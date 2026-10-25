import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function verifyProfessorCaller(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return { error: "Missing authorization token", status: 401 };
  }

  const token = authHeader.replace("Bearer ", "");
  const admin = createAdminClient();

  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    return { error: "Unauthorized caller", status: 401 };
  }

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (callerProfile?.role !== "PROFESSOR") {
    return { error: "Forbidden: Only authorized professors may inspect deletion impact", status: 403 };
  }

  return { admin, user };
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyProfessorCaller(req);
    if ("error" in authCheck) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }
    const { admin } = authCheck;

    const body = await req.json();
    const { studentIds } = body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: "studentIds array is required" }, { status: 400 });
    }

    // 1. Check for active submissions linked to any of these student IDs
    const { data: subs, error: subErr } = await admin
      .from("submissions")
      .select(`
        id, student_id, session_id,
        sessions ( name ),
        profiles ( full_name, usn )
      `)
      .in("student_id", studentIds);

    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 });
    }

    interface StudentSubInfo {
      name: string;
      usn: string;
      count: number;
      sessions: string[];
    }

    const studentSubMap = new Map<string, StudentSubInfo>();
    (subs || []).forEach((s: any) => {
      const studentId = s.student_id;
      const existing: StudentSubInfo = studentSubMap.get(studentId) || {
        name: s.profiles?.full_name || "Student",
        usn: s.profiles?.usn || "N/A",
        count: 0,
        sessions: [] as string[],
      };
      existing.count += 1;
      const sessName = s.sessions?.name;
      if (sessName && !existing.sessions.includes(sessName)) {
        existing.sessions.push(sessName);
      }
      studentSubMap.set(studentId, existing);
    });

    const studentsWithSubmissions = Array.from(studentSubMap.entries()).map(([id, info]) => ({
      id,
      name: info.name,
      usn: info.usn,
      count: info.count,
      sessions: info.sessions,
    }));

    // 2. Check for uploaded reference materials linked to any of these IDs
    const { data: refs, error: refErr } = await admin
      .from("reference_materials")
      .select(`
        id, name, uploaded_by,
        profiles ( full_name, role )
      `)
      .in("uploaded_by", studentIds);

    if (refErr) {
      return NextResponse.json({ error: refErr.message }, { status: 500 });
    }

    interface ContributorRefInfo {
      name: string;
      count: number;
      references: string[];
    }

    const refMap = new Map<string, ContributorRefInfo>();
    (refs || []).forEach((r: any) => {
      const uploaderId = r.uploaded_by;
      const existing: ContributorRefInfo = refMap.get(uploaderId) || {
        name: r.profiles?.full_name || "Contributor",
        count: 0,
        references: [] as string[],
      };
      existing.count += 1;
      if (r.name && !existing.references.includes(r.name)) {
        existing.references.push(r.name);
      }
      refMap.set(uploaderId, existing);
    });

    const contributorsWithReferences = Array.from(refMap.entries()).map(([id, info]) => ({
      id,
      name: info.name,
      count: info.count,
      references: info.references,
    }));

    return NextResponse.json({
      hasSubmissions: studentsWithSubmissions.length > 0,
      totalSubmissions: subs?.length || 0,
      studentsWithSubmissions,
      hasReferences: contributorsWithReferences.length > 0,
      totalReferences: refs?.length || 0,
      contributorsWithReferences,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
