"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ResultData {
  sessionName: string;
  submissionStatus: string;
  submittedAt: string;
  extractedText: string;
  charCount: number;
  assessmentStatus: string;
  referenceScore: number;
  finalApprovedMark: number;
  originalAiMark: number;
  hasOverride: boolean;
  matchedKeywords: string[];
}

export default function StudentResultsPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [result, setResult] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadResults() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("auth_user_id", user.id)
        .single();

      if (!profile || profile.role !== "STUDENT") {
        router.push("/login");
        return;
      }

      const { data: session } = await supabase
        .from("sessions")
        .select("name")
        .eq("id", sessionId)
        .single();

      const { data: submission, error: subErr } = await supabase
        .from("submissions")
        .select(`
          id, status, submitted_at, extracted_text, char_count,
          assessments (
            status, reference_score, original_ai_mark, final_approved_mark, matched_keywords
          )
        `)
        .eq("session_id", sessionId)
        .eq("student_id", profile.id)
        .maybeSingle();

      if (subErr || !submission) {
        setErrorMsg("No submission found for this session.");
        setLoading(false);
        return;
      }

      const assessment = Array.isArray(submission.assessments)
        ? submission.assessments[0]
        : submission.assessments;

      const origMark = assessment ? Number(assessment.original_ai_mark) : 0;
      const finalMark = assessment ? Number(assessment.final_approved_mark) : 0;

      setResult({
        sessionName: session?.name || "Assessment Session",
        submissionStatus: submission.status,
        submittedAt: new Date(submission.submitted_at).toLocaleString(),
        extractedText: submission.extracted_text,
        charCount: submission.char_count,
        assessmentStatus: assessment?.status || "PENDING",
        referenceScore: assessment?.reference_score || 0,
        originalAiMark: origMark,
        finalApprovedMark: finalMark,
        hasOverride: Math.abs(finalMark - origMark) > 0.001,
        matchedKeywords: assessment?.matched_keywords || [],
      });

      setLoading(false);
    }

    loadResults();
  }, [sessionId, router]);

  if (loading) {
    return <div className="text-center py-12 text-sm text-slate-500">Loading your evaluation...</div>;
  }

  if (errorMsg || !result) {
    return (
      <div className="max-w-xl mx-auto bg-white p-6 rounded-2xl border text-center">
        <p className="text-sm text-red-600">{errorMsg || "Unable to display result."}</p>
        <a href="/student/dashboard" className="mt-4 inline-block text-xs font-semibold text-blue-600 hover:underline">
          Return to Sessions
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <a href="/student/dashboard" className="text-xs text-blue-600 hover:underline">
            &larr; Back to Sessions
          </a>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            Reflection Evaluation & Marks
          </h1>
          <p className="text-xs text-slate-500">
            Session: <span className="font-semibold text-slate-700">{result.sessionName}</span>
          </p>
        </div>
        <div className="text-right">
          <span
            className={`text-xs px-3 py-1 rounded-full font-semibold uppercase ${
              result.assessmentStatus === "COMPLETED"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : result.assessmentStatus === "NEEDS_REVIEW"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-blue-50 text-blue-700 border border-blue-200"
            }`}
          >
            {result.assessmentStatus}
          </span>
          <p className="text-[11px] text-slate-400 mt-1">Submitted: {result.submittedAt}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            Final Session Mark
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-slate-900">
              {result.assessmentStatus === "COMPLETED" ? result.finalApprovedMark.toFixed(2) : "—"}
            </span>
            <span className="text-base text-slate-400 font-medium">/ 5.00</span>
          </div>
          {result.hasOverride && (
            <div className="mt-3 text-[11px] text-purple-700 bg-purple-50 p-2 rounded-lg border border-purple-100">
              Note: Includes professor grade review (Original AI Mark: {result.originalAiMark.toFixed(2)}/5.00)
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            Reference Keyword Score
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-blue-600">
              {result.assessmentStatus === "COMPLETED" ? result.referenceScore : "—"}
            </span>
            <span className="text-base text-slate-400 font-medium">/ 15</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-3">
            Formula: Session Mark = Reference Score / 3.0
          </p>
        </div>
      </div>

      {result.matchedKeywords.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border shadow-sm">
          <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-3">
            Matched Reference Keywords ({result.matchedKeywords.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {result.matchedKeywords.map((kw, i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 font-medium border border-blue-200"
              >
                ✓ {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            Your Submitted Reflection
          </h3>
          <span className="text-xs text-slate-400">
            {result.charCount} / 500 characters
          </span>
        </div>
        <p className="text-sm text-slate-800 whitespace-pre-wrap bg-slate-50 p-4 rounded-xl border font-mono">
          {result.extractedText}
        </p>
      </div>
    </div>
  );
}
