"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

interface UploadedMaterial {
  id: string;
  name: string;
  extracted_text: string;
  created_at: string;
  keywords: string[];
  linked_sessions: string[];
}

interface MatchingSession {
  id: string;
  name: string;
  created_at: string;
}

export default function ReferenceContributorPortalPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<{ id: string; full_name: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Ingestion form state
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [referenceText, setReferenceText] = useState("");
  const [docCharCount, setDocCharCount] = useState<number>(0);
  const [extractedKeywords, setExtractedKeywords] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Today's detected sessions
  const [todaySessions, setTodaySessions] = useState<MatchingSession[]>([]);

  // User's uploaded history (Read-Only)
  const [history, setHistory] = useState<UploadedMaterial[]>([]);
  const [previewExpandedId, setPreviewExpandedId] = useState<string | null>(null);

  const todayIsoDate = new Date().toISOString().split("T")[0];
  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Verify Auth and Role
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/reference/login");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, role, status")
        .eq("auth_user_id", user.id)
        .single();

      if (profErr || !prof) {
        router.push("/reference/login");
        return;
      }

      if (prof.status === "SUSPENDED") {
        await supabase.auth.signOut();
        router.push("/reference/login");
        return;
      }

      if (prof.role !== "REFERENCE_CONTRIBUTOR" && prof.role !== "PROFESSOR") {
        // Normal students not allowed here
        router.push("/student/dashboard");
        return;
      }

      setProfile(prof);
      await loadTodaySessions(supabase);
      await loadUserHistory(supabase, prof.id);
      setLoading(false);
    }

    init();
  }, [router]);

  // Load sessions created on current date
  const loadTodaySessions = async (supabase: any) => {
    const { data: sessList } = await supabase
      .from("sessions")
      .select("id, name, created_at")
      .order("created_at", { ascending: false });

    if (sessList) {
      const matching = sessList.filter((s: any) => {
        const d = new Date(s.created_at).toISOString().split("T")[0];
        return d === todayIsoDate;
      });
      setTodaySessions(matching);
    }
  };

  // Load history of materials uploaded by this user
  const loadUserHistory = async (supabase: any, profileId: string) => {
    const { data: materials } = await supabase
      .from("reference_materials")
      .select(`
        id, name, extracted_text, created_at, uploaded_by,
        reference_keyword_sets ( keywords, is_active ),
        session_references ( session_id, sessions ( name ) )
      `)
      .eq("uploaded_by", profileId)
      .order("created_at", { ascending: false });

    if (materials) {
      const formatted: UploadedMaterial[] = materials.map((m: any) => {
        const activeKw = m.reference_keyword_sets?.find((k: any) => k.is_active) || m.reference_keyword_sets?.[0];
        const linked = (m.session_references || [])
          .map((sr: any) => sr.sessions?.name)
          .filter(Boolean);

        return {
          id: m.id,
          name: m.name,
          extracted_text: m.extracted_text || "",
          created_at: m.created_at,
          keywords: activeKw?.keywords || [],
          linked_sessions: linked,
        };
      });
      setHistory(formatted);
    }
  };

  // Handle Document Selection and NLP Keyword Extraction
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    if (!name.trim()) {
      setName(selected.name.replace(/\.[^/.]+$/, ""));
    }
    setExtracting(true);
    setStatusMsg(null);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://localhost:8000";
      const formData = new FormData();
      formData.append("file", selected);
      formData.append("keyword_count", "5");

      const resp = await fetch(`${backendUrl}/api/references/extract-keywords`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        throw new Error(errJson?.detail?.message || "Failed to extract keywords from file.");
      }

      const data = await resp.json();
      setReferenceText(data.extracted_text || "");
      setDocCharCount(data.char_count || 0);
      setExtractedKeywords(data.keywords || []);
      setStatusMsg({
        type: "success",
        text: `Extracted ${data.keywords?.length || 0} authoritative reference keywords successfully.`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err.message || "Failed to extract content from document.",
      });
    } finally {
      setExtracting(false);
    }
  };

  // Handle Form Submission (Create-Only)
  const handleSubmitReference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!file || !referenceText) {
      setStatusMsg({
        type: "error",
        text: "Please choose a valid lecture document (.pdf, .docx, .txt, .ocr, .md) to upload.",
      });
      return;
    }

    if (extractedKeywords.length !== 5 && extractedKeywords.length !== 15) {
      setStatusMsg({
        type: "error",
        text: `Document must yield 5 calibrated keywords. Currently extracted: ${extractedKeywords.length}.`,
      });
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);

    const supabase = createClient();

    try {
      // 1. Upload original document to Supabase storage
      const storagePath = `references/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadErr } = await supabase.storage
        .from("reference-materials")
        .upload(storagePath, file, { upsert: true });

      if (uploadErr) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`);
      }

      // 2. Insert into reference_materials
      const { data: newRef, error: refErr } = await supabase
        .from("reference_materials")
        .insert({
          name: name.trim(),
          storage_path: storagePath,
          extracted_text: referenceText.trim(),
          uploaded_by: profile.id,
        })
        .select("id, created_at")
        .single();

      if (refErr) throw new Error(refErr.message);

      // 3. Insert 5 keywords into reference_keyword_sets
      const { error: kwErr } = await supabase
        .from("reference_keyword_sets")
        .insert({
          reference_id: newRef.id,
          version: 1,
          keywords: extractedKeywords,
          is_active: true,
        });

      if (kwErr) throw new Error(kwErr.message);

      // 4. Automatic Date-Based Session Linking:
      // Automatically link to all sessions created on this calendar date
      const uploadDateStr = new Date(newRef.created_at || Date.now()).toISOString().split("T")[0];
      const { data: allSessions } = await supabase
        .from("sessions")
        .select("id, created_at");

      let linkedCount = 0;
      if (allSessions && allSessions.length > 0) {
        const matches = allSessions.filter((s: any) => {
          const sDate = new Date(s.created_at).toISOString().split("T")[0];
          return sDate === uploadDateStr;
        });

        if (matches.length > 0) {
          const links = matches.map((s: any) => ({
            session_id: s.id,
            reference_id: newRef.id,
          }));
          await supabase.from("session_references").insert(links);
          linkedCount = matches.length;
        }
      }

      // Success Reset
      setName("");
      setFile(null);
      setReferenceText("");
      setDocCharCount(0);
      setExtractedKeywords([]);
      setStatusMsg({
        type: "success",
        text: `Reference material "${name.trim()}" successfully published! ${
          linkedCount > 0
            ? `Automatically linked to ${linkedCount} session(s) created today.`
            : "Any new session created today will automatically bind to this material."
        }`,
      });

      await loadUserHistory(supabase, profile.id);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err.message || "An unexpected error occurred during submission.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-24 text-slate-400 dark:text-slate-500 text-sm">
        <div className="w-9 h-9 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Verifying Reference Contributor credentials...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-12">
      {/* Hero Header Card */}
      <div className="relative rounded-3xl overflow-hidden p-6 sm:p-8 border border-white/80 dark:border-slate-800 shadow-xl bg-white/70 dark:bg-[#0c0f1e]/80 backdrop-blur-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 rounded-full bg-gradient-to-br from-purple-500/15 via-pink-500/15 to-cyan-500/15 blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-500/40">
                📚 Reference Contributor
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cool-50 dark:bg-cyan-950/50 text-cool-800 dark:text-cyan-300 border border-cool-200 dark:border-cyan-500/30">
                🔒 Upload-Only Authority
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Reference Material Upload Portal
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Welcome, <span className="font-bold text-slate-800 dark:text-slate-200">{profile?.full_name}</span>. Provide lecture notes, textbook chapters, or model notes for automated assessment calibration.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-100/90 dark:bg-slate-900/90 px-4 py-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-inner">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Today: {todayFormatted}</span>
          </div>
        </div>

        {/* Date Auto-Link Banner */}
        <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-purple-50/90 via-pink-50/80 to-cyan-50/90 dark:from-purple-950/40 dark:via-pink-950/30 dark:to-cyan-950/40 border border-purple-200/80 dark:border-purple-500/30 text-xs text-purple-900 dark:text-purple-200 space-y-1">
          <div className="flex items-center gap-2 font-bold text-purple-800 dark:text-purple-300">
            <span>📅</span>
            <span>Date-Based Automatic Session Linking Active</span>
          </div>
          <p className="text-[11px] text-purple-800/90 dark:text-purple-300/80 leading-relaxed">
            All reference materials uploaded on calendar date <strong className="font-mono text-purple-950 dark:text-purple-100">{todayIsoDate}</strong> automatically link to sessions scheduled or created on this same date. The faculty professor retains full visibility of all uploads and generated keywords.
          </p>
          {todaySessions.length > 0 ? (
            <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-semibold text-purple-900 dark:text-purple-200">Matching Today&apos;s Sessions:</span>
              {todaySessions.map((s) => (
                <span
                  key={s.id}
                  className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-purple-900/60 font-semibold border border-purple-300 dark:border-purple-600 shadow-sm"
                >
                  ✓ {s.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] italic text-purple-700/80 dark:text-purple-300/70 pt-1">
              ℹ️ No sessions created today yet. Any new session created by faculty today will automatically link to materials uploaded today.
            </p>
          )}
        </div>
      </div>

      {/* Main Upload Form Card (Liquid Glass System) */}
      <div className="relative">
        <div className="liquid-glass-modal p-6 sm:p-8 shadow-2xl transition-colors space-y-6">
          <div className="border-b border-slate-200/80 dark:border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>📤</span>
              <span>Upload New Reference Material</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select document file. The NLP engine will instantly extract the text and 5 subject-matter keywords.
            </p>
          </div>

          {statusMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-2xl border text-xs font-semibold flex items-start gap-2.5 ${
                statusMsg.type === "success"
                  ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200"
                  : "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-500/40 text-rose-800 dark:text-rose-200"
              }`}
            >
              <span className="text-base">{statusMsg.type === "success" ? "✅" : "⚠️"}</span>
              <span className="leading-relaxed">{statusMsg.text}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmitReference} className="space-y-5">
            {/* Document File Dropzone */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                1. Select Document (.PDF, .DOCX, .TXT, .OCR, .MD)
              </label>
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 rounded-2xl p-6 text-center bg-slate-50/60 dark:bg-slate-950/50 transition cursor-pointer relative group">
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.ocr,.md"
                  required
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="space-y-2 pointer-events-none">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center text-2xl group-hover:scale-110 transition">
                    📁
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {file ? file.name : "Click to select or drag and drop reference document"}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {file ? `${(file.size / 1024).toFixed(1)} KB • Auto-processing keywords` : "Supports PDF, DOCX, TXT, OCR scans"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Document Title */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                2. Reference Material Title
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Unit 3: Distributed Hash Tables & Consensus"
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 dark:focus:ring-purple-500/50 transition shadow-sm"
              />
            </div>

            {/* Extracting Progress Spinner */}
            {extracting && (
              <div className="p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-500/30 text-xs text-purple-700 dark:text-purple-300 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span>Running non-AI NLP keyword extractor (calibrating top 5 domain terms)...</span>
              </div>
            )}

            {/* Extracted 5 Keywords Showcase */}
            {extractedKeywords.length > 0 && (
              <div className="p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      3. Calibrated Subject Keywords
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cool-100 dark:bg-cyan-950 text-cool-800 dark:text-cyan-300 border border-cool-200 dark:border-cyan-500/30">
                      {extractedKeywords.length} Keywords
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {docCharCount.toLocaleString()} Characters Processed
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {extractedKeywords.map((kw, idx) => (
                    <motion.span
                      key={idx}
                      whileHover={{ scale: 1.05 }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-purple-900 dark:text-purple-200 border border-purple-200 dark:border-purple-700 shadow-sm"
                    >
                      <span className="text-purple-500">#{idx + 1}</span>
                      <span>{kw}</span>
                    </motion.span>
                  ))}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                  Deterministic Scoring Calibration: 5/5 matched keywords = 5.00 marks (1.00 mark per match).
                </p>
              </div>
            )}

            {/* Text Excerpt Preview */}
            {referenceText && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Extracted Document Excerpt Preview
                </label>
                <div className="max-h-36 overflow-y-auto p-3.5 rounded-2xl bg-white/60 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {referenceText.slice(0, 1000)}
                  {referenceText.length > 1000 ? "\n\n[... Remaining content indexed for evaluation ...]" : ""}
                </div>
              </div>
            )}

            {/* Submit Action */}
            <div className="pt-2 flex justify-end">
              <InteractiveButton
                type="submit"
                disabled={submitting || extracting || !file || !referenceText}
                className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold shadow-lg bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-500 hover:opacity-95"
              >
                {submitting ? "Uploading & Publishing..." : "Submit Reference Material →"}
              </InteractiveButton>
            </div>
          </form>
        </div>
      </div>

      {/* Read-Only Material History (CREATE ONLY ENFORCED) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Your Published Reference Materials
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit log of materials uploaded under your contributor identity.
            </p>
          </div>
          <span className="text-[11px] px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-mono border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
            {history.length} Materials Recorded
          </span>
        </div>

        {history.length === 0 ? (
          <GlowCard className="p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No reference materials uploaded yet.
            </p>
            <p className="text-xs text-slate-400">
              Upload your first lecture notes or reference material using the form above.
            </p>
          </GlowCard>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {history.map((item) => (
              <GlowCard key={item.id} className="p-5 sm:p-6 transition-all hover:border-purple-300 dark:hover:border-purple-700">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                        {item.name}
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
                        {item.keywords.length} Keywords
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>Uploaded: {new Date(item.created_at).toLocaleString()}</span>
                      <span>•</span>
                      <span className="font-mono text-[11px]">ID: {item.id.slice(0, 8)}...</span>
                    </div>

                    {/* Keywords pills */}
                    <div className="pt-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                        Calibrated Keywords:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {item.keywords.map((kw, i) => (
                          <span
                            key={i}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-purple-50/70 dark:bg-purple-950/30 text-purple-800 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/40 font-medium"
                          >
                            #{kw}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Linked Sessions */}
                    <div className="pt-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1.5">
                        Associated Sessions:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {item.linked_sessions.length > 0 ? (
                          item.linked_sessions.map((sessName, i) => (
                            <span
                              key={i}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 font-medium"
                            >
                              📅 {sessName}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            No active session linked on this calendar day
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expandable text preview */}
                    {previewExpandedId === item.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto"
                      >
                        {item.extracted_text.slice(0, 800)}
                        {item.extracted_text.length > 800 ? "..." : ""}
                      </motion.div>
                    )}
                  </div>

                  {/* Actions / Read-Only Tag */}
                  <div className="flex flex-col sm:items-end justify-between gap-3 self-stretch">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewExpandedId(previewExpandedId === item.id ? null : item.id)
                      }
                      className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline"
                    >
                      {previewExpandedId === item.id ? "Hide Excerpt ▲" : "View Excerpt ▼"}
                    </button>

                    <div className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100/80 dark:bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex items-center gap-1.5">
                      <span>🔒</span>
                      <span>Read-only record. Faculty admin manages edits.</span>
                    </div>
                  </div>
                </div>
              </GlowCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
