"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import GlowCard from "@/components/GlowCard";

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
    return (
      <div className="text-center py-20 text-slate-400 dark:text-slate-500 text-sm">
        <div className="w-8 h-8 border-2 border-peach-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Retrieving authoritative evaluation...
      </div>
    );
  }

  if (errorMsg || !result) {
    return (
      <GlowCard className="max-w-xl mx-auto p-8 text-center space-y-4">
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{errorMsg || "Unable to display result."}</p>
        <a href="/student/dashboard" className="text-xs font-bold text-peach-600 dark:text-peach-400 hover:underline">
          &larr; Return to Dashboard
        </a>
      </GlowCard>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <a href="/student/dashboard" className="text-xs font-semibold text-peach-600 dark:text-peach-400 hover:underline">
            &larr; Back to Sessions
          </a>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight mt-1">
            Reflection Evaluation
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Session: <span className="font-bold text-slate-700 dark:text-slate-200">{result.sessionName}</span>
          </p>
        </div>
        <div className="text-right self-start sm:self-auto">
          <span
            className={`text-xs px-3.5 py-1.5 rounded-full font-bold uppercase tracking-wider ${
              result.assessmentStatus === "COMPLETED"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50"
                : result.assessmentStatus === "NEEDS_REVIEW"
                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50"
                : "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50"
            }`}
          >
            {result.assessmentStatus}
          </span>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-mono">{result.submittedAt}</p>
        </div>
      </div>

      {/* Hero Grade Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Final Approved Mark */}
        <GlowCard glowColor="peach" className="p-7">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Final Session Mark
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-black gradient-text-flame">
              {result.assessmentStatus === "COMPLETED" ? result.finalApprovedMark.toFixed(2) : "—"}
            </span>
            <span className="text-base text-slate-400 dark:text-slate-500 font-bold">/ 5.00</span>
          </div>
          {result.hasOverride && (
            <div className="mt-3 text-[11px] font-medium text-purple-700 dark:text-purple-300 bg-purple-50/80 dark:bg-purple-950/40 p-2.5 rounded-xl border border-purple-200/60 dark:border-purple-800/50">
              Note: Professor grade override applied (Original AI: {result.originalAiMark.toFixed(2)}/5.00)
            </div>
          )}
        </GlowCard>

        {/* Reference Score */}
        <GlowCard glowColor="cool" className="p-7">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Reference Score (15 Keywords)
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-black text-cool-500 dark:text-cyan-400">
              {result.assessmentStatus === "COMPLETED" ? result.referenceScore : "—"}
            </span>
            <span className="text-base text-slate-400 dark:text-slate-500 font-bold">/ 15</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 font-mono">
            Deterministic Formula: Mark = Keyword Score ÷ 3.0
          </p>
        </GlowCard>
      </div>

      {/* Matched Keywords Grid */}
      {result.matchedKeywords.length > 0 && (
        <GlowCard className="p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Matched Keywords ({result.matchedKeywords.length} of 15)
          </h3>
          <div className="flex flex-wrap gap-2">
            {result.matchedKeywords.map((kw, i) => (
              <motion.span
                key={i}
                whileHover={{ scale: 1.08 }}
                className="text-xs px-3 py-1.5 rounded-xl bg-gradient-to-r from-peach-50 to-cool-50 dark:from-slate-800/80 dark:to-slate-800/60 text-slate-800 dark:text-slate-100 font-semibold border border-peach-200/80 dark:border-slate-700 shadow-sm cursor-default"
              >
                ✓ {kw}
              </motion.span>
            ))}
          </div>
        </GlowCard>
      )}

      {/* Submitted Text */}
      <GlowCard className="p-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Your Submitted Body
          </h3>
          <span className="text-xs font-mono text-slate-400 dark:text-slate-500 font-semibold">
            {result.charCount} / 500 characters
          </span>
        </div>
        <div className="bg-white/70 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-100 whitespace-pre-wrap font-mono leading-relaxed">
          {result.extractedText}
        </div>
      </GlowCard>
    </div>
  );
}
