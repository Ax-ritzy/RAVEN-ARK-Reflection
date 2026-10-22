"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

interface SessionDetail {
  id: string;
  name: string;
  status: "OPEN" | "CLOSED";
  created_at: string;
  submissions_count: number;
  assigned_references: string[];
}

export default function SessionManagementPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [availableReferences, setAvailableReferences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchSessions = async () => {
    const supabase = createClient();
    
    const { data: sessData } = await supabase
      .from("sessions")
      .select("id, name, status, created_at")
      .order("created_at", { ascending: false });

    const { data: refData } = await supabase
      .from("reference_materials")
      .select("id, name");
    setAvailableReferences(refData || []);

    const { data: subCounts } = await supabase
      .from("submissions")
      .select("session_id");

    const countMap = new Map();
    subCounts?.forEach((s: any) => {
      countMap.set(s.session_id, (countMap.get(s.session_id) || 0) + 1);
    });

    const { data: sessRefs } = await supabase
      .from("session_references")
      .select("session_id, reference_materials(name)");

    const refMap = new Map();
    sessRefs?.forEach((sr: any) => {
      const existing = refMap.get(sr.session_id) || [];
      if (sr.reference_materials?.name) {
        existing.push(sr.reference_materials.name);
      }
      refMap.set(sr.session_id, existing);
    });

    const enriched: SessionDetail[] = (sessData || []).map((s: any) => ({
      ...s,
      submissions_count: countMap.get(s.id) || 0,
      assigned_references: refMap.get(s.id) || [],
    }));

    setSessions(enriched);
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
      fetchSessions();
    }
    checkAuth();
  }, [router]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user?.id)
      .single();

    if (!profile) {
      setModalError("Professor profile not found.");
      setSaving(false);
      return;
    }

    const { data: newSession, error: sessErr } = await supabase
      .from("sessions")
      .insert({
        name: newSessionName.trim(),
        status: "OPEN",
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (sessErr) {
      setModalError(sessErr.message);
      setSaving(false);
      return;
    }

    if (selectedRefIds.length > 0) {
      const links = selectedRefIds.map((refId) => ({
        session_id: newSession.id,
        reference_id: refId,
      }));
      await supabase.from("session_references").insert(links);
    }

    setShowModal(false);
    setNewSessionName("");
    setSelectedRefIds([]);
    setSaving(false);
    fetchSessions();
  };

  const toggleSessionStatus = async (sessionId: string, currentStatus: "OPEN" | "CLOSED") => {
    const nextStatus = currentStatus === "OPEN" ? "CLOSED" : "OPEN";
    const supabase = createClient();
    const { error } = await supabase
      .from("sessions")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    if (!error) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: nextStatus } : s))
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
            Session Lifecycle & Assignment
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Open, close, and link multi-reference benchmarks to reflection sessions
          </p>
        </div>
        <InteractiveButton
          variant="primary"
          onClick={() => setShowModal(true)}
        >
          + Create New Session
        </InteractiveButton>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="text-center py-16 text-xs text-slate-400">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <GlowCard className="p-12 text-center text-xs text-slate-500">
            No reflection sessions created yet. Click "+ Create New Session" to begin.
          </GlowCard>
        ) : (
          sessions.map((s) => (
            <GlowCard key={s.id} glowColor={s.status === "OPEN" ? "peach" : "cool"} className="p-6">
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
                    <span className="text-xs text-slate-400 font-mono">
                      Created: {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-800 text-lg">{s.name}</h3>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>Submissions: <strong className="text-slate-800">{s.submissions_count}</strong></span>
                    <span>·</span>
                    <span>
                      Assigned References:{" "}
                      {s.assigned_references.length > 0 ? (
                        <span className="font-semibold text-slate-700">
                          {s.assigned_references.join(", ")}
                        </span>
                      ) : (
                        <span className="italic text-amber-600">None assigned</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <motion.button
                    whileTap={{ scale: 0.94 }}
                    onClick={() => toggleSessionStatus(s.id, s.status)}
                    className={`text-xs font-bold px-4 py-2.5 rounded-xl border transition shadow-sm ${
                      s.status === "OPEN"
                        ? "border-rose-300 text-rose-700 hover:bg-rose-50"
                        : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    {s.status === "OPEN" ? "Close Session" : "Re-Open Session"}
                  </motion.button>
                </div>
              </div>
            </GlowCard>
          ))
        )}
      </div>

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
                <h2 className="text-base font-extrabold text-slate-800">Create Reflection Session</h2>
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

              <form onSubmit={handleCreateSession} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Session Title / Topic Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    placeholder="e.g. Session 3: Transformer Attention & Encoders"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-peach-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Assign Reference Materials
                  </label>
                  {availableReferences.length === 0 ? (
                    <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                      No reference materials found in library.
                    </p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-200/80 p-2.5 rounded-xl bg-slate-50/70">
                      {availableReferences.map((ref) => (
                        <label key={ref.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedRefIds.includes(ref.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRefIds([...selectedRefIds, ref.id]);
                              } else {
                                setSelectedRefIds(selectedRefIds.filter((id) => id !== ref.id));
                              }
                            }}
                          />
                          <span>{ref.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
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
                    disabled={saving || !newSessionName.trim()}
                    className="px-4 py-2"
                  >
                    {saving ? "Creating..." : "Create Session"}
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
