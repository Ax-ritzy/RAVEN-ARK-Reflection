"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTheme } from "./ThemeProvider";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  glowColor?: "red" | "cyan" | "pink" | "violet" | "peach" | "cool" | "lavender";
}

export default function GlowCard({
  children,
  className = "",
  onClick,
  glowColor = "pink",
}: GlowCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [isHovered, setIsHovered] = useState(false);

  const glowColorMapDark = {
    red: "rgba(239, 68, 68, 0.22)",
    cyan: "rgba(6, 182, 212, 0.24)",
    cool: "rgba(6, 182, 212, 0.24)",
    pink: "rgba(236, 72, 153, 0.24)",
    peach: "rgba(236, 72, 153, 0.24)",
    violet: "rgba(139, 92, 246, 0.24)",
    lavender: "rgba(139, 92, 246, 0.24)",
  };

  const glowColorMapLight = {
    red: "rgba(239, 68, 68, 0.14)",
    cyan: "rgba(14, 165, 233, 0.15)",
    cool: "rgba(14, 165, 233, 0.15)",
    pink: "rgba(236, 72, 153, 0.14)",
    peach: "rgba(253, 147, 110, 0.20)",
    violet: "rgba(168, 85, 247, 0.15)",
    lavender: "rgba(168, 85, 247, 0.18)",
  };

  const activeGlow = isDark ? glowColorMapDark[glowColor] : glowColorMapLight[glowColor];

  // 120 FPS High-Performance Mouse Tracker:
  // Directly updates glowRef background without triggering React state re-renders
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || !glowRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    glowRef.current.style.background = `radial-gradient(450px circle at ${x}px ${y}px, ${activeGlow}, transparent 70%)`;
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      whileHover={{ y: -3, transition: { duration: 0.18 } }}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      className={`relative overflow-hidden rounded-2xl glass-panel glass-panel-hover border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#0d101d]/75 text-slate-800 dark:text-slate-100 shadow-md dark:shadow-xl transition-all duration-300 gpu-layer ${className} ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      {/* Dynamic Cursor Spotlight Tracking (Zero Re-render GPU composited) */}
      <div
        ref={glowRef}
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 gpu-layer"
        style={{
          opacity: isHovered ? 1 : 0,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
