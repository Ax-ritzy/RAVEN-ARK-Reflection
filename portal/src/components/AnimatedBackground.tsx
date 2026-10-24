"use client";

import { motion } from "framer-motion";
import { useTheme } from "./ThemeProvider";

export default function AnimatedBackground() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className={`fixed inset-0 -z-10 overflow-hidden pointer-events-none ${
        isDark ? "bg-[#07080e]" : "bg-[#faf9f6]"
      }`}
    >
      {isDark ? (
        <>
          {/* DARK THEME: Red + Flame Blue + Neon Pink + Violet Plasma Mesh */}
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
        </>
      ) : (
        <>
          {/* LIGHT THEME: Soft Warm Peach + Sky Blue + Lavender Ambient Orbs */}
          {/* Ambient Base Radial Gradients */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 15% 15%, rgba(255, 237, 228, 0.85) 0%, transparent 50%), radial-gradient(circle at 85% 20%, rgba(224, 242, 254, 0.85) 0%, transparent 50%), radial-gradient(circle at 50% 80%, rgba(254, 215, 190, 0.65) 0%, transparent 50%), radial-gradient(circle at 80% 85%, rgba(243, 232, 255, 0.7) 0%, transparent 50%)",
            }}
          />

          {/* 1. Warm Peach Orb */}
          <motion.div
            className="absolute -top-[10%] left-[20%] w-[50vw] h-[50vw] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(253, 147, 110, 0.22) 0%, rgba(254, 215, 190, 0.06) 70%, transparent 100%)",
              filter: "blur(70px)",
            }}
            animate={{
              x: [0, 50, -30, 0],
              y: [0, 40, -40, 0],
              scale: [1, 1.1, 0.95, 1],
            }}
            transition={{
              duration: 16,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* 2. Soft Sky Blue Orb */}
          <motion.div
            className="absolute bottom-[-15%] right-[10%] w-[55vw] h-[55vw] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(56, 189, 248, 0.18) 0%, rgba(186, 230, 253, 0.05) 70%, transparent 100%)",
              filter: "blur(75px)",
            }}
            animate={{
              x: [0, -60, 40, 0],
              y: [0, 50, -50, 0],
              scale: [1, 0.92, 1.08, 1],
            }}
            transition={{
              duration: 18,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* 3. Subtle Lavender Orb */}
          <motion.div
            className="absolute top-[40%] left-[-15%] w-[45vw] h-[45vw] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(216, 180, 254, 0.20) 0%, transparent 70%)",
              filter: "blur(70px)",
            }}
            animate={{
              x: [0, 60, -40, 0],
              y: [0, -40, 40, 0],
              scale: [1, 1.12, 0.96, 1],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </>
      )}

      {/* Radial vignette mask for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? "radial-gradient(circle at 50% 50%, transparent 20%, rgba(7, 8, 14, 0.6) 100%)"
            : "radial-gradient(circle at 50% 50%, transparent 50%, rgba(250, 249, 246, 0.4) 100%)",
        }}
      />
    </div>
  );
}
