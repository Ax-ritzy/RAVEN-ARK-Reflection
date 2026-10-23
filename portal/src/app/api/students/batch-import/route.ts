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

  // Fast path: User metadata contains role (saves 1 round-trip)
  if (user.user_metadata?.role === "PROFESSOR" || user.app_metadata?.role === "PROFESSOR") {
    return { admin, user };
  }

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  if (callerProfile?.role !== "PROFESSOR") {
    return { error: "Forbidden: Only authorized professors may import student accounts", status: 403 };
  }

  return { admin, user };
}

interface RawStudentRow {
  name?: string;
  fullName?: string;
  usn?: string;
  email?: string;
  emailId?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyProfessorCaller(req);
    if ("error" in authCheck) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }
    const { admin } = authCheck;

    const body = await req.json();
    const students: RawStudentRow[] = body.students || [];

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        { error: "A non-empty 'students' array is required." },
        { status: 400 }
      );
    }

    if (students.length > 500) {
      return NextResponse.json(
        { error: "Maximum batch import size is 500 students per upload." },
        { status: 400 }
      );
    }

    // Pre-fetch all existing USNs to prevent duplicate queries
    const { data: existingProfiles } = await admin
      .from("profiles")
      .select("usn")
      .eq("role", "STUDENT");

    const existingUsnSet = new Set(
      (existingProfiles || []).map((p: any) => (p.usn || "").toUpperCase().trim())
    );

    const results: Array<{
      usn: string;
      fullName: string;
      email: string;
      status: "SUCCESS" | "SKIPPED" | "FAILED";
      reason?: string;
    }> = [];

    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const raw of students) {
      const name = (raw.name || raw.fullName || "").trim();
      const usn = (raw.usn || "").trim().toUpperCase();
      const email = (raw.email || raw.emailId || "").trim().toLowerCase();
      const password = (raw.password || "").toString().trim();

      if (!name || !usn || !email || !password) {
        results.push({
          usn: usn || "N/A",
          fullName: name || "N/A",
          email: email || "N/A",
          status: "FAILED",
          reason: "Missing required fields (Name, USN, Email ID, or Password).",
        });
        failedCount++;
        continue;
      }

      if (password.length < 6) {
        results.push({
          usn,
          fullName: name,
          email,
          status: "FAILED",
          reason: "Password must be at least 6 characters.",
        });
        failedCount++;
        continue;
      }

      // Check USN collision
      if (existingUsnSet.has(usn)) {
        results.push({
          usn,
          fullName: name,
          email,
          status: "SKIPPED",
          reason: `USN '${usn}' is already registered in the roster.`,
        });
        skippedCount++;
        continue;
      }

      try {
        // Create Supabase Auth User
        const { data: newAuthUser, error: authError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: name,
            role: "STUDENT",
            usn,
          },
        });

        if (authError) {
          // If email is already in use
          if (authError.message.toLowerCase().includes("already registered")) {
            results.push({
              usn,
              fullName: name,
              email,
              status: "SKIPPED",
              reason: `Email '${email}' is already in use.`,
            });
            skippedCount++;
            continue;
          }

          results.push({
            usn,
            fullName: name,
            email,
            status: "FAILED",
            reason: authError.message,
          });
          failedCount++;
          continue;
        }

        // Insert into public.profiles
        const { error: profileError } = await admin.from("profiles").insert({
          auth_user_id: newAuthUser.user.id,
          role: "STUDENT",
          usn,
          full_name: name,
          status: "ACTIVE",
        });

        if (profileError) {
          await admin.auth.admin.deleteUser(newAuthUser.user.id);
          results.push({
            usn,
            fullName: name,
            email,
            status: "FAILED",
            reason: profileError.message,
          });
          failedCount++;
          continue;
        }

        existingUsnSet.add(usn);
        results.push({
          usn,
          fullName: name,
          email,
          status: "SUCCESS",
        });
        successCount++;
      } catch (rowErr: any) {
        results.push({
          usn,
          fullName: name,
          email,
          status: "FAILED",
          reason: rowErr.message || "Failed to provision.",
        });
        failedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      total: students.length,
      successCount,
      skippedCount,
      failedCount,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
