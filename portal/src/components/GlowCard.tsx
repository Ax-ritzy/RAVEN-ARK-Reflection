"use client";

import React, { useRef, useState } from "react";
import { motion } from "framer-motion";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  glowColor?: "peach" | "cool" | "lavender";
}

export default function GlowCard({
  children,
  className = "",
  onClick,
  glowColor = "peach",
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
    peach: "rgba(253, 147, 110, 0.22)",
    cool: "rgba(56, 189, 248, 0.22)",
    lavender: "rgba(192, 132, 252, 0.22)",
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
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.985 }}
      className={`relative overflow-hidden rounded-2xl glass-panel glass-panel-hover transition-all duration-300 ${className} ${
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
