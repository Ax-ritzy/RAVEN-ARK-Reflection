"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function StudentLoginPage() {
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
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      // Fetch profile to verify role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, status, usn")
        .eq("auth_user_id", data.user.id)
        .single();

      if (profile?.role !== "STUDENT") {
        await supabase.auth.signOut();
        setErrorMsg("Access Denied: This portal is reserved exclusively for students.");
        setLoading(false);
        return;
      }

      if (profile?.status === "SUSPENDED") {
        await supabase.auth.signOut();
        setErrorMsg("Your account has been suspended by the administration.");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-sm border p-8">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Student Sign In</h1>
        <p className="text-sm text-slate-500 mt-1">
          Access your reflection assessments and view grades
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
            Student Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@institution.edu"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Sign In to Student Portal"}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t text-center text-xs text-slate-500">
        Account provisioning is handled directly by your professor. Contact your course instructor if you require login credentials.
      </div>
    </div>
  );
}
