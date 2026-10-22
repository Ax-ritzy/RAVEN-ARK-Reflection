import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Missing authorization token" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const admin = createAdminClient();

    // 1. Verify caller session & ensure caller is a PROFESSOR
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized caller" }, { status: 401 });
    }

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("auth_user_id", user.id)
      .single();

    if (callerProfile?.role !== "PROFESSOR") {
      return NextResponse.json(
        { error: "Forbidden: Only authorized professors may provision student accounts" },
        { status: 403 }
      );
    }

    // 2. Parse request payload
    const body = await req.json();
    const { fullName, usn, email, password } = body;

    if (!fullName || !usn || !email || !password) {
      return NextResponse.json(
        { error: "All fields (fullName, usn, email, password) are required" },
        { status: 400 }
      );
    }

    const cleanUsn = usn.trim().toUpperCase();

    // 3. Check for duplicate USN
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

    // 4. Provision Supabase Auth User via Admin API
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

    // 5. Create linked Student Profile in PostgreSQL
    const { data: profileRecord, error: profileInsertError } = await admin
      .from("profiles")
      .insert({
        auth_user_id: newAuthUser.user.id,
        role: "STUDENT",
        usn: cleanUsn,
        full_name: fullName.trim(),
        status: "ACTIVE",
      })
      .select("id, usn, full_name, status, created_at")
      .single();

    if (profileInsertError) {
      // Rollback Auth user to prevent orphaned account
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
        usn: profileRecord.usn,
        fullName: profileRecord.full_name,
        authUserId: newAuthUser.user.id,
        status: profileRecord.status,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
