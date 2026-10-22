"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

interface StudentProfile {
  id: string;
  usn: string;
  full_name: string;
  status: "ACTIVE" | "SUSPENDED";
  created_at: string;
}

export default function StudentManagementPage() {
  const router = useRouter();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [fullName, setFullName] = useState("");
  const [usn, setUsn] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  const fetchStudents = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, usn, full_name, status, created_at")
      .eq("role", "STUDENT")
      .order("created_at", { ascending: false });

    setStudents(data || []);
    setLoading(false);
  };

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      fetchStudents();
    }
    checkAuth();
  }, [router]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);
    setModalError(null);
    setModalSuccess(null);

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error("Session expired. Please sign in again.");
      }

      const res = await fetch("/api/students/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fullName, usn, email, password }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to provision student");
      }

      setModalSuccess(`Successfully created and provisioned ${fullName} (${usn.toUpperCase()})`);
      setFullName("");
      setUsn("");
      setEmail("");
      setPassword("");
      fetchStudents();
    } catch (err: any) {
      setModalError(err.message || "An unexpected error occurred.");
    } finally {
      setProvisioning(false);
    }
  };

  const toggleStatus = async (studentId: string, currentStatus: "ACTIVE" | "SUSPENDED") => {
    const newStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", studentId);

    if (!error) {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, status: newStatus } : s))
      );
    }
  };

  const filtered = students.filter(
    (s) =>
      s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.usn && s.usn.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
            Student Roster Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative enrollment and server-side Supabase Auth credentials management
          </p>
        </div>
        <InteractiveButton
          variant="primary"
          onClick={() => {
            setShowModal(true);
            setModalError(null);
            setModalSuccess(null);
          }}
        >
          + Provision Student Account
        </InteractiveButton>
      </div>

      <GlowCard className="p-4">
        <div className="flex items-center justify-between gap-4">
          <input
            type="text"
            placeholder="Search by USN or Student Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-sm px-4 py-2.5 rounded-xl border border-slate-200/90 text-xs focus:outline-none focus:ring-2 focus:ring-peach-400 bg-white/70"
          />
          <span className="text-xs font-semibold text-slate-500">
            Showing {filtered.length} of {students.length} Enrolled Students
          </span>
        </div>
      </GlowCard>

      <GlowCard className="overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-xs text-slate-400">Loading student roster...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-xs text-slate-500">No students match search criteria.</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-peach-50/50 border-b border-peach-100/60 text-slate-600 uppercase tracking-wider font-bold">
              <tr>
                <th className="py-3.5 px-5">Student USN</th>
                <th className="py-3.5 px-5">Full Name</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5">Enrolled Date</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-peach-50/40 transition">
                  <td className="py-4 px-5 font-mono font-bold text-slate-800">{s.usn || "N/A"}</td>
                  <td className="py-4 px-5 font-semibold text-slate-900">{s.full_name}</td>
                  <td className="py-4 px-5">
                    <span
                      className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                        s.status === "ACTIVE"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="py-4 px-5 text-slate-500">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-5 text-right">
                    <motion.button
                      whileTap={{ scale: 0.94 }}
                      onClick={() => toggleStatus(s.id, s.status)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition ${
                        s.status === "ACTIVE"
                          ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                          : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      }`}
                    >
                      {s.status === "ACTIVE" ? "Suspend Access" : "Reactivate"}
                    </motion.button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlowCard>

      {/* Provision Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 15 }}
              className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/90 max-w-md w-full p-7 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-base font-extrabold text-slate-800">Provision New Student Account</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                >
                  &times;
                </button>
              </div>

              {modalError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                  ⚠️ {modalError}
                </div>
              )}
              {modalSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                  ✓ {modalSuccess}
                </div>
              )}

              <form onSubmit={handleCreateStudent} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Alice Smith"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-peach-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Unique USN / Student ID
                  </label>
                  <input
                    type="text"
                    required
                    value={usn}
                    onChange={(e) => setUsn(e.target.value)}
                    placeholder="e.g. 1RV21CS001"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs uppercase font-mono focus:ring-2 focus:ring-peach-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Login Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@institution.edu"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-peach-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Initial Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-peach-400 focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl border text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <InteractiveButton
                    type="submit"
                    disabled={provisioning}
                    className="px-4 py-2"
                  >
                    {provisioning ? "Provisioning..." : "Provision Account"}
                  </InteractiveButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
