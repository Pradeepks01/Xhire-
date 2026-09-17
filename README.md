# Xhire

An autonomous multi-agent AI platform for technical hiring and screening.

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14+-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Overview

Xhire is an end-to-end technical interview platform that uses a multi-agent AI system to conduct adaptive technical interviews. It automatically parses job descriptions and candidate resumes, conducts voice or text interviews across multiple interviewer personas, and generates detailed evaluation reports for recruiters.

---

## Key Features

* **Multi-Agent Interview Panel**: Conducts interviews across three calibrated personas:
  * Hiring Manager: Assesses behavioral fit, ownership, and communication.
  * Senior Engineer: Probes system architecture, scalability, and trade-offs.
  * Domain Expert: Tests deep technical knowledge, memory, and runtime mechanics.
* **Adaptive Questioning**: Automatically adjusts question difficulty based on candidate answers using a 3-level depth model (Recall, Application, Analysis).
* **AI Text Detection**: Built-in statistical NLP checks (Perplexity and Burstiness) to identify AI-generated answers without external paid APIs.
* **Resume Guardrail**: Detects and rejects non-resume files such as academic marksheets, grade cards, and invoices before starting interviews.
* **Candidate Leaderboard & Radar Charts**: Ranks candidates across six technical skills with side-by-side radar chart comparisons.
* **Self-Serve Calendar Booking**: Integrated scheduling with automatic timezone handling, Google Calendar links, and `.ics` file downloads.
* **Sub-25ms Response Time**: Fast, non-blocking question delivery with asynchronous background evaluation.

---

## How It Works

1. **Job Setup**: The recruiter creates a job requisition and uploads the job description. The system automatically creates a custom evaluation rubric.
2. **Candidate Invitation & Booking**: The candidate receives an invitation email, selects an interview slot on the calendar, and logs into the portal.
3. **Live Technical Interview**: The candidate completes the interview using either voice (speech-to-text) or text. Follow-up questions adapt in real time.
4. **Automated Assessment**: The platform evaluates answers in the background and delivers a complete Decision and Assessment Record (DAR) with scores, transcripts, and radar charts.

---

## Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14, React, TypeScript | Recruiter dashboard, candidate portal, voice input |
| **Backend** | FastAPI, Python 3.12, Uvicorn | REST API gateway, authentication, and business logic |
| **Database** | SQLModel, SQLite / PostgreSQL | Candidate data, job requisitions, and interview logs |
| **Background Tasks** | Celery, RabbitMQ / ThreadPool | Asynchronous answer evaluation and AI detection |
| **LLM Inference** | Google Gemini Flash | Question generation, rubric scoring, and report synthesis |
| **Speech Audio** | Web Speech API | In-browser speech recognition (STT) and voice playback (TTS) |

---

## Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/Pradeepks01/Xhire-.git
cd Xhire-
```

### 2. Start Backend Server
```bash
cd Xhire_backend

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Backend API docs available at: `http://127.0.0.1:8000/docs`

### 3. Start Frontend Portal
Open a new terminal:
```bash
cd Xhire_frontend

# Install dependencies
npm install

# Start Next.js server
npm run dev
```
Open your browser at: `http://localhost:3000`

---

## Testing

Run backend tests using pytest:
```bash
cd Xhire_backend
python -m pytest test_db.py test_ai_detector.py test_resume_validator.py test_candidate_matrix.py test_calendar.py test_jd_autotuner.py -v
```

---

## License

This project is open-source and available under the [MIT License](LICENSE).



