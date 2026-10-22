import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { submissionId } = body;

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

    // 3. Dispatch to FastAPI Assessment Service
    const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://localhost:8000";
    let assessResult: any = null;

    try {
      const resp = await fetch(`${backendUrl}/api/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: sub.id,
          session_id: sub.session_id,
          student_usn: (sub.profiles as any)?.usn || "N/A",
          reflection_text: sub.extracted_text,
          candidate_references: candidateReferences,
          min_similarity_threshold: 0.0, // Match best candidate available for the session
        }),
      });

      if (resp.ok) {
        assessResult = await resp.json();
      }
    } catch (backendFetchErr) {
      console.warn("Backend FastAPI unreachable, evaluating locally...", backendFetchErr);
    }

    // Fallback: If FastAPI was temporarily unreachable, calculate deterministically here
    if (!assessResult) {
      const chosen = candidateReferences[0];
      const reflectionWords = new Set(
        sub.extracted_text.toLowerCase().match(/\b[a-zA-Z0-9_\-]+\b/g) || []
      );
      const matched = chosen.keywords.filter((kw: string) => reflectionWords.has(kw.toLowerCase()));
      const refScore = matched.length;
      const mark = Number((refScore / 3.0).toFixed(2));

      assessResult = {
        selected_reference_id: chosen.id,
        similarity_score: 0.50,
        matched_keywords: matched,
        reference_score: refScore,
        calculated_mark: mark,
        status: "COMPLETED",
      };
    }

    // 4. Upsert into assessments table using Admin Service Role
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
          final_approved_mark: assessResult.calculated_mark || 0.0,
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

    // 5. Ensure submission status is updated
    await admin
      .from("submissions")
      .update({ status: "SUBMITTED" })
      .eq("id", sub.id);

    return NextResponse.json({
      success: true,
      assessment: assessmentRecord,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
