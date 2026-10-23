"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";
import Modal from "@/components/Modal";

interface SubmissionRow {
  submission_id: string;
  assessment_id: string | null;
  student_name: string;
  student_usn: string;
  session_name: string;
  reflection_text: string;
  char_count: number;
  submitted_at: string;
  similarity_score: number;
  matched_keywords: string[];
  reference_score: number;
  original_ai_mark: number;
  final_approved_mark: number;
  status: string; // "COMPLETED" | "NEEDS_REVIEW" | "PENDING_EVALUATION"
  has_override: boolean;
}

export default function AssessmentReviewPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);

  // View Reflection Modal State
  const [viewModal, setViewModal] = useState<SubmissionRow | null>(null);

  // Grade Override Modal State
  const [overrideModal, setOverrideModal] = useState<SubmissionRow | null>(null);
  const [overrideMark, setOverrideMark] = useState<number>(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Delete Submission Modal State
  const [deleteTarget, setDeleteTarget] = useState<SubmissionRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchSubmissionsAndAssessments = async () => {
    const supabase = createClient();
    
    // Select from submissions to ensure EVERY student submission is visible
    const { data, error } = await supabase
      .from("submissions")
      .select(`
        id, session_id, student_id, extracted_text, char_count, status, submitted_at,
        profiles ( full_name, usn ),
        sessions ( name ),
        assessments (
          id, similarity_score, matched_keywords, reference_score,
          original_ai_mark, final_approved_mark, status,
          mark_overrides ( id )
        )
      `)
      .order("submitted_at", { ascending: false });

    if (error) {
      console.error("Error loading submissions:", error);
      setLoading(false);
      return;
    }

    const formatted: SubmissionRow[] = (data || []).map((s: any) => {
      const a = Array.isArray(s.assessments) ? s.assessments[0] : s.assessments;
      const orig = a ? Number(a.original_ai_mark || 0) : 0;
      const fin = a ? Number(a.final_approved_mark || 0) : 0;
      const overrides = a?.mark_overrides || [];

      return {
        submission_id: s.id,
        assessment_id: a?.id || null,
        student_name: s.profiles?.full_name || "Unknown Student",
        student_usn: s.profiles?.usn || "N/A",
        session_name: s.sessions?.name || "Session",
        reflection_text: s.extracted_text || "",
        char_count: s.char_count || 0,
        submitted_at: s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "Recently",
        similarity_score: a?.similarity_score || 0,
        matched_keywords: a?.matched_keywords || [],
        reference_score: a?.reference_score || 0,
        original_ai_mark: orig,
        final_approved_mark: fin,
        status: a ? a.status : "PENDING_EVALUATION",
        has_override: overrides.length > 0 || Math.abs(orig - fin) > 0.001,
      };
    });

    setSubmissions(formatted);
    setLoading(false);
  };

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      fetchSubmissionsAndAssessments();
    }
    checkAuth();
  }, [router]);

  const handleEvaluateSubmission = async (submissionId: string, forceQwen: boolean = true) => {
    setEvaluatingId(submissionId);
    try {
      const resp = await fetch("/api/submissions/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, forceQwen }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        throw new Error(errJson?.error || "Evaluation failed.");
      }

      await fetchSubmissionsAndAssessments();
    } catch (err: any) {
      alert(err.message || "Could not evaluate submission.");
    } finally {
      setEvaluatingId(null);
    }
  };

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModal) return;

    if (!overrideModal.assessment_id) {
      setOverrideError("Please evaluate the submission before applying a mark override.");
      return;
    }

    if (overrideMark < 0 || overrideMark > 5) {
      setOverrideError("Mark must be between 0.00 and 5.00.");
      return;
    }

    if (!overrideReason.trim()) {
      setOverrideError("Please provide an explicit audit reason for this grade override.");
      return;
    }

    setSavingOverride(true);
    setOverrideError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user?.id)
      .single();

    try {
      const { error: overrideInsertErr } = await supabase
        .from("mark_overrides")
        .insert({
          assessment_id: overrideModal.assessment_id,
          professor_id: profProfile?.id,
          previous_mark: overrideModal.final_approved_mark,
          new_mark: overrideMark,
          reason: overrideReason.trim(),
        });

      if (overrideInsertErr) throw new Error(overrideInsertErr.message);

      const { error: assessUpdateErr } = await supabase
        .from("assessments")
        .update({
          final_approved_mark: overrideMark,
          status: "COMPLETED",
        })
        .eq("id", overrideModal.assessment_id);

      if (assessUpdateErr) throw new Error(assessUpdateErr.message);

      setOverrideModal(null);
      setOverrideReason("");
      fetchSubmissionsAndAssessments();
    } catch (err: any) {
      setOverrideError(err.message || "Failed to record mark override.");
    } finally {
      setSavingOverride(false);
    }
  };

  const handleDeleteSubmission = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("submissions")
        .delete()
        .eq("id", deleteTarget.submission_id);

      if (error) throw new Error(error.message);

      setDeleteTarget(null);
      if (viewModal?.submission_id === deleteTarget.submission_id) {
        setViewModal(null);
      }
      fetchSubmissionsAndAssessments();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete submission.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-cool-100/70 dark:bg-red-950/40 border border-cool-200 dark:border-red-500/30 text-cool-900 dark:text-red-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Academic Assessment & Submissions Review
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            🤖 Ollama Qwen 3.5:9B Active
          </div>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Student Submissions & <span className="gradient-text-flame">Evaluations</span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Inspect student reflections, review automated Qwen 3.5 semantic scoring (Score / 3), trigger on-demand AI assessments, and record audited manual overrides.
        </p>
      </motion.div>

      {/* Submissions Table Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <GlowCard glowColor="cool" className="overflow-hidden p-0">
          {loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              <div className="w-8 h-8 mx-auto mb-3 border-2 border-cool-400 dark:border-cyan-400 border-t-transparent rounded-full animate-spin" />
              Loading student submissions and assessment records...
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              No student submissions found. Submissions will appear here as soon as students submit.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100/80 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold text-[11px]">
                    <th className="py-4 px-5">Student</th>
                    <th className="py-4 px-4">Session</th>
                    <th className="py-4 px-4">Submitted At</th>
                    <th className="py-4 px-4">Keyword Score</th>
                    <th className="py-4 px-4">Approved Mark</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {submissions.map((s, i) => (
                    <motion.tr
                      key={s.submission_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-slate-100/50 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <span className="font-bold text-slate-900 dark:text-white block">{s.student_name}</span>
                        <span className="font-mono text-slate-400 dark:text-slate-500 text-[11px] block">{s.student_usn}</span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                        {s.session_name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                        {s.submitted_at}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {s.assessment_id ? (
                          <span className="px-2.5 py-1 rounded-lg bg-cool-50 dark:bg-cyan-950/40 border border-cool-200/80 dark:border-cyan-500/30 text-cool-800 dark:text-cyan-300 font-bold">
                            {s.reference_score} / 15
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not evaluated</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {s.assessment_id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">
                              {s.final_approved_mark.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400">/5.00</span>
                            {s.has_override && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
                                OVERRIDE
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            s.status === "COMPLETED"
                              ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
                              : s.status === "NEEDS_REVIEW"
                              ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30"
                              : "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30"
                          }`}
                        >
                          {s.status === "PENDING_EVALUATION" ? "PENDING EVALUATION" : s.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <InteractiveButton
                            onClick={() => setViewModal(s)}
                            variant="secondary"
                            size="sm"
                          >
                            View Submission
                          </InteractiveButton>

                          <InteractiveButton
                            onClick={() => handleEvaluateSubmission(s.submission_id, true)}
                            variant={s.assessment_id ? "ghost" : "primary"}
                            size="sm"
                            disabled={evaluatingId === s.submission_id}
                            className={s.assessment_id ? "text-cool-700 hover:bg-cool-100/60" : ""}
                          >
                            {evaluatingId === s.submission_id ? (
                              <span className="flex items-center gap-1">
                                <span className="w-3 h-3 border-2 border-cool-500 border-t-transparent rounded-full animate-spin" />
                                Qwen Evaluating...
                              </span>
                            ) : (
                              <span>🤖 {s.assessment_id ? "Re-assess" : "Assess (Qwen)"}</span>
                            )}
                          </InteractiveButton>

                          {s.assessment_id && (
                            <InteractiveButton
                              onClick={() => {
                                setOverrideModal(s);
                                setOverrideMark(s.final_approved_mark);
                                setOverrideReason("");
                                setOverrideError(null);
                              }}
                              variant="outline"
                              size="sm"
                            >
                              Override Mark
                            </InteractiveButton>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setDeleteTarget(s);
                              setDeleteError(null);
                            }}
                            className="relative z-20 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-800/50 active:scale-95 transition-all cursor-pointer select-none"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlowCard>
      </motion.div>

      {/* VIEW SUBMISSION MODAL */}
      <Modal
        isOpen={Boolean(viewModal)}
        onClose={() => setViewModal(null)}
        maxWidth="max-w-xl"
      >
        {viewModal && (
          <div className="space-y-5">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800/80 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cool-100 dark:bg-cyan-950/40 text-cool-800 dark:text-cyan-300 mb-1 border border-cool-200 dark:border-cyan-500/30">
                  Student Reflection Details
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  {viewModal.student_name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  USN: {viewModal.student_usn} • Session: {viewModal.session_name} • Submitted: {viewModal.submitted_at}
                </p>
              </div>
              <button
                onClick={() => setViewModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white border border-white/40 dark:border-white/10 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Reflection Body Card */}
            <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-400 tracking-wider">
                  Full Submitted Reflection Body
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {viewModal.char_count} / 500 characters
                </span>
              </div>
              <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                {viewModal.reflection_text}
              </p>
            </div>

            {/* Assessment Stats or Evaluation Prompt */}
            {viewModal.assessment_id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-cool-50/80 dark:bg-cyan-950/40 p-3.5 rounded-xl border border-cool-200 dark:border-cyan-500/30 text-center">
                    <span className="text-[11px] font-bold uppercase text-cool-700 dark:text-cyan-400 tracking-wider block">
                      Matched Keywords
                    </span>
                    <span className="text-2xl font-black text-cool-900 dark:text-cyan-300 font-mono">
                      {viewModal.reference_score} / 15
                    </span>
                  </div>
                  <div className="bg-peach-50/80 dark:bg-pink-950/40 p-3.5 rounded-xl border border-peach-200 dark:border-pink-500/30 text-center">
                    <span className="text-[11px] font-bold uppercase text-peach-700 dark:text-pink-400 tracking-wider block">
                      Final Approved Mark
                    </span>
                    <span className="text-2xl font-black text-peach-900 dark:text-pink-300 font-mono">
                      {viewModal.final_approved_mark.toFixed(2)} / 5.00
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider block mb-1.5">
                    Keywords Matched in Submission:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {viewModal.matched_keywords.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">No calibrated keywords matched.</span>
                    ) : (
                      viewModal.matched_keywords.map((kw, i) => (
                        <span
                          key={i}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-cool-50 dark:bg-cyan-950/40 text-cool-700 dark:text-cyan-300 border border-cool-200 dark:border-cyan-500/30 font-semibold"
                        >
                          ✓ {kw}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 text-center space-y-2">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  This submission is pending evaluation.
                </p>
                <InteractiveButton
                  onClick={async () => {
                    await handleEvaluateSubmission(viewModal.submission_id);
                    setViewModal(null);
                  }}
                  variant="primary"
                  size="sm"
                  disabled={evaluatingId === viewModal.submission_id}
                >
                  {evaluatingId === viewModal.submission_id ? "Evaluating..." : "⚡ Evaluate Reflection Now"}
                </InteractiveButton>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDeleteTarget(viewModal);
                  setDeleteError(null);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50 active:scale-95 transition-all cursor-pointer select-none"
              >
                Delete Submission
              </button>

              <div className="flex gap-2">
                <InteractiveButton
                  onClick={async () => {
                    await handleEvaluateSubmission(viewModal.submission_id, true);
                    setViewModal(null);
                  }}
                  variant="outline"
                  size="sm"
                  disabled={evaluatingId === viewModal.submission_id}
                  className="border-cool-300 text-cool-800 hover:bg-cool-50"
                >
                  {evaluatingId === viewModal.submission_id ? "Evaluating..." : "🤖 Re-evaluate (Qwen)"}
                </InteractiveButton>

                {viewModal.assessment_id && (
                  <InteractiveButton
                    onClick={() => {
                      setOverrideModal(viewModal);
                      setOverrideMark(viewModal.final_approved_mark);
                      setOverrideReason("");
                      setOverrideError(null);
                      setViewModal(null);
                    }}
                    variant="primary"
                    size="sm"
                  >
                    Override Mark
                  </InteractiveButton>
                )}
                <InteractiveButton
                  onClick={() => setViewModal(null)}
                  variant="secondary"
                  size="sm"
                >
                  Close
                </InteractiveButton>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* OVERRIDE MODAL */}
      <Modal
        isOpen={Boolean(overrideModal)}
        onClose={() => setOverrideModal(null)}
        maxWidth="max-w-xl"
      >
        {overrideModal && (
          <div className="space-y-5">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800/80 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cool-100 dark:bg-cyan-950/40 text-cool-800 dark:text-cyan-300 mb-1 border border-cool-200 dark:border-cyan-500/30">
                  Audited Evaluation Override
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  {overrideModal.student_name}
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  USN: {overrideModal.student_usn} • Session: {overrideModal.session_name}
                </p>
              </div>
              <button
                onClick={() => setOverrideModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white border border-white/40 dark:border-white/10 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {overrideError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0 text-rose-500 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{overrideError}</span>
              </div>
            )}

            <form onSubmit={handleApplyOverride} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-950/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide block mb-1">
                    Calculated AI Mark
                  </span>
                  <span className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
                    {overrideModal.original_ai_mark.toFixed(2)}
                    <span className="text-xs text-slate-400 font-normal ml-1">/ 5.00</span>
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
                    New Approved Mark (/5.00)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    required
                    value={overrideMark}
                    onChange={(e) => setOverrideMark(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-base font-extrabold font-mono text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
                  Mandatory Audit Reason (Required for Record)
                </label>
                <textarea
                  rows={3}
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Document specific justification for adjusting deterministic score..."
                  className="w-full p-3.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition leading-relaxed"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-3">
                <InteractiveButton
                  type="button"
                  variant="outline"
                  onClick={() => setOverrideModal(null)}
                >
                  Cancel
                </InteractiveButton>
                <InteractiveButton
                  type="submit"
                  variant="primary"
                  disabled={savingOverride}
                >
                  {savingOverride ? "Recording Override..." : "Save Approved Mark"}
                </InteractiveButton>
              </div>
            </form>
          </div>
        )}
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        maxWidth="max-w-md"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/50 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Delete Student Submission?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Are you sure you want to permanently delete the submission by <strong className="text-slate-900 dark:text-white">{deleteTarget.student_name}</strong> (<span className="font-mono text-cyan-600 dark:text-cyan-300 font-bold">{deleteTarget.student_usn}</span>) for <strong className="text-slate-900 dark:text-white">{deleteTarget.session_name}</strong>?
                <span className="block mt-1 text-slate-500 dark:text-slate-400">
                  This will delete their reflection record and allow the student to resubmit their reflection for this session.
                </span>
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs">
                {deleteError}
              </div>
            )}

            <div className="pt-2 flex justify-end gap-3">
              <InteractiveButton
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </InteractiveButton>
              <button
                type="button"
                onClick={handleDeleteSubmission}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-rose-600/30 active:scale-95 transition cursor-pointer select-none disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
