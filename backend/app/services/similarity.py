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
        all_scores: Dict[str, float],
        matched_keywords: Optional[List[str]] = None,
        reference_score: int = 0,
        all_keyword_counts: Optional[Dict[str, int]] = None
    ):
        self.selected_reference_id = selected_reference_id
        self.similarity_score = round(similarity_score, 4)
        self.qualifies = qualifies
        self.all_scores = all_scores
        self.matched_keywords = matched_keywords or []
        self.reference_score = reference_score
        self.all_keyword_counts = all_keyword_counts or {}

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
    Compares student reflection against all assigned reference materials.
    RULE: If there are multiple reference materials, the document containing the
    HIGHEST keyword count is selected as the Major Reference material for the student.
    
    STRICT ISOLATION INVARIANT:
    No cross-matching of keywords across files. Each candidate reference is evaluated
    strictly against its own isolated keyword set. No keywords are pooled or mixed up.
    
    TIE-BREAKER:
    If multiple references have the exact same highest keyword count, text cosine
    similarity is used as the deterministic tie-breaker.
    """
    if not candidate_references:
        return ReferenceSelectionResult(
            selected_reference_id=None,
            similarity_score=0.0,
            qualifies=False,
            all_scores={}
        )

    # Extract all alphanumeric token words from student reflection
    words = set(re.findall(r'\b[a-zA-Z0-9_\-]+\b', reflection_text.lower()))

    # Check if candidate references have keyword sets provided
    has_keywords = any(bool(ref.get("keywords")) for ref in candidate_references)

    best_ref_id = None
    best_keyword_count = -1
    best_similarity = -1.0
    best_matched_keywords: List[str] = []

    all_scores: Dict[str, float] = {}
    all_keyword_counts: Dict[str, int] = {}

    for ref in candidate_references:
        ref_id = str(ref.get("id"))
        ref_text = ref.get("extracted_text") or ref.get("text") or ""
        ref_kws = ref.get("keywords") or []

        # 1. Cosine similarity
        sim = compute_cosine_similarity(reflection_text, ref_text)
        all_scores[ref_id] = round(sim, 4)

        # 2. Strict isolated keyword matching (zero cross-matching between files)
        clean_kws = [str(k).strip() for k in ref_kws if str(k).strip()]
        matched_isolated = [k for k in clean_kws if k.lower() in words]
        kw_count = len(matched_isolated)
        all_keyword_counts[ref_id] = kw_count

        # 3. Major Reference Selection
        if has_keywords:
            # Document with highest keyword count wins; cosine similarity acts as tie-breaker
            if (kw_count > best_keyword_count) or (kw_count == best_keyword_count and sim > best_similarity):
                best_keyword_count = kw_count
                best_similarity = sim
                best_ref_id = ref_id
                best_matched_keywords = matched_isolated
        else:
            # Fallback to pure text similarity if keywords not yet assigned
            if sim > best_similarity:
                best_similarity = sim
                best_ref_id = ref_id
                best_matched_keywords = []

    qualifies = (best_keyword_count > 0) or (best_similarity >= min_threshold)

    return ReferenceSelectionResult(
        selected_reference_id=best_ref_id,
        similarity_score=max(best_similarity, 0.0),
        qualifies=qualifies,
        all_scores=all_scores,
        matched_keywords=best_matched_keywords,
        reference_score=max(best_keyword_count, 0),
        all_keyword_counts=all_keyword_counts
    )
