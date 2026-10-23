"use client";

import { useTheme } from "./ThemeProvider";
import { motion } from "framer-motion";

export default function ThemeToggle() {
  const { theme, toggleTheme, isMounted } = useTheme();

  if (!isMounted) {
    return (
      <div className="w-16 h-8 rounded-full bg-slate-800/40 border border-slate-700/50 animate-pulse" />
    );
  }

  const isDark = theme === "dark";

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className={`relative inline-flex items-center h-8 rounded-full p-1 cursor-pointer transition-colors duration-300 border select-none ${
        isDark
          ? "bg-[#0b0e1b] border-slate-700/80 text-cyan-300 shadow-md shadow-pink-950/30"
          : "bg-amber-50/90 border-amber-200/90 text-amber-700 shadow-sm shadow-amber-500/10"
      }`}
    >
      <div className="flex items-center gap-1.5 px-1.5 text-[11px] font-bold">
        {/* Sun Icon */}
        <span
          className={`flex items-center justify-center w-5 h-5 rounded-full transition-all duration-300 ${
            !isDark
              ? "bg-gradient-to-tr from-amber-400 to-peach-500 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        </span>

        {/* Moon Icon */}
        <span
          className={`flex items-center justify-center w-5 h-5 rounded-full transition-all duration-300 ${
            isDark
              ? "bg-gradient-to-tr from-purple-600 via-pink-600 to-cyan-500 text-white shadow-sm shadow-cyan-500/30"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
            />
          </svg>
        </span>
      </div>
    </motion.button>
  );
}
