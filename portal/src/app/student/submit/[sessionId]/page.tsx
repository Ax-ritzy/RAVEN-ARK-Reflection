"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

export default function SubmitReflectionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [sessionName, setSessionName] = useState("");
  const [reflectionText, setReflectionText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);

  const MAX_CHARS = 500;

  useEffect(() => {
    async function verifyEligibility() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, usn, role")
        .eq("auth_user_id", user.id)
        .single();

      if (!profile || profile.role !== "STUDENT") {
        router.push("/login");
        return;
      }
      setStudentProfile(profile);

      const { data: session } = await supabase
        .from("sessions")
        .select("id, name, status")
        .eq("id", sessionId)
        .single();

      if (!session) {
        setErrorMsg("Session not found.");
        setLoading(false);
        return;
      }

      if (session.status !== "OPEN") {
        setErrorMsg("This session is CLOSED. Submissions are no longer accepted.");
        setLoading(false);
        return;
      }

      setSessionName(session.name);

      const { data: existingSub } = await supabase
        .from("submissions")
        .select("id")
        .eq("session_id", sessionId)
        .eq("student_id", profile.id)
        .maybeSingle();

      if (existingSub) {
        setErrorMsg("You have already submitted a reflection for this session.");
        setLoading(false);
        return;
      }

      setLoading(false);
    }

    verifyEligibility();
  }, [sessionId, router]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);

      if (selected.name.endsWith(".txt")) {
        const text = await selected.text();
        setReflectionText(text.slice(0, 1000));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    const supabase = createClient();

    try {
      let finalBody = reflectionText.trim();
      let storagePath = `text_input_${Date.now()}.txt`;

      if (file) {
        const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://localhost:8000";
        const formData = new FormData();
        formData.append("file", file);
        formData.append("max_chars", "500");

        try {
          const extractResp = await fetch(`${backendUrl}/api/extract`, {
            method: "POST",
            body: formData,
          });

          if (!extractResp.ok) {
            const errData = await extractResp.json();
            throw new Error(errData.detail?.message || "File extraction failed");
          }

          const extractData = await extractResp.json();
          finalBody = extractData.extracted_text;
        } catch (fetchErr: any) {
          if (file.name.endsWith(".txt")) {
            finalBody = (await file.text()).trim();
          } else {
            throw new Error(`Document extraction failed: ${fetchErr.message}`);
          }
        }

        const fileExt = file.name.split(".").pop();
        storagePath = `${studentProfile.id}/${sessionId}/${Date.now()}.${fileExt}`;
        await supabase.storage
          .from("student-submissions")
          .upload(storagePath, file, { upsert: true });
      }

      if (finalBody.length === 0) {
        throw new Error("Reflection body cannot be empty.");
      }

      if (finalBody.length > MAX_CHARS) {
        throw new Error(`Reflection exceeds the 500-character limit (${finalBody.length} characters).`);
      }

      const { data: subData, error: subError } = await supabase
        .from("submissions")
        .insert({
          session_id: sessionId,
          student_id: studentProfile.id,
          storage_path: storagePath,
          extracted_text: finalBody,
          char_count: finalBody.length,
          status: "SUBMITTED",
        })
        .select("id")
        .single();

      if (subError) {
        if (subError.code === "23505") {
          throw new Error("Duplicate submission rejected. Exactly one submission allowed per session.");
        }
        throw new Error(subError.message);
      }

      // Immediately trigger deterministic assessment evaluation
      try {
        await fetch("/api/submissions/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId: subData.id }),
        });
      } catch (evalErr) {
        console.warn("Evaluation trigger notice:", evalErr);
      }

      router.push(`/student/results/${sessionId}`);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit reflection.");
      setSubmitting(false);
    }
  };

  const currentChars = reflectionText.length;
  const progressPercent = Math.min((currentChars / MAX_CHARS) * 100, 100);
  const isOverLimit = currentChars > MAX_CHARS;

  if (loading) {
    return (
      <div className="text-center py-20 text-slate-400 text-sm">
        <div className="w-8 h-8 border-2 border-peach-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        Verifying student eligibility...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <GlowCard glowColor="peach" className="p-8">
        <div className="mb-6 space-y-2">
          <a
            href="/student/dashboard"
            className="text-xs font-semibold text-peach-600 hover:text-peach-700 transition inline-flex items-center gap-1"
          >
            &larr; Back to Sessions
          </a>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
            Submit Reflection
          </h1>
          <p className="text-xs text-slate-500">
            Session: <span className="font-bold text-slate-700">{sessionName}</span>
          </p>
        </div>

        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 mb-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold"
          >
            ⚠️ {errorMsg}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload Drop Area */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              Upload Document (TXT, DOCX, or PDF)
            </label>
            <div className="border-2 border-dashed border-peach-200 hover:border-peach-400 rounded-2xl p-6 text-center transition-all bg-peach-50/30 hover:bg-peach-50/60 cursor-pointer group">
              <input
                type="file"
                accept=".txt,.docx,.pdf"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-gradient-to-r file:from-peach-500 file:to-rose-500 file:text-white hover:file:opacity-90 transition cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-2">
                Text is safely extracted and strictly checked against the 500-character maximum.
              </p>
            </div>
          </div>

          {/* Text Area */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-bold">
              <label className="uppercase tracking-wider text-slate-600">
                Or Type Reflection Directly
              </label>
              <span
                className={`font-mono px-2.5 py-0.5 rounded-full ${
                  isOverLimit
                    ? "bg-rose-100 text-rose-700 font-extrabold"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {currentChars} / {MAX_CHARS}
              </span>
            </div>

            {/* Visual Character Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <motion.div
                className={`h-full ${
                  isOverLimit
                    ? "bg-rose-500"
                    : "bg-gradient-to-r from-peach-400 via-rose-400 to-cool-400"
                }`}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.2 }}
              />
            </div>

            <textarea
              rows={6}
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
              placeholder="Synthesize the core concepts covered in today's reflection (maximum 500 characters)..."
              className={`w-full p-4 rounded-2xl border text-sm font-sans focus:outline-none transition-all shadow-sm ${
                isOverLimit
                  ? "border-rose-400 focus:ring-2 focus:ring-rose-400 bg-rose-50/20"
                  : "border-slate-200 focus:ring-2 focus:ring-peach-400 bg-white/80"
              }`}
            />
          </div>

          <InteractiveButton
            type="submit"
            disabled={submitting || isOverLimit || (!file && !reflectionText.trim())}
            className="w-full py-3.5 rounded-2xl text-sm font-bold shadow-lg"
          >
            {submitting ? "Processing & Evaluating..." : "Submit Reflection for Evaluation →"}
          </InteractiveButton>
        </form>
      </GlowCard>
    </div>
  );
}
