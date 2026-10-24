"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeProvider } from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";
import AnimatedBackground from "@/components/AnimatedBackground";
import CursorTracker from "@/components/CursorTracker";
import { motion } from "framer-motion";
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
  const isReference = pathname.startsWith("/reference");
  const isAuthPage = pathname === "/login" || pathname === "/";

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-Flicker Synchronous Theme Initialization Script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('reflection_ai_theme');
                  var theme = saved === 'dark' ? 'dark' : 'light';
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                    document.documentElement.classList.remove('light');
                    document.documentElement.style.colorScheme = 'dark';
                  } else {
                    document.documentElement.classList.add('light');
                    document.documentElement.classList.remove('dark');
                    document.documentElement.style.colorScheme = 'light';
                  }
                } catch (e) {
                  document.documentElement.classList.add('light');
                  document.documentElement.style.colorScheme = 'light';
                }
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased min-h-screen flex flex-col font-sans">
        <ThemeProvider>
          {/* Dynamic Light/Dark Ambient Gradient Mesh */}
          <AnimatedBackground />

          {/* Interactive Adaptive Cursor Tracker */}
          <CursorTracker />

          {/* Dynamic Glassmorphic Navigation */}
          <header className="sticky top-0 z-30 px-4 py-3">
            <div className="max-w-7xl mx-auto rounded-2xl glass-panel px-5 h-16 flex items-center justify-between shadow-xl dark:shadow-2xl border border-slate-200/80 dark:border-slate-800/90 transition-all duration-300">
              {/* Logo Brand */}
              <Link
                href={isAdmin ? "/admin/dashboard" : isStudent ? "/student/dashboard" : isReference ? "/reference" : "/login"}
                className="flex items-center space-x-3 group"
              >
                <motion.div
                  whileHover={{ rotate: 12, scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-500 via-pink-500 via-purple-500 to-cyan-400 p-[2px] shadow-lg shadow-pink-500/25"
                >
                  <div className="w-full h-full bg-white dark:bg-[#0a0c16] rounded-[10px] flex items-center justify-center transition-colors">
                    <span className="font-extrabold text-lg gradient-text-flame">
                      R
                    </span>
                  </div>
                </motion.div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold tracking-tight text-slate-900 dark:text-white text-sm sm:text-base group-hover:text-pink-500 dark:group-hover:text-pink-400 transition">
                      Reflection AI
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-peach-100/80 dark:bg-gradient-to-r dark:from-red-950/60 dark:via-purple-950/60 dark:to-cyan-950/60 text-slate-700 dark:text-pink-300 border border-peach-200/80 dark:border-pink-500/30">
                      {isAdmin ? "Faculty Admin" : isStudent ? "Student Area" : isReference ? "Ref Contributor" : "Universal"}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block -mt-0.5 font-medium">
                    Academic Assessment System
                  </span>
                </div>
              </Link>

              {/* Nav Links & Controls */}
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
                        <Link
                          key={tab.href}
                          href={tab.href}
                          className={`relative px-3.5 py-1.5 rounded-xl transition-all duration-150 ${
                            active
                              ? "text-slate-900 dark:text-white bg-peach-100/90 dark:bg-gradient-to-r dark:from-red-500/25 dark:via-pink-500/25 dark:to-purple-500/25 border border-peach-300 dark:border-pink-500/40 font-bold shadow-sm dark:shadow-md shadow-pink-500/10"
                              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
                          }`}
                        >
                          {tab.label}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {isStudent && (
                  <div className="flex items-center space-x-2">
                    <Link
                      href="/student/dashboard"
                      className="px-3.5 py-1.5 rounded-xl text-cool-600 dark:text-cyan-300 bg-cool-50 dark:bg-cyan-950/40 font-bold border border-cool-200 dark:border-cyan-500/30"
                    >
                      My Sessions
                    </Link>
                  </div>
                )}

                {isReference && (
                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-1.5 rounded-xl text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 font-bold border border-purple-200 dark:border-purple-500/30 text-xs">
                      📚 Reference Material Portal
                    </span>
                  </div>
                )}

                {/* Theme Switcher Toggle */}
                <div className="pl-1 pr-1">
                  <ThemeToggle />
                </div>

                {!isAuthPage ? (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSignOut}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white/90 dark:bg-slate-900/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200/80 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-500/40 shadow-sm transition"
                  >
                    Sign Out
                  </motion.button>
                ) : (
                  <Link
                    href="/login"
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-red-500 via-pink-500 to-purple-600 hover:opacity-90 text-white shadow-md dark:shadow-lg shadow-pink-500/25 transition"
                  >
                    Sign In
                  </Link>
                )}
              </nav>
            </div>
          </header>

          {/* Instant Content Area - No Transition Lag */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
            {children}
          </main>

          <footer className="mt-auto py-6 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors">
            Reflection AI Assessment Platform &copy; 2026. Adaptive Light & Dark Experience.
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
