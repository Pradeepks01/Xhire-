import re
import pathlib
from typing import Any, Dict, List, Optional, Tuple
from openai import OpenAI
from pypdf import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

from .X_llm_client import oai_embed

# ==============================
# ---------- RETRIEVER ---------
# ==============================
class KBIndex:
    """Simple local KB with PDF/TXT parsing and two embedding backends: OpenAI‑compatible or TF‑IDF."""
    def __init__(self, client: OpenAI, emb_model: str):
        self.client = client
        self.emb_model = emb_model
        self.docs: List[Dict[str, Any]] = []          # raw chunks
        self._tfidf: Optional[TfidfVectorizer] = None
        self._tfidf_mat = None
        self._vecs: Optional[List[List[float]]] = None # embedding vectors if using API

    def _chunk_text(self, text: str, doc_id: str, title: str) -> List[Dict[str, Any]]:
        chunks = []
        paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        for i, p in enumerate(paras):
            for j in range(0, len(p), 700):
                snippet = p[j:j+700]
                if snippet:
                    chunks.append({
                        "doc_id": doc_id,
                        "title": title,
                        "section": f"{i+1}",
                        "snippet": snippet,
                    })
        return chunks

    def load_folder(self, folder: pathlib.Path) -> int:
        self.docs.clear(); self._tfidf = None; self._tfidf_mat = None; self._vecs = None
        if not folder.exists():
            return 0
        count = 0
        for path in folder.rglob("*"):
            if path.suffix.lower() == ".pdf":
                try:
                    reader = PdfReader(str(path))
                    pages = []
                    for pi, page in enumerate(reader.pages):
                        try:
                            pages.append(page.extract_text() or "")
                        except Exception:
                            pages.append("")
                    text = "\n\n".join(pages)
                except Exception:
                    continue
            elif path.suffix.lower() in {".txt", ".md"}:
                try:
                    text = path.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    continue
            else:
                continue
            doc_id = path.stem
            title = path.name
            chunks = self._chunk_text(text, doc_id, title)
            self.docs.extend(chunks)
            count += 1
        # Try embeddings API; if fails, build TF‑IDF
        if self.docs:
            texts = [d["snippet"] for d in self.docs]
            vecs = oai_embed(self.client, self.emb_model, texts)
            if vecs is not None:
                self._vecs = vecs
            else:
                self._tfidf = TfidfVectorizer(stop_words="english", max_features=50000)
                self._tfidf_mat = self._tfidf.fit_transform(texts)
        return count

    def _similarities(self, query: str) -> List[Tuple[int,float]]:
        if self._vecs is not None:
            qv = oai_embed(self.client, self.emb_model, [query])
            if not qv:
                return []
            # cosine
            A = np.array(self._vecs, dtype=float)
            q = np.array(qv[0], dtype=float)
            denom = (np.linalg.norm(A, axis=1) * (np.linalg.norm(q) + 1e-8) + 1e-8)
            sims = (A @ q) / denom
            return list(enumerate(sims.tolist()))
        else:
            if not self._tfidf or self._tfidf_mat is None:
                return []
            qv = self._tfidf.transform([query])
            sims = cosine_similarity(self._tfidf_mat, qv).ravel()
            return list(enumerate(sims.tolist()))

    def retrieve(self, query: str, top_k: int = 3) -> Tuple[List[Dict[str, Any]], float]:
        sims = self._similarities(query)
        if not sims:
            return [], 0.0
        sims.sort(key=lambda t: t[1], reverse=True)
        picks, scores = [], []
        for idx, sc in sims[:top_k]:
            d = dict(self.docs[idx])
            d["score"] = float(sc)
            picks.append(d)
            scores.append(sc)
        # evidence_confidence scaled 0‑100 from top score
        ev_conf = max(0.0, min(100.0, (scores[0] if scores else 0.0) * 100.0))
        return picks, ev_conf