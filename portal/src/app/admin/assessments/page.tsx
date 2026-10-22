"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

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

  const handleEvaluateSubmission = async (submissionId: string) => {
    setEvaluatingId(submissionId);
    try {
      const resp = await fetch("/api/submissions/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-cool-100/70 border border-cool-200 text-cool-900 mb-2">
          <span className="w-2 h-2 rounded-full bg-cool-500 animate-pulse" />
          Academic Assessment & Submissions Review
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Student Submissions & <span className="text-transparent bg-clip-text bg-gradient-to-r from-cool-600 via-indigo-600 to-peach-600">Evaluations</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Inspect student reflection texts, review deterministic keyword scoring (Score / 3), run on-demand evaluations, or override final marks.
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
              <div className="w-8 h-8 mx-auto mb-3 border-2 border-cool-400 border-t-transparent rounded-full animate-spin" />
              Loading student submissions and assessment records...
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              No student submissions found. Submissions will appear here as soon as students submit.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-50 via-cool-50/40 to-slate-50 border-b border-slate-200/80 text-slate-600 uppercase tracking-wider font-bold text-[11px]">
                    <th className="py-4 px-5">Student</th>
                    <th className="py-4 px-4">Session</th>
                    <th className="py-4 px-4">Submitted At</th>
                    <th className="py-4 px-4">Keyword Score</th>
                    <th className="py-4 px-4">Approved Mark</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {submissions.map((s, i) => (
                    <motion.tr
                      key={s.submission_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-cool-50/30 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <span className="font-bold text-slate-900 block">{s.student_name}</span>
                        <span className="font-mono text-slate-400 text-[11px] block">{s.student_usn}</span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {s.session_name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                        {s.submitted_at}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {s.assessment_id ? (
                          <span className="px-2.5 py-1 rounded-lg bg-cool-50 border border-cool-200/80 text-cool-800 font-bold">
                            {s.reference_score} / 15
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not evaluated</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        {s.assessment_id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-sm">
                              {s.final_approved_mark.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400">/5.00</span>
                            {s.has_override && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
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
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : s.status === "NEEDS_REVIEW"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
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

                          {!s.assessment_id ? (
                            <InteractiveButton
                              onClick={() => handleEvaluateSubmission(s.submission_id)}
                              variant="primary"
                              size="sm"
                              disabled={evaluatingId === s.submission_id}
                            >
                              {evaluatingId === s.submission_id ? "Evaluating..." : "⚡ Assess Now"}
                            </InteractiveButton>
                          ) : (
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

                          <InteractiveButton
                            onClick={() => {
                              setDeleteTarget(s);
                              setDeleteError(null);
                            }}
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50/60"
                          >
                            Delete
                          </InteractiveButton>
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
      <AnimatePresence>
        {viewModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-cool-200/60 max-w-xl w-full p-6 sm:p-8 space-y-5 max-h-[92vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cool-100 text-cool-800 mb-1">
                    Student Reflection Details
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    {viewModal.student_name}
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    USN: {viewModal.student_usn} • Session: {viewModal.session_name} • Submitted: {viewModal.submitted_at}
                  </p>
                </div>
                <button
                  onClick={() => setViewModal(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {/* Reflection Body Card */}
              <div className="bg-slate-50/90 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
                    Full Submitted Reflection Body
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {viewModal.char_count} / 500 characters
                  </span>
                </div>
                <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans bg-white p-3.5 rounded-xl border border-slate-100">
                  {viewModal.reflection_text}
                </p>
              </div>

              {/* Assessment Stats or Evaluation Prompt */}
              {viewModal.assessment_id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-cool-50/80 p-3.5 rounded-xl border border-cool-200/80 text-center">
                      <span className="text-[11px] font-bold uppercase text-cool-700 tracking-wider block">
                        Matched Keywords
                      </span>
                      <span className="text-2xl font-black text-cool-900 font-mono">
                        {viewModal.reference_score} / 15
                      </span>
                    </div>
                    <div className="bg-peach-50/80 p-3.5 rounded-xl border border-peach-200/80 text-center">
                      <span className="text-[11px] font-bold uppercase text-peach-700 tracking-wider block">
                        Final Approved Mark
                      </span>
                      <span className="text-2xl font-black text-peach-900 font-mono">
                        {viewModal.final_approved_mark.toFixed(2)} / 5.00
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider block mb-1.5">
                      Keywords Matched in Submission:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {viewModal.matched_keywords.length === 0 ? (
                        <span className="text-xs text-slate-400 italic">No calibrated keywords matched.</span>
                      ) : (
                        viewModal.matched_keywords.map((kw, i) => (
                          <span
                            key={i}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-cool-50 text-cool-700 border border-cool-200 font-semibold"
                          >
                            ✓ {kw}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2">
                  <p className="text-xs font-bold text-amber-800">
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

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <InteractiveButton
                  onClick={() => {
                    setDeleteTarget(viewModal);
                    setDeleteError(null);
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                >
                  Delete Submission
                </InteractiveButton>

                <div className="flex gap-2">
                  {viewModal.assessment_id && (
                    <InteractiveButton
                      onClick={() => {
                        setOverrideModal(viewModal);
                        setOverrideMark(viewModal.final_approved_mark);
                        setOverrideReason("");
                        setOverrideError(null);
                        setViewModal(null);
                      }}
                      variant="outline"
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* OVERRIDE MODAL */}
      <AnimatePresence>
        {overrideModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-cool-200/60 max-w-xl w-full p-6 sm:p-8 space-y-5 max-h-[92vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cool-100 text-cool-800 mb-1">
                    Audited Evaluation Override
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    {overrideModal.student_name}
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    USN: {overrideModal.student_usn} • Session: {overrideModal.session_name}
                  </p>
                </div>
                <button
                  onClick={() => setOverrideModal(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {overrideError && (
                <div className="p-3.5 rounded-2xl bg-red-50/90 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{overrideError}</span>
                </div>
              )}

              <form onSubmit={handleApplyOverride} className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                      Calculated AI Mark
                    </span>
                    <span className="text-xl font-extrabold text-slate-800 font-mono">
                      {overrideModal.original_ai_mark.toFixed(2)}
                      <span className="text-xs text-slate-400 font-normal ml-1">/ 5.00</span>
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
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
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-base font-extrabold font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-cool-400 focus:border-cool-400 focus:outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Mandatory Audit Reason (Required for Record)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Document specific justification for adjusting deterministic score..."
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-peach-400 focus:border-peach-400 focus:outline-none transition leading-relaxed"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
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
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-rose-200 max-w-md w-full p-6 sm:p-7 space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 mb-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Delete Student Submission?
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Are you sure you want to permanently delete the submission by <strong className="text-slate-900">{deleteTarget.student_name}</strong> (<span className="font-mono text-cool-600 font-bold">{deleteTarget.student_usn}</span>) for <strong className="text-slate-900">{deleteTarget.session_name}</strong>?
                  <span className="block mt-1 text-slate-500">
                    This will delete their reflection record and allow the student to resubmit their reflection for this session.
                  </span>
                </p>
              </div>

              {deleteError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
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
                <InteractiveButton
                  type="button"
                  variant="primary"
                  className="bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white"
                  onClick={handleDeleteSubmission}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Permanently Delete"}
                </InteractiveButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
