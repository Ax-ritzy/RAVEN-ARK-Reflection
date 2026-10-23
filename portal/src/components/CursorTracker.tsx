"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useTheme } from "./ThemeProvider";

export default function CursorTracker() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [isHovered, setIsHovered] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const mouseX = useMotionValue(-100);
  const mouseY = useMotionValue(-100);

  // Smooth spring physics for trailing flame halo
  const springConfigTrailing = { damping: 25, stiffness: 250 };
  const haloX = useSpring(mouseX, springConfigTrailing);
  const haloY = useSpring(mouseY, springConfigTrailing);

  // High responsiveness for the central plasma dot
  const springConfigDot = { damping: 40, stiffness: 900 };
  const dotX = useSpring(mouseX, springConfigDot);
  const dotY = useSpring(mouseY, springConfigDot);

  useEffect(() => {
    // Only activate cursor tracker on non-touch devices
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isInteractive =
        target.closest("button") ||
        target.closest("a") ||
        target.closest("input") ||
        target.closest("select") ||
        target.closest("textarea") ||
        target.closest("[role='button']") ||
        target.classList.contains("cursor-pointer") ||
        window.getComputedStyle(target).cursor === "pointer";

      setIsHovered(!!isInteractive);
    };

    const handleMouseLeave = () => setIsVisible(false);

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mouseover", handleMouseOver, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [mouseX, mouseY, isVisible]);

  if (!isVisible) return null;

  return (
    <div className="hidden md:block pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      {/* Dynamic Ambient Spotlight behind the cursor */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          x: haloX,
          y: haloY,
          translateX: "-50%",
          translateY: "-50%",
          width: isHovered ? 260 : 180,
          height: isHovered ? 260 : 180,
          background: isDark
            ? isHovered
              ? "radial-gradient(circle, rgba(236, 72, 153, 0.16) 0%, rgba(6, 182, 212, 0.12) 40%, rgba(139, 92, 246, 0.08) 70%, transparent 100%)"
              : "radial-gradient(circle, rgba(239, 68, 68, 0.12) 0%, rgba(6, 182, 212, 0.08) 45%, transparent 70%)"
            : isHovered
            ? "radial-gradient(circle, rgba(253, 147, 110, 0.18) 0%, rgba(56, 189, 248, 0.12) 45%, transparent 70%)"
            : "radial-gradient(circle, rgba(253, 147, 110, 0.10) 0%, rgba(56, 189, 248, 0.06) 50%, transparent 70%)",
          filter: "blur(20px)",
          transition: "width 0.3s ease, height 0.3s ease",
        }}
      />

      {/* Trailing Outer Flame Halo */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          x: haloX,
          y: haloY,
          translateX: "-50%",
          translateY: "-50%",
        }}
        animate={{
          scale: isClicking ? 0.8 : isHovered ? 1.6 : 1,
          width: 36,
          height: 36,
          rotate: isHovered ? 180 : 0,
        }}
        transition={{
          scale: { type: "spring", stiffness: 400, damping: 25 },
          rotate: { duration: 3, repeat: Infinity, ease: "linear" },
        }}
      >
        <div
          className={`w-full h-full rounded-full p-[1.5px] transition-all duration-300 ${
            isDark
              ? "bg-gradient-to-r from-red-500 via-pink-500 via-purple-500 to-cyan-400 opacity-80 shadow-[0_0_18px_rgba(236,72,153,0.5)]"
              : "bg-gradient-to-r from-peach-500 via-lavender-500 to-cool-500 opacity-75 shadow-[0_0_12px_rgba(253,147,110,0.4)]"
          }`}
        >
          <div
            className={`w-full h-full rounded-full backdrop-blur-[2px] ${
              isDark ? "bg-slate-950/40" : "bg-white/50"
            }`}
          />
        </div>
      </motion.div>

      {/* Central Flame Core Dot */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          x: dotX,
          y: dotY,
          translateX: "-50%",
          translateY: "-50%",
        }}
        animate={{
          scale: isClicking ? 0.6 : isHovered ? 1.4 : 1,
          width: 8,
          height: 8,
        }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
      >
        <div
          className={`w-full h-full rounded-full transition-all duration-300 ${
            isDark
              ? "bg-gradient-to-tr from-cyan-400 via-pink-400 to-red-400 shadow-[0_0_10px_#06b6d4,0_0_15px_#ec4899]"
              : "bg-gradient-to-tr from-peach-500 to-cool-500 shadow-[0_0_8px_rgba(253,147,110,0.7)]"
          }`}
        />
      </motion.div>
    </div>
  );
}
