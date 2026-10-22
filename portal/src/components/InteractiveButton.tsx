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
      "bg-gradient-to-r from-peach-500 via-rose-500 to-peach-600 text-white shadow-md shadow-peach-500/25 hover:shadow-lg hover:shadow-peach-500/40 hover:brightness-105",
    secondary:
      "bg-white/90 backdrop-blur-md text-slate-800 border border-slate-200/80 shadow-sm hover:bg-white hover:border-peach-300 hover:text-peach-600 hover:shadow-md",
    accent:
      "bg-gradient-to-r from-cool-500 via-indigo-500 to-cool-600 text-white shadow-md shadow-cool-500/25 hover:shadow-lg hover:shadow-cool-500/40 hover:brightness-105",
    ghost:
      "bg-transparent text-slate-600 hover:bg-peach-100/50 hover:text-peach-700",
    outline:
      "bg-white/60 backdrop-blur-xs text-slate-700 border border-slate-200 hover:border-cool-400 hover:bg-cool-50/50 hover:text-cool-800 shadow-xs",
  };

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
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
