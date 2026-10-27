"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCached, setCached, invalidateCache } from "@/lib/cache";
import { motion, AnimatePresence } from "framer-motion";
import GlowCard from "@/components/GlowCard";
import InteractiveButton from "@/components/InteractiveButton";
import Modal from "@/components/Modal";

interface StudentProfile {
  id: string;
  auth_user_id?: string;
  usn: string;
  full_name: string;
  role?: "STUDENT" | "REFERENCE_CONTRIBUTOR";
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

  const cachedStudents = getCached<StudentProfile[]>("admin_students_list");
  const [students, setStudents] = useState<StudentProfile[]>(cachedStudents || []);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(!cachedStudents);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Single Student Creation Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fullName, setFullName] = useState("");
  const [usn, setUsn] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountRole, setAccountRole] = useState<"STUDENT" | "REFERENCE_CONTRIBUTOR">("STUDENT");
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

  // Multi-Select Batch Deletion State
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleteStep, setBatchDeleteStep] = useState<1 | 2>(1);
  const [checkingImpact, setCheckingImpact] = useState(false);
  const [impactData, setImpactData] = useState<any>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);

  const fetchStudents = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, auth_user_id, usn, full_name, role, status, created_at")
      .in("role", ["STUDENT", "REFERENCE_CONTRIBUTOR"])
      .order("created_at", { ascending: false });

    if (data) {
      setStudents(data);
      setCached("admin_students_list", data);
    }
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
        body: JSON.stringify({ fullName, usn, email, password, role: accountRole }),
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

      invalidateCache("admin_students");
      invalidateCache("admin_dashboard");
      fetchStudents();
    } catch (err: any) {
      setModalError(err.message || "An unexpected error occurred.");
    } finally {
      setProvisioning(false);
    }
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = async () => {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    wb.creator = "Reflection AI";
    const ws = wb.addWorksheet("Students");

    ws.columns = [
      { header: "Name", key: "name", width: 22 },
      { header: "USN", key: "usn", width: 16 },
      { header: "Email ID", key: "email", width: 34 },
      { header: "Password", key: "password", width: 18 },
    ];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FF0F172A" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF1F5F9" },
    };

    // Add sample rows
    ws.addRow({ name: "Alex Morgan", usn: "1RV21CS010", email: "alex.morgan@institution.edu", password: "Student@123" });
    ws.addRow({ name: "Brian Clark", usn: "1RV21CS011", email: "brian.clark@institution.edu", password: "Student@123" });
    ws.addRow({ name: "Catherine Lee", usn: "1RV21CS012", email: "catherine.lee@institution.edu", password: "Student@123" });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Student_Roster_Template.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Parse Uploaded Excel File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelFileName(file.name);
    setExcelError(null);
    setImportSummary(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const ExcelJS = await import("exceljs");
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(arrayBuffer);

        const ws = wb.worksheets[0];
        if (!ws) {
          throw new Error("The selected Excel file is empty or contains no worksheets.");
        }

        let headers: string[] = [];
        const rawJson: any[] = [];

        ws.eachRow((row, rowNumber) => {
          const rowValues = row.values as any[];
          if (rowNumber === 1) {
            headers = (rowValues || []).slice(1).map((val) => String(val || "").trim().toLowerCase());
          } else {
            const rowData: Record<string, any> = {};
            (rowValues || []).slice(1).forEach((val, idx) => {
              const header = headers[idx] || `col_${idx}`;
              let cleanVal = val;
              if (cleanVal && typeof cleanVal === "object") {
                if ("text" in cleanVal) cleanVal = cleanVal.text;
                else if ("result" in cleanVal) cleanVal = cleanVal.result;
              }
              rowData[header] = cleanVal !== undefined && cleanVal !== null ? String(cleanVal).trim() : "";
            });
            rawJson.push(rowData);
          }
        });

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

    reader.readAsArrayBuffer(file);
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
      invalidateCache("admin_students");
      invalidateCache("admin_dashboard");
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
      invalidateCache("admin_students");
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
      invalidateCache("admin_students");
      invalidateCache("admin_dashboard");
      fetchStudents();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete student record.");
    } finally {
      setDeleting(false);
    }
  };

  const toggleStatus = async (studentId: string, currentStatus: "ACTIVE" | "SUSPENDED") => {
    const newStatus: "ACTIVE" | "SUSPENDED" = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus })
      .eq("id", studentId);

    if (!error) {
      setStudents((prev) => {
        const updated: StudentProfile[] = prev.map((s) => (s.id === studentId ? { ...s, status: newStatus } : s));
        setCached("admin_students_list", updated);
        return updated;
      });
    }
  };

  const handleToggleSelectAll = () => {
    if (filtered.length > 0 && selectedStudentIds.length === filtered.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(filtered.map((s) => s.id));
    }
  };

  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openBatchDeleteModal = async () => {
    if (selectedStudentIds.length === 0) return;
    setShowBatchDeleteModal(true);
    setBatchDeleteStep(1);
    setCheckingImpact(true);
    setBatchDeleteError(null);
    setImpactData(null);

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session expired. Please sign in again.");

      const res = await fetch("/api/students/impact-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ studentIds: selectedStudentIds }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to inspect impact");
      setImpactData(data);
    } catch (err: any) {
      setBatchDeleteError(err.message || "Failed to inspect deletion impact.");
    } finally {
      setCheckingImpact(false);
    }
  };

  const handleExecuteBatchDelete = async () => {
    if (selectedStudentIds.length === 0) return;
    setBatchDeleting(true);
    setBatchDeleteError(null);

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
        body: JSON.stringify({ studentIds: selectedStudentIds }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete selected accounts");

      const count = data.deletedCount || selectedStudentIds.length;
      setShowBatchDeleteModal(false);
      setSelectedStudentIds([]);
      setNotification({
        type: "success",
        message: `Batch delete complete: Successfully removed ${count} account(s) and their authentication records.`,
      });
      invalidateCache("admin_students");
      invalidateCache("admin_dashboard");
      fetchStudents();
    } catch (err: any) {
      setBatchDeleteError(err.message || "Failed to execute batch deletion.");
    } finally {
      setBatchDeleting(false);
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-cool-100/80 dark:bg-red-950/40 border border-cool-200 dark:border-red-500/30 text-cool-900 dark:text-red-300 mb-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
            Institutional Roster Management
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Student Roster & <span className="gradient-text-flame">Access Control</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
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
            className="border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-bold"
            icon={
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                ? "bg-emerald-50/90 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                : "bg-rose-50/90 dark:bg-rose-950/60 border-rose-200 dark:border-rose-500/30 text-rose-900 dark:text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-200 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
                ✓
              </span>
              <span className="font-medium">{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold px-2 py-1 text-sm"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Batch Action Bar */}
      <AnimatePresence>
        {selectedStudentIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-slate-900 dark:bg-slate-950 text-white border border-slate-700 dark:border-slate-800 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-peach-400 animate-pulse" />
              <div className="text-xs">
                <span className="px-2.5 py-1 rounded-full bg-peach-500/20 text-peach-300 font-mono font-bold text-xs mr-2 border border-peach-500/30">
                  {selectedStudentIds.length} Selected
                </span>
                <span className="font-semibold text-slate-300">
                  Account{selectedStudentIds.length > 1 ? "s" : ""} marked for batch action
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setSelectedStudentIds([])}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Deselect All
              </button>
              <button
                type="button"
                onClick={openBatchDeleteModal}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-rose-600/30 active:scale-95 transition flex items-center gap-2 cursor-pointer"
              >
                <span>🗑️</span>
                <span>Delete Selected ({selectedStudentIds.length})</span>
              </button>
            </div>
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
          <div className="p-4 sm:p-6 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <svg className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by student name or USN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-950/80 text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 focus:outline-none transition"
              />
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Showing <span className="font-bold text-slate-800 dark:text-slate-200">{filtered.length}</span> of {students.length} students
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              <div className="w-8 h-8 mx-auto mb-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
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
                  <tr className="bg-slate-100/70 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold text-[11px]">
                    <th className="py-4 px-4 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selectedStudentIds.length === filtered.length}
                        onChange={handleToggleSelectAll}
                        className="rounded text-pink-500 focus:ring-pink-500 w-4 h-4 cursor-pointer"
                      />
                    </th>
                    <th className="py-4 px-6">Student Name</th>
                    <th className="py-4 px-6">USN</th>
                    <th className="py-4 px-6">Status</th>
                    <th className="py-4 px-6">Registered On</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                  {filtered.map((s) => (
                    <motion.tr
                      key={s.id}
                      whileHover={{ backgroundColor: "rgba(100, 116, 139, 0.05)" }}
                      className={`transition-colors group ${selectedStudentIds.includes(s.id) ? "bg-peach-50/40 dark:bg-red-950/20" : ""}`}
                    >
                      <td className="py-4 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(s.id)}
                          onChange={() => handleToggleSelectStudent(s.id)}
                          className="rounded text-pink-500 focus:ring-pink-500 w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-peach-100 via-pink-100 to-cool-100 dark:from-red-500/20 dark:via-pink-500/20 dark:to-cyan-500/20 border border-peach-200 dark:border-pink-500/30 text-peach-800 dark:text-pink-300 flex items-center justify-center font-bold text-xs shadow-sm">
                            {s.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white group-hover:text-cool-600 dark:group-hover:text-cyan-300 transition">
                              {s.full_name}
                            </span>
                            <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                              ID: {s.id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-cyan-300 font-bold border border-slate-200 dark:border-slate-800 text-[11px]">
                            {s.usn || "N/A"}
                          </span>
                          {s.role === "REFERENCE_CONTRIBUTOR" && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
                              Ref Contributor
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <button
                          onClick={() => toggleStatus(s.id, s.status)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition ${
                            s.status === "ACTIVE"
                              ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                              : "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                          }`}
                          title="Click to toggle status"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${s.status === "ACTIVE" ? "bg-emerald-500 dark:bg-emerald-400" : "bg-rose-500 dark:bg-rose-400"}`} />
                          {s.status}
                        </button>
                      </td>
                      <td className="py-4 px-6 text-slate-500 dark:text-slate-400 text-[11px]">
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
                            className="relative z-20 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50 active:scale-95 transition-all cursor-pointer select-none"
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
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        maxWidth="max-w-lg"
      >
        <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Register Student Account</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Provisions Supabase Auth credentials & assigns verified USN
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

        <form onSubmit={handleCreateStudent} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
              Account Role / Authorization
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAccountRole("STUDENT")}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                  accountRole === "STUDENT"
                    ? "bg-cyan-50 dark:bg-cyan-950/60 border-cyan-400 text-cyan-800 dark:text-cyan-300 shadow-sm"
                    : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                🎓 Student (Reflections)
              </button>
              <button
                type="button"
                onClick={() => setAccountRole("REFERENCE_CONTRIBUTOR")}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                  accountRole === "REFERENCE_CONTRIBUTOR"
                    ? "bg-purple-50 dark:bg-purple-950/60 border-purple-400 text-purple-800 dark:text-purple-300 shadow-sm"
                    : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                }`}
              >
                📚 Ref Contributor (Uploads)
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {accountRole === "STUDENT"
                ? "Submits reflections for evaluation via Student Portal."
                : "Authorized exclusively to upload authoritative reference notes via Reference Portal."}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
              Full Legal Name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Jane Doe"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
              University Seat Number (USN)
            </label>
            <input
              type="text"
              required
              value={usn}
              onChange={(e) => setUsn(e.target.value)}
              placeholder="e.g. 1RV21CS001"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold uppercase text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
              Institutional Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@institution.edu"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
              Initial Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
            />
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
              disabled={provisioning || !fullName || !usn || !email || !password}
            >
              {provisioning ? "Provisioning..." : "Provision Student"}
            </InteractiveButton>
          </div>
        </form>
      </Modal>

      {/* EXCEL BATCH IMPORT MODAL */}
      <Modal
        isOpen={showExcelModal}
        onClose={() => setShowExcelModal(false)}
        maxWidth="max-w-2xl"
      >
              <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800/80 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 mb-1">
                    Spreadsheet Batch Enrollment
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    Import Students from Excel (.xlsx)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Recognizes columns: <span className="font-mono font-bold text-slate-700 dark:text-cyan-300">Name | USN | Email ID | Password</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowExcelModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white border border-white/40 dark:border-white/10 flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {/* Template Download Prompt */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Need the standard spreadsheet format?</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Download our pre-formatted template with verified column headers.</p>
                </div>
                <InteractiveButton
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="border-emerald-300 dark:border-cyan-500/40 text-emerald-800 dark:text-cyan-300 hover:bg-white dark:hover:bg-cyan-950/40 text-xs whitespace-nowrap font-semibold"
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
                    className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-cyan-500 bg-slate-50/60 dark:bg-slate-950/60 hover:bg-slate-100/60 dark:hover:bg-slate-900/60 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-cyan-950/70 border border-emerald-200 dark:border-cyan-500/30 text-emerald-700 dark:text-cyan-300 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {excelFileName ? `Selected: ${excelFileName}` : "Click to select or drop your .xlsx / .xls file"}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Supports Microsoft Excel spreadsheets with up to 500 rows</p>
                    </div>
                  </div>
                </div>
              )}

              {excelError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 text-rose-500 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{excelError}</span>
                </div>
              )}

              {/* Preview Table of Parsed Records */}
              {excelRows.length > 0 && !importSummary && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Roster Preview ({excelRows.length} Students Detected)
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 font-bold text-[10px]">
                      {validExcelCount} Valid / {excelRows.length - validExcelCount} Incomplete
                    </span>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/40 dark:bg-slate-950/40">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-400 sticky top-0 font-bold border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Name</th>
                          <th className="py-2 px-3">USN</th>
                          <th className="py-2 px-3">Email ID</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                        {excelRows.map((r, i) => (
                          <tr key={i} className={r.isValid ? "bg-white dark:bg-slate-950/30" : "bg-rose-50/50 dark:bg-rose-950/20"}>
                            <td className="py-2 px-3 font-sans font-semibold text-slate-900 dark:text-slate-200">{r.name || "—"}</td>
                            <td className="py-2 px-3 font-bold text-cool-700 dark:text-cyan-300">{r.usn || "—"}</td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-sans">{r.email || "—"}</td>
                            <td className="py-2 px-3">
                              {r.isValid ? (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">✓ Ready</span>
                              ) : (
                                <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">⚠ {r.validationError}</span>
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
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Batch Import Results
                    </h3>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-2.5 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-500/30">
                        <span className="block text-xl font-black text-emerald-800 dark:text-emerald-300 font-mono">
                          {importSummary.successCount}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Created</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-100/70 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-500/30">
                        <span className="block text-xl font-black text-amber-800 dark:text-amber-300 font-mono">
                          {importSummary.skippedCount}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">Skipped (Exists)</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-100/70 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/30">
                        <span className="block text-xl font-black text-rose-800 dark:text-rose-300 font-mono">
                          {importSummary.failedCount}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400">Failed</span>
                      </div>
                    </div>
                  </div>

                  {/* Skipped or Failed Breakdown */}
                  {importSummary.results.some((r) => r.status !== "SUCCESS") && (
                    <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-2 bg-slate-50 dark:bg-slate-950/60 space-y-1">
                      {importSummary.results.filter((r) => r.status !== "SUCCESS").map((r, i) => (
                        <div key={i} className="text-[11px] flex justify-between items-center py-1 px-2 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{r.usn} ({r.fullName})</span>
                          <span className={`text-[10px] font-bold ${r.status === "SKIPPED" ? "text-amber-700 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>
                            {r.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-3">
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
      </Modal>

      {/* EDIT STUDENT MODAL */}
      <Modal
        isOpen={Boolean(editStudent)}
        onClose={() => setEditStudent(null)}
        maxWidth="max-w-lg"
      >
        {editStudent && (
          <div className="space-y-5">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800/80 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-300 mb-1">
                  Edit Student
                </div>
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  Edit {editStudent.full_name}
                </h2>
                <p className="text-xs text-slate-400 font-mono">
                  USN: {editStudent.usn} &bull; ID: {editStudent.id.slice(0, 8)}...
                </p>
              </div>
              <button
                onClick={() => setEditStudent(null)}
                className="w-8 h-8 rounded-full bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white border border-white/40 dark:border-white/10 flex items-center justify-center transition"
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

            <form onSubmit={handleUpdateStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
                  Student Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
                  University Seat Number (USN)
                </label>
                <input
                  type="text"
                  required
                  value={editUsn}
                  onChange={(e) => setEditUsn(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold uppercase text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
                  Account Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as "ACTIVE" | "SUSPENDED")}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                >
                  <option value="ACTIVE" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">ACTIVE (Can Submit Reflections)</option>
                  <option value="SUSPENDED" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">SUSPENDED (Access Frozen)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1.5">
                  Reset Password (Optional)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave blank to preserve existing password"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 focus:outline-none transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter at least 6 characters if resetting student password.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-3">
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
                Delete Student Account?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Are you sure you want to permanently remove <strong className="text-slate-900 dark:text-white">{deleteTarget.full_name}</strong> (<span className="font-mono text-cool-600 dark:text-cyan-300 font-bold">{deleteTarget.usn}</span>)?
                This will also remove their authentication credentials and any associated submissions.
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
                onClick={handleDeleteStudent}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-rose-600/30 active:scale-95 transition cursor-pointer select-none disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* BATCH DELETE 2-STEP CONFIRMATION MODAL (RULE 1 & RULE 2) */}
      <Modal
        isOpen={showBatchDeleteModal}
        onClose={() => {
          if (!batchDeleting) {
            setShowBatchDeleteModal(false);
            setBatchDeleteStep(1);
          }
        }}
        maxWidth="max-w-xl"
      >
        <div className="space-y-5">
          {/* Header with Steps */}
          <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                    batchDeleteStep === 1
                      ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300"
                      : "bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300"
                  }`}
                >
                  Step {batchDeleteStep} of 2: {batchDeleteStep === 1 ? "Impact & Safety Scan" : "Final Confirmation"}
                </span>
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                {batchDeleteStep === 1 ? "Review Accounts for Deletion" : "Confirm Permanent Deletion"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {batchDeleteStep === 1
                  ? `Analyzing data linked to ${selectedStudentIds.length} selected account(s)`
                  : "This action is irreversible and permanently wipes selected accounts"}
              </p>
            </div>
            {!batchDeleting && (
              <button
                onClick={() => setShowBatchDeleteModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white border border-white/40 dark:border-white/10 flex items-center justify-center transition"
              >
                ✕
              </button>
            )}
          </div>

          {batchDeleteError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0 text-rose-500 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{batchDeleteError}</span>
            </div>
          )}

          {/* STEP 1: Impact Scan (Rule 2) */}
          {batchDeleteStep === 1 && (
            <div className="space-y-4">
              {checkingImpact ? (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-3">
                  <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Scanning active sessions for student reflections and reference materials...</p>
                </div>
              ) : (
                <>
                  {/* Warning Box if Submissions or References Detected (Rule 2) */}
                  {impactData?.hasSubmissions || impactData?.hasReferences ? (
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 space-y-3">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs uppercase tracking-wider">
                        <span>⚠️ Active Academic Data Detected</span>
                      </div>

                      {impactData?.hasSubmissions && (
                        <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
                          <p className="font-semibold">
                            • {impactData.totalSubmissions} active session reflection(s) exist for {impactData.studentsWithSubmissions.length} of the selected student(s):
                          </p>
                          <div className="max-h-28 overflow-y-auto pl-2 space-y-1 font-mono text-[11px] text-amber-800 dark:text-amber-300">
                            {impactData.studentsWithSubmissions.map((s: any) => (
                              <div key={s.id} className="bg-amber-100/70 dark:bg-amber-900/40 px-2 py-1 rounded">
                                <strong>{s.name} ({s.usn})</strong>: {s.count} reflection(s) in ({s.sessions.join(", ")})
                              </div>
                            ))}
                          </div>
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">
                            Deleting these students will permanently erase their reflections and scores.
                          </p>
                        </div>
                      )}

                      {impactData?.hasReferences && (
                        <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1.5 pt-2 border-t border-amber-200 dark:border-amber-800/40">
                          <p className="font-semibold">
                            • {impactData.totalReferences} uploaded reference note(s) belong to {impactData.contributorsWithReferences.length} of the selected account(s):
                          </p>
                          <div className="max-h-24 overflow-y-auto pl-2 space-y-1 font-mono text-[11px] text-amber-800 dark:text-amber-300">
                            {impactData.contributorsWithReferences.map((c: any) => (
                              <div key={c.id} className="bg-amber-100/70 dark:bg-amber-900/40 px-2 py-1 rounded">
                                <strong>{c.name}</strong>: {c.references.join(", ")}
                              </div>
                            ))}
                          </div>
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 italic">
                            To maintain active sessions, reference notes will be preserved with Faculty Administration ownership.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 font-medium">
                      <span>✓ Clean Status:</span> No active session submissions or reference materials are attached to the selected accounts.
                    </div>
                  )}

                  {/* List of Selected Profiles */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Selected Accounts ({selectedStudentIds.length})
                      </span>
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl p-2 space-y-1.5 bg-slate-50/50 dark:bg-slate-950/40">
                      {students
                        .filter((s) => selectedStudentIds.includes(s.id))
                        .map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 dark:text-white">{s.full_name}</span>
                              <span className="font-mono text-[11px] text-slate-500">{s.usn || "N/A"}</span>
                            </div>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                s.role === "REFERENCE_CONTRIBUTOR"
                                  ? "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                              }`}
                            >
                              {s.role === "REFERENCE_CONTRIBUTOR" ? "Ref Contributor" : "Student"}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Step 1 Actions */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-3">
                    <InteractiveButton
                      type="button"
                      variant="outline"
                      onClick={() => setShowBatchDeleteModal(false)}
                    >
                      Cancel
                    </InteractiveButton>
                    <button
                      type="button"
                      onClick={() => setBatchDeleteStep(2)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-peach-600 hover:bg-peach-700 text-white shadow-md active:scale-95 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Proceed to Final Confirmation</span>
                      <span>&rarr;</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 2: Final Confirmation (Rule 1) */}
          {batchDeleteStep === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 space-y-3">
                <div className="flex items-center gap-2.5 font-extrabold text-sm text-rose-700 dark:text-rose-300">
                  <span className="text-xl">⚠️</span>
                  <span>Are you absolutely sure? This cannot be undone.</span>
                </div>
                <p className="text-xs leading-relaxed">
                  You are about to permanently delete <strong className="font-bold underline">{selectedStudentIds.length} account(s)</strong>.
                </p>
                <div className="text-xs space-y-1 text-rose-800 dark:text-rose-300">
                  <p>• Database profile records will be completely removed.</p>
                  <p>• Supabase Auth accounts will be revoked (students will not be able to log in).</p>
                  <p>• Any associated reflection submissions and scores will be permanently deleted.</p>
                </div>
              </div>

              {/* Step 2 Actions */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
                <button
                  type="button"
                  disabled={batchDeleting}
                  onClick={() => setBatchDeleteStep(1)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                >
                  &larr; Back to Impact Review
                </button>
                <div className="flex gap-3">
                  <InteractiveButton
                    type="button"
                    variant="outline"
                    disabled={batchDeleting}
                    onClick={() => setShowBatchDeleteModal(false)}
                  >
                    Cancel
                  </InteractiveButton>
                  <button
                    type="button"
                    onClick={handleExecuteBatchDelete}
                    disabled={batchDeleting}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-rose-600/30 active:scale-95 transition cursor-pointer select-none disabled:opacity-50 flex items-center gap-2"
                  >
                    {batchDeleting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Deleting {selectedStudentIds.length} Accounts...</span>
                      </>
                    ) : (
                      <>
                        <span>🗑️</span>
                        <span>Yes, Permanently Delete All {selectedStudentIds.length} Accounts</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
