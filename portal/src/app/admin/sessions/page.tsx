"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import { motion, AnimatePresence } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";
import Modal from "@/components/Modal";
import { computeTimerState, calculateExpiryTimestamp } from "@/lib/timer";

interface SessionDetail {
  id: string;
  name: string;
  status: "OPEN" | "CLOSED";
  created_at: string;
  expires_at?: string | null;
  submissions_count: number;
  assigned_references: string[];
  assigned_reference_ids: string[];
}

export default function SessionManagementPage() {
  const router = useRouter();
  const cachedSessions = getCached<SessionDetail[]>("admin_sessions_list");
  const cachedRefs = getCached<any[]>("admin_available_references");
  const [sessions, setSessions] = useState<SessionDetail[]>(cachedSessions || []);
  const [availableReferences, setAvailableReferences] = useState<any[]>(cachedRefs || []);
  const [loading, setLoading] = useState(!cachedSessions);
  const [, setTick] = useState(0);

  // Live countdown ticker
  useEffect(() => {
    const timerInterval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timerInterval);
  }, []);

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState("");
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
  const [expiryMode, setExpiryMode] = useState<"NONE" | "PRESET" | "CUSTOM" | "DATETIME">("PRESET");
  const [presetMinutes, setPresetMinutes] = useState<number>(30);
  const [customMinutes, setCustomMinutes] = useState<number>(0);
  const [specificDateTime, setSpecificDateTime] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit Modal State
  const [editSession, setEditSession] = useState<SessionDetail | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const [editRefIds, setEditRefIds] = useState<string[]>([]);
  const [editExpiryMode, setEditExpiryMode] = useState<"NONE" | "PRESET" | "CUSTOM" | "DATETIME">("NONE");
  const [editPresetMinutes, setEditPresetMinutes] = useState<number>(15);
  const [editCustomMinutes, setEditCustomMinutes] = useState<number>(0);
  const [editSpecificDateTime, setEditSpecificDateTime] = useState<string>("");
  const [editExpiresAt, setEditExpiresAt] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Modal State
  const [deleteTarget, setDeleteTarget] = useState<SessionDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchSessions = async () => {
    const supabase = createClient();
    
    // Concurrently fetch sessions, references, submission counts, and mappings in parallel
    let sessData: any[] = [];
    const [
      { data: sData, error: sErr },
      { data: refData },
      { data: subCounts },
      { data: sessRefs },
    ] = await Promise.all([
      supabase.from("sessions").select("id, name, status, created_at, expires_at").order("created_at", { ascending: false }),
      supabase.from("reference_materials").select("id, name, created_at"),
      supabase.from("submissions").select("session_id"),
      supabase.from("session_references").select("session_id, reference_id, reference_materials(name)"),
    ]);

    if (sErr && sErr.code === "42703") {
      const fb = await supabase.from("sessions").select("id, name, status, created_at").order("created_at", { ascending: false });
      sessData = fb.data || [];
    } else {
      sessData = sData || [];
    }

    setAvailableReferences(refData || []);

    const countMap = new Map();
    subCounts?.forEach((s: any) => {
      countMap.set(s.session_id, (countMap.get(s.session_id) || 0) + 1);
    });

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
    setCached("admin_sessions_list", enriched);
    setCached("admin_available_references", refData || []);
    setLoading(false);
  };

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user || (await supabase.auth.getUser()).data.user;
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

    const calculatedExpiresAt = calculateExpiryTimestamp(
      expiryMode,
      presetMinutes,
      customMinutes,
      specificDateTime
    );

    const insertPayload: any = {
      name: newSessionName.trim(),
      status: "OPEN",
      created_by: profile.id,
    };
    if (calculatedExpiresAt) {
      insertPayload.expires_at = calculatedExpiresAt;
    }

    let newSession: any = null;
    const { data: createdSess, error: sessErr } = await supabase
      .from("sessions")
      .insert(insertPayload)
      .select("id")
      .single();

    if (sessErr) {
      // Fallback if expires_at column does not exist yet in live database
      if (sessErr.code === "42703" && insertPayload.expires_at) {
        delete insertPayload.expires_at;
        const retry = await supabase.from("sessions").insert(insertPayload).select("id").single();
        if (retry.error) {
          setModalError(retry.error.message);
          setSaving(false);
          return;
        }
        newSession = retry.data;
      } else {
        setModalError(sessErr.message);
        setSaving(false);
        return;
      }
    } else {
      newSession = createdSess;
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
    setExpiryMode("PRESET");
    setPresetMinutes(30);
    setCustomMinutes(0);
    setSpecificDateTime("");
    setSaving(false);
    invalidateCache("admin_sessions");
    invalidateCache("admin_dashboard");
    fetchSessions();
  };

  const openEditModal = (s: SessionDetail) => {
    setEditSession(s);
    setEditName(s.name);
    setEditStatus(s.status);
    setEditRefIds([...s.assigned_reference_ids]);
    setEditExpiresAt(s.expires_at || null);
    if (s.expires_at) {
      setEditExpiryMode("DATETIME");
      try {
        const d = new Date(s.expires_at);
        const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setEditSpecificDateTime(localIso);
      } catch {
        setEditSpecificDateTime("");
      }
    } else {
      setEditExpiryMode("NONE");
      setEditSpecificDateTime("");
    }
    setEditError(null);
  };

  const handleUpdateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSession) return;

    setSavingEdit(true);
    setEditError(null);

    try {
      const supabase = createClient();

      let updatedExpiresAt = editExpiresAt;
      if (editExpiryMode === "PRESET") {
        updatedExpiresAt = new Date(Date.now() + editPresetMinutes * 60 * 1000).toISOString();
      } else if (editExpiryMode === "CUSTOM") {
        updatedExpiresAt = new Date(Date.now() + Math.max(1, editCustomMinutes) * 60 * 1000).toISOString();
      } else if (editExpiryMode === "DATETIME") {
        updatedExpiresAt = editSpecificDateTime ? new Date(editSpecificDateTime).toISOString() : null;
      } else if (editExpiryMode === "NONE") {
        updatedExpiresAt = null;
      }

      // 1. Update session details
      const updatePayload: any = {
        name: editName.trim(),
        status: editStatus,
        updated_at: new Date().toISOString(),
      };
      if (updatedExpiresAt !== undefined) {
        updatePayload.expires_at = updatedExpiresAt;
      }

      const { error: sessErr } = await supabase
        .from("sessions")
        .update(updatePayload)
        .eq("id", editSession.id);

      if (sessErr) {
        if (sessErr.code === "42703" && "expires_at" in updatePayload) {
          delete updatePayload.expires_at;
          const retry = await supabase.from("sessions").update(updatePayload).eq("id", editSession.id);
          if (retry.error) throw new Error(retry.error.message);
        } else {
          throw new Error(sessErr.message);
        }
      }

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
      invalidateCache("admin_sessions");
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
      invalidateCache("admin_sessions");
      invalidateCache("admin_dashboard");
      fetchSessions();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete session.");
    } finally {
      setDeleting(false);
    }
  };

  const toggleStatus = async (sessionId: string, currentStatus: "OPEN" | "CLOSED") => {
    const nextStatus: "OPEN" | "CLOSED" = currentStatus === "OPEN" ? "CLOSED" : "OPEN";
    const supabase = createClient();
    const { error } = await supabase
      .from("sessions")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    if (!error) {
      setSessions((prev) => {
        const updated: SessionDetail[] = prev.map((s) => (s.id === sessionId ? { ...s, status: nextStatus } : s));
        setCached("admin_sessions_list", updated);
        return updated;
      });
      invalidateCache("admin_dashboard");
    }
  };

  const openCreateModal = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const autoSelected = (availableReferences || [])
      .filter((r) => {
        if (!r.created_at) return false;
        const refDate = new Date(r.created_at).toISOString().split("T")[0];
        return refDate === todayStr;
      })
      .map((r) => r.id);

    setSelectedRefIds(autoSelected);
    setNewSessionName("");
    setModalError(null);
    setShowCreateModal(true);
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-peach-100/70 dark:bg-red-950/40 border border-peach-200 dark:border-red-500/30 text-peach-900 dark:text-red-300 mb-2">
            <span className="w-2 h-2 rounded-full bg-peach-500 dark:bg-cyan-400 animate-pulse" />
            Curriculum Orchestration
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Academic Assessment <span className="gradient-text-flame">Sessions</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create, edit, and manage reflection evaluation sessions and assign reference benchmark materials.
          </p>
        </div>

        <InteractiveButton
          onClick={openCreateModal}
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
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-peach-400 dark:border-cyan-400 border-t-transparent rounded-full animate-spin" />
            Loading assessment sessions...
          </div>
        ) : sessions.length === 0 ? (
          <GlowCard glowColor="peach" className="p-12 text-center">
            <h3 className="text-base font-bold text-slate-800 dark:text-white">No sessions created yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 mb-5">
              Create an academic session to allow students to submit their reflection assignments.
            </p>
            <InteractiveButton
              onClick={openCreateModal}
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
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight">{s.name}</h3>
                      {(() => {
                        const timer = computeTimerState(s.expires_at);
                        const isExpired = timer?.isExpired ?? false;
                        return (
                          <>
                            <span
                              className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                s.status === "OPEN" && !isExpired
                                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              {isExpired ? "EXPIRED" : s.status}
                            </span>
                            {timer && !timer.isExpired && s.status === "OPEN" && (
                              <span
                                className={`text-xs px-2.5 py-0.5 rounded-full font-bold tracking-wider border flex items-center gap-1 ${
                                  timer.urgency === "critical"
                                    ? "bg-rose-50 text-rose-700 border-rose-300 animate-pulse dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
                                    : timer.urgency === "warning"
                                    ? "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                                    : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
                                }`}
                              >
                                <span>⏳</span> {timer.formatted} left
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                      <span>Created: {new Date(s.created_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {s.submissions_count} Submissions Received
                      </span>
                      <span>•</span>
                      <span className="font-mono text-slate-400 dark:text-slate-500 text-[11px]">ID: {s.id.slice(0, 8)}...</span>
                    </div>

                    <div className="pt-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                        Assigned Reference Benchmarks:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {s.assigned_references.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">No reference materials assigned</span>
                        ) : (
                          s.assigned_references.map((refName, i) => (
                            <span
                              key={i}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-cool-50 dark:bg-cyan-950/40 text-cool-800 dark:text-cyan-300 border border-cool-200/80 dark:border-cyan-500/30 font-medium"
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

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDeleteTarget(s);
                        setDeleteError(null);
                      }}
                      className="relative z-20 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-800/50 active:scale-95 transition-all cursor-pointer select-none"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </GlowCard>
            </motion.div>
          ))
        )}
      </div>

      {/* CREATE SESSION MODAL */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        maxWidth="max-w-lg"
      >
        <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Create Assessment Session</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Define topic title and link calibrated reference lecture materials
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(false)}
            className="w-8 h-8 rounded-full bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white border border-white/40 dark:border-white/10 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {modalError && (
          <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0 text-rose-500 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{modalError}</span>
          </div>
        )}

        <form onSubmit={handleCreateSession} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
              Session Title
            </label>
            <input
              type="text"
              required
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="e.g. Session 6: Self-Attention & Vision Transformers"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
            />
          </div>

          {/* Expiry Timer Configuration */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                ⏳ Session Expiry Timer
              </label>
              <span className="text-[10px] text-slate-400">
                Auto-closes & auto-submits drafts
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setExpiryMode("NONE")}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition ${
                  expiryMode === "NONE"
                    ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-sm"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                No Timer
              </button>
              <button
                type="button"
                onClick={() => setExpiryMode("PRESET")}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition ${
                  expiryMode === "PRESET"
                    ? "bg-peach-600 text-white dark:bg-peach-500 border-transparent shadow-sm"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                Duration
              </button>
              <button
                type="button"
                onClick={() => setExpiryMode("DATETIME")}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition ${
                  expiryMode === "DATETIME"
                    ? "bg-peach-600 text-white dark:bg-peach-500 border-transparent shadow-sm"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                Exact Date/Time
              </button>
            </div>

            {expiryMode === "PRESET" && (
              <div className="space-y-2 pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {[15, 30, 45, 60, 90].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setPresetMinutes(m);
                        setCustomMinutes(0);
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
                        presetMinutes === m && customMinutes === 0
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500"
                      }`}
                    >
                      {m} mins
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[11px] text-slate-500">Or custom:</span>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={customMinutes || ""}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setCustomMinutes(val);
                    }}
                    placeholder="e.g. 25"
                    className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-xs text-slate-900 dark:text-slate-100"
                  />
                  <span className="text-[11px] text-slate-500">minutes</span>
                </div>
              </div>
            )}

            {expiryMode === "DATETIME" && (
              <div className="pt-1">
                <input
                  type="datetime-local"
                  value={specificDateTime}
                  onChange={(e) => setSpecificDateTime(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-peach-500"
                />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                Link Reference Materials (Multi-Reference Support)
              </label>
              <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 font-semibold">
                {selectedRefIds.length} Selected
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
              System will evaluate student submissions against the reference with highest semantic cosine match. Reference materials uploaded today are pre-selected automatically.
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {availableReferences.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No reference materials available.</p>
              ) : (
                availableReferences.map((r) => {
                  const isToday =
                    r.created_at &&
                    new Date(r.created_at).toISOString().split("T")[0] ===
                      new Date().toISOString().split("T")[0];

                  return (
                    <label
                      key={r.id}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition ${
                        selectedRefIds.includes(r.id)
                          ? "bg-peach-50/80 dark:bg-red-950/40 border-peach-300 dark:border-red-500/40 text-peach-900 dark:text-red-300 font-semibold"
                          : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedRefIds.includes(r.id)}
                          onChange={() => toggleCreateRef(r.id)}
                          className="rounded text-pink-500 focus:ring-pink-500 w-4 h-4"
                        />
                        <span>{r.name}</span>
                      </div>
                      {isToday && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-600/40">
                          📅 Today&apos;s Upload
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-3">
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
      </Modal>

      {/* EDIT SESSION MODAL */}
      <Modal
        isOpen={Boolean(editSession)}
        onClose={() => setEditSession(null)}
        maxWidth="max-w-lg"
      >
        {editSession && (
          <div className="space-y-5">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800/80 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-peach-100 dark:bg-red-950/40 text-peach-800 dark:text-red-300 mb-1 border border-peach-200 dark:border-red-500/30">
                  Edit Session
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  Edit Session Details
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  ID: {editSession.id.slice(0, 8)}...
                </p>
              </div>
              <button
                onClick={() => setEditSession(null)}
                className="w-8 h-8 rounded-full bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white border border-white/40 dark:border-white/10 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0 text-rose-500 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateSession} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
                  Session Title
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
                  Session Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as "OPEN" | "CLOSED")}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                >
                  <option value="OPEN" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">OPEN (Accepting Student Reflections)</option>
                  <option value="CLOSED" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">CLOSED (Submissions Locked)</option>
                </select>
              </div>

              {/* Expiry Timer Configuration in Edit Modal */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                    ⏳ Session Expiry Timer
                  </label>
                  {editSession.expires_at && (() => {
                    const t = computeTimerState(editSession.expires_at);
                    if (!t) return null;
                    return (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        t.isExpired ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}>
                        {t.isExpired ? "Currently Expired" : `${t.formatted} left`}
                      </span>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditExpiryMode("NONE")}
                    className={`py-1.5 px-1 text-center rounded-lg text-[11px] font-semibold border transition ${
                      editExpiryMode === "NONE"
                        ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-sm"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    No Timer
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditExpiryMode("PRESET"); setEditPresetMinutes(15); }}
                    className={`py-1.5 px-1 text-center rounded-lg text-[11px] font-semibold border transition ${
                      editExpiryMode === "PRESET" && editPresetMinutes === 15
                        ? "bg-peach-600 text-white dark:bg-peach-500 border-transparent shadow-sm"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    +15 mins
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditExpiryMode("PRESET"); setEditPresetMinutes(30); }}
                    className={`py-1.5 px-1 text-center rounded-lg text-[11px] font-semibold border transition ${
                      editExpiryMode === "PRESET" && editPresetMinutes === 30
                        ? "bg-peach-600 text-white dark:bg-peach-500 border-transparent shadow-sm"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    +30 mins
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditExpiryMode("DATETIME")}
                    className={`py-1.5 px-1 text-center rounded-lg text-[11px] font-semibold border transition ${
                      editExpiryMode === "DATETIME"
                        ? "bg-peach-600 text-white dark:bg-peach-500 border-transparent shadow-sm"
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    Exact Time
                  </button>
                </div>

                {editExpiryMode === "DATETIME" && (
                  <div className="pt-1">
                    <input
                      type="datetime-local"
                      value={editSpecificDateTime}
                      onChange={(e) => setEditSpecificDateTime(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-peach-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
                  Linked Reference Benchmark Materials
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
                            ? "bg-peach-50/80 dark:bg-red-950/40 border-peach-300 dark:border-red-500/40 text-peach-900 dark:text-red-300 font-semibold"
                            : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={editRefIds.includes(r.id)}
                          onChange={() => toggleEditRef(r.id)}
                          className="rounded text-pink-500 focus:ring-pink-500 w-4 h-4"
                        />
                        <span>{r.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-3">
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
                  disabled={saving || !editName.trim()}
                >
                  {saving ? "Updating..." : "Save Changes"}
                </InteractiveButton>
              </div>
            </form>
          </div>
        )}
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        maxWidth="max-w-md"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/50 flex items-center justify-center text-rose-600 dark:text-rose-400 mb-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Delete Assessment Session?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Are you sure you want to permanently delete <strong className="text-slate-900 dark:text-white">{deleteTarget.name}</strong>?
                {deleteTarget.submissions_count > 0 && (
                  <span className="block mt-1 font-semibold text-rose-600 dark:text-rose-400">
                    Warning: This session has {deleteTarget.submissions_count} student submission(s). Deleting it will also remove all associated submissions and assessments.
                  </span>
                )}
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs">
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
              <button
                type="button"
                onClick={handleDeleteSession}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-rose-600/30 active:scale-95 transition cursor-pointer select-none disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
