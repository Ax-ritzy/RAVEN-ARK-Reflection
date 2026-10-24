import urllib.request
import json
import time
import logging
from typing import List, Dict, Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)

def evaluate_with_qwen(
    reflection_text: str,
    reference_title: str,
    reference_keywords: List[str],
    timeout_seconds: Optional[int] = None
) -> Dict[str, Any]:
    """
    Evaluates a student reflection against the 15 required keywords using local Ollama Qwen 3.5:9B.
    Runs with think=False for low-latency (~10-15s), high-precision deterministic scoring.
    """
    timeout = timeout_seconds or settings.ollama_timeout_seconds
    clean_keywords = [str(k).strip().lower() for k in reference_keywords if str(k).strip()]
    total_kw = len(clean_keywords) if clean_keywords else 5
    multiplier = 5.0 / total_kw

    prompt_payload = {
        "model": settings.ollama_model,
        "think": False,
        "messages": [
            {
                "role": "system",
                "content": (
                    f"You are an automated academic evaluator. Evaluate student reflections against the provided list of {total_kw} required reference keywords. "
                    "Rule 1: Award 1 mark per keyword only if that keyword (or its direct morphological inflection/adjective/plural) is meaningfully used in the reflection context. "
                    f"Rule 2: Maximum reference_score is {total_kw} (1 mark per distinct matched keyword). "
                    f"Rule 3: calculated_mark = round(reference_score * {5.0 / total_kw:.2f}, 2) (maximum 5.00). "
                    "Rule 4: Output strictly valid JSON conforming to this schema:\n"
                    "{\n"
                    '  "matched_keywords": ["keyword1", "keyword2"],\n'
                    f'  "reference_score": {min(2, total_kw)},\n'
                    f'  "calculated_mark": {min(2.0, round(2 * multiplier, 2))},\n'
                    '  "feedback": "1-2 sentence academic assessment of conceptual depth."\n'
                    "}"
                )
            },
            {
                "role": "user",
                "content": (
                    f"Reference Topic: {reference_title}\n"
                    f"Required Keywords ({total_kw}): {json.dumps(clean_keywords)}\n\n"
                    f"Student Reflection:\n\"{reflection_text}\""
                )
            }
        ],
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.0,
            "num_predict": 256
        }
    }

    req = urllib.request.Request(
        f"{settings.ollama_url.rstrip('/')}/api/chat",
        headers={"Content-Type": "application/json"},
        data=json.dumps(prompt_payload).encode("utf-8")
    )

    t0 = time.time()
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        duration = time.time() - t0
        data = json.loads(resp.read().decode("utf-8"))
        msg = data.get("message", {})
        raw_content = msg.get("content", "").strip()

        if not raw_content:
            raise ValueError("Ollama returned empty content.")

        parsed = json.loads(raw_content)
        
        # Validate and normalize
        matched = [str(k).lower().strip() for k in parsed.get("matched_keywords", []) if str(k).lower().strip() in clean_keywords]
        # De-duplicate while preserving order
        matched_unique = list(dict.fromkeys(matched))
        ref_score = len(matched_unique)
        calc_mark = round(ref_score * multiplier, 2)
        feedback = parsed.get("feedback", "Automated Qwen evaluation completed.")

        return {
            "success": True,
            "source": f"ollama_{settings.ollama_model}",
            "matched_keywords": matched_unique,
            "reference_score": ref_score,
            "calculated_mark": min(5.00, calc_mark),
            "feedback": feedback,
            "duration_seconds": round(duration, 2)
        }

    except Exception as e:
        logger.warning(f"Ollama Qwen evaluation error: {e}")
        return {
            "success": False,
            "source": f"ollama_{settings.ollama_model}",
            "matched_keywords": [],
            "reference_score": 0,
            "calculated_mark": 0.0,
            "feedback": f"Evaluation fallback due to error: {str(e)}",
            "error": str(e),
            "duration_seconds": round(time.time() - t0, 2)
        }
