"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";
import { computeTimerState, TimerState } from "@/lib/timer";

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
  const [autoSubmitNotice, setAutoSubmitNotice] = useState<string | null>(null);
  const [studentProfile, setStudentProfile] = useState<any>(null);

  // Timer States
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timerState, setTimerState] = useState<TimerState | null>(null);

  // Refs to avoid stale closures in interval
  const reflectionTextRef = useRef(reflectionText);
  reflectionTextRef.current = reflectionText;
  const fileRef = useRef(file);
  fileRef.current = file;
  const isSubmittedRef = useRef(false);

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

      // Resilient select including expires_at
      let session: any = null;
      const { data: sessData, error: sessErr } = await supabase
        .from("sessions")
        .select("id, name, status, expires_at")
        .eq("id", sessionId)
        .single();

      if (sessErr && sessErr.code === "42703") {
        const fallback = await supabase
          .from("sessions")
          .select("id, name, status")
          .eq("id", sessionId)
          .single();
        session = fallback.data;
      } else {
        session = sessData;
      }

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

      // Check if session has expired
      if (session.expires_at) {
        const initialTimer = computeTimerState(session.expires_at);
        if (initialTimer && initialTimer.isExpired) {
          setErrorMsg("This session's submission window has expired. Submissions are closed.");
          setLoading(false);
          return;
        }
        setExpiresAt(session.expires_at);
        setTimerState(initialTimer);
      }

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

  // Live Timer Countdown & Auto-Submit on Expiry
  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const state = computeTimerState(expiresAt);
      setTimerState(state);

      if (state && state.isExpired) {
        clearInterval(interval);
        handleAutoSubmitOnTimeout();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleAutoSubmitOnTimeout = async () => {
    if (isSubmittedRef.current) return;
    isSubmittedRef.current = true;

    const currentText = reflectionTextRef.current.trim();
    if (currentText.length > 0 || fileRef.current) {
      setAutoSubmitNotice("⏳ Session time has expired! Automatically submitting your current reflection draft...");
      await executeSubmission(currentText, fileRef.current, true);
    } else {
      setErrorMsg("⏰ The session timer has expired. No submission was recorded because no reflection text was entered.");
    }
  };

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

  const executeSubmission = async (bodyText: string, uploadFile: File | null, isAuto: boolean = false) => {
    setErrorMsg(null);
    setSubmitting(true);
    isSubmittedRef.current = true;

    const supabase = createClient();

    try {
      let finalBody = bodyText.trim();
      let storagePath = `text_input_${Date.now()}.txt`;

      if (uploadFile) {
        const backendUrl = process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL || "http://localhost:8000";
        const formData = new FormData();
        formData.append("file", uploadFile);
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
          if (uploadFile.name.endsWith(".txt")) {
            finalBody = (await uploadFile.text()).trim();
          } else {
            throw new Error(`Document extraction failed: ${fetchErr.message}`);
          }
        }

        const fileExt = uploadFile.name.split(".").pop();
        storagePath = `${studentProfile.id}/${sessionId}/${Date.now()}.${fileExt}`;
        await supabase.storage
          .from("student-submissions")
          .upload(storagePath, uploadFile, { upsert: true });
      }

      if (finalBody.length === 0) {
        throw new Error("Reflection body cannot be empty.");
      }

      // If auto-submitting and text exceeds 500 characters, truncate gracefully
      if (isAuto && finalBody.length > MAX_CHARS) {
        finalBody = finalBody.slice(0, MAX_CHARS);
      } else if (finalBody.length > MAX_CHARS) {
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

      // Trigger deterministic evaluation
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
      isSubmittedRef.current = false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSubmission(reflectionText, file, false);
  };

  const currentChars = reflectionText.length;
  const progressPercent = Math.min((currentChars / MAX_CHARS) * 100, 100);
  const isOverLimit = currentChars > MAX_CHARS;
  const isTimeUp = timerState?.isExpired ?? false;

  if (loading) {
    return (
      <div className="text-center py-20 text-slate-400 dark:text-slate-500 text-sm">
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
            className="text-xs font-semibold text-peach-600 dark:text-peach-400 hover:text-peach-700 dark:hover:text-peach-300 transition inline-flex items-center gap-1"
          >
            &larr; Back to Sessions
          </a>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">
            Submit Reflection
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Session: <span className="font-bold text-slate-700 dark:text-slate-200">{sessionName}</span>
          </p>
        </div>

        {/* Live Countdown Timer Banner */}
        {timerState && !timerState.isExpired && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 mb-6 rounded-2xl border flex items-center justify-between transition-all duration-300 ${
              timerState.urgency === "critical"
                ? "bg-rose-50/90 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700/60 text-rose-900 dark:text-rose-200 animate-pulse shadow-md shadow-rose-500/10"
                : timerState.urgency === "warning"
                ? "bg-amber-50/90 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200"
                : "bg-emerald-50/90 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700/60 text-emerald-900 dark:text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">
                {timerState.urgency === "critical" ? "🔥" : timerState.urgency === "warning" ? "⚠️" : "⏳"}
              </span>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider">
                  {timerState.urgency === "critical"
                    ? "Time Almost Up!"
                    : timerState.urgency === "warning"
                    ? "Submissions Closing Soon"
                    : "Time Remaining"}
                </div>
                <div className="text-[11px] opacity-80">
                  Draft will automatically submit when timer reaches 00:00
                </div>
              </div>
            </div>
            <div className="text-lg sm:text-xl font-mono font-black tracking-tight">
              {timerState.formatted}
            </div>
          </motion.div>
        )}

        {/* Auto-Submit Notice */}
        {autoSubmitNotice && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 mb-6 rounded-2xl bg-peach-50 dark:bg-peach-950/60 border border-peach-300 dark:border-peach-700 text-peach-900 dark:text-peach-200 text-xs font-semibold flex items-center gap-3"
          >
            <div className="w-4 h-4 border-2 border-peach-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span>{autoSubmitNotice}</span>
          </motion.div>
        )}

        {/* Error Notice */}
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 mb-6 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold"
          >
            ⚠️ {errorMsg}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload Drop Area */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
              Upload Document (TXT, DOCX, or PDF)
            </label>
            <div className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              isTimeUp || submitting
                ? "opacity-60 cursor-not-allowed border-slate-300 dark:border-slate-800"
                : "border-peach-200 dark:border-slate-700 hover:border-peach-400 dark:hover:border-cyan-400 bg-peach-50/30 dark:bg-slate-900/40 hover:bg-peach-50/60 dark:hover:bg-slate-900/70 cursor-pointer"
            }`}>
              <input
                type="file"
                accept=".txt,.docx,.pdf"
                disabled={submitting || isTimeUp}
                onChange={handleFileChange}
                className="w-full text-xs text-slate-500 dark:text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-gradient-to-r file:from-peach-500 file:to-rose-500 file:text-white hover:file:opacity-90 transition cursor-pointer disabled:cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                Text is safely extracted and strictly checked against the 500-character maximum.
              </p>
            </div>
          </div>

          {/* Text Area */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-bold">
              <label className="uppercase tracking-wider text-slate-600 dark:text-slate-300">
                Or Type Reflection Directly
              </label>
              <span
                className={`font-mono px-2.5 py-0.5 rounded-full ${
                  isOverLimit
                    ? "bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-extrabold"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}
              >
                {currentChars} / {MAX_CHARS}
              </span>
            </div>

            {/* Visual Character Progress Bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
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
              disabled={submitting || isTimeUp}
              onChange={(e) => setReflectionText(e.target.value)}
              placeholder="Synthesize the core concepts covered in today's reflection (maximum 500 characters)..."
              className={`w-full p-4 rounded-2xl border text-sm font-sans focus:outline-none transition-all shadow-sm ${
                isTimeUp || submitting
                  ? "bg-slate-100 dark:bg-slate-900/60 opacity-60 cursor-not-allowed border-slate-300"
                  : isOverLimit
                  ? "border-rose-400 focus:ring-2 focus:ring-rose-400 bg-rose-50/20 dark:bg-rose-950/20 text-slate-900 dark:text-slate-100"
                  : "border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-peach-400 bg-white/80 dark:bg-slate-900/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              }`}
            />
          </div>

          <InteractiveButton
            type="submit"
            disabled={submitting || isOverLimit || isTimeUp || (!file && !reflectionText.trim())}
            className="w-full py-3.5 rounded-2xl text-sm font-bold shadow-lg"
          >
            {submitting ? "Processing & Evaluating..." : isTimeUp ? "Session Expired" : "Submit Reflection for Evaluation →"}
          </InteractiveButton>
        </form>
      </GlowCard>
    </div>
  );
}
