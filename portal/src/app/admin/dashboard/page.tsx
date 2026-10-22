"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

      const { count: studentCount } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "STUDENT");

      const { data: sessions } = await supabase
        .from("sessions")
        .select("status");

      const totalSess = sessions?.length || 0;
      const openSess = sessions?.filter((s) => s.status === "OPEN").length || 0;
      const closedSess = sessions?.filter((s) => s.status === "CLOSED").length || 0;

      const { count: subCount } = await supabase
        .from("submissions")
        .select("id", { count: "exact", head: true });

      const { data: assessments } = await supabase
        .from("assessments")
        .select("status, final_approved_mark");

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Faculty Administrative Overview
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time reflection assessment telemetry and system status
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/admin/sessions"
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shadow-sm"
          >
            Manage Sessions
          </a>
          <a
            href="/admin/students"
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-sm"
          >
            Provision Students
          </a>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-500">
          Aggregating authoritative database records...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border shadow-sm">
              <span className="text-xs font-semibold uppercase text-slate-400">Total Enrolled</span>
              <p className="text-3xl font-extrabold text-slate-900 mt-2">{metrics.totalStudents}</p>
              <span className="text-xs text-slate-500 mt-1 block">Active Student Profiles</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border shadow-sm">
              <span className="text-xs font-semibold uppercase text-slate-400">Sessions</span>
              <p className="text-3xl font-extrabold text-slate-900 mt-2">{metrics.totalSessions}</p>
              <span className="text-xs text-emerald-600 mt-1 block font-medium">
                {metrics.openSessions} Open · {metrics.closedSessions} Closed
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border shadow-sm">
              <span className="text-xs font-semibold uppercase text-slate-400">Submissions</span>
              <p className="text-3xl font-extrabold text-indigo-600 mt-2">{metrics.totalSubmissions}</p>
              <span className="text-xs text-slate-500 mt-1 block">Total Reflections Recorded</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border shadow-sm">
              <span className="text-xs font-semibold uppercase text-slate-400">Average Mark</span>
              <p className="text-3xl font-extrabold text-emerald-600 mt-2">{metrics.averageMark.toFixed(2)}</p>
              <span className="text-xs text-slate-500 mt-1 block">Out of 5.00 Maximum</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border shadow-sm">
            <h2 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-4">
              Assessment Processing Breakdown
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <span className="text-xs font-medium text-emerald-800">Evaluated & Completed</span>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{metrics.completedAssessments}</p>
              </div>

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                <span className="text-xs font-medium text-amber-800">Needs Review (Low Sim / USN)</span>
                <p className="text-2xl font-bold text-amber-700 mt-1">{metrics.needsReviewAssessments}</p>
              </div>

              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                <span className="text-xs font-medium text-blue-800">Pending Evaluation</span>
                <p className="text-2xl font-bold text-blue-700 mt-1">{metrics.pendingAssessments}</p>
              </div>

              <div className="p-4 rounded-xl bg-rose-50 border border-rose-100">
                <span className="text-xs font-medium text-rose-800">Evaluation Failed</span>
                <p className="text-2xl font-bold text-rose-700 mt-1">{metrics.failedAssessments}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
