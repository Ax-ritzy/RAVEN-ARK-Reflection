"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";

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
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const glowColorMap = {
    red: "rgba(239, 68, 68, 0.22)",
    cyan: "rgba(6, 182, 212, 0.24)",
    cool: "rgba(6, 182, 212, 0.24)",
    pink: "rgba(236, 72, 153, 0.24)",
    peach: "rgba(236, 72, 153, 0.24)",
    violet: "rgba(139, 92, 246, 0.24)",
    lavender: "rgba(139, 92, 246, 0.24)",
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setMousePos({ x: -1000, y: -1000 });
      }}
      onClick={onClick}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      className={`relative overflow-hidden rounded-2xl glass-panel glass-panel-hover border border-slate-800/80 bg-[#0d101d]/75 text-slate-100 shadow-xl transition-all duration-300 ${className} ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      {/* Dynamic Cursor Spotlight Tracking */}
      <div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(450px circle at ${mousePos.x}px ${mousePos.y}px, ${glowColorMap[glowColor]}, transparent 70%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}
