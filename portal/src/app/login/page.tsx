"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import InteractiveButton from "@/components/InteractiveButton";

export default function UniversalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("role, status, full_name, usn")
        .eq("auth_user_id", data.user.id)
        .single();

      if (profErr || !profile) {
        setErrorMsg("Authenticated, but no linked student, faculty, or contributor profile was found.");
        setLoading(false);
        return;
      }

      if (profile.status === "SUSPENDED") {
        await supabase.auth.signOut();
        setErrorMsg("Your account has been suspended by institution administration.");
        setLoading(false);
        return;
      }

      // Universal Dynamic Role Routing
      if (profile.role === "PROFESSOR") {
        router.push("/admin/dashboard");
      } else if (profile.role === "STUDENT") {
        router.push("/student/dashboard");
      } else if (profile.role === "REFERENCE_CONTRIBUTOR") {
        router.push("/reference");
      } else {
        setErrorMsg(`Unknown role: ${profile.role}`);
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-[78vh] flex items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full relative"
      >
        {/* Animated Radiant 3D Gradient Liquid Aura */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-red-500/30 via-pink-500/30 via-purple-500/30 to-cyan-500/30 dark:from-red-500/40 dark:via-pink-500/40 dark:to-cyan-400/40 opacity-75 blur-xl animate-gradient-shift -z-10" />

        <div className="liquid-glass-modal p-8 sm:p-10 shadow-2xl space-y-7 transition-colors">
          {/* Header */}
          <div className="text-center space-y-3">
            <motion.div
              whileHover={{ rotate: 180, scale: 1.1 }}
              transition={{ duration: 0.6 }}
              className="w-14 h-14 bg-gradient-to-tr from-red-500 via-pink-500 via-purple-500 to-cyan-400 rounded-2xl mx-auto flex items-center justify-center text-white font-extrabold text-2xl shadow-lg shadow-pink-500/30"
            >
              R
            </motion.div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-peach-100/90 dark:bg-red-950/50 text-peach-800 dark:text-red-300 border border-peach-200/80 dark:border-red-500/30 mb-1.5">
                Universal Portal
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Reflection AI Assessment
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Single sign-in with automated role routing
              </p>
            </div>
          </div>

          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2"
            >
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Institutional Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="faculty@institution.edu, student@institution.edu..."
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:focus:ring-cyan-500/50 transition-all shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:focus:ring-cyan-500/50 transition-all shadow-sm"
              />
            </div>

            <InteractiveButton
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl text-sm font-bold shadow-lg"
            >
              {loading ? "Authenticating & Routing..." : "Sign In to System →"}
            </InteractiveButton>
          </form>

          {/* Quick Info Badges */}
          <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-semibold">
              <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-peach-50 dark:bg-red-950/40 text-peach-800 dark:text-red-300 border border-peach-200 dark:border-red-500/30">
                🛡️ Faculty
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cool-50 dark:bg-cyan-950/40 text-cool-800 dark:text-cyan-300 border border-cool-200 dark:border-cyan-500/30">
                🎓 Student
              </span>
              <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
                📚 Ref Contributor
              </span>
            </div>

            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 leading-relaxed">
              Dynamic role detection routes each user directly to their authorized portal.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
