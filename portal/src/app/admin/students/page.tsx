"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";

interface StudentProfile {
  id: string;
  auth_user_id?: string;
  usn: string;
  full_name: string;
  status: "ACTIVE" | "SUSPENDED";
  created_at: string;
}

interface ParsedExcelStudent {
  name: string;
  usn: string;
  email: string;
  password: string;
  isValid: boolean;
  validationError?: string;
}

interface ImportSummary {
  total: number;
  successCount: number;
  skippedCount: number;
  failedCount: number;
  results: Array<{
    usn: string;
    fullName: string;
    email: string;
    status: "SUCCESS" | "SKIPPED" | "FAILED";
    reason?: string;
  }>;
}

export default function StudentManagementPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Single Student Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fullName, setFullName] = useState("");
  const [usn, setUsn] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Excel Batch Import Modal State
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const [excelRows, setExcelRows] = useState<ParsedExcelStudent[]>([]);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [importingExcel, setImportingExcel] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  // Edit Student Modal State
  const [editStudent, setEditStudent] = useState<StudentProfile | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editUsn, setEditUsn] = useState("");
  const [editStatus, setEditStatus] = useState<"ACTIVE" | "SUSPENDED">("ACTIVE");
  const [editPassword, setEditPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Student Modal State
  const [deleteTarget, setDeleteTarget] = useState<StudentProfile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchStudents = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, auth_user_id, usn, full_name, status, created_at")
      .eq("role", "STUDENT")
      .order("created_at", { ascending: false });

    setStudents(data || []);
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
      fetchStudents();
    }
    checkAuth();
  }, [router]);

  // Single Student Creation
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);
    setModalError(null);

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error("Session expired. Please sign in again.");
      }

      const res = await fetch("/api/students/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fullName, usn, email, password }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to provision student");
      }

      // Automatically close modal on successful single creation
      setShowCreateModal(false);
      setFullName("");
      setUsn("");
      setEmail("");
      setPassword("");
      setNotification({
        type: "success",
        message: `Successfully created and provisioned student ${fullName.trim()} (${usn.trim().toUpperCase()}).`,
      });

      fetchStudents();
    } catch (err: any) {
      setModalError(err.message || "An unexpected error occurred.");
    } finally {
      setProvisioning(false);
    }
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const sampleData = [
      ["Name", "USN", "Email ID", "Password"],
      ["Alex Morgan", "1RV21CS010", "alex.morgan@institution.edu", "Student@123"],
      ["Brian Clark", "1RV21CS011", "brian.clark@institution.edu", "Student@123"],
      ["Catherine Lee", "1RV21CS012", "catherine.lee@institution.edu", "Student@123"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleData);

    // Set nice column widths
    ws["!cols"] = [{ wch: 20 }, { wch: 15 }, { wch: 32 }, { wch: 18 }];

    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "Student_Roster_Template.xlsx");
  };

  // Parse Uploaded Excel File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFileName(file.name);
    setExcelError(null);
    setImportSummary(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (!rawJson || rawJson.length === 0) {
          throw new Error("The selected Excel file is empty or contains no student data rows.");
        }

        // Helper to match column headers regardless of spacing or case
        const getField = (row: any, ...aliases: string[]) => {
          for (const alias of aliases) {
            const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
            for (const key of Object.keys(row)) {
              const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (cleanKey === cleanAlias) {
                return String(row[key]).trim();
              }
            }
          }
          return "";
        };

        const parsed: ParsedExcelStudent[] = rawJson.map((row) => {
          const name = getField(row, "name", "fullname", "studentname");
          const usn = getField(row, "usn", "rollno", "studentid").toUpperCase();
          const email = getField(row, "emailid", "email", "emailaddress");
          const password = getField(row, "password", "pass");

          let isValid = true;
          let validationError = "";

          if (!name) {
            isValid = false;
            validationError = "Missing Name";
          } else if (!usn) {
            isValid = false;
            validationError = "Missing USN";
          } else if (!email || !email.includes("@")) {
            isValid = false;
            validationError = "Invalid Email";
          } else if (!password || password.length < 6) {
            isValid = false;
            validationError = "Password < 6 chars";
          }

          return { name, usn, email, password, isValid, validationError };
        }).filter((r) => r.name || r.usn || r.email);

        if (parsed.length === 0) {
          throw new Error("No recognizable student records found. Please ensure headers are: Name | USN | Email ID | Password");
        }

        setExcelRows(parsed);
      } catch (err: any) {
        setExcelError(err.message || "Failed to parse spreadsheet file.");
        setExcelRows([]);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Submit Batch Import
  const handleConfirmImport = async () => {
    const validRows = excelRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setExcelError("No valid rows available to import.");
      return;
    }

    setImportingExcel(true);
    setExcelError(null);

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) throw new Error("Session expired. Please sign in again.");

      const res = await fetch("/api/students/batch-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ students: validRows }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process batch import.");
      }

      setImportSummary(data);
      fetchStudents();

      if (data.successCount > 0) {
        setNotification({
          type: "success",
          message: `Batch import complete: ${data.successCount} student(s) successfully registered into roster.`,
        });
      }
    } catch (err: any) {
      setExcelError(err.message || "Failed to import students.");
    } finally {
      setImportingExcel(false);
    }
  };

  const openEditModal = (student: StudentProfile) => {
    setEditStudent(student);
    setEditFullName(student.full_name);
    setEditUsn(student.usn);
    setEditStatus(student.status);
    setEditPassword("");
    setEditError(null);
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editStudent) return;

    setSavingEdit(true);
    setEditError(null);

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) throw new Error("Session expired. Please sign in again.");

      const res = await fetch("/api/students/provision", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          studentId: editStudent.id,
          fullName: editFullName,
          usn: editUsn,
          status: editStatus,
          newPassword: editPassword || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to update student");
      }

      setEditStudent(null);
      setNotification({
        type: "success",
        message: `Successfully updated student record for ${editFullName} (${editUsn.toUpperCase()}).`,
      });
      fetchStudents();
    } catch (err: any) {
      setEditError(err.message || "Failed to update student record.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) throw new Error("Session expired. Please sign in again.");

      const res = await fetch("/api/students/provision", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ studentId: deleteTarget.id }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to delete student");
      }

      const deletedName = deleteTarget.full_name;
      setDeleteTarget(null);
      setNotification({
        type: "success",
        message: `Permanently removed student ${deletedName}.`,
      });
      fetchStudents();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete student record.");
    } finally {
      setDeleting(false);
    }
  };

  const toggleStatus = async (studentId: string, currentStatus: "ACTIVE" | "SUSPENDED") => {
    const newStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", studentId);

    if (!error) {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, status: newStatus } : s))
      );
    }
  };

  const filtered = students.filter(
    (s) =>
      s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.usn && s.usn.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const validExcelCount = excelRows.filter((r) => r.isValid).length;

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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-950/40 border border-red-500/30 text-red-300 mb-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Institutional Roster Management
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Student Roster & <span className="gradient-text-flame">Access Control</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Register students individually or import via Excel spreadsheets with auto-credentials.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <InteractiveButton
            onClick={() => {
              setShowExcelModal(true);
              setExcelRows([]);
              setExcelFileName(null);
              setExcelError(null);
              setImportSummary(null);
            }}
            variant="outline"
            className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/40 font-bold"
            icon={
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
          >
            📊 Import Excel (.xlsx)
          </InteractiveButton>

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
            + Add Student
          </InteractiveButton>
        </div>
      </motion.div>

      {/* Global Notification Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 shadow-sm ${
              notification.type === "success"
                ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-200"
                : "bg-rose-950/60 border-rose-500/30 text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center font-bold text-xs">
                ✓
              </span>
              <span className="font-medium">{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-white font-bold px-2 py-1 text-sm"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Roster Table Card */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <GlowCard glowColor="cyan" className="overflow-hidden p-0">
          <div className="p-4 sm:p-6 border-b border-slate-800/80 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by student name or USN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-800 rounded-xl text-xs bg-slate-950/80 text-slate-200 placeholder:text-slate-500 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 focus:outline-none transition"
              />
            </div>
            <div className="text-xs text-slate-400 font-medium">
              Showing <span className="font-bold text-slate-200">{filtered.length}</span> of {students.length} students
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              <div className="w-8 h-8 mx-auto mb-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              Loading student roster...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              No students found matching your criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-bold text-[11px]">
                    <th className="py-4 px-6">Student Name</th>
                    <th className="py-4 px-6">USN</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6">Registered On</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                  {filtered.map((s) => (
                    <motion.tr
                      key={s.id}
                      whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.03)" }}
                      className="transition-colors group"
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-500/20 via-pink-500/20 to-cyan-500/20 border border-pink-500/30 text-pink-300 flex items-center justify-center font-bold text-xs shadow-sm">
                            {s.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-white group-hover:text-cyan-300 transition">
                              {s.full_name}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-mono">
                              ID: {s.id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="font-mono px-2 py-0.5 rounded-md bg-slate-900 text-cyan-300 font-bold border border-slate-800 text-[11px]">
                          {s.usn || "N/A"}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <button
                          onClick={() => toggleStatus(s.id, s.status)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition ${
                            s.status === "ACTIVE"
                              ? "bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/40"
                              : "bg-rose-950/50 text-rose-300 border border-rose-500/30 hover:bg-rose-900/40"
                          }`}
                          title="Click to toggle status"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${s.status === "ACTIVE" ? "bg-emerald-400" : "bg-rose-400"}`} />
                          {s.status}
                        </button>
                      </td>
                      <td className="py-4 px-6 text-slate-400 text-[11px]">
                        {new Date(s.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <InteractiveButton
                            onClick={() => openEditModal(s)}
                            variant="secondary"
                            size="sm"
                          >
                            Edit
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
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlowCard>
      </motion.div>

      {/* SINGLE CREATE STUDENT MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-[#0d101e]/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-slate-800 max-w-lg w-full p-6 sm:p-8 space-y-5 max-h-[92vh] overflow-y-auto text-slate-100"
            >
              <div className="flex justify-between items-start border-b border-slate-800/80 pb-4">
                <div>
                  <h2 className="text-xl font-extrabold text-white">Register Student Account</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Provisions Supabase Auth credentials & assigns verified USN
                  </p>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {modalError && (
                <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleCreateStudent} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Full Legal Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Jane Doe"
                    className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    University Seat Number (USN)
                  </label>
                  <input
                    type="text"
                    required
                    value={usn}
                    onChange={(e) => setUsn(e.target.value)}
                    placeholder="e.g. 1RV21CS001"
                    className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-mono font-bold uppercase text-slate-100 placeholder:text-slate-500 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Institutional Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@institution.edu"
                    className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Initial Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                  />
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex justify-end gap-3">
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
                    disabled={provisioning || !fullName || !usn || !email || !password}
                  >
                    {provisioning ? "Provisioning..." : "Provision Student"}
                  </InteractiveButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EXCEL BATCH IMPORT MODAL */}
      <AnimatePresence>
        {showExcelModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-[#0d101e]/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-slate-800 max-w-2xl w-full p-6 sm:p-8 space-y-5 max-h-[92vh] overflow-y-auto text-slate-100"
            >
              <div className="flex justify-between items-start border-b border-slate-800/80 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 mb-1">
                    Spreadsheet Batch Enrollment
                  </div>
                  <h2 className="text-xl font-extrabold text-white">
                    Import Students from Excel (.xlsx)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Recognizes columns: <span className="font-mono font-bold text-cyan-300">Name | USN | Email ID | Password</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowExcelModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {/* Template Download Prompt */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-200">Need the standard spreadsheet format?</h4>
                  <p className="text-[11px] text-slate-400">Download our pre-formatted template with verified column headers.</p>
                </div>
                <InteractiveButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/40 text-xs whitespace-nowrap font-semibold"
                >
                  📥 Download Template (.xlsx)
                </InteractiveButton>
              </div>

              {/* File Upload Box */}
              {!importSummary && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-cyan-400 bg-slate-950/60 hover:bg-slate-900/60 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2"
                  >
                    <div className="w-10 h-10 rounded-full bg-cyan-950/70 border border-cyan-500/30 text-cyan-300 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-200">
                        {excelFileName ? `Selected: ${excelFileName}` : "Click to select or drop your .xlsx / .xls file"}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Supports Microsoft Excel spreadsheets with up to 500 rows</p>
                    </div>
                  </div>
                </div>
              )}

              {excelError && (
                <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{excelError}</span>
                </div>
              )}

              {/* Preview Table of Parsed Records */}
              {excelRows.length > 0 && !importSummary && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-300">
                      Roster Preview ({excelRows.length} Students Detected)
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-bold text-[10px]">
                      {validExcelCount} Valid / {excelRows.length - validExcelCount} Incomplete
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950/40">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-900 text-slate-400 sticky top-0 font-bold border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Name</th>
                          <th className="py-2 px-3">USN</th>
                          <th className="py-2 px-3">Email ID</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 font-mono">
                        {excelRows.map((r, i) => (
                          <tr key={i} className={r.isValid ? "bg-slate-950/30" : "bg-rose-950/20"}>
                            <td className="py-2 px-3 font-sans font-semibold text-slate-200">{r.name || "—"}</td>
                            <td className="py-2 px-3 font-bold text-cyan-300">{r.usn || "—"}</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">{r.email || "—"}</td>
                            <td className="py-2 px-3">
                              {r.isValid ? (
                                <span className="text-[10px] text-emerald-400 font-bold">✓ Ready</span>
                              ) : (
                                <span className="text-[10px] text-rose-400 font-bold">⚠ {r.validationError}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Import Summary after Execution */}
              {importSummary && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                      Batch Import Results
                    </h3>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30">
                        <span className="block text-xl font-black text-emerald-300 font-mono">
                          {importSummary.successCount}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-emerald-400">Created</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/30">
                        <span className="block text-xl font-black text-amber-300 font-mono">
                          {importSummary.skippedCount}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-amber-400">Skipped (Exists)</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-500/30">
                        <span className="block text-xl font-black text-rose-300 font-mono">
                          {importSummary.failedCount}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-rose-400">Failed</span>
                      </div>
                    </div>
                  </div>

                  {/* Skipped or Failed Breakdown */}
                  {importSummary.results.some((r) => r.status !== "SUCCESS") && (
                    <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-950/60 space-y-1">
                      {importSummary.results.filter((r) => r.status !== "SUCCESS").map((r, i) => (
                        <div key={i} className="text-[11px] flex justify-between items-center py-1 px-2 rounded bg-slate-900 border border-slate-800">
                          <span className="font-mono font-bold text-slate-200">{r.usn} ({r.fullName})</span>
                          <span className={`text-[10px] font-bold ${r.status === "SKIPPED" ? "text-amber-400" : "text-rose-400"}`}>
                            {r.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800/80 flex justify-end gap-3">
                <InteractiveButton
                  type="button"
                  variant="outline"
                  onClick={() => setShowExcelModal(false)}
                >
                  {importSummary ? "Done" : "Cancel"}
                </InteractiveButton>

                {!importSummary && excelRows.length > 0 && (
                  <InteractiveButton
                    type="button"
                    variant="primary"
                    disabled={importingExcel || validExcelCount === 0}
                    onClick={handleConfirmImport}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    {importingExcel
                      ? "Enrolling Students into Database..."
                      : `Confirm & Import ${validExcelCount} Student(s)`}
                  </InteractiveButton>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT STUDENT MODAL */}
      <AnimatePresence>
        {editStudent && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-[#0d101e]/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-slate-800 max-w-lg w-full p-6 sm:p-8 space-y-5 max-h-[92vh] overflow-y-auto text-slate-100"
            >
              <div className="flex justify-between items-start border-b border-slate-800/80 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-950/60 border border-purple-500/30 text-purple-300 mb-1">
                    Edit Student
                  </div>
                  <h2 className="text-xl font-extrabold text-white">
                    Edit {editStudent.full_name}
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    USN: {editStudent.usn} &bull; ID: {editStudent.id.slice(0, 8)}...
                  </p>
                </div>
                <button
                  onClick={() => setEditStudent(null)}
                  className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {editError && (
                <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleUpdateStudent} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Student Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    University Seat Number (USN)
                  </label>
                  <input
                    type="text"
                    required
                    value={editUsn}
                    onChange={(e) => setEditUsn(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-mono font-bold uppercase text-slate-100 placeholder:text-slate-500 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Account Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as "ACTIVE" | "SUSPENDED")}
                    className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                  >
                    <option value="ACTIVE" className="bg-slate-900 text-slate-100">ACTIVE (Can Submit Reflections)</option>
                    <option value="SUSPENDED" className="bg-slate-900 text-slate-100">SUSPENDED (Access Frozen)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Reset Password (Optional)
                  </label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Leave blank to preserve existing password"
                    className="w-full px-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Enter at least 6 characters if resetting student password.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex justify-end gap-3">
                  <InteractiveButton
                    type="button"
                    variant="outline"
                    onClick={() => setEditStudent(null)}
                  >
                    Cancel
                  </InteractiveButton>
                  <InteractiveButton
                    type="submit"
                    variant="primary"
                    disabled={savingEdit || !editFullName.trim() || !editUsn.trim()}
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
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-[#0d101e]/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-rose-900/50 max-w-md w-full p-6 sm:p-7 space-y-4 text-slate-100"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-950/60 border border-rose-800/50 flex items-center justify-center text-rose-400 mb-2">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white">
                  Delete Student Account?
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Are you sure you want to permanently remove <strong className="text-white">{deleteTarget.full_name}</strong> (<span className="font-mono text-cyan-300 font-bold">{deleteTarget.usn}</span>)?
                  This will also remove their authentication credentials and any associated submissions.
                </p>
              </div>

              {deleteError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs">
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
                  onClick={handleDeleteStudent}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-rose-600/30 active:scale-95 transition cursor-pointer select-none disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
