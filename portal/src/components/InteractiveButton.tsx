"use client";

import React from "react";
import { motion } from "framer-motion";

export interface InteractiveButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "accent" | "ghost" | "outline";
  glow?: boolean;
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export default function InteractiveButton({
  variant = "primary",
  glow = true,
  size = "md",
  icon,
  children,
  className = "",
  disabled,
  ...props
}: InteractiveButtonProps) {
  const sizeClasses = {
    sm: "px-3.5 py-1.5 text-xs rounded-lg gap-1.5",
    md: "px-5 py-2.5 text-xs sm:text-sm rounded-xl gap-2",
    lg: "px-6 py-3.5 text-sm sm:text-base rounded-2xl gap-2.5",
  };

  const baseClasses =
    `relative inline-flex items-center justify-center font-semibold transition-all duration-300 btn-interactive select-none disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]}`;

  const variants = {
    primary:
      "bg-gradient-to-r from-red-500 via-pink-500 via-purple-600 to-cyan-500 text-white shadow-lg shadow-pink-500/20 hover:shadow-cyan-500/30 hover:brightness-110",
    secondary:
      "bg-white dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/90 hover:border-pink-500/50 hover:text-slate-900 dark:hover:text-white shadow-sm dark:shadow-md",
    accent:
      "bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white shadow-lg shadow-cyan-500/25 hover:shadow-pink-500/30 hover:brightness-110",
    ghost:
      "bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60",
    outline:
      "bg-white/70 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-cyan-500 hover:bg-cyan-50/70 dark:hover:bg-cyan-950/20 hover:text-cyan-700 dark:hover:text-cyan-300 shadow-sm",
  };

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      disabled={disabled}
      className={`${baseClasses} ${variants[variant]} ${className}`}
      {...(props as any)}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span>{children}</span>
    </motion.button>
  );
}
