"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import InteractiveButton from "@/components/InteractiveButton";

export default function UnifiedLoginPage() {
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
        setErrorMsg("Authenticated, but no linked student or faculty profile was found.");
        setLoading(false);
        return;
      }

      if (profile.status === "SUSPENDED") {
        await supabase.auth.signOut();
        setErrorMsg("Your account has been suspended by institution administration.");
        setLoading(false);
        return;
      }

      if (profile.role === "PROFESSOR") {
        router.push("/admin/dashboard");
      } else if (profile.role === "STUDENT") {
        router.push("/student/dashboard");
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
        {/* Animated Radiant Gradient Aura */}
        <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-peach-400 via-rose-400 to-cool-400 opacity-50 blur-xl animate-gradient-shift -z-10" />

        <div className="bg-white/85 backdrop-blur-2xl rounded-3xl border border-white/90 p-8 sm:p-10 shadow-2xl shadow-peach-500/10 space-y-7">
          {/* Header */}
          <div className="text-center space-y-3">
            <motion.div
              whileHover={{ rotate: 180, scale: 1.1 }}
              transition={{ duration: 0.6 }}
              className="w-14 h-14 bg-gradient-to-tr from-peach-500 via-rose-400 to-cool-400 rounded-2xl mx-auto flex items-center justify-center text-white font-extrabold text-2xl shadow-lg shadow-peach-500/30"
            >
              R
            </motion.div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">
                Institutional Assessment
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Enter your credentials for dynamic role routing
              </p>
            </div>
          </div>

          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2"
            >
              <span>⚠️</span>
              <span>{errorMsg}</span>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Institutional Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="professor@institution.edu or student1@institution.edu"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200/90 bg-white/70 backdrop-blur-sm text-sm focus:outline-none focus:ring-2 focus:ring-peach-400 focus:border-transparent transition-all shadow-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200/90 bg-white/70 backdrop-blur-sm text-sm focus:outline-none focus:ring-2 focus:ring-peach-400 focus:border-transparent transition-all shadow-sm"
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
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-peach-50 text-peach-700 border border-peach-200/50">
              🛡️ Faculty Route
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cool-50 text-cool-700 border border-cool-200/50">
              🎓 Student Route
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
