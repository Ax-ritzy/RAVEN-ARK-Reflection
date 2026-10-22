import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { submissionId, forceQwen = true } = body;

    if (!submissionId) {
      return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Fetch submission record
    const { data: sub, error: subErr } = await admin
      .from("submissions")
      .select(`
        id, session_id, student_id, extracted_text, char_count,
        profiles ( usn, full_name )
      `)
      .eq("id", submissionId)
      .single();

    if (subErr || !sub) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // 2. Fetch session's assigned references and their active 15 keywords
    const { data: sessRefs, error: refErr } = await admin
      .from("session_references")
      .select(`
        reference_id,
        reference_materials (
          id, name, extracted_text,
          reference_keyword_sets ( keywords, is_active )
        )
      `)
      .eq("session_id", sub.session_id);

    if (refErr || !sessRefs || sessRefs.length === 0) {
      return NextResponse.json(
        { error: "No reference materials assigned to this session. Please assign a reference note first." },
        { status: 400 }
      );
    }

    const candidateReferences = sessRefs.map((sr: any) => {
      const rm = sr.reference_materials;
      const kwSet = rm?.reference_keyword_sets?.find((k: any) => k.is_active) || rm?.reference_keyword_sets?.[0];
      return {
        id: rm.id,
        name: rm.name,
        extracted_text: rm.extracted_text || "",
        keywords: kwSet?.keywords || [],
      };
    });

    // 3. Multi-Reference Selection: Identify Major Reference by Highest Keyword Count
    // STRICT ISOLATION: No cross-matching of keywords across files.
    const reflectionWords = new Set(
      sub.extracted_text.toLowerCase().match(/\b[a-zA-Z0-9_\-]+\b/g) || []
    );

    let chosenRef = candidateReferences[0];
    let bestKeywordCount = -1;
    let chosenRefMatchedKeywords: string[] = [];

    for (const ref of candidateReferences) {
      const cleanKeywords = (ref.keywords || []).map((k: string) => k.trim().toLowerCase());
      // Strict isolated evaluation for this specific reference document
      const matched = cleanKeywords.filter((k: string) => reflectionWords.has(k));
      if (matched.length > bestKeywordCount) {
        bestKeywordCount = matched.length;
        chosenRef = ref;
        chosenRefMatchedKeywords = matched;
      }
    }

    const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://localhost:8000";
    let assessResult: any = null;

    // 3. Step A: Try FastAPI Assessment Service (which runs Ollama Qwen 3.5:9B)
    try {
      const endpoint = forceQwen ? `${backendUrl}/api/assess/qwen` : `${backendUrl}/api/assess`;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: sub.id,
          session_id: sub.session_id,
          student_usn: (sub.profiles as any)?.usn || "N/A",
          reflection_text: sub.extracted_text,
          candidate_references: candidateReferences,
          min_similarity_threshold: 0.0,
        }),
      });

      if (resp.ok) {
        assessResult = await resp.json();
      }
    } catch (backendErr) {
      console.warn("Backend FastAPI unreachable, trying direct Ollama Qwen...", backendErr);
    }

    // 3. Step B: Try Direct Ollama Qwen 3.5:9B if FastAPI was unreachable
    if (!assessResult && forceQwen) {
      try {
        const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
        const cleanKeywords = chosenRef.keywords.map((k: string) => k.trim().toLowerCase());

        const ollamaResp = await fetch(`${ollamaUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "qwen3.5:9b",
            think: false,
            messages: [
              {
                role: "system",
                content:
                  "You are an automated academic evaluator. Evaluate student reflections against 15 required keywords. " +
                  "Rule 1: Award 1 mark per keyword only if the keyword (or morphological form) is meaningfully used in context. " +
                  "Rule 2: Max reference_score is 15. " +
                  "Rule 3: calculated_mark = round(reference_score / 3.0, 2) (max 5.00). " +
                  "Rule 4: Output strictly valid JSON: {\"matched_keywords\": [\"k1\"], \"reference_score\": 1, \"calculated_mark\": 0.33, \"feedback\": \"brief evaluation\"}",
              },
              {
                role: "user",
                content: `Reference Topic: ${chosenRef.name}\nRequired 15 Keywords: ${JSON.stringify(cleanKeywords)}\n\nStudent Reflection:\n"${sub.extracted_text}"`,
              },
            ],
            stream: false,
            format: "json",
            options: {
              temperature: 0.0,
              num_predict: 256,
            },
          }),
        });

        if (ollamaResp.ok) {
          const ollamaData = await ollamaResp.json();
          const content = ollamaData?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            const matched = (parsed.matched_keywords || [])
              .map((k: string) => k.toLowerCase().trim())
              .filter((k: string) => cleanKeywords.includes(k));
            const uniqueMatched = Array.from(new Set(matched));
            const score = uniqueMatched.length;
            const mark = Number((score / 3.0).toFixed(2));

            assessResult = {
              selected_reference_id: chosenRef.id,
              similarity_score: 0.90,
              matched_keywords: uniqueMatched,
              reference_score: score,
              calculated_mark: Math.min(5.0, mark),
              status: "COMPLETED",
              evaluation_source: "ollama_qwen3.5:9b_direct",
              feedback: parsed.feedback || "Automated Qwen 3.5 evaluation completed.",
            };
          }
        }
      } catch (ollamaErr) {
        console.warn("Direct Ollama call failed, falling back to deterministic:", ollamaErr);
      }
    }

    // 3. Step C: Deterministic Local Fallback (Guaranteed to succeed)
    if (!assessResult) {
      const refScore = chosenRefMatchedKeywords.length;
      const mark = Number((refScore / 3.0).toFixed(2));

      assessResult = {
        selected_reference_id: chosenRef.id,
        similarity_score: 0.85,
        matched_keywords: chosenRefMatchedKeywords,
        reference_score: refScore,
        calculated_mark: Math.min(5.0, mark),
        status: "COMPLETED",
        evaluation_source: "native_deterministic_fallback",
        feedback: `Deterministic evaluation using major reference: ${chosenRef.name}.`,
      };
    }

    // 4. Check if an existing assessment has a Professor Manual Override
    const { data: existingAssessment } = await admin
      .from("assessments")
      .select(`
        id, final_approved_mark,
        mark_overrides ( id, new_mark )
      `)
      .eq("submission_id", sub.id)
      .maybeSingle();

    const hasOverride = (existingAssessment?.mark_overrides || []).length > 0;
    // CRITICAL: Preserve professor's manual override if one exists
    const finalMark = hasOverride
      ? Number(existingAssessment?.final_approved_mark)
      : (assessResult.calculated_mark || 0.0);

    // 5. Upsert into assessments table using Admin Service Role
    const { data: assessmentRecord, error: assessInsertErr } = await admin
      .from("assessments")
      .upsert(
        {
          submission_id: sub.id,
          selected_reference_id: assessResult.selected_reference_id,
          similarity_score: assessResult.similarity_score || 0.0,
          matched_keywords: assessResult.matched_keywords || [],
          reference_score: assessResult.reference_score || 0,
          original_ai_mark: assessResult.calculated_mark || 0.0,
          final_approved_mark: finalMark,
          status: assessResult.status || "COMPLETED",
          evaluated_at: new Date().toISOString(),
        },
        { onConflict: "submission_id" }
      )
      .select()
      .single();

    if (assessInsertErr) {
      return NextResponse.json({ error: assessInsertErr.message }, { status: 500 });
    }

    // 6. Ensure submission status is updated
    await admin
      .from("submissions")
      .update({ status: "SUBMITTED" })
      .eq("id", sub.id);

    return NextResponse.json({
      success: true,
      assessment: assessmentRecord,
      evaluation_source: assessResult.evaluation_source,
      has_override: hasOverride,
      feedback: assessResult.feedback,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
