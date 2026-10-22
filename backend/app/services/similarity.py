from typing import List, Dict, Any, Tuple, Optional
import math
import re
from collections import Counter

class ReferenceSelectionResult:
    def __init__(
        self,
        selected_reference_id: Optional[str],
        similarity_score: float,
        qualifies: bool,
        all_scores: Dict[str, float]
    ):
        self.selected_reference_id = selected_reference_id
        self.similarity_score = round(similarity_score, 4)
        self.qualifies = qualifies
        self.all_scores = all_scores

def compute_cosine_similarity(text1: str, text2: str) -> float:
    """
    Computes cosine similarity between two texts using TF-IDF or term frequency.
    Works robustly with scikit-learn when available, with pure-python fallback.
    """
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        
        vectorizer = TfidfVectorizer(stop_words='english')
        tfidf_matrix = vectorizer.fit_transform([text1, text2])
        sim = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
        return float(sim)
    except Exception:
        # Pure-python term-frequency cosine fallback
        words1 = re.findall(r'\b\w+\b', text1.lower())
        words2 = re.findall(r'\b\w+\b', text2.lower())
        if not words1 or not words2:
            return 0.0
            
        c1 = Counter(words1)
        c2 = Counter(words2)
        
        all_words = set(c1.keys()).union(set(c2.keys()))
        dot = sum(c1[w] * c2[w] for w in all_words)
        mag1 = math.sqrt(sum(v * v for v in c1.values()))
        mag2 = math.sqrt(sum(v * v for v in c2.values()))
        
        if mag1 == 0 or mag2 == 0:
            return 0.0
        return float(dot / (mag1 * mag2))

def select_best_reference(
    reflection_text: str,
    candidate_references: List[Dict[str, Any]],
    min_threshold: float = 0.35
) -> ReferenceSelectionResult:
    """
    Compares reflection against all assigned references.
    Selects the single reference with highest similarity.
    If best similarity < min_threshold, flags qualifies=False.
    """
    if not candidate_references:
        return ReferenceSelectionResult(
            selected_reference_id=None,
            similarity_score=0.0,
            qualifies=False,
            all_scores={}
        )

    best_ref_id = None
    best_score = -1.0
    all_scores = {}

    for ref in candidate_references:
        ref_id = str(ref.get("id"))
        ref_text = ref.get("extracted_text") or ref.get("text") or ""
        
        score = compute_cosine_similarity(reflection_text, ref_text)
        all_scores[ref_id] = round(score, 4)

        if score > best_score:
            best_score = score
            best_ref_id = ref_id

    qualifies = best_score >= min_threshold

    return ReferenceSelectionResult(
        selected_reference_id=best_ref_id,
        similarity_score=max(best_score, 0.0),
        qualifies=qualifies,
        all_scores=all_scores
    )
