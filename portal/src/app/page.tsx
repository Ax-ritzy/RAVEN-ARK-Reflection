"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function checkExistingAuth() {
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

      if (profile?.role === "PROFESSOR") {
        router.push("/admin/dashboard");
      } else if (profile?.role === "STUDENT") {
        router.push("/student/dashboard");
      } else {
        router.push("/login");
      }
    }

    checkExistingAuth();
  }, [router]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center text-center p-8 rounded-3xl bg-white/85 dark:bg-[#0d101e]/90 backdrop-blur-xl border border-peach-200/50 dark:border-slate-800 shadow-xl max-w-sm w-full mx-4 text-slate-800 dark:text-slate-100"
      >
        <div className="relative mb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-peach-400 via-rose-400 to-cool-400 dark:from-red-500 dark:via-pink-500 dark:to-cyan-400 flex items-center justify-center shadow-lg shadow-peach-400/30">
            <svg className="w-7 h-7 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
          <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white dark:border-slate-900 animate-ping" />
        </div>
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
          RAVEN ARK Assessment Engine
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Verifying credentials & routing to dashboard...
        </p>
      </motion.div>
    </div>
  );
}
