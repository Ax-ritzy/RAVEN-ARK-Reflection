"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function checkExistingAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("auth_user_id", user.id)
        .single();

      if (profile?.role === "PROFESSOR") {
        router.push("/admin/dashboard");
      } else if (profile?.role === "STUDENT") {
        router.push("/student/dashboard");
      } else {
        router.push("/login");
      }
    }

    checkExistingAuth();
  }, [router]);

  return (
    <div className="text-center py-24 text-slate-400 text-sm">
      Routing to your institutional portal...
    </div>
  );
}
