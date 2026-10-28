import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, title } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // 1. Dual-Key Gemini Flash Semantic Extraction with Auto-Failover on Quota/Token Exhaustion
    const apiKeys = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_FALLBACK,
    ].filter((k): k is string => Boolean(k && k.trim()));

    const prompt = `You are an academic curriculum evaluator and semantic topic-modeling engine.

TASK:
Analyze the following reference text for an academic reflection module titled "${title || 'Reference Document'}".
Extract exactly 5 core subject-matter keywords or conceptual keyphrases (1 to 3 words each) that represent the specific learning concepts, theories, and key ideas in this text.

RULES:
1. TOPIC RELEVANCE: Keywords must be deeply relevant to the subject matter of the document (e.g., if the topic is scientific research, extract methodological concepts; if the topic is tactical gaming like Valorant, extract game-specific mechanics; if business, extract strategic metrics).
2. MULTI-WORD CONCEPTS PREFERRED: Prefer rich, multi-word conceptual phrases over single isolated generic words (e.g., "Educated guess", "Empirical evidence", "Value propositions", "Side-by-side check", "Statistical scrutiny").
3. ZERO FILLER WORDS: Strictly avoid generic filler words, adverbs, or vague pronouns (e.g., "something", "instead", "gracefully", "altogether", "today", "really", "simply", "actually").
4. CALIBRATED OUTPUT: Output strictly a valid JSON array containing exactly 5 string elements. No markdown formatting, no code block backticks, no conversational preamble.

Example Output format:
["Educated guess", "Prediction", "Test", "Side-by-side check", "Learn"]

REFERENCE TEXT:
"""
${text.slice(0, 4000)}
"""`;

    for (let i = 0; i < apiKeys.length; i++) {
      const currentKey = apiKeys[i];
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${currentKey}`;

        const geminiResp = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        });

        if (geminiResp.ok) {
          const data = await geminiResp.json();
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            const parsed = JSON.parse(candidateText);
            if (Array.isArray(parsed) && parsed.length >= 5) {
              const clean = parsed.slice(0, 5).map((k: string) => String(k).trim().replace(/^["']|["']$/g, ""));
              return NextResponse.json({
                keywords: clean,
                source: "gemini",
                keyIndex: i + 1,
              });
            }
          }
        } else {
          const errText = await geminiResp.text();
          console.warn(`Gemini API Key #${i + 1} failed (Status: ${geminiResp.status}). Failing over to next key...`, errText);
        }
      } catch (geminiErr) {
        console.warn(`Gemini API Key #${i + 1} network error, failing over...`, geminiErr);
      }
    }

    // 2. Intelligent Multi-Word Collocation Fallback (Runs if all Gemini keys run out of quota or are offline)
    const forbiddenWords = new Set([
      "something", "instead", "gracefully", "altogether", "simply", "actually",
      "wondering", "happens", "grab", "wrong", "right", "away", "today", "turn",
      "turns", "keeps", "saying", "morning", "fast", "longer", "real", "helpful",
      "about", "their", "there", "these", "those", "which", "where", "while",
      "could", "would", "should", "being", "having", "other", "every", "first",
      "second", "think", "sketching", "whispered", "functions", "either", "neither",
      "invites", "lighting", "crumbling", "tells", "across", "before", "begins",
      "quiet", "study", "weaving", "scattered", "clues", "bold", "neither", "settled",
      "fragile", "bridge", "speak", "back", "fresh", "story", "works", "world"
    ]);

    const clauses = text.split(/[,.;:\n()\[\]"'`]+/);
    const candidates: Map<string, number> = new Map();

    for (const clause of clauses) {
      const tokens = clause
        .toLowerCase()
        .replace(/[^a-z0-9\-]/g, " ")
        .split(/\s+/)
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 0);

      let curPhrase: string[] = [];
      for (const t of tokens) {
        if (!forbiddenWords.has(t) && t.length >= 3 && !t.endsWith("ly")) {
          curPhrase.push(t);
        } else {
          if (curPhrase.length >= 2) {
            const p = curPhrase.slice(0, 3).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            candidates.set(p, (candidates.get(p) || 0) + 6);
          } else if (curPhrase.length === 1 && curPhrase[0].length >= 4) {
            const w = curPhrase[0].charAt(0).toUpperCase() + curPhrase[0].slice(1);
            candidates.set(w, (candidates.get(w) || 0) + 2);
          }
          curPhrase = [];
        }
      }
      if (curPhrase.length >= 2) {
        const p = curPhrase.slice(0, 3).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        candidates.set(p, (candidates.get(p) || 0) + 6);
      } else if (curPhrase.length === 1 && curPhrase[0].length >= 4) {
        const w = curPhrase[0].charAt(0).toUpperCase() + curPhrase[0].slice(1);
        candidates.set(w, (candidates.get(w) || 0) + 2);
      }
    }

    const sorted = Array.from(candidates.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);

    const selected: string[] = [];
    for (const item of sorted) {
      const itemLower = item.toLowerCase();
      let isSub = false;
      for (const s of selected) {
        const sLower = s.toLowerCase();
        if (itemLower === sLower || itemLower.includes(sLower) || sLower.includes(itemLower)) {
          isSub = true;
          break;
        }
      }
      if (!isSub) {
        selected.push(item);
      }
      if (selected.length === 5) break;
    }

    if (selected.length < 5) {
      const words = text
        .replace(/[^a-zA-Z]/g, " ")
        .split(/\s+/)
        .filter((w: string) => w.length >= 4 && !forbiddenWords.has(w.toLowerCase()) && !w.toLowerCase().endsWith("ly"));
      for (const w of words) {
        const cap = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        if (!selected.some((s) => s.toLowerCase() === cap.toLowerCase())) {
          selected.push(cap);
        }
        if (selected.length === 5) break;
      }
    }

    return NextResponse.json({ keywords: selected.slice(0, 5), source: "fallback" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}
