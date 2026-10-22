"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

  const handleCreateReference = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setModalError(null);

    const parsedKeywords = rawKeywords
      .split(/[\n,]/)
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k.length > 0);

    const distinct = Array.from(new Set(parsedKeywords));

    if (distinct.length !== 15) {
      setModalError(
        `A reference must have EXACTLY 15 distinct keywords. You currently have ${distinct.length} distinct keywords.`
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
          keywords: distinct,
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Reference Library & 15-Keyword Calibration
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative lecture notes and verified 15-keyword benchmarks for evaluation
          </p>
        </div>
        <button
          onClick={() => {
            setShowModal(true);
            setModalError(null);
          }}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shadow-sm"
        >
          + Upload Reference Material
        </button>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="text-center py-12 text-xs text-slate-500">Loading reference library...</div>
        ) : references.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border text-center text-xs text-slate-500">
            No reference materials uploaded yet. Click "+ Upload Reference Material" to add one.
          </div>
        ) : (
          references.map((r) => (
            <div key={r.id} className="bg-white p-6 rounded-2xl border shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{r.name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">Reference ID: {r.id}</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 self-start sm:self-auto">
                  {r.keywords.length} Calibrated Keywords
                </span>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-2">
                  15 Subject-Specific Evaluation Keywords
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {r.keywords.map((kw, i) => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-medium border border-slate-200"
                    >
                      {i + 1}. {kw}
                    </span>
                  ))}
                </div>
              </div>

              {r.extracted_text && (
                <div className="bg-slate-50 p-3.5 rounded-xl border text-xs text-slate-600 line-clamp-3">
                  <strong className="text-slate-700">Source Text Excerpt: </strong>
                  {r.extracted_text}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-slate-900">Upload Reference Material</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateReference} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reference Material Title
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lecture 4: Attention Mechanisms and Transformers"
                  className="w-full px-3 py-2 border rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reference Body / Topic Text
                </label>
                <textarea
                  rows={4}
                  required
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                  placeholder="Paste core lecture note text used for semantic similarity comparison..."
                  className="w-full p-3 border rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Exactly 15 Distinct Subject Keywords
                  </label>
                  <span className="text-xs text-slate-400">Comma or line separated</span>
                </div>
                <textarea
                  rows={5}
                  required
                  value={rawKeywords}
                  onChange={(e) => setRawKeywords(e.target.value)}
                  placeholder="optimization, gradient, backpropagation, weights, convergence, epochs, momentum, regularization, hyperparameter, loss, activation, stochastic, normalization, landscape, decay"
                  className="w-full p-3 border rounded-xl text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3.5 py-2 rounded-xl border text-xs text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim() || !rawKeywords.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Reference & Keywords"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
