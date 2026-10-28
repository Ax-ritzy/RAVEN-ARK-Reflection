import re
import os
import json
import logging
import urllib.request
from collections import Counter
from typing import List, Set, Optional

logger = logging.getLogger(__name__)

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
    "work", "works", "working", "sketching", "whispered", "functions", "either",
    "neither", "invites", "lighting", "crumbling", "tells", "weaving", "scattered",
    
    # Auxiliary & Linking Verbs
    "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", 
    "having", "do", "does", "did", "done", "doing", "can", "could", "will", "would", 
    "shall", "should", "may", "might", "must", "ought", "need", "used", "get", "got", 
    "getting", "make", "made", "making", "say", "said", "take", "takes", "taking",
    "win", "put", "let", "see", "look", "run"
}


def extract_with_gemini(text: str, count: int = 5) -> Optional[List[str]]:
    """
    Extracts semantic keyphrases with strict domain & topic relevance using Google Gemini Flash API.
    Supports automatic token-exhaustion failover between primary GEMINI_API_KEY and secondary GEMINI_API_KEY_FALLBACK.
    """
    api_keys = [
        os.environ.get("GEMINI_API_KEY"),
        os.environ.get("GEMINI_API_KEY_FALLBACK")
    ]
    api_keys = [k.strip() for k in api_keys if k and k.strip()]
    if not api_keys:
        return None

    prompt = f"""You are an academic curriculum evaluator and semantic topic-modeling engine.

TASK:
Analyze the following text and extract exactly {count} authoritative, domain-specific conceptual keyphrases (1 to 3 words each) that represent the core conceptual pillars, theories, or operational mechanics of the text.

RULES:
1. TOPIC RELEVANCE: Keywords must be deeply relevant to the subject matter of the document (e.g., if the topic is scientific research, extract methodological concepts; if the topic is tactical gaming like Valorant, extract game-specific mechanics; if business, extract strategic metrics).
2. MULTI-WORD CONCEPTS PREFERRED: Prefer rich, multi-word conceptual phrases over single isolated generic words (e.g., "Educated guess", "Empirical evidence", "Value propositions", "Side-by-side check", "Statistical scrutiny").
3. ZERO FILLER WORDS: Strictly avoid generic filler words, adverbs, or vague pronouns (e.g., "something", "instead", "gracefully", "altogether", "today", "really", "simply", "actually").
4. CALIBRATED OUTPUT: Output strictly a valid JSON array containing exactly {count} string elements. No markdown formatting, no code block backticks, no conversational preamble.

Example Output format:
["Educated guess", "Prediction", "Test", "Side-by-side check", "Learn"]

DOCUMENT TEXT:
\"\"\"
{text[:4000]}
\"\"\""""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    }

    for idx, key in enumerate(api_keys):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key={key}"
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                candidate = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                parsed = json.loads(candidate)
                if isinstance(parsed, list) and len(parsed) >= count:
                    return [str(x).strip() for x in parsed[:count]]
        except Exception as e:
            logger.warning(f"Gemini API Key #{idx + 1} error: {e}. Failing over to next key...")

    return None


def extract_top_keywords(text: str, count: int = 5) -> List[str]:
    """
    Extracts authoritative, multi-word conceptual keywords and keyphrases from reference text:
    1. Attempts Gemini Flash API with dual-key auto-failover.
    2. Falls back seamlessly to intelligent POS-style collocation chunking if Gemini is unavailable.
    """
    if not text or not text.strip():
        raise ValueError("Document contains no readable text for keyword extraction.")

    # 1. Try Gemini first (with dual-key failover)
    gemini_result = extract_with_gemini(text, count=count)
    if gemini_result and len(gemini_result) == count:
        return gemini_result

    # 2. Local Fallback: Multi-word clause chunking & stopword filtering
    clauses = re.split(r'[,.;:\n\(\)\[\]"\'`]+', text)
    candidates: Counter = Counter()

    for clause in clauses:
        words = [w.strip("'- ") for w in re.findall(r'[a-zA-Z0-9\-]+', clause.lower()) if w.strip("'- ")]
        cur_phrase = []
        for w in words:
            if w not in FORBIDDEN_STOPWORDS and len(w) >= 3 and not w.endswith("ly"):
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
            if w_lower not in FORBIDDEN_STOPWORDS and not w_lower.endswith("ly") and not any(w_lower in s.lower() for s in selected):
                selected.append(w_title)
                if len(selected) == count:
                    break

    return selected[:count]


def extract_top_15_keywords(text: str) -> List[str]:
    """Legacy backward-compatibility alias for 15-keyword extraction."""
    return extract_top_keywords(text, count=15)
