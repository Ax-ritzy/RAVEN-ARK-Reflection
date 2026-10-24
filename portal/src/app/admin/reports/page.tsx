"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

export default function ReportsExportPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [studentCount, setStudentCount] = useState<number>(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [exportingSession, setExportingSession] = useState(false);
  const [exportingMaster, setExportingMaster] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSessions() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const [{ data }, { count }] = await Promise.all([
        supabase
          .from("sessions")
          .select("id, name, status")
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "STUDENT"),
      ]);

      if (data && data.length > 0) {
        setSessions(data);
        setSelectedSessionId(data[0].id);
      }

      setStudentCount(count || 0);
    }
    loadSessions();
  }, [router]);

  const handleExportSessionSheet = async () => {
    if (!selectedSessionId) return;
    setExportingSession(true);
    setStatusMessage(null);

    const supabase = createClient();
    const session = sessions.find((s) => s.id === selectedSessionId);

    try {
      const { data: submissions } = await supabase
        .from("submissions")
        .select(`
          id, status,
          profiles ( full_name, usn ),
          assessments (
            reference_score, final_approved_mark, selected_reference_id, status,
            reference_materials ( name )
          )
        `)
        .eq("session_id", selectedSessionId);

      const records = (submissions || []).map((sub: any) => {
        const a = Array.isArray(sub.assessments) ? sub.assessments[0] : sub.assessments;
        return {
          usn: sub.profiles?.usn || "N/A",
          student_name: sub.profiles?.full_name || "Unknown",
          final_mark: a ? Number(a.final_approved_mark) : 0.0,
          reference_score: a ? a.reference_score : 0,
          selected_reference_id: a?.selected_reference_id || "N/A",
          selected_material_name: a?.reference_materials?.name || "N/A",
          submission_status: sub.status,
          assessment_status: a?.status || "PENDING",
        };
      });

      const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://localhost:8000";
      const resp = await fetch(`${backendUrl}/api/reports/session-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: selectedSessionId,
          session_name: session?.name || "Session",
          records,
        }),
      });

      if (!resp.ok) throw new Error("Backend failed to generate session Excel report");

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Session_${session?.name.replace(/[^a-zA-Z0-9]/g, "_")}_Assessment.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setStatusMessage("Session Assessment Sheet downloaded successfully.");
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setExportingSession(false);
    }
  };

  const handleExportMasterSheet = async () => {
    setExportingMaster(true);
    setStatusMessage(null);

    const supabase = createClient();

    try {
      const { data: studentsData } = await supabase
        .from("profiles")
        .select("id, full_name, usn")
        .eq("role", "STUDENT")
        .order("usn", { ascending: true });

      const { data: allSubs } = await supabase
        .from("submissions")
        .select(`
          session_id, student_id,
          assessments ( final_approved_mark, status )
        `);

      const scoreLookup = new Map();
      allSubs?.forEach((sub: any) => {
        const a = Array.isArray(sub.assessments) ? sub.assessments[0] : sub.assessments;
        const key = `${sub.student_id}_${sub.session_id}`;
        scoreLookup.set(key, {
          mark: a ? Number(a.final_approved_mark) : 0.0,
          status: a?.status || "SUBMITTED",
        });
      });

      const sessionList = sessions.map((s) => ({ id: s.id, name: s.name }));

      const studentList = (studentsData || []).map((st) => {
        const scores: Record<string, any> = {};
        sessions.forEach((s) => {
          const rec = scoreLookup.get(`${st.id}_${s.id}`);
          if (rec) {
            scores[s.id] = rec;
          } else {
            scores[s.id] = { mark: 0.0, status: "ABSENT" };
          }
        });

        return {
          name: st.full_name,
          usn: st.usn || "N/A",
          scores,
        };
      });

      const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://localhost:8000";
      const resp = await fetch(`${backendUrl}/api/reports/master-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessions: sessionList,
          students: studentList,
        }),
      });

      if (!resp.ok) throw new Error("Backend failed to generate master performance Excel report");

      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Master_Student_Performance_Report.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setStatusMessage("Master Student Performance Sheet downloaded successfully.");
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setExportingMaster(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-peach-100/70 dark:bg-peach-950/40 border border-peach-200 dark:border-peach-800/50 text-peach-900 dark:text-peach-300 mb-2">
          <span className="w-2 h-2 rounded-full bg-peach-500 animate-pulse" />
          Export & Institutional Reporting Engine
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Excel Academic Reports <span className="gradient-text-flame">(.xlsx)</span>
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Export institutional-grade spreadsheets, session performance distributions, and course-wide master grade matrices.
        </p>
      </motion.div>

      {/* Status Alert */}
      {statusMessage && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-2xl text-xs font-semibold border flex items-center gap-3 ${
            statusMessage.startsWith("Error")
              ? "bg-red-50/90 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50"
              : "bg-emerald-50/90 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50 shadow-sm"
          }`}
        >
          <span className="text-base">{statusMessage.startsWith("Error") ? "⚠️" : "✓"}</span>
          <span>{statusMessage}</span>
        </motion.div>
      )}

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Session Sheet Card */}
        <motion.div
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <GlowCard glowColor="cool" className="p-7 space-y-6 flex flex-col justify-between h-full">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cool-100 dark:bg-cyan-950/60 border border-cool-200 dark:border-cyan-800/50 flex items-center justify-center text-cool-600 dark:text-cyan-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    1. Session Assessment Sheet
                  </h2>
                  <span className="text-xs text-cool-700 dark:text-cyan-300 font-semibold">Single Session Breakdown</span>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Detailed per-student breakdown for a chosen session: USN, Student Name, Final Mark (/5.00), Keyword Matches, Selected Reference Title, and Submission Status.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
                  Select Target Session
                </label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 font-semibold text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cool-400 focus:border-cool-400 focus:outline-none transition"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-50/80 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span>Formatting:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">OpenPyXL Styled .xlsx</span>
                </div>
                <div className="flex justify-between">
                  <span>Reference Multi-Selection:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Highest Cosine Match</span>
                </div>
                <div className="flex justify-between">
                  <span>Audit Consistency:</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Live Overrides Included</span>
                </div>
              </div>
            </div>

            <InteractiveButton
              onClick={handleExportSessionSheet}
              disabled={exportingSession || !selectedSessionId}
              variant="primary"
              className="w-full mt-4"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              }
            >
              {exportingSession ? "Generating XLSX..." : "Download Session Assessment Sheet (.xlsx)"}
            </InteractiveButton>
          </GlowCard>
        </motion.div>

        {/* Master Performance Sheet Card */}
        <motion.div
          initial={{ opacity: 0, x: 15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <GlowCard glowColor="peach" className="p-7 space-y-6 flex flex-col justify-between h-full">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-peach-100 dark:bg-peach-950/60 border border-peach-200 dark:border-peach-800/50 flex items-center justify-center text-peach-600 dark:text-peach-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    2. Master Performance Sheet
                  </h2>
                  <span className="text-xs text-peach-700 dark:text-peach-300 font-semibold">Course-Wide Cohort Matrix</span>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Course-wide matrix: Student names, USNs, and one column per session with final approved marks. Clearly distinguishes unsubmitted absent zeroes from assessed zeroes.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-peach-50/70 dark:bg-peach-950/40 p-3 rounded-xl border border-peach-200/60 dark:border-peach-800/50 text-center">
                  <span className="text-xl font-extrabold text-peach-900 dark:text-peach-200 font-mono block">
                    {studentCount}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-peach-700 dark:text-peach-400 tracking-wider">
                    Enrolled Students
                  </span>
                </div>
                <div className="bg-cool-50/70 dark:bg-cyan-950/40 p-3 rounded-xl border border-cool-200/60 dark:border-cyan-800/50 text-center">
                  <span className="text-xl font-extrabold text-cool-900 dark:text-cyan-200 font-mono block">
                    {sessions.length}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-cool-700 dark:text-cyan-400 tracking-wider">
                    Total Sessions
                  </span>
                </div>
              </div>

              <div className="bg-slate-50/80 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span>Absence Distinction:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">"ABSENT" Tagged Explicitly</span>
                </div>
                <div className="flex justify-between">
                  <span>Cross-Session Aggregation:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Automatic Row Totals</span>
                </div>
                <div className="flex justify-between">
                  <span>Professor Audit Sync:</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Fully Synchronized</span>
                </div>
              </div>
            </div>

            <InteractiveButton
              onClick={handleExportMasterSheet}
              disabled={exportingMaster || sessions.length === 0}
              variant="secondary"
              className="w-full mt-4"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            >
              {exportingMaster ? "Generating Master Matrix..." : "Download Master Performance Sheet (.xlsx)"}
            </InteractiveButton>
          </GlowCard>
        </motion.div>
      </div>
    </div>
  );
}
