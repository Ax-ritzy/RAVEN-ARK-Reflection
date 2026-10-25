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
    const { fullName, usn, email, password, role } = body;

    if (!fullName || !usn || !email || !password) {
      return NextResponse.json(
        { error: "All fields (fullName, usn, email, password) are required" },
        { status: 400 }
      );
    }

    const cleanUsn = usn.trim().toUpperCase();
    const assignedRole = role === "REFERENCE_CONTRIBUTOR" ? "REFERENCE_CONTRIBUTOR" : "STUDENT";

    // Check for duplicate USN
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("usn", cleanUsn)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { error: `An account with USN '${cleanUsn}' already exists in the roster.` },
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
        role: assignedRole,
        usn: cleanUsn,
      },
    });

    if (authCreateError) {
      return NextResponse.json(
        { error: `Auth user creation failed: ${authCreateError.message}` },
        { status: 400 }
      );
    }

    // Create linked Profile in PostgreSQL
    const { data: profileRecord, error: profileInsertError } = await admin
      .from("profiles")
      .insert({
        auth_user_id: newAuthUser.user.id,
        role: assignedRole,
        usn: cleanUsn,
        full_name: fullName.trim(),
        status: "ACTIVE",
      })
      .select("id, auth_user_id, usn, full_name, role, status, created_at")
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

// DELETE: Delete student(s) and linked auth account(s)
export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await verifyProfessorCaller(req);
    if ("error" in authCheck) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }
    const { admin } = authCheck;

    const body = await req.json();
    const { studentId, studentIds } = body;

    const targetIds: string[] = studentIds && Array.isArray(studentIds)
      ? studentIds
      : studentId
      ? [studentId]
      : [];

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "studentId or studentIds array is required" }, { status: 400 });
    }

    // 1. Fetch target profiles
    const { data: profiles, error: fetchErr } = await admin
      .from("profiles")
      .select("id, auth_user_id, role, full_name, usn")
      .in("id", targetIds);

    if (fetchErr || !profiles || profiles.length === 0) {
      return NextResponse.json({ error: "No matching student/contributor profiles found" }, { status: 404 });
    }

    // Strict safety guard: Never allow deleting PROFESSOR accounts
    const unauthorizedAccounts = profiles.filter(
      (p) => p.role !== "STUDENT" && p.role !== "REFERENCE_CONTRIBUTOR"
    );
    if (unauthorizedAccounts.length > 0) {
      return NextResponse.json(
        { error: `Forbidden: Cannot delete administrative account(s): ${unauthorizedAccounts.map((a) => a.full_name).join(", ")}` },
        { status: 403 }
      );
    }

    const validIds = profiles.map((p) => p.id);

    // 2. Unlink any reference_materials uploaded by these profiles so foreign key constraints do not fail
    await admin
      .from("reference_materials")
      .update({ uploaded_by: null })
      .in("uploaded_by", validIds);

    // 3. Delete from Supabase Auth admin API for all profiles with an auth_user_id
    for (const p of profiles) {
      if (p.auth_user_id) {
        try {
          await admin.auth.admin.deleteUser(p.auth_user_id);
        } catch (authDelErr: any) {
          console.warn(`Could not delete auth user ${p.auth_user_id}:`, authDelErr.message);
        }
      }
    }

    // 4. Delete profile rows in batch (cascades to submissions)
    const { error: deleteError } = await admin
      .from("profiles")
      .delete()
      .in("id", validIds);

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete profile records: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${validIds.length} account(s) and their associated credentials.`,
      deletedCount: validIds.length,
      deletedIds: validIds,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
