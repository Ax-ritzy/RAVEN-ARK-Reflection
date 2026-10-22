"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface SessionItem {
  id: string;
  name: string;
  status: "OPEN" | "CLOSED";
  created_at: string;
  submission?: {
    id: string;
    status: string;
    submitted_at: string;
    assessment?: {
      final_approved_mark: number;
      reference_score: number;
      status: string;
    };
  };
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [studentUsn, setStudentUsn] = useState<string>("");
  const [studentName, setStudentName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      // Fetch profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, usn, role")
        .eq("auth_user_id", user.id)
        .single();

      if (!profile || profile.role !== "STUDENT") {
        router.push("/login");
        return;
      }

      setStudentUsn(profile.usn || "");
      setStudentName(profile.full_name);

      // Fetch sessions and student's submissions
      const { data: sessionRows } = await supabase
        .from("sessions")
        .select("id, name, status, created_at")
        .order("created_at", { ascending: false });

      const { data: submissionRows } = await supabase
        .from("submissions")
        .select(`
          id, session_id, status, submitted_at,
          assessments ( final_approved_mark, reference_score, status )
        `)
        .eq("student_id", profile.id);

      const subMap = new Map();
      if (submissionRows) {
        submissionRows.forEach((sub: any) => {
          subMap.set(sub.session_id, {
            id: sub.id,
            status: sub.status,
            submitted_at: sub.submitted_at,
            assessment: sub.assessments?.[0] || sub.assessments,
          });
        });
      }

      const merged: SessionItem[] = (sessionRows || []).map((s: any) => ({
        ...s,
        submission: subMap.get(s.id),
      }));

      setSessions(merged);
      setLoading(false);
    }

    loadData();
  }, [router]);

  return (
    <div className="space-y-6">
      {/* Student Welcome Card */}
      <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Welcome, {studentName || "Student"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Student USN: <span className="font-semibold text-slate-700">{studentUsn || "N/A"}</span>
          </p>
        </div>
        <div className="text-xs px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-200 self-start sm:self-auto">
          Active Student Account
        </div>
      </div>

      {/* Session List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">
            Assigned Reflection Sessions
          </h2>
          <span className="text-xs text-slate-500">
            {sessions.length} Total Sessions
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-slate-500">
            Loading your sessions...
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border text-center text-sm text-slate-500">
            No assessment sessions currently available.
          </div>
        ) : (
          <div className="grid gap-4">
            {sessions.map((s) => {
              const hasSubmitted = !!s.submission;
              const isAssessed = s.submission?.assessment?.status === "COMPLETED";

              return (
                <div
                  key={s.id}
                  className="bg-white p-5 rounded-xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:border-slate-300"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase ${
                          s.status === "OPEN"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {s.status}
                      </span>
                      {hasSubmitted && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          Submitted
                        </span>
                      )}
                      {isAssessed && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                          Evaluated
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900 text-base">
                      {s.name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Session ID: {s.id}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {hasSubmitted ? (
                      <button
                        onClick={() => router.push(`/results/${s.id}`)}
                        className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition"
                      >
                        View Results
                      </button>
                    ) : s.status === "OPEN" ? (
                      <button
                        onClick={() => router.push(`/submit/${s.id}`)}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition shadow-sm"
                      >
                        Submit Reflection
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium px-3 py-2 bg-slate-50 rounded-lg border">
                        Session Closed (Missing)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
