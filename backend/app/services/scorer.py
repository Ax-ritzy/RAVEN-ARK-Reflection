import re
from typing import List, Set, Tuple, Dict, Any

from app.services.keyword_extractor import FORBIDDEN_STOPWORDS

class ScoringError(Exception):
    pass

def validate_keyword_set(keywords: List[str]) -> List[str]:
    """
    Validates that the provided keyword list contains 5 (or legacy 15) distinct,
    non-empty, non-stopword tokens. Returns the normalized distinct keywords.
    """
    cleaned: List[str] = []
    seen: Set[str] = set()

    for kw in keywords:
        token = kw.strip().lower()
        if not token:
            continue
        if token in FORBIDDEN_STOPWORDS:
            continue
        if token not in seen:
            seen.add(token)
            cleaned.append(token)

    if len(cleaned) not in (5, 15):
        raise ScoringError(
            f"Reference keyword set must contain exactly 5 (or 15) distinct, non-stopword keywords. "
            f"Found {len(cleaned)} usable keywords."
        )

    return cleaned

def calculate_deterministic_score(
    reflection_text: str,
    reference_keywords: List[str]
) -> Dict[str, Any]:
    """
    DETERMINISTIC SCORING ENGINE:
    1. Reference Score = number of distinct reference keywords found in the reflection.
    2. Each distinct matched keyword contributes points towards the 5.00 mark limit.
       - For 5-keyword set: 1 match = 1.00 Mark (5 matches = 5.00 Marks).
       - For 15-keyword set: 1 match = 1/3 Mark (15 matches = 5.00 Marks).
    3. Repeated occurrences of the same keyword do NOT earn extra points.
    4. Session Mark is clamped between 0.00 and 5.00.
    """
    # Normalize reflection text into word tokens
    reflection_words = set(re.findall(r'\b[a-zA-Z0-9_\-]+\b', reflection_text.lower()))
    
    # Clean and distinct the reference keywords
    valid_keywords = validate_keyword_set(reference_keywords)
    
    matched_keywords: List[str] = []
    
    for kw in valid_keywords:
        # If keyword is multi-word (e.g. "loss landscape") check substring / phrase match
        if " " in kw:
            pattern = r'\b' + re.escape(kw.lower()) + r'\b'
            if re.search(pattern, reflection_text.lower()):
                matched_keywords.append(kw)
        else:
            if kw.lower() in reflection_words:
                matched_keywords.append(kw)

    reference_score = len(matched_keywords)
    total_kw = len(valid_keywords)
    multiplier = 5.0 / total_kw if total_kw > 0 else 1.0
    calculated_mark = round(reference_score * multiplier, 2)
    
    # Clamp safety
    calculated_mark = max(0.00, min(5.00, calculated_mark))

    return {
        "reference_score": reference_score,
        "calculated_mark": calculated_mark,
        "matched_keywords": matched_keywords,
        "total_keywords": total_kw
    }
