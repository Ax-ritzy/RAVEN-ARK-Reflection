"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AnimatedBackground from "@/components/AnimatedBackground";
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
    <html lang="en">
      <body className="antialiased min-h-screen flex flex-col font-sans selection:bg-peach-200 selection:text-peach-900">
        <AnimatedBackground />

        {/* Dynamic Glassmorphic Navigation */}
        <header className="sticky top-0 z-50 px-4 py-3">
          <div className="max-w-7xl mx-auto rounded-2xl glass-panel px-5 h-16 flex items-center justify-between shadow-lg shadow-peach-500/5 border border-white/80">
            {/* Logo Brand */}
            <a href={isAdmin ? "/admin/dashboard" : isStudent ? "/student/dashboard" : "/login"} className="flex items-center space-x-3 group">
              <motion.div
                whileHover={{ rotate: 12, scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                className="w-10 h-10 rounded-xl bg-gradient-to-tr from-peach-500 via-rose-400 to-cool-400 p-[2px] shadow-md shadow-peach-500/30"
              >
                <div className="w-full h-full bg-white/90 rounded-[10px] flex items-center justify-center">
                  <span className="font-extrabold text-lg gradient-text-peach-cool">
                    R
                  </span>
                </div>
              </motion.div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tracking-tight text-slate-800 text-sm sm:text-base group-hover:text-peach-600 transition">
                    Reflection AI
                  </span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-peach-100 to-cool-100 text-slate-700 border border-peach-200/60">
                    {isAdmin ? "Faculty Admin" : isStudent ? "Student Area" : "Unified"}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 block -mt-0.5">
                  Academic Assessment System
                </span>
              </div>
            </a>

            {/* Nav Links */}
            <nav className="flex items-center space-x-1 sm:space-x-3 text-xs font-semibold">
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
                            ? "text-peach-600 bg-peach-100/70 font-bold shadow-sm"
                            : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
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
                    className="px-3.5 py-1.5 rounded-xl text-cool-600 bg-cool-50 font-bold border border-cool-200/50"
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
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white/90 hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200/70 shadow-sm transition"
                >
                  Sign Out
                </motion.button>
              ) : (
                <a
                  href="/login"
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-peach-500 to-rose-500 hover:from-peach-600 hover:to-rose-600 text-white shadow-md shadow-peach-500/20 transition"
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

        <footer className="mt-auto py-6 text-center text-xs text-slate-400/80">
          Reflection AI Assessment Platform &copy; 2026. Interactive Peach & Cool Adaptive Design.
        </footer>
      </body>
    </html>
  );
}
