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
    return { error: "Forbidden: Only authorized professors may manage student accounts", status: 403 };
  }

  return { admin, user };
}

// POST: Provision new student
export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyProfessorCaller(req);
    if ("error" in authCheck) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }
    const { admin } = authCheck;

    const body = await req.json();
    const { fullName, usn, email, password } = body;

    if (!fullName || !usn || !email || !password) {
      return NextResponse.json(
        { error: "All fields (fullName, usn, email, password) are required" },
        { status: 400 }
      );
    }

    const cleanUsn = usn.trim().toUpperCase();

    // Check for duplicate USN
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("usn", cleanUsn)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { error: `A student with USN '${cleanUsn}' already exists in the roster.` },
        { status: 409 }
      );
    }

    // Provision Supabase Auth User via Admin API
    const { data: newAuthUser, error: authCreateError } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName.trim(),
        role: "STUDENT",
        usn: cleanUsn,
      },
    });

    if (authCreateError) {
      return NextResponse.json(
        { error: `Auth user creation failed: ${authCreateError.message}` },
        { status: 400 }
      );
    }

    // Create linked Student Profile in PostgreSQL
    const { data: profileRecord, error: profileInsertError } = await admin
      .from("profiles")
      .insert({
        auth_user_id: newAuthUser.user.id,
        role: "STUDENT",
        usn: cleanUsn,
        full_name: fullName.trim(),
        status: "ACTIVE",
      })
      .select("id, auth_user_id, usn, full_name, status, created_at")
      .single();

    if (profileInsertError) {
      await admin.auth.admin.deleteUser(newAuthUser.user.id);
      return NextResponse.json(
        { error: `Failed to link student roster record: ${profileInsertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Student account provisioned and linked successfully.",
      student: {
        id: profileRecord.id,
        authUserId: newAuthUser.user.id,
        usn: profileRecord.usn,
        fullName: profileRecord.full_name,
        status: profileRecord.status,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// PUT: Edit existing student
export async function PUT(req: NextRequest) {
  try {
    const authCheck = await verifyProfessorCaller(req);
    if ("error" in authCheck) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }
    const { admin } = authCheck;

    const body = await req.json();
    const { studentId, fullName, usn, status, newPassword } = body;

    if (!studentId || !fullName || !usn) {
      return NextResponse.json(
        { error: "studentId, fullName, and usn are required" },
        { status: 400 }
      );
    }

    const cleanUsn = usn.trim().toUpperCase();

    // Check if USN is already taken by another student
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("usn", cleanUsn)
      .neq("id", studentId)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { error: `USN '${cleanUsn}' is already in use by another student.` },
        { status: 409 }
      );
    }

    // Fetch current profile to get auth_user_id
    const { data: targetProfile, error: fetchErr } = await admin
      .from("profiles")
      .select("id, auth_user_id")
      .eq("id", studentId)
      .single();

    if (fetchErr || !targetProfile) {
      return NextResponse.json({ error: "Student profile not found." }, { status: 404 });
    }

    // Update profile in PostgreSQL
    const { data: updatedProfile, error: updateErr } = await admin
      .from("profiles")
      .update({
        full_name: fullName.trim(),
        usn: cleanUsn,
        status: status || "ACTIVE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", studentId)
      .select("id, auth_user_id, usn, full_name, status, created_at")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // If new password provided, update Supabase Auth User
    if (newPassword && newPassword.trim().length >= 6) {
      if (targetProfile.auth_user_id) {
        await admin.auth.admin.updateUserById(targetProfile.auth_user_id, {
          password: newPassword.trim(),
        });
      }
    }

    // Update user metadata in Auth User
    if (targetProfile.auth_user_id) {
      await admin.auth.admin.updateUserById(targetProfile.auth_user_id, {
        user_metadata: {
          full_name: fullName.trim(),
          role: "STUDENT",
          usn: cleanUsn,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Student record updated successfully.",
      student: updatedProfile,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// DELETE: Delete student and linked auth account
export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await verifyProfessorCaller(req);
    if ("error" in authCheck) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }
    const { admin } = authCheck;

    const body = await req.json();
    const { studentId } = body;

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }

    // Fetch student's profile
    const { data: profile, error: fetchErr } = await admin
      .from("profiles")
      .select("id, auth_user_id, role")
      .eq("id", studentId)
      .single();

    if (fetchErr || !profile) {
      return NextResponse.json({ error: "Student profile not found" }, { status: 404 });
    }

    if (profile.role !== "STUDENT") {
      return NextResponse.json({ error: "Forbidden: Cannot delete non-student accounts" }, { status: 403 });
    }

    // If student has an auth_user_id, delete via Supabase Admin API (cascades in DB)
    if (profile.auth_user_id) {
      await admin.auth.admin.deleteUser(profile.auth_user_id);
    } else {
      await admin.from("profiles").delete().eq("id", studentId);
    }

    return NextResponse.json({
      success: true,
      message: "Student account and all associated records deleted successfully.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
