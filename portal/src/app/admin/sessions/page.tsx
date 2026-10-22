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
  assigned_reference_ids: string[];
}

export default function SessionManagementPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [availableReferences, setAvailableReferences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit Modal State
  const [editSession, setEditSession] = useState<SessionDetail | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const [editRefIds, setEditRefIds] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Modal State
  const [deleteTarget, setDeleteTarget] = useState<SessionDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      .select("session_id, reference_id, reference_materials(name)");

    const refMap = new Map();
    const refIdMap = new Map();
    sessRefs?.forEach((sr: any) => {
      const existing = refMap.get(sr.session_id) || [];
      const existingIds = refIdMap.get(sr.session_id) || [];
      if (sr.reference_materials?.name) {
        existing.push(sr.reference_materials.name);
      }
      if (sr.reference_id) {
        existingIds.push(sr.reference_id);
      }
      refMap.set(sr.session_id, existing);
      refIdMap.set(sr.session_id, existingIds);
    });

    const enriched: SessionDetail[] = (sessData || []).map((s: any) => ({
      ...s,
      submissions_count: countMap.get(s.id) || 0,
      assigned_references: refMap.get(s.id) || [],
      assigned_reference_ids: refIdMap.get(s.id) || [],
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
      const { error: linkErr } = await supabase
        .from("session_references")
        .insert(links);

      if (linkErr) {
        setModalError(`Session created, but error assigning references: ${linkErr.message}`);
        setSaving(false);
        fetchSessions();
        return;
      }
    }

    setShowCreateModal(false);
    setNewSessionName("");
    setSelectedRefIds([]);
    setSaving(false);
    fetchSessions();
  };

  const openEditModal = (s: SessionDetail) => {
    setEditSession(s);
    setEditName(s.name);
    setEditStatus(s.status);
    setEditRefIds([...s.assigned_reference_ids]);
    setEditError(null);
  };

  const handleUpdateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSession) return;

    setSavingEdit(true);
    setEditError(null);

    try {
      const supabase = createClient();

      // 1. Update session details
      const { error: sessErr } = await supabase
        .from("sessions")
        .update({
          name: editName.trim(),
          status: editStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editSession.id);

      if (sessErr) throw new Error(sessErr.message);

      // 2. Resync session references
      await supabase
        .from("session_references")
        .delete()
        .eq("session_id", editSession.id);

      if (editRefIds.length > 0) {
        const links = editRefIds.map((rId) => ({
          session_id: editSession.id,
          reference_id: rId,
        }));
        const { error: linkErr } = await supabase
          .from("session_references")
          .insert(links);
        if (linkErr) throw new Error(linkErr.message);
      }

      setEditSession(null);
      fetchSessions();
    } catch (err: any) {
      setEditError(err.message || "Failed to update session.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("sessions")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw new Error(error.message);

      setDeleteTarget(null);
      fetchSessions();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete session.");
    } finally {
      setDeleting(false);
    }
  };

  const toggleStatus = async (sessionId: string, currentStatus: "OPEN" | "CLOSED") => {
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

  const toggleCreateRef = (refId: string) => {
    setSelectedRefIds((prev) =>
      prev.includes(refId) ? prev.filter((id) => id !== refId) : [...prev, refId]
    );
  };

  const toggleEditRef = (refId: string) => {
    setEditRefIds((prev) =>
      prev.includes(refId) ? prev.filter((id) => id !== refId) : [...prev, refId]
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-peach-100/70 border border-peach-200 text-peach-900 mb-2">
            <span className="w-2 h-2 rounded-full bg-peach-500 animate-pulse" />
            Curriculum Orchestration
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Academic Assessment <span className="text-transparent bg-clip-text bg-gradient-to-r from-peach-600 via-rose-500 to-cool-600">Sessions</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create, edit, and manage reflection evaluation sessions and assign reference benchmark materials.
          </p>
        </div>

        <InteractiveButton
          onClick={() => {
            setShowCreateModal(true);
            setModalError(null);
          }}
          variant="primary"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Create New Session
        </InteractiveButton>
      </motion.div>

      {/* Sessions Grid */}
      <div className="grid gap-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-peach-400 border-t-transparent rounded-full animate-spin" />
            Loading assessment sessions...
          </div>
        ) : sessions.length === 0 ? (
          <GlowCard glowColor="peach" className="p-12 text-center">
            <h3 className="text-base font-bold text-slate-800">No sessions created yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
              Create an academic session to allow students to submit their reflection assignments.
            </p>
            <InteractiveButton
              onClick={() => {
                setShowCreateModal(true);
                setModalError(null);
              }}
              variant="primary"
            >
              Create First Session
            </InteractiveButton>
          </GlowCard>
        ) : (
          sessions.map((s, idx) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <GlowCard glowColor={s.status === "OPEN" ? "peach" : "cool"} className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="font-bold text-slate-900 text-lg tracking-tight">{s.name}</h3>
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          s.status === "OPEN"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span>Created: {new Date(s.created_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="font-semibold text-slate-700">
                        {s.submissions_count} Submissions Received
                      </span>
                      <span>•</span>
                      <span className="font-mono text-slate-400 text-[11px]">ID: {s.id.slice(0, 8)}...</span>
                    </div>

                    <div className="pt-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Assigned Reference Benchmarks:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {s.assigned_references.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">No reference materials assigned</span>
                        ) : (
                          s.assigned_references.map((refName, i) => (
                            <span
                              key={i}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-cool-50 text-cool-800 border border-cool-200/80 font-medium"
                            >
                              📚 {refName}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex flex-wrap items-center gap-2 lg:self-center">
                    <InteractiveButton
                      onClick={() => openEditModal(s)}
                      variant="outline"
                      size="sm"
                    >
                      Edit Session
                    </InteractiveButton>

                    <InteractiveButton
                      onClick={() => toggleStatus(s.id, s.status)}
                      variant={s.status === "OPEN" ? "secondary" : "primary"}
                      size="sm"
                    >
                      {s.status === "OPEN" ? "Close Session" : "Open Session"}
                    </InteractiveButton>

                    <InteractiveButton
                      onClick={() => {
                        setDeleteTarget(s);
                        setDeleteError(null);
                      }}
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50/60"
                    >
                      Delete
                    </InteractiveButton>
                  </div>
                </div>
              </GlowCard>
            </motion.div>
          ))
        )}
      </div>

      {/* CREATE SESSION MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-peach-200/60 max-w-lg w-full p-6 sm:p-8 space-y-5 max-h-[92vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Create Assessment Session</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Define topic title and link calibrated reference lecture materials
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div className="p-3.5 rounded-2xl bg-red-50/90 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleCreateSession} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Session Title
                  </label>
                  <input
                    type="text"
                    required
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    placeholder="e.g. Session 6: Self-Attention & Vision Transformers"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-peach-400 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Link Reference Materials (Multi-Reference Support)
                  </label>
                  <p className="text-[11px] text-slate-400 mb-2">
                    System will evaluate student submissions against the reference with the highest semantic cosine match.
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {availableReferences.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No reference materials available.</p>
                    ) : (
                      availableReferences.map((r) => (
                        <label
                          key={r.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                            selectedRefIds.includes(r.id)
                              ? "bg-peach-50/70 border-peach-300 text-peach-900 font-semibold"
                              : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRefIds.includes(r.id)}
                            onChange={() => toggleCreateRef(r.id)}
                            className="rounded text-peach-600 focus:ring-peach-500 w-4 h-4"
                          />
                          <span>{r.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                  <InteractiveButton
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </InteractiveButton>
                  <InteractiveButton
                    type="submit"
                    variant="primary"
                    disabled={saving || !newSessionName.trim()}
                  >
                    {saving ? "Creating..." : "Create Session"}
                  </InteractiveButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT SESSION MODAL */}
      <AnimatePresence>
        {editSession && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-peach-200/60 max-w-lg w-full p-6 sm:p-8 space-y-5 max-h-[92vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-peach-100 text-peach-800 mb-1">
                    Edit Session
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900">
                    Edit Session Details
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    ID: {editSession.id.slice(0, 8)}...
                  </p>
                </div>
                <button
                  onClick={() => setEditSession(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {editError && (
                <div className="p-3.5 rounded-2xl bg-red-50/90 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleUpdateSession} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Session Title
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-peach-400 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Session Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as "OPEN" | "CLOSED")}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-peach-400 focus:outline-none transition"
                  >
                    <option value="OPEN">OPEN (Accepting Student Reflections)</option>
                    <option value="CLOSED">CLOSED (Submissions Locked)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Assigned Reference Materials
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {availableReferences.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No reference materials available.</p>
                    ) : (
                      availableReferences.map((r) => (
                        <label
                          key={r.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition ${
                            editRefIds.includes(r.id)
                              ? "bg-peach-50/70 border-peach-300 text-peach-900 font-semibold"
                              : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={editRefIds.includes(r.id)}
                            onChange={() => toggleEditRef(r.id)}
                            className="rounded text-peach-600 focus:ring-peach-500 w-4 h-4"
                          />
                          <span>{r.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                  <InteractiveButton
                    type="button"
                    variant="outline"
                    onClick={() => setEditSession(null)}
                  >
                    Cancel
                  </InteractiveButton>
                  <InteractiveButton
                    type="submit"
                    variant="primary"
                    disabled={savingEdit || !editName.trim()}
                  >
                    {savingEdit ? "Updating..." : "Save Changes"}
                  </InteractiveButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-rose-200 max-w-md w-full p-6 sm:p-7 space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 mb-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Delete Assessment Session?
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Are you sure you want to permanently delete <strong className="text-slate-900">{deleteTarget.name}</strong>?
                  {deleteTarget.submissions_count > 0 && (
                    <span className="block mt-1 font-semibold text-rose-600">
                      Warning: This session has {deleteTarget.submissions_count} student submission(s). Deleting it will also remove all associated submissions and assessments.
                    </span>
                  )}
                </p>
              </div>

              {deleteError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  {deleteError}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-3">
                <InteractiveButton
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </InteractiveButton>
                <InteractiveButton
                  type="button"
                  variant="primary"
                  className="bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white"
                  onClick={handleDeleteSession}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Permanently Delete"}
                </InteractiveButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
