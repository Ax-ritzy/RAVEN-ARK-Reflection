"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

interface AssessmentRow {
  assessment_id: string;
  submission_id: string;
  student_name: string;
  student_usn: string;
  session_name: string;
  reflection_text: string;
  char_count: number;
  similarity_score: number;
  matched_keywords: string[];
  reference_score: number;
  original_ai_mark: number;
  final_approved_mark: number;
  status: string;
  has_override: boolean;
}

export default function AssessmentReviewPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [overrideModal, setOverrideModal] = useState<AssessmentRow | null>(null);
  const [overrideMark, setOverrideMark] = useState<number>(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const fetchAssessments = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("assessments")
      .select(`
        id, similarity_score, matched_keywords, reference_score,
        original_ai_mark, final_approved_mark, status,
        submissions (
          id, extracted_text, char_count,
          profiles ( full_name, usn ),
          sessions ( name )
        ),
        mark_overrides ( id )
      `)
      .order("evaluated_at", { ascending: false });

    const formatted: AssessmentRow[] = (data || []).map((a: any) => {
      const orig = Number(a.original_ai_mark || 0);
      const fin = Number(a.final_approved_mark || 0);
      const overrides = a.mark_overrides || [];

      return {
        assessment_id: a.id,
        submission_id: a.submissions?.id,
        student_name: a.submissions?.profiles?.full_name || "Unknown Student",
        student_usn: a.submissions?.profiles?.usn || "N/A",
        session_name: a.submissions?.sessions?.name || "Session",
        reflection_text: a.submissions?.extracted_text || "",
        char_count: a.submissions?.char_count || 0,
        similarity_score: a.similarity_score || 0,
        matched_keywords: a.matched_keywords || [],
        reference_score: a.reference_score || 0,
        original_ai_mark: orig,
        final_approved_mark: fin,
        status: a.status,
        has_override: overrides.length > 0 || Math.abs(orig - fin) > 0.001,
      };
    });

    setAssessments(formatted);
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
      fetchAssessments();
    }
    checkAuth();
  }, [router]);

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModal) return;

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
      fetchAssessments();
    } catch (err: any) {
      setOverrideError(err.message || "Failed to record mark override.");
    } finally {
      setSavingOverride(false);
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
          Academic Integrity & Audit Protocol
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Submissions & <span className="text-transparent bg-clip-text bg-gradient-to-r from-cool-600 via-indigo-600 to-peach-600">Assessment Audits</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Review automated cosine similarity matchings, deterministic keyword matches (Mark = Score / 3), and execute professor overrides.
        </p>
      </motion.div>

      {/* Table Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <GlowCard glowColor="cool" className="overflow-hidden p-0">
          {loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              <div className="w-8 h-8 mx-auto mb-3 border-2 border-cool-400 border-t-transparent rounded-full animate-spin" />
              Loading submissions and evaluation metrics...
            </div>
          ) : assessments.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              No assessments recorded yet. Submissions will appear here once processed.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-50 via-cool-50/40 to-slate-50 border-b border-slate-200/80 text-slate-600 uppercase tracking-wider font-bold text-[11px]">
                    <th className="py-4 px-5">Student</th>
                    <th className="py-4 px-4">Session</th>
                    <th className="py-4 px-4">Cosine Similarity</th>
                    <th className="py-4 px-4">Keyword Score</th>
                    <th className="py-4 px-4">Calculated Mark</th>
                    <th className="py-4 px-4">Approved Mark</th>
                    <th className="py-4 px-4">Status</th>
                    <th className="py-4 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {assessments.map((a, i) => (
                    <motion.tr
                      key={a.assessment_id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="hover:bg-cool-50/30 transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <span className="font-bold text-slate-900 block">{a.student_name}</span>
                        <span className="font-mono text-slate-400 text-[11px] block">{a.student_usn}</span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {a.session_name}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-700">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-cool-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.round(a.similarity_score * 100))}%` }}
                            />
                          </div>
                          <span>{(a.similarity_score * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <span className="px-2.5 py-1 rounded-lg bg-cool-50 border border-cool-200/80 text-cool-800 font-bold">
                          {a.reference_score} / 15
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600 font-medium">
                        {a.original_ai_mark.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-sm">
                            {a.final_approved_mark.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400">/5.00</span>
                          {a.has_override && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 border border-purple-200">
                              OVERRIDE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            a.status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : a.status === "NEEDS_REVIEW"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-cool-50 text-cool-700 border border-cool-200"
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <InteractiveButton
                          onClick={() => {
                            setOverrideModal(a);
                            setOverrideMark(a.final_approved_mark);
                            setOverrideReason("");
                            setOverrideError(null);
                          }}
                          variant="outline"
                          size="sm"
                        >
                          Override Mark
                        </InteractiveButton>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlowCard>
      </motion.div>

      {/* Override Modal */}
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

              {/* Reflection Content Card */}
              <div className="bg-slate-50/90 p-4 rounded-2xl border border-slate-200/80">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
                    Student Reflection Body
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {overrideModal.char_count} / 500 characters
                  </span>
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans bg-white p-3 rounded-xl border border-slate-100">
                  {overrideModal.reflection_text}
                </p>
              </div>

              {/* Matched Keywords Pill Box */}
              <div>
                <span className="text-[11px] font-bold uppercase text-slate-500 tracking-wider block mb-2">
                  Deterministic Keyword Matches ({overrideModal.matched_keywords.length} of 15)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {overrideModal.matched_keywords.length === 0 ? (
                    <span className="text-xs text-slate-400 italic">No calibrated keywords matched in reflection.</span>
                  ) : (
                    overrideModal.matched_keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-cool-50 text-cool-700 border border-cool-200 font-semibold flex items-center gap-1 shadow-xs"
                      >
                        <span className="text-cool-500 font-bold">✓</span> {kw}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Grade Adjustment Form */}
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
    </div>
  );
}
