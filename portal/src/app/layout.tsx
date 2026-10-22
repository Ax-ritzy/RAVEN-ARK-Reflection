"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = pathname.startsWith("/admin");
  const isStudent = pathname.startsWith("/student");
  const isAuthPage = pathname === "/login" || pathname === "/";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-slate-50 flex flex-col font-sans">
        <header
          className={`border-b sticky top-0 z-50 shadow-sm ${
            isAdmin ? "bg-slate-900 text-white" : "bg-white text-slate-900"
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-lg text-white ${
                  isAdmin ? "bg-indigo-600" : "bg-blue-600"
                }`}
              >
                R
              </span>
              <div>
                <span className="font-bold tracking-tight block text-sm sm:text-base">
                  {isAdmin ? "Professor Admin Area" : "Student Portal"}
                </span>
                <span className={`text-[11px] block ${isAdmin ? "text-slate-400" : "text-slate-500"}`}>
                  Reflection AI Assessment System
                </span>
              </div>
            </div>

            <nav className="flex items-center space-x-4 sm:space-x-6 text-xs sm:text-sm font-medium">
              {isAdmin && (
                <>
                  <a href="/admin/dashboard" className="hover:text-indigo-400 transition">
                    Dashboard
                  </a>
                  <a href="/admin/students" className="hover:text-indigo-400 transition">
                    Students
                  </a>
                  <a href="/admin/sessions" className="hover:text-indigo-400 transition">
                    Sessions
                  </a>
                  <a href="/admin/references" className="hover:text-indigo-400 transition">
                    References
                  </a>
                  <a href="/admin/assessments" className="hover:text-indigo-400 transition">
                    Assessments
                  </a>
                  <a href="/admin/reports" className="hover:text-indigo-400 transition">
                    Reports
                  </a>
                </>
              )}

              {isStudent && (
                <>
                  <a href="/student/dashboard" className="text-slate-600 hover:text-blue-600 transition">
                    Sessions
                  </a>
                </>
              )}

              {!isAuthPage ? (
                <button
                  onClick={handleSignOut}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    isAdmin
                      ? "bg-slate-800 hover:bg-slate-700 text-slate-200"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  Sign Out
                </button>
              ) : (
                <a
                  href="/login"
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
                >
                  Sign In
                </a>
              )}
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
          {children}
        </main>

        <footer className="border-t bg-white py-6 text-center text-xs text-slate-500">
          Reflection AI Assessment Platform &copy; 2026. Unified Academic Portal.
        </footer>
      </body>
    </html>
  );
}
