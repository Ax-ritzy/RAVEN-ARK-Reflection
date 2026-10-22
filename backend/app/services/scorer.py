import re
from typing import List, Set, Tuple, Dict, Any

STANDARD_STOPWORDS: Set[str] = {
    "the", "and", "is", "or", "if", "a", "an", "in", "on", "of", "to", "for", 
    "with", "at", "by", "from", "as", "about", "into", "through", "after", 
    "over", "between", "out", "against", "during", "without", "before", 
    "under", "around", "among", "this", "that", "these", "those", "it", "its"
}

class ScoringError(Exception):
    pass

def validate_keyword_set(keywords: List[str]) -> List[str]:
    """
    Validates that the provided keyword list contains exactly 15 distinct,
    non-empty, non-stopword tokens. Returns the normalized distinct keywords.
    """
    cleaned: List[str] = []
    seen: Set[str] = set()

    for kw in keywords:
        token = kw.strip().lower()
        if not token:
            continue
        if token in STANDARD_STOPWORDS:
            continue
        if token not in seen:
            seen.add(token)
            cleaned.append(token)

    if len(cleaned) != 15:
        raise ScoringError(
            f"Reference keyword set must contain exactly 15 distinct, non-stopword keywords. "
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
    2. Each distinct matched keyword contributes exactly 1 point, irrespective of frequency.
    3. Repeated occurrences of the same keyword do NOT earn extra points.
    4. Reference Score is an integer from 0 to 15.
    5. Session Mark = Reference Score / 3.0 (rounded to 2 decimal places, 0.00 to 5.00).
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

    reference_score = len(matched_keywords)  # 0 to 15
    
    # Exact Formula: Session Mark = Reference Score / 3.0
    calculated_mark = round(reference_score / 3.0, 2)
    
    # Clamp safety
    calculated_mark = max(0.00, min(5.00, calculated_mark))

    return {
        "reference_score": reference_score,
        "calculated_mark": calculated_mark,
        "matched_keywords": matched_keywords,
        "total_keywords": len(valid_keywords)
    }
