"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

interface ReferenceMaterial {
  id: string;
  name: string;
  extracted_text: string;
  created_at: string;
  keywords: string[];
}

export default function ReferenceLibraryPage() {
  const router = useRouter();
  const [references, setReferences] = useState<ReferenceMaterial[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [rawKeywords, setRawKeywords] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchReferences = async () => {
    const supabase = createClient();
    const { data: refRows } = await supabase
      .from("reference_materials")
      .select(`
        id, name, extracted_text, created_at,
        reference_keyword_sets ( keywords, is_active )
      `)
      .order("created_at", { ascending: false });

    const formatted: ReferenceMaterial[] = (refRows || []).map((r: any) => {
      const activeKw = r.reference_keyword_sets?.find((k: any) => k.is_active) || r.reference_keyword_sets?.[0];
      return {
        id: r.id,
        name: r.name,
        extracted_text: r.extracted_text || "",
        created_at: r.created_at,
        keywords: activeKw?.keywords || [],
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

  const parsedKeywords = rawKeywords
    .split(/[\n,]/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
  const distinctKeywords = Array.from(new Set(parsedKeywords));

  const handleCreateReference = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError(null);

    if (distinctKeywords.length !== 15) {
      setModalError(
        `A reference must have EXACTLY 15 distinct keywords. You currently have ${distinctKeywords.length} distinct keywords.`
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
      const { data: newRef, error: refErr } = await supabase
        .from("reference_materials")
        .insert({
          name: name.trim(),
          storage_path: `references/${Date.now()}_text.txt`,
          extracted_text: referenceText.trim(),
          uploaded_by: profile?.id,
        })
        .select("id")
        .single();

      if (refErr) throw new Error(refErr.message);

      const { error: kwErr } = await supabase
        .from("reference_keyword_sets")
        .insert({
          reference_id: newRef.id,
          version: 1,
          keywords: distinctKeywords,
          is_active: true,
        });

      if (kwErr) throw new Error(kwErr.message);

      setShowModal(false);
      setName("");
      setReferenceText("");
      setRawKeywords("");
      fetchReferences();
    } catch (err: any) {
      setModalError(err.message || "Failed to save reference material");
    } finally {
      setSaving(false);
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-peach-100/70 border border-peach-200 text-peach-900 mb-2">
            <span className="w-2 h-2 rounded-full bg-peach-500 animate-pulse" />
            Calibration & Benchmark Engine
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Reference Library & <span className="text-transparent bg-clip-text bg-gradient-to-r from-peach-600 via-rose-500 to-cool-600">15-Keyword Sets</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative lecture materials, cosine similarity benchmarks, and strict 15-keyword evaluation sets.
          </p>
        </div>

        <InteractiveButton
          onClick={() => {
            setShowModal(true);
            setModalError(null);
          }}
          variant="primary"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Add Reference Material
        </InteractiveButton>
      </motion.div>

      {/* Reference Material Grid */}
      <div className="grid gap-6">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            <div className="w-8 h-8 mx-auto mb-3 border-2 border-peach-400 border-t-transparent rounded-full animate-spin" />
            Loading calibrated reference library...
          </div>
        ) : references.length === 0 ? (
          <GlowCard glowColor="peach" className="p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-peach-100/60 border border-peach-200 flex items-center justify-center text-peach-600">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-800">No reference materials uploaded yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-5">
              Upload authoritative lecture texts and calibrate exactly 15 keywords to start evaluating student reflections.
            </p>
            <InteractiveButton
              onClick={() => {
                setShowModal(true);
                setModalError(null);
              }}
              variant="primary"
            >
              Upload First Reference
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
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="font-bold text-slate-900 text-lg tracking-tight">{r.name}</h3>
                    </div>
                    <p className="text-xs text-slate-400 font-mono">
                      ID: {r.id} • Added on {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-sm">
                      ✓ {r.keywords.length} Calibrated Keywords
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      15 Deterministic Evaluation Keywords (Score = Matches / 3)
                    </h4>
                    <span className="text-[11px] font-mono text-slate-400">1 match = 1/3 mark</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.keywords.map((kw, i) => (
                      <motion.span
                        key={i}
                        whileHover={{ scale: 1.05, y: -2 }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200/80 text-slate-700 font-medium shadow-xs hover:border-cool-300 hover:text-cool-700 hover:shadow-sm transition cursor-default flex items-center gap-1.5"
                      >
                        <span className="text-[10px] font-bold text-cool-500 font-mono">#{i + 1}</span>
                        <span>{kw}</span>
                      </motion.span>
                    ))}
                  </div>
                </div>

                {r.extracted_text && (
                  <div className="bg-slate-50/80 backdrop-blur-xs p-4 rounded-xl border border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wide">
                        Authoritative Text Excerpt
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {r.extracted_text.length} chars
                      </span>
                    </div>
                    <p className="line-clamp-3 leading-relaxed text-slate-600 font-sans">
                      {r.extracted_text}
                    </p>
                  </div>
                )}
              </GlowCard>
            </motion.div>
          ))
        )}
      </div>

      {/* Upload Reference Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-peach-200/60 max-w-xl w-full p-6 sm:p-8 space-y-6 max-h-[92vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Upload Reference Material</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Provide authoritative lecture content & calibrate exactly 15 keywords
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div className="p-3.5 rounded-2xl bg-red-50/90 border border-red-200 text-red-700 text-xs leading-relaxed flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleCreateReference} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    Reference Material Title
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Session 5: Neural Attention & Transformer Architectures"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-peach-400 focus:border-peach-400 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
                    Authoritative Lecture / Subject Text
                  </label>
                  <textarea
                    rows={5}
                    required
                    value={referenceText}
                    onChange={(e) => setReferenceText(e.target.value)}
                    placeholder="Paste the authoritative lecture summary or slide transcript used for semantic cosine similarity matching..."
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-peach-400 focus:border-peach-400 focus:outline-none transition leading-relaxed"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Exact 15 Subject-Specific Keywords
                    </label>
                    <span
                      className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                        distinctKeywords.length === 15
                          ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                          : "bg-amber-50 text-amber-700 border-amber-300"
                      }`}
                    >
                      {distinctKeywords.length} / 15 keywords
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    required
                    value={rawKeywords}
                    onChange={(e) => setRawKeywords(e.target.value)}
                    placeholder="optimization, gradient, backpropagation, weights, convergence, epochs, momentum, regularization, hyperparameter, loss, activation, stochastic, normalization, landscape, decay"
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-cool-400 focus:border-cool-400 focus:outline-none transition"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Separate keywords with commas or newlines. Duplicate entries will be automatically unified.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                  <InteractiveButton
                    type="button"
                    variant="outline"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </InteractiveButton>
                  <InteractiveButton
                    type="submit"
                    variant="primary"
                    disabled={saving || !name.trim() || distinctKeywords.length !== 15}
                  >
                    {saving ? "Saving Material..." : "Save & Calibrate (15 Keywords)"}
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
