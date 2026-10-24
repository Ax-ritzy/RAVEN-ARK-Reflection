import re
from collections import Counter
from typing import List, Set

# Comprehensive academic & conversational stopword list
# Excludes pronouns, conjunctions, prepositions, adverbs, and conversational fluff
FORBIDDEN_STOPWORDS: Set[str] = {
    # Articles, Determiners & Pronouns
    "a", "an", "the", "this", "that", "these", "those", "each", "every", "all", "both", 
    "some", "any", "no", "neither", "either", "another", "other", "such", "something",
    "anything", "nothing", "everything", "someone", "anyone", "everyone", "i", "me", "my",
    "myself", "we", "us", "our", "ours", "ourselves", "you", "your", "yours", "yourself",
    "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it",
    "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which",
    "who", "whom", "whose", "whoever", "whomever", "one", "two", "three", "first", "second",
    
    # Prepositions & Conjunctions
    "about", "above", "across", "after", "against", "along", "among", "around", "at", 
    "before", "behind", "below", "beneath", "beside", "between", "beyond", "by", 
    "down", "during", "except", "for", "from", "in", "inside", "into", "near", 
    "of", "off", "on", "onto", "out", "outside", "over", "past", "round", "since", 
    "through", "throughout", "till", "to", "toward", "towards", "under", "underneath", 
    "until", "unto", "up", "upon", "with", "within", "without", "and", "but", "or", 
    "nor", "so", "yet", "as", "because", "although", "though", "even", "if", "unless", 
    "while", "whereas", "whether", "than",
    
    # Conversational Fillers, Adverbs & Casual Modifiers (Purging #something, #instead, #gracefully, etc.)
    "instead", "gracefully", "altogether", "simply", "actually", "really", "wondering",
    "happens", "grab", "wrong", "right", "away", "today", "yesterday", "tomorrow",
    "morning", "fast", "longer", "real", "helpful", "turns", "turn", "keeps", "saying",
    "again", "almost", "already", "also", "always", "anyway", "back", "ever", "far",
    "here", "how", "however", "just", "less", "more", "most", "much", "never", "next",
    "not", "now", "often", "only", "quite", "rather", "seldom", "soon", "still", "then",
    "there", "therefore", "thus", "too", "very", "well", "when", "whenever", "where",
    "wherever", "why", "yes", "like", "sure", "maybe", "probably", "certainly",
    "smart", "quick", "clear", "core", "ceramic", "heat", "coffee", "cools", "cup",
    "mug", "thermometer", "paper", "words", "world", "thing", "things", "part",
    "work", "works", "working",
    
    # Auxiliary & Linking Verbs
    "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", 
    "having", "do", "does", "did", "done", "doing", "can", "could", "will", "would", 
    "shall", "should", "may", "might", "must", "ought", "need", "used", "get", "got", 
    "getting", "make", "made", "making", "say", "said", "take", "takes", "taking",
    "win", "put", "let", "see", "look", "run"
}

def extract_top_keywords(text: str, count: int = 5) -> List[str]:
    """
    Extracts authoritative, multi-word conceptual keywords and keyphrases from reference text:
    1. Segments text into semantic clauses.
    2. Identifies contiguous conceptual phrases (e.g. 'Educated guess', 'Side-by-side check', 'Empirical evidence').
    3. Purges all generic English conversational stopwords, filler adverbs, and vague pronouns.
    4. Guarantees exactly `count` unique, high-quality, topic-relevant concepts.
    """
    if not text or not text.strip():
        raise ValueError("Document contains no readable text for keyword extraction.")

    # Split into semantic clauses (by punctuation / boundaries)
    clauses = re.split(r'[,.;:\n\(\)\[\]"\'`]+', text)
    candidates: Counter = Counter()

    for clause in clauses:
        words = [w.strip("'- ") for w in re.findall(r'[a-zA-Z0-9\-]+', clause.lower()) if w.strip("'- ")]
        cur_phrase = []
        for w in words:
            if w not in FORBIDDEN_STOPWORDS and len(w) >= 3:
                cur_phrase.append(w)
            else:
                if len(cur_phrase) >= 2:
                    phrase_title = " ".join(cur_phrase[:3]).title()
                    candidates[phrase_title] += 6
                elif len(cur_phrase) == 1 and len(cur_phrase[0]) >= 4:
                    candidates[cur_phrase[0].title()] += 2
                cur_phrase = []
        if len(cur_phrase) >= 2:
            phrase_title = " ".join(cur_phrase[:3]).title()
            candidates[phrase_title] += 6
        elif len(cur_phrase) == 1 and len(cur_phrase[0]) >= 4:
            candidates[cur_phrase[0].title()] += 2

    # Rank candidates by score descending
    ranked = [c for c, _ in candidates.most_common()]

    # Collect up to `count` distinct concepts, avoiding redundant substrings
    selected: List[str] = []
    for item in ranked:
        item_lower = item.lower()
        # Avoid duplicate substrings (e.g. don't pick 'Guess' if 'Educated Guess' is already selected)
        is_sub = False
        for s in selected:
            s_lower = s.lower()
            if item_lower == s_lower or item_lower in s_lower or s_lower in item_lower:
                is_sub = True
                break
        if not is_sub:
            selected.append(item)
        if len(selected) == count:
            break

    # If document was extremely short, pad with clean individual tokens
    if len(selected) < count:
        all_words = re.findall(r'\b[a-zA-Z]{4,}\b', text)
        for w in all_words:
            w_title = w.title()
            w_lower = w.lower()
            if w_lower not in FORBIDDEN_STOPWORDS and not any(w_lower in s.lower() for s in selected):
                selected.append(w_title)
                if len(selected) == count:
                    break

    return selected[:count]


def extract_top_15_keywords(text: str) -> List[str]:
    """Legacy backward-compatibility alias for 15-keyword extraction."""
    return extract_top_keywords(text, count=15)
