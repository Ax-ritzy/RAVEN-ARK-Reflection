"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

      // Verify Session status
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

      // Check if already submitted
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

      // If plain text, extract immediately for convenience
      if (selected.name.endsWith(".txt")) {
        const text = await selected.text();
        setReflectionText(text.slice(0, 1000)); // preview
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

      // If a file was uploaded, process through extractor
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
          // If backend extraction unreachable, do local text validation for .txt
          if (file.name.endsWith(".txt")) {
            finalBody = (await file.text()).trim();
          } else {
            throw new Error(`Document extraction failed: ${fetchErr.message}`);
          }
        }

        // Upload file to Supabase Storage
        const fileExt = file.name.split(".").pop();
        storagePath = `${studentProfile.id}/${sessionId}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("student-submissions")
          .upload(storagePath, file, { upsert: true });

        if (uploadError) {
          console.warn("Storage upload warning:", uploadError.message);
        }
      }

      // Enforce 500-char limit
      if (finalBody.length === 0) {
        throw new Error("Reflection body cannot be empty.");
      }

      if (finalBody.length > MAX_CHARS) {
        throw new Error(`Reflection exceeds the 500-character limit (${finalBody.length} characters).`);
      }

      // Insert Submission atomically into database
      const { data: newSub, error: subError } = await supabase
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

      // Submission recorded successfully -> Redirect to results page
      router.push(`/results/${sessionId}`);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit reflection.");
      setSubmitting(false);
    }
  };

  const currentChars = reflectionText.length;
  const isOverLimit = currentChars > MAX_CHARS;

  if (loading) {
    return <div className="text-center py-12 text-sm text-slate-500">Checking eligibility...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl border shadow-sm p-6 sm:p-8">
      <div className="mb-6">
        <a href="/dashboard" className="text-xs text-blue-600 hover:underline">
          &larr; Back to Sessions
        </a>
        <h1 className="text-xl font-bold text-slate-900 mt-2">
          Submit Reflection
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Session: <span className="font-semibold text-slate-700">{sessionName}</span>
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 mb-6 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Document Upload Option */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-700 mb-2">
            Upload Document (TXT, DOCX, or PDF)
          </label>
          <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-blue-400 transition cursor-pointer">
            <input
              type="file"
              accept=".txt,.docx,.pdf"
              onChange={handleFileChange}
              className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-slate-400 mt-2">
              Body text will be safely extracted and validated against the 500-character maximum.
            </p>
          </div>
        </div>

        {/* Direct Text Editor Option */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-xs font-semibold uppercase text-slate-700">
              Or Type Reflection Directly
            </label>
            <span
              className={`text-xs font-medium ${
                isOverLimit ? "text-red-600 font-bold" : "text-slate-500"
              }`}
            >
              {currentChars} / {MAX_CHARS} characters
            </span>
          </div>
          <textarea
            rows={6}
            value={reflectionText}
            onChange={(e) => setReflectionText(e.target.value)}
            placeholder="Write your core reflection here (max 500 characters)..."
            className={`w-full p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
              isOverLimit ? "border-red-400 focus:ring-red-400" : "focus:ring-blue-500"
            }`}
          />
          {isOverLimit && (
            <p className="text-xs text-red-600 mt-1">
              Warning: Exceeds the 500-character limit by {currentChars - MAX_CHARS} characters.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || isOverLimit || (!file && !reflectionText.trim())}
          className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
        >
          {submitting ? "Processing Submission..." : "Submit Reflection for Evaluation"}
        </button>
      </form>
    </div>
  );
}
