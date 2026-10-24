"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

interface DashboardMetrics {
  totalStudents: number;
  totalSessions: number;
  openSessions: number;
  closedSessions: number;
  totalSubmissions: number;
  completedAssessments: number;
  pendingAssessments: number;
  needsReviewAssessments: number;
  failedAssessments: number;
  averageMark: number;
}

export default function ProfessorDashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalStudents: 0,
    totalSessions: 0,
    openSessions: 0,
    closedSessions: 0,
    totalSubmissions: 0,
    completedAssessments: 0,
    pendingAssessments: 0,
    needsReviewAssessments: 0,
    failedAssessments: 0,
    averageMark: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMetrics() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("auth_user_id", user.id)
        .single();

      if (profile?.role !== "PROFESSOR") {
        router.push("/login");
        return;
      }

      // Concurrently query institutional telemetry metrics in parallel
      const [
        { count: studentCount },
        { data: sessions },
        { count: subCount },
        { data: assessments },
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "STUDENT"),
        supabase.from("sessions").select("status"),
        supabase.from("submissions").select("id", { count: "exact", head: true }),
        supabase.from("assessments").select("status, final_approved_mark"),
      ]);

      const totalSess = sessions?.length || 0;
      const openSess = sessions?.filter((s) => s.status === "OPEN").length || 0;
      const closedSess = sessions?.filter((s) => s.status === "CLOSED").length || 0;

      let completed = 0;
      let pending = 0;
      let needsReview = 0;
      let failed = 0;
      let sumMarks = 0;

      assessments?.forEach((a) => {
        if (a.status === "COMPLETED") {
          completed++;
          sumMarks += Number(a.final_approved_mark || 0);
        } else if (a.status === "PENDING" || a.status === "PROCESSING") {
          pending++;
        } else if (a.status === "NEEDS_REVIEW") {
          needsReview++;
        } else if (a.status === "FAILED") {
          failed++;
        }
      });

      const avg = completed > 0 ? Number((sumMarks / completed).toFixed(2)) : 0;

      setMetrics({
        totalStudents: studentCount || 0,
        totalSessions: totalSess,
        openSessions: openSess,
        closedSessions: closedSess,
        totalSubmissions: subCount || 0,
        completedAssessments: completed,
        pendingAssessments: pending,
        needsReviewAssessments: needsReview,
        failedAssessments: failed,
        averageMark: avg,
      });

      setLoading(false);
    }

    loadMetrics();
  }, [router]);

  return (
    <div className="space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-peach-600 dark:text-red-300 bg-peach-100/70 dark:bg-red-950/40 px-3 py-1 rounded-full inline-block mb-1 border border-peach-200/50 dark:border-red-500/30">
            Administrative Control Panel
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Institutional Telemetry
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time reflection assessment metrics and status monitoring
          </p>
        </div>
        <div className="flex gap-2">
          <InteractiveButton
            variant="secondary"
            onClick={() => router.push("/admin/sessions")}
          >
            Manage Sessions
          </InteractiveButton>
          <InteractiveButton
            variant="primary"
            onClick={() => router.push("/admin/students")}
          >
            + Provision Student
          </InteractiveButton>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400 text-sm">
          <div className="w-8 h-8 border-2 border-peach-400 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Aggregating authoritative database records...
        </div>
      ) : (
        <>
          {/* Top Metric Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <GlowCard glowColor="peach" className="p-6">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Total Enrolled</span>
              <p className="text-4xl font-black text-slate-900 dark:text-white mt-2">{metrics.totalStudents}</p>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">Active Profiles</span>
            </GlowCard>

            <GlowCard glowColor="cool" className="p-6">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Sessions</span>
              <p className="text-4xl font-black text-slate-900 dark:text-white mt-2">{metrics.totalSessions}</p>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 block font-bold">
                {metrics.openSessions} Open · {metrics.closedSessions} Closed
              </span>
            </GlowCard>

            <GlowCard glowColor="lavender" className="p-6">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Submissions</span>
              <p className="text-4xl font-black text-cool-500 dark:text-cyan-400 mt-2">{metrics.totalSubmissions}</p>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">Total Submissions</span>
            </GlowCard>

            <GlowCard glowColor="peach" className="p-6">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Average Mark</span>
              <p className="text-4xl font-black gradient-text-peach-cool mt-2">{metrics.averageMark.toFixed(2)}</p>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block font-mono">Out of 5.00 Max</span>
            </GlowCard>
          </div>

          {/* Assessment Health Breakdown */}
          <GlowCard className="p-7">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
              Real-Time Processing Breakdown
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-500/30 shadow-sm">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Evaluated & Completed</span>
                <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{metrics.completedAssessments}</p>
              </div>

              <div className="p-5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-500/30 shadow-sm">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Needs Review (Similarity / USN)</span>
                <p className="text-3xl font-black text-amber-700 dark:text-amber-400 mt-1">{metrics.needsReviewAssessments}</p>
              </div>

              <div className="p-5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-500/30 shadow-sm">
                <span className="text-xs font-bold text-blue-800 dark:text-blue-300">Pending Evaluation</span>
                <p className="text-3xl font-black text-blue-700 dark:text-blue-400 mt-1">{metrics.pendingAssessments}</p>
              </div>

              <div className="p-5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-500/30 shadow-sm">
                <span className="text-xs font-bold text-rose-800 dark:text-rose-300">Evaluation Failed</span>
                <p className="text-3xl font-black text-rose-700 dark:text-rose-400 mt-1">{metrics.failedAssessments}</p>
              </div>
            </div>
          </GlowCard>
        </>
      )}
    </div>
  );
}
