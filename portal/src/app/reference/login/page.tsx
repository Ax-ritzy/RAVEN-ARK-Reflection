"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ReferenceLoginRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the Single Universal Login Portal
    router.replace("/login");
  }, [router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          Redirecting to Universal Login Portal...
        </p>
      </div>
    </div>
  );
}
