"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

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
    <div className="space-y-7">
      {/* Welcome Banner Card */}
      <GlowCard glowColor="peach" className="p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs uppercase font-extrabold tracking-wider text-peach-600 bg-peach-100/70 px-3 py-1 rounded-full inline-block mb-1 border border-peach-200/50">
              Student Workspace
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">
              Welcome back, <span className="gradient-text-peach-cool">{studentName || "Student"}</span>
            </h1>
            <p className="text-xs text-slate-500 font-mono">
              Academic Identifier (USN): <span className="font-bold text-slate-700">{studentUsn || "N/A"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Active Enrolled Account
            </span>
          </div>
        </div>
      </GlowCard>

      {/* Session List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>📚</span> Assigned Reflection Sessions
          </h2>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/80 border border-slate-200 text-slate-600 shadow-sm">
            {sessions.length} Available Sessions
          </span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm text-slate-400">
            <div className="w-8 h-8 border-2 border-peach-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading reflection assessments...
          </div>
        ) : sessions.length === 0 ? (
          <GlowCard className="p-12 text-center text-sm text-slate-500">
            No reflection sessions currently assigned.
          </GlowCard>
        ) : (
          <div className="grid gap-4">
            {sessions.map((s, idx) => {
              const hasSubmitted = !!s.submission;
              const isAssessed = s.submission?.assessment?.status === "COMPLETED";

              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <GlowCard glowColor={s.status === "OPEN" ? "peach" : "cool"} className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider ${
                              s.status === "OPEN"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-slate-100 text-slate-600 border border-slate-200"
                            }`}
                          >
                            {s.status}
                          </span>
                          {hasSubmitted && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                              ✓ Submitted
                            </span>
                          )}
                          {isAssessed && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-semibold border border-purple-200">
                              ★ Evaluated ({s.submission?.assessment?.final_approved_mark.toFixed(2)}/5.00)
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-slate-800 text-lg">
                          {s.name}
                        </h3>
                        <p className="text-xs text-slate-400 font-mono">
                          ID: {s.id}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {hasSubmitted ? (
                          <InteractiveButton
                            variant="secondary"
                            onClick={() => router.push(`/student/results/${s.id}`)}
                          >
                            View Result & Review →
                          </InteractiveButton>
                        ) : s.status === "OPEN" ? (
                          <InteractiveButton
                            variant="primary"
                            onClick={() => router.push(`/student/submit/${s.id}`)}
                          >
                            Submit Reflection →
                          </InteractiveButton>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium px-4 py-2.5 bg-slate-100/70 rounded-xl border">
                            Session Concluded
                          </span>
                        )}
                      </div>
                    </div>
                  </GlowCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
