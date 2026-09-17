import pytest
from app.ai_detector import detect_ai_text

def test_detect_human_text():
    # Human text: high burstiness (short sentences mixed with conversational clauses), natural speech, high perplexity
    human_text = (
        "Well, honestly, I remember that production incident clearly. "
        "It was crazy! Our database connections suddenly spiked at 2 AM on a Sunday. "
        "So we had to quickly SSH into the bastion, inspect pg_stat_activity, and kill deadlocks. "
        "After that, I updated our HikariCP connection pool settings. "
        "Never happened again."
    )
    res = detect_ai_text(human_text)
    assert res.ai_probability < 50.0
    assert res.is_flagged is False
    assert res.burstiness > 0.40
    assert res.human_likeness_score > 50.0
    print("\nHuman Detection Result:", res)

def test_detect_chatgpt_text():
    # Typical ChatGPT/Claude text: uniform sentence lengths, low burstiness, low perplexity, hallmark transitions
    ai_text = (
        "Furthermore, it is important to remember that database optimization plays a crucial role in modern software engineering. "
        "Moreover, leveraging comprehensive connection pooling ensures that resources are allocated seamlessly and efficiently across all services. "
        "In summary, this intricate balance between throughput and latency stands as a testament to robust architectural principles."
    )
    res = detect_ai_text(ai_text)
    assert res.ai_probability >= 70.0
    assert res.is_flagged is True
    assert res.burstiness < 0.35
    assert len(res.flags) > 0
    print("\nAI Detection Result:", res)

def test_detect_empty_and_short_text():
    empty_res = detect_ai_text("")
    assert empty_res.is_flagged is False

    short_res = detect_ai_text("Yes, I agree with that.")
    assert short_res.is_flagged is False
