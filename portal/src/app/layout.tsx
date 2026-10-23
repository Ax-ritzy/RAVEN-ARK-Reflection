"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AnimatedBackground from "@/components/AnimatedBackground";
import CursorTracker from "@/components/CursorTracker";
import { motion, AnimatePresence } from "framer-motion";
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
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen flex flex-col font-sans bg-[#07080e] text-slate-100 selection:bg-pink-500/30 selection:text-white">
        {/* Dynamic Dark Ambient Gradient Mesh */}
        <AnimatedBackground />

        {/* Interactive Flame Cursor Tracker */}
        <CursorTracker />

        {/* Dynamic Glassmorphic Navigation */}
        <header className="sticky top-0 z-50 px-4 py-3">
          <div className="max-w-7xl mx-auto rounded-2xl glass-panel px-5 h-16 flex items-center justify-between shadow-2xl shadow-pink-950/20 border border-slate-800/90">
            {/* Logo Brand */}
            <a
              href={isAdmin ? "/admin/dashboard" : isStudent ? "/student/dashboard" : "/login"}
              className="flex items-center space-x-3 group"
            >
              <motion.div
                whileHover={{ rotate: 12, scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-500 via-pink-500 via-purple-500 to-cyan-400 p-[2px] shadow-lg shadow-pink-500/25"
              >
                <div className="w-full h-full bg-[#0a0c16] rounded-[10px] flex items-center justify-center">
                  <span className="font-extrabold text-lg gradient-text-flame">
                    R
                  </span>
                </div>
              </motion.div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tracking-tight text-white text-sm sm:text-base group-hover:text-pink-400 transition">
                    Reflection AI
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-red-950/60 via-purple-950/60 to-cyan-950/60 text-pink-300 border border-pink-500/30">
                    {isAdmin ? "Faculty Admin" : isStudent ? "Student Area" : "Unified"}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 block -mt-0.5 font-medium">
                  Academic Assessment System
                </span>
              </div>
            </a>

            {/* Nav Links */}
            <nav className="flex items-center space-x-1 sm:space-x-2 text-xs font-semibold">
              {isAdmin && (
                <div className="hidden md:flex items-center space-x-1">
                  {[
                    { label: "Dashboard", href: "/admin/dashboard" },
                    { label: "Students", href: "/admin/students" },
                    { label: "Sessions", href: "/admin/sessions" },
                    { label: "References", href: "/admin/references" },
                    { label: "Assessments", href: "/admin/assessments" },
                    { label: "Reports", href: "/admin/reports" },
                  ].map((tab) => {
                    const active = pathname === tab.href;
                    return (
                      <a
                        key={tab.href}
                        href={tab.href}
                        className={`relative px-3.5 py-1.5 rounded-xl transition-all duration-200 ${
                          active
                            ? "text-white bg-gradient-to-r from-red-500/25 via-pink-500/25 to-purple-500/25 border border-pink-500/40 font-bold shadow-md shadow-pink-500/10"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                        }`}
                      >
                        {tab.label}
                      </a>
                    );
                  })}
                </div>
              )}

              {isStudent && (
                <div className="flex items-center space-x-2">
                  <a
                    href="/student/dashboard"
                    className="px-3.5 py-1.5 rounded-xl text-cyan-300 bg-cyan-950/40 font-bold border border-cyan-500/30"
                  >
                    My Sessions
                  </a>
                </div>
              )}

              {!isAuthPage ? (
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSignOut}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900/80 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 shadow-sm transition"
                >
                  Sign Out
                </motion.button>
              ) : (
                <a
                  href="/login"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-500 via-pink-500 to-purple-600 hover:opacity-90 text-white shadow-lg shadow-pink-500/25 transition"
                >
                  Sign In
                </a>
              )}
            </nav>
          </div>
        </header>

        {/* Content Area with smooth entrance */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="mt-auto py-6 text-center text-xs text-slate-500">
          Reflection AI Assessment Platform &copy; 2026. Dark Flame Red &bull; Cyan &bull; Pink &bull; Violet Edition.
        </footer>
      </body>
    </html>
  );
}
