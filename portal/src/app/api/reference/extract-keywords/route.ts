import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text, title } = await req.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    // 1. Semantic Extraction using local Ollama Qwen 3.5:4B
    const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
    const prompt = `You are an academic curriculum evaluator. Analyze the following reference text for an academic reflection module titled "${title || 'Reflection Note'}".

TASK:
Extract exactly 5 core subject-matter keywords or conceptual phrases (1 to 3 words each) that represent the specific learning concepts, theories, and key ideas in this text.

RULES:
1. Do NOT select generic filler words, adverbs, or vague pronouns (e.g., "something", "instead", "gracefully", "altogether", "today", "really", "simply", "actually").
2. Focus on conceptual terms, domain mechanics, and key ideas (e.g., "Educated guess", "Empirical evidence", "Key performance indicators", "Falsifiable proposition", "Side-by-side check").
3. Return ONLY a valid JSON array of exactly 5 strings. No markdown formatting, no explanation, no backticks.

Example Output format:
["Educated guess", "Prediction", "Test", "Side-by-side check", "Learn"]

REFERENCE TEXT:
"""
${text.slice(0, 3500)}
"""`;

    try {
      const ollamaResp = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen3.5:4b",
          prompt,
          stream: false,
          options: { temperature: 0.1 }
        }),
      });

      if (ollamaResp.ok) {
        const data = await ollamaResp.json();
        const responseText = data.response || "";
        
        // Extract JSON array from LLM response
        const jsonMatch = responseText.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.length >= 5) {
            const clean = parsed.slice(0, 5).map((k: string) => String(k).trim().replace(/^["']|["']$/g, ''));
            return NextResponse.json({ keywords: clean });
          }
        }
      }
    } catch (ollamaErr) {
      console.warn("Ollama extraction fallback triggered:", ollamaErr);
    }

    // 2. Intelligent NLP Fallback (Filters out all common filler words/adverbs)
    const fillerWords = new Set([
      "something", "instead", "gracefully", "altogether", "simply", "actually",
      "wondering", "happens", "grab", "wrong", "right", "away", "today", "turn",
      "turns", "keeps", "saying", "morning", "fast", "longer", "real", "helpful",
      "about", "their", "there", "these", "those", "which", "where", "while",
      "could", "would", "should", "being", "having", "other", "every", "first"
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((w: string) => w.length >= 4 && !fillerWords.has(w));

    const freqMap: Record<string, number> = {};
    for (const w of words) {
      freqMap[w] = (freqMap[w] || 0) + 1;
    }

    const fallbackKeywords = Object.entries(freqMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

    return NextResponse.json({ keywords: fallbackKeywords });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Extraction failed" }, { status: 500 });
  }
}
