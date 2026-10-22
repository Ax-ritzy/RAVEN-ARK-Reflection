"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

  // New Session Modal
  const [showModal, setShowModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchSessions = async () => {
    const supabase = createClient();
    
    // 1. Fetch sessions
    const { data: sessData } = await supabase
      .from("sessions")
      .select("id, name, status, created_at")
      .order("created_at", { ascending: false });

    // 2. Fetch references
    const { data: refData } = await supabase
      .from("reference_materials")
      .select("id, name");
    setAvailableReferences(refData || []);

    // 3. Fetch submissions counts
    const { data: subCounts } = await supabase
      .from("submissions")
      .select("session_id");

    const countMap = new Map();
    subCounts?.forEach((s: any) => {
      countMap.set(s.session_id, (countMap.get(s.session_id) || 0) + 1);
    });

    // 4. Fetch session_references
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

    // 1. Insert session
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

    // 2. Link selected references
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Session Lifecycle & Assignment Management
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create, open, close, and assign reference materials to reflection sessions
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shadow-sm"
        >
          + Create New Session
        </button>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="text-center py-12 text-xs text-slate-500">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border text-center text-xs text-slate-500">
            No reflection sessions created yet. Click "+ Create New Session" to begin.
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className="bg-white p-5 rounded-xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase ${
                      s.status === "OPEN"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {s.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    Created: {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 text-base">{s.name}</h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Submissions: <strong className="text-slate-800">{s.submissions_count}</strong></span>
                  <span>·</span>
                  <span>
                    Assigned References:{" "}
                    {s.assigned_references.length > 0 ? (
                      <span className="font-medium text-slate-700">
                        {s.assigned_references.join(", ")}
                      </span>
                    ) : (
                      <span className="italic text-amber-600">None assigned</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleSessionStatus(s.id, s.status)}
                  className={`text-xs font-semibold px-4 py-2 rounded-lg border transition ${
                    s.status === "OPEN"
                      ? "border-rose-300 text-rose-700 hover:bg-rose-50"
                      : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {s.status === "OPEN" ? "Close Session" : "Re-Open Session"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Session Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-slate-900">Create New Reflection Session</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Session Title / Topic Name
                </label>
                <input
                  type="text"
                  required
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  placeholder="e.g. Session 3: Transformer Attention & Positional Encoding"
                  className="w-full px-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assign Reference Materials (Select all that apply)
                </label>
                {availableReferences.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                    No reference materials found in library. You can add them under the References tab.
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1 border p-2 rounded-lg bg-slate-50">
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
                  className="px-3.5 py-2 rounded-lg border text-xs text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !newSessionName.trim()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Create Session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
