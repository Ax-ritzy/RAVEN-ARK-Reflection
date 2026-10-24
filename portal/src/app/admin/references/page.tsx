"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";
import Modal from "@/components/Modal";

interface ReferenceMaterial {
  id: string;
  name: string;
  extracted_text: string;
  created_at: string;
  keywords: string[];
  uploaded_by_name?: string;
  uploaded_by_role?: string;
  linked_sessions?: string[];
}

export default function ReferenceLibraryPage() {
  const router = useRouter();
  const [references, setReferences] = useState<ReferenceMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Reference Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [referenceText, setReferenceText] = useState("");
  const [extractedKeywords, setExtractedKeywords] = useState<string[]>([]);
  const [docCharCount, setDocCharCount] = useState<number>(0);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit Reference Modal State
  const [editReference, setEditReference] = useState<ReferenceMaterial | null>(null);
  const [editName, setEditName] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editReferenceText, setEditReferenceText] = useState("");
  const [editKeywords, setEditKeywords] = useState<string[]>([]);
  const [editExtracting, setEditExtracting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Modal State
  const [deleteTarget, setDeleteTarget] = useState<ReferenceMaterial | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchReferences = async () => {
    const supabase = createClient();
    const { data: refRows } = await supabase
      .from("reference_materials")
      .select(`
        id, name, extracted_text, created_at, uploaded_by,
        profiles ( full_name, role ),
        reference_keyword_sets ( keywords, is_active ),
        session_references ( session_id, sessions ( name, created_at ) )
      `)
      .order("created_at", { ascending: false });

    const formatted: ReferenceMaterial[] = (refRows || []).map((r: any) => {
      const activeKw = r.reference_keyword_sets?.find((k: any) => k.is_active) || r.reference_keyword_sets?.[0];
      const linked = (r.session_references || [])
        .map((sr: any) => sr.sessions?.name)
        .filter(Boolean);

      return {
        id: r.id,
        name: r.name,
        extracted_text: r.extracted_text || "",
        created_at: r.created_at,
        keywords: activeKw?.keywords || [],
        uploaded_by_name: r.profiles?.full_name || "Faculty Administration",
        uploaded_by_role: r.profiles?.role || "PROFESSOR",
        linked_sessions: linked,
      };
    });

    setReferences(formatted);
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
      fetchReferences();
    }
    checkAuth();
  }, [router]);

  // Automated Document Read & Non-AI 5-Keyword Extraction
  const handleProcessUploadedDocument = async (selectedFile: File, isEdit: boolean = false) => {
    if (isEdit) {
      setEditFile(selectedFile);
      setEditExtracting(true);
      setEditError(null);
    } else {
      setFile(selectedFile);
      setExtractingDoc(true);
      setModalError(null);
    }

    try {
      const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://localhost:8000";
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("keyword_count", "5");

      const resp = await fetch(`${backendUrl}/api/references/extract-keywords`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        throw new Error(errJson?.detail?.message || "Failed to extract keywords from document.");
      }

      const data = await resp.json();
      const keywords = data.keywords || [];

      if (isEdit) {
        if (!editName.trim()) {
          setEditName(selectedFile.name.replace(/\.[^/.]+$/, ""));
        }
        setEditReferenceText(data.extracted_text || "");
        setEditKeywords(keywords);
      } else {
        if (!name.trim()) {
          setName(selectedFile.name.replace(/\.[^/.]+$/, ""));
        }
        setReferenceText(data.extracted_text || "");
        setDocCharCount(data.char_count || 0);
        setExtractedKeywords(keywords);
      }
    } catch (err: any) {
      if (isEdit) {
        setEditError(err.message || "Could not process document.");
      } else {
        setModalError(err.message || "Could not process document.");
      }
    } finally {
      if (isEdit) {
        setEditExtracting(false);
      } else {
        setExtractingDoc(false);
      }
    }
  };

  const handleCreateReference = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError(null);

    if (!file || !referenceText) {
      setModalError("Please upload a lecture document (.pdf, .docx, .txt, .ocr) to extract reference keywords.");
      setSaving(false);
      return;
    }

    if (extractedKeywords.length !== 5 && extractedKeywords.length !== 15) {
      setModalError(
        `Reference must have 5 calibrated keywords. Currently extracted: ${extractedKeywords.length} keywords.`
      );
      setSaving(false);
      return;
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user?.id)
      .single();

    try {
      // 1. Upload original file to Supabase storage
      const storagePath = `references/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await supabase.storage
        .from("reference-materials")
        .upload(storagePath, file, { upsert: true });

      // 2. Insert into reference_materials
      const { data: newRef, error: refErr } = await supabase
        .from("reference_materials")
        .insert({
          name: name.trim(),
          storage_path: storagePath,
          extracted_text: referenceText.trim(),
          uploaded_by: profile?.id,
        })
        .select("id, created_at")
        .single();

      if (refErr) throw new Error(refErr.message);

      // 3. Insert the calibrated keywords
      const { error: kwErr } = await supabase
        .from("reference_keyword_sets")
        .insert({
          reference_id: newRef.id,
          version: 1,
          keywords: extractedKeywords,
          is_active: true,
        });

      if (kwErr) throw new Error(kwErr.message);

      // 4. Date-Based Automatic Session Linking:
      // Match sessions created on the same calendar date as this reference material
      const uploadDateStr = new Date(newRef.created_at || Date.now()).toISOString().split("T")[0];
      const { data: todaySessions } = await supabase
        .from("sessions")
        .select("id, created_at");

      if (todaySessions && todaySessions.length > 0) {
        const matchingSessions = todaySessions.filter((s: any) => {
          const sessDateStr = new Date(s.created_at).toISOString().split("T")[0];
          return sessDateStr === uploadDateStr;
        });

        if (matchingSessions.length > 0) {
          const sessionRefRows = matchingSessions.map((s: any) => ({
            session_id: s.id,
            reference_id: newRef.id,
          }));
          await supabase.from("session_references").insert(sessionRefRows);
        }
      }

      // Reset modal state
      setShowCreateModal(false);
      setName("");
      setFile(null);
      setReferenceText("");
      setExtractedKeywords([]);
      setDocCharCount(0);
      fetchReferences();
    } catch (err: any) {
      setModalError(err.message || "Failed to save reference material");
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (r: ReferenceMaterial) => {
    setEditReference(r);
    setEditName(r.name);
    setEditReferenceText(r.extracted_text);
    setEditKeywords([...r.keywords]);
    setEditFile(null);
    setEditError(null);
  };

  const handleUpdateReference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editReference) return;

    setSavingEdit(true);
    setEditError(null);

    if (editKeywords.length !== 5 && editKeywords.length !== 15) {
      setEditError(
        `Reference must have 5 calibrated keywords. Currently has: ${editKeywords.length} keywords.`
      );
      setSavingEdit(false);
      return;
    }

    try {
      const supabase = createClient();

      // 1. If replacement document was uploaded, save it to storage
      let storagePath: string | undefined = undefined;
      if (editFile) {
        storagePath = `references/${Date.now()}_${editFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        await supabase.storage
          .from("reference-materials")
          .upload(storagePath, editFile, { upsert: true });
      }

      // 2. Update reference material record
      const updatePayload: any = {
        name: editName.trim(),
        extracted_text: editReferenceText.trim(),
      };
      if (storagePath) {
        updatePayload.storage_path = storagePath;
      }

      const { error: refErr } = await supabase
        .from("reference_materials")
        .update(updatePayload)
        .eq("id", editReference.id);

      if (refErr) throw new Error(refErr.message);

      // 3. Update keyword set
      const { error: kwErr } = await supabase
        .from("reference_keyword_sets")
        .update({
          keywords: editKeywords,
        })
        .eq("reference_id", editReference.id);

      if (kwErr) throw new Error(kwErr.message);

      setEditReference(null);
      fetchReferences();
    } catch (err: any) {
      setEditError(err.message || "Failed to update reference material");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteReference = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("reference_materials")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw new Error(error.message);

      setDeleteTarget(null);
      fetchReferences();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete reference material.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-peach-100/70 dark:bg-peach-950/40 border border-peach-200 dark:border-peach-800/50 text-peach-900 dark:text-peach-300 mb-2">
            <span className="w-2 h-2 rounded-full bg-peach-500 animate-pulse" />
            Document-Driven Calibration Engine
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Reference Library & <span className="gradient-text-flame">Automated 5-Keywords</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Upload lecture documents (.pdf, .docx, .txt, .ocr). System automatically extracts text and calculates 5 non-stopword evaluation keywords.
          </p>
        </div>

        <InteractiveButton
          onClick={() => {
            setShowCreateModal(true);
            setName("");
            setFile(null);
            setReferenceText("");
            setExtractedKeywords([]);
            setModalError(null);
          }}
          variant="primary"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Upload Reference Document
        </InteractiveButton>
      </motion.div>

      {/* Reference Material Grid */}
      <div className="grid gap-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500 text-sm">
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-peach-400 border-t-transparent rounded-full animate-spin" />
            Loading calibrated reference library...
          </div>
        ) : references.length === 0 ? (
          <GlowCard glowColor="peach" className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-peach-100/60 dark:bg-peach-950/40 border border-peach-200 dark:border-peach-800/40 flex items-center justify-center text-peach-600 dark:text-peach-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No reference documents uploaded yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1 mb-5">
              Upload a lecture document to automatically extract text and calibrate the 5 keywords.
            </p>
            <InteractiveButton
              onClick={() => {
                setShowCreateModal(true);
                setModalError(null);
              }}
              variant="primary"
            >
              Upload First Reference Document
            </InteractiveButton>
          </GlowCard>
        ) : (
          references.map((r, idx) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08 }}
            >
              <GlowCard glowColor={idx % 2 === 0 ? "cool" : "peach"} className="p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg tracking-tight">{r.name}</h3>
                      {r.uploaded_by_role === "REFERENCE_CONTRIBUTOR" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
                          Ref Contributor Upload
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-mono">
                      <span>By: <strong className="text-slate-600 dark:text-slate-300 font-sans">{r.uploaded_by_name}</strong></span>
                      <span>&bull;</span>
                      <span>Added: {new Date(r.created_at).toLocaleDateString()}</span>
                      {r.linked_sessions && r.linked_sessions.length > 0 && (
                        <>
                          <span>&bull;</span>
                          <span className="text-cool-600 dark:text-cyan-400 font-sans font-semibold">
                            🔗 {r.linked_sessions.join(", ")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50 shadow-sm">
                      ✓ {r.keywords.length} Calibrated Keywords
                    </span>
                    <InteractiveButton
                      onClick={() => openEditModal(r)}
                      variant="outline"
                      size="sm"
                    >
                      Edit
                    </InteractiveButton>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDeleteTarget(r);
                        setDeleteError(null);
                      }}
                      className="relative z-20 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50 active:scale-95 transition-all cursor-pointer select-none"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {r.keywords.length} Calibrated Keywords ({r.keywords.length === 5 ? "1 Match = 1.00 Mark, Max 5.00" : "1 Match = 0.33 Mark, Max 5.00"})
                    </h4>
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Zero Stopwords Guaranteed</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.keywords.map((kw, i) => (
                      <motion.span
                        key={i}
                        whileHover={{ scale: 1.05, y: -2 }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-200 font-medium shadow-xs hover:border-cool-300 dark:hover:border-cool-500 hover:text-cool-700 dark:hover:text-cool-300 hover:shadow-sm transition cursor-default flex items-center gap-1.5"
                      >
                        <span className="text-[10px] font-bold text-cool-500 dark:text-cool-400 font-mono">#{i + 1}</span>
                        <span>{kw}</span>
                      </motion.span>
                    ))}
                  </div>
                </div>

                {r.extracted_text && (
                  <div className="bg-slate-50/80 dark:bg-slate-900/60 backdrop-blur-xs p-4 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wide">
                        Authoritative Extracted Document Excerpt
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                        {r.extracted_text.length} chars
                      </span>
                    </div>
                    <p className="line-clamp-3 leading-relaxed text-slate-600 dark:text-slate-300 font-sans">
                      {r.extracted_text}
                    </p>
                  </div>
                )}
              </GlowCard>
            </motion.div>
          ))
        )}
      </div>

      {/* UPLOAD & AUTO-CALIBRATE REFERENCE MODAL */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        maxWidth="max-w-xl"
      >
        <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Upload Reference Document</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              File-read performs automated NLP extraction of 5 subject-specific keywords (generic English forbidden)
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
          <div className="p-3.5 rounded-2xl bg-red-50/90 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs leading-relaxed flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{modalError}</span>
          </div>
        )}

        <form onSubmit={handleCreateReference} className="space-y-5">
          {/* Reference Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Reference Material Title
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Session 5: Neural Attention & Transformer Architectures"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-peach-400 focus:border-peach-400 focus:outline-none transition"
            />
          </div>

          {/* Document File Dropzone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
              Upload Lecture File (.pdf, .docx, .txt, .ocr, .md)
            </label>
            <div className="border-2 border-dashed border-peach-200 dark:border-slate-700 hover:border-peach-400 dark:hover:border-cyan-400 rounded-2xl p-6 text-center transition bg-peach-50/30 dark:bg-slate-900/40 hover:bg-peach-50/60 dark:hover:bg-slate-900/70 cursor-pointer">
              <input
                type="file"
                accept=".pdf,.docx,.txt,.ocr,.md,.text"
                required
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleProcessUploadedDocument(e.target.files[0], false);
                  }
                }}
                className="w-full text-xs text-slate-500 dark:text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-gradient-to-r file:from-peach-500 file:to-rose-500 file:text-white hover:file:opacity-90 transition cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                Upload PDF, DOCX, TXT, OCR, or Markdown. The system will perform a complete document read.
              </p>
            </div>
          </div>

          {/* Processing State */}
          {extractingDoc && (
            <div className="p-4 rounded-2xl bg-cool-50 dark:bg-cyan-950/40 border border-cool-200 dark:border-cyan-800/50 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-cool-500 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-bold text-cool-800 dark:text-cyan-300">
                Reading document & computing 5 keywords...
              </p>
              <p className="text-[11px] text-cool-600 dark:text-cyan-400">
                Purging generic stopwords and extracting core domain terms.
              </p>
            </div>
          )}

          {/* Extracted 5 Keywords Display */}
          {extractedKeywords.length > 0 && !extractingDoc && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                  Auto-Calibrated Keywords ({extractedKeywords.length} Keywords)
                </label>
                <span className="text-[11px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/50">
                  ✓ {extractedKeywords.length} Keywords Ready
                </span>
              </div>

              <div className="flex flex-wrap gap-2 p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto">
                {extractedKeywords.map((kw, i) => (
                  <span
                    key={i}
                    className="text-xs px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold border border-cool-200/80 dark:border-slate-700 shadow-xs flex items-center gap-1.5"
                  >
                    <span className="text-[10px] font-bold text-cool-500 dark:text-cool-400 font-mono">#{i + 1}</span>
                    <span>{kw}</span>
                  </span>
                ))}
              </div>

              {referenceText && (
                <div className="bg-slate-50/80 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between mb-1">
                    <span className="font-bold text-slate-700 dark:text-slate-200">Document Text Read:</span>
                    <span className="font-mono text-slate-400 dark:text-slate-500">{docCharCount} characters</span>
                  </div>
                  <p className="line-clamp-2 text-slate-500 dark:text-slate-400 font-sans">
                    {referenceText}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
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
              disabled={saving || extractingDoc || !name.trim() || (extractedKeywords.length !== 5 && extractedKeywords.length !== 15)}
            >
              {saving ? "Saving Reference..." : `Save & Calibrate (${extractedKeywords.length || 5} Keywords)`}
            </InteractiveButton>
          </div>
        </form>
      </Modal>

      {/* EDIT REFERENCE MODAL */}
      <Modal
        isOpen={Boolean(editReference)}
        onClose={() => setEditReference(null)}
        maxWidth="max-w-xl"
      >
        {editReference && (
          <div className="space-y-6">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-peach-100 dark:bg-peach-950/50 text-peach-800 dark:text-peach-300 mb-1">
                  Edit Reference
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Edit Reference Material</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Update reference notes or re-upload a document to refresh the keywords
                </p>
              </div>
              <button
                onClick={() => setEditReference(null)}
                className="w-8 h-8 rounded-full bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white border border-white/40 dark:border-white/10 flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="p-3.5 rounded-2xl bg-red-50/90 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs leading-relaxed flex items-center gap-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateReference} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                  Reference Material Title
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-peach-400 focus:outline-none transition"
                />
              </div>

              {/* Optional Document Replacement */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wide">
                  Replace Document File (Optional)
                </label>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.ocr,.md,.text"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleProcessUploadedDocument(e.target.files[0], true);
                    }
                  }}
                  className="w-full text-xs text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200 hover:file:bg-slate-200 dark:hover:file:bg-slate-700 transition"
                />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Upload a new file to re-calculate keywords, or keep existing calibrated keywords below.
                </p>
              </div>

              {editExtracting && (
                <div className="p-3.5 rounded-xl bg-cool-50 dark:bg-cyan-950/40 border border-cool-200 dark:border-cyan-800/50 text-center text-xs font-bold text-cool-800 dark:text-cyan-300">
                  Re-reading document and updating keywords...
                </div>
              )}

              {/* Keywords Chips */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                    Active Keywords
                  </label>
                  <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/50">
                    {editKeywords.length} keywords
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 max-h-40 overflow-y-auto">
                  {editKeywords.map((kw, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold border border-cool-200/80 dark:border-slate-700 shadow-xs flex items-center gap-1"
                    >
                      <span className="text-[10px] text-cool-500 dark:text-cool-400 font-bold">#{i + 1}</span>
                      <span>{kw}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
                <InteractiveButton
                  type="button"
                  variant="outline"
                  onClick={() => setEditReference(null)}
                >
                  Cancel
                </InteractiveButton>
                <InteractiveButton
                  type="submit"
                  variant="primary"
                  disabled={savingEdit || editExtracting || !editName.trim() || (editKeywords.length !== 5 && editKeywords.length !== 15)}
                >
                  {savingEdit ? "Updating..." : "Save Changes"}
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
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/50 flex items-center justify-center text-rose-500 dark:text-rose-400 mb-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Delete Reference Material?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Are you sure you want to permanently delete <strong className="text-slate-900 dark:text-white">{deleteTarget.name}</strong>?
                This will remove its calibrated keywords and unlink it from any assessment sessions.
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
                onClick={handleDeleteReference}
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
