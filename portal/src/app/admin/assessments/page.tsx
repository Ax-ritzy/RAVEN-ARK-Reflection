"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Submission & Assessment Review
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Audit deterministic marks, review keyword matches, and execute verified manual overrides
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-xs text-slate-500">Loading assessments...</div>
        ) : assessments.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-500">No assessments recorded yet.</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">Session</th>
                <th className="py-3 px-4">Similarity</th>
                <th className="py-3 px-4">Ref Score</th>
                <th className="py-3 px-4">AI Mark</th>
                <th className="py-3 px-4">Approved Mark</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assessments.map((a) => (
                <tr key={a.assessment_id} className="hover:bg-slate-50 transition">
                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-slate-900 block">{a.student_name}</span>
                    <span className="font-mono text-slate-500 text-[11px] block">{a.student_usn}</span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-700">{a.session_name}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-600">
                    {(a.similarity_score * 100).toFixed(1)}%
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-blue-600">
                    {a.reference_score} / 15
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600">
                    {a.original_ai_mark.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                    {a.final_approved_mark.toFixed(2)}
                    {a.has_override && (
                      <span className="ml-1 text-[10px] text-purple-600 font-semibold">(Override)</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                        a.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : a.status === "NEEDS_REVIEW"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => {
                        setOverrideModal(a);
                        setOverrideMark(a.final_approved_mark);
                        setOverrideReason("");
                        setOverrideError(null);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[11px] transition"
                    >
                      Override Mark
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {overrideModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-slate-900">Manual Grade Override</h2>
                <p className="text-xs text-slate-500">
                  {overrideModal.student_name} ({overrideModal.student_usn})
                </p>
              </div>
              <button
                onClick={() => setOverrideModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {overrideError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                {overrideError}
              </div>
            )}

            <div className="bg-slate-50 p-3.5 rounded-xl border">
              <span className="text-[11px] font-semibold uppercase text-slate-500 block mb-1">
                Student Reflection Body ({overrideModal.char_count} chars)
              </span>
              <p className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                {overrideModal.reflection_text}
              </p>
            </div>

            <div>
              <span className="text-[11px] font-semibold uppercase text-slate-500 block mb-1.5">
                Matched Keywords ({overrideModal.matched_keywords.length} of 15)
              </span>
              <div className="flex flex-wrap gap-1">
                {overrideModal.matched_keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-medium border border-blue-200"
                  >
                    ✓ {kw}
                  </span>
                ))}
              </div>
            </div>

            <form onSubmit={handleApplyOverride} className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-100 p-3 rounded-xl">
                  <span className="text-[11px] text-slate-500 block">Original AI Mark</span>
                  <span className="text-lg font-bold text-slate-800">
                    {overrideModal.original_ai_mark.toFixed(2)} / 5.00
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Approved Mark (/5.00)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    required
                    value={overrideMark}
                    onChange={(e) => setOverrideMark(parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border rounded-xl text-sm font-bold font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory Audit Reason for Override
                </label>
                <textarea
                  rows={3}
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain why this grade is being manually corrected..."
                  className="w-full p-2.5 border rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOverrideModal(null)}
                  className="px-3.5 py-2 rounded-xl border text-xs text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOverride}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  {savingOverride ? "Saving Override..." : "Save Approved Mark"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
