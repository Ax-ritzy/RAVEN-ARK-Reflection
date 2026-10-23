"use client";

import { motion } from "framer-motion";

export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-[#07080e]">
      {/* Dark Ambient Base Gradient */}
      <div className="absolute inset-0 bg-radial-gradient" />

      {/* 1. Crimson Flame Red Plasma Orb */}
      <motion.div
        className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(239, 68, 68, 0.22) 0%, rgba(220, 38, 38, 0.08) 50%, transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{
          x: [0, 80, -40, 0],
          y: [0, 60, -50, 0],
          scale: [1, 1.15, 0.92, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* 2. Flame Blue (Electric Cyan) Plasma Orb */}
      <motion.div
        className="absolute -top-[10%] -right-[15%] w-[60vw] h-[60vw] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(6, 182, 212, 0.24) 0%, rgba(14, 165, 233, 0.08) 50%, transparent 70%)",
          filter: "blur(90px)",
        }}
        animate={{
          x: [0, -70, 50, 0],
          y: [0, 80, -60, 0],
          scale: [1, 0.9, 1.12, 1],
        }}
        transition={{
          duration: 24,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* 3. Neon Pink Plasma Orb */}
      <motion.div
        className="absolute -bottom-[20%] left-[20%] w-[65vw] h-[65vw] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(236, 72, 153, 0.22) 0%, rgba(244, 63, 94, 0.07) 50%, transparent 70%)",
          filter: "blur(85px)",
        }}
        animate={{
          x: [0, 90, -70, 0],
          y: [0, -70, 60, 0],
          scale: [1, 1.18, 0.94, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* 4. Ultraviolet Purple Plasma Orb */}
      <motion.div
        className="absolute top-[35%] right-[10%] w-[50vw] h-[50vw] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(139, 92, 246, 0.22) 0%, rgba(124, 58, 237, 0.07) 50%, transparent 70%)",
          filter: "blur(85px)",
        }}
        animate={{
          x: [0, -80, 60, 0],
          y: [0, -50, 70, 0],
          scale: [1, 0.95, 1.1, 1],
        }}
        transition={{
          duration: 26,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Subtle Digital Grid Overlay */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.15) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      {/* Radial vignette mask for cinematic contrast */}
      <div className="absolute inset-0 bg-radial-vignette opacity-70" />
    </div>
  );
}
