"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ReportsExportPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
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

      const { data } = await supabase
        .from("sessions")
        .select("id, name, status")
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        setSessions(data);
        setSelectedSessionId(data[0].id);
      }
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
      // Fetch authoritative submissions and assessments for this session
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
      // 1. Fetch all students
      const { data: studentsData } = await supabase
        .from("profiles")
        .select("id, full_name, usn")
        .eq("role", "STUDENT")
        .order("usn", { ascending: true });

      // 2. Fetch all submissions with assessments
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
            // Distinct absent zero!
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Excel Academic Reports (.xlsx)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Export authoritative assessment snapshots, keyword statistics, and master grade sheets
        </p>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-medium border ${
            statusMessage.startsWith("Error")
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}
        >
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Report 1: Session Assessment Sheet */}
        <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
          <div className="border-b pb-3">
            <h2 className="text-base font-bold text-slate-900">
              1. Session Assessment Sheet
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Detailed per-student breakdown for a single session: USN, name, final mark (/5), reference score (/15), selected reference ID, and submission status.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Session
            </label>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportSessionSheet}
            disabled={exportingSession || !selectedSessionId}
            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition disabled:opacity-50 shadow-sm"
          >
            {exportingSession ? "Generating XLSX..." : "Download Session Assessment Sheet (.xlsx)"}
          </button>
        </div>

        {/* Report 2: Master Performance Sheet */}
        <div className="bg-white p-6 rounded-xl border shadow-sm space-y-4">
          <div className="border-b pb-3">
            <h2 className="text-base font-bold text-slate-900">
              2. Master Student Performance Sheet
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Course-wide matrix: Student names, USNs, and one column per session with final approved marks. Clearly distinguishes absent zeroes from assessed zeroes.
            </p>
          </div>

          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border space-y-1">
            <p><strong>Roster:</strong> All registered students in database</p>
            <p><strong>Sessions Included:</strong> {sessions.length} sessions</p>
            <p><strong>Audit Invariant:</strong> Reflects all approved professor overrides</p>
          </div>

          <button
            onClick={handleExportMasterSheet}
            disabled={exportingMaster || sessions.length === 0}
            className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition disabled:opacity-50 shadow-sm"
          >
            {exportingMaster ? "Generating XLSX..." : "Download Master Performance Sheet (.xlsx)"}
          </button>
        </div>
      </div>
    </div>
  );
}
