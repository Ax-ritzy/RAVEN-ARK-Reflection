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
      
      // 1. Kick off sessions query immediately without waiting for auth
      const sessionRowsPromise = supabase
        .from("sessions")
        .select("id, name, status, created_at")
        .order("created_at", { ascending: false });

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, usn, role")
        .eq("auth_user_id", session.user.id)
        .single();

      if (!profile || profile.role !== "STUDENT") {
        router.push("/login");
        return;
      }

      setStudentUsn(profile.usn || "");
      setStudentName(profile.full_name);

      // Concurrently await sessions and student submissions
      const [{ data: sessionRows }, { data: submissionRows }] = await Promise.all([
        sessionRowsPromise,
        supabase
          .from("submissions")
          .select(`
            id, session_id, status, submitted_at,
            assessments ( final_approved_mark, reference_score, status )
          `)
          .eq("student_id", profile.id),
      ]);

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
            <span className="text-xs uppercase font-extrabold tracking-wider text-peach-600 dark:text-peach-300 bg-peach-100/70 dark:bg-peach-950/50 px-3 py-1 rounded-full inline-block mb-1 border border-peach-200/50 dark:border-peach-800/50">
              Student Workspace
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-white tracking-tight">
              Welcome back, <span className="gradient-text-flame">{studentName || "Student"}</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Academic Identifier (USN): <span className="font-bold text-slate-700 dark:text-slate-200">{studentUsn || "N/A"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Active Enrolled Account
            </span>
          </div>
        </div>
      </GlowCard>

      {/* Session List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span>📚</span> Assigned Reflection Sessions
          </h2>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm">
            {sessions.length} Available Sessions
          </span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm text-slate-400 dark:text-slate-500">
            <div className="w-8 h-8 border-2 border-peach-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Loading reflection assessments...
          </div>
        ) : sessions.length === 0 ? (
          <GlowCard className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
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
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {s.status}
                          </span>
                          {hasSubmitted && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800/50">
                              ✓ Submitted
                            </span>
                          )}
                          {isAssessed && (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800/50">
                              ★ Evaluated ({s.submission?.assessment?.final_approved_mark.toFixed(2)}/5.00)
                            </span>
                          )}
                        </div>

                        <h3 className="font-bold text-slate-800 dark:text-white text-lg">
                          {s.name}
                        </h3>
                        <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">
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
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-medium px-4 py-2.5 bg-slate-100/70 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
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
