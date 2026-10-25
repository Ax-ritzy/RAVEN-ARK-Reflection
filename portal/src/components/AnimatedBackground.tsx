"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider";

export default function AnimatedBackground() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const parallaxRef = useRef<HTMLDivElement>(null);
  const targetOffset = useRef({ x: 0, y: 0 });
  const currentOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // Only enable mouse parallax reaction on fine pointer devices (desktop)
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Subtle parallax range: -18px to +18px
      const xRatio = e.clientX / window.innerWidth - 0.5;
      const yRatio = e.clientY / window.innerHeight - 0.5;
      targetOffset.current = {
        x: xRatio * 28,
        y: yRatio * 28,
      };
    };

    let animationId: number;
    const updateParallax = () => {
      // Smooth 120 FPS Lerp for background parallax response (factor: 0.05)
      currentOffset.current.x += (targetOffset.current.x - currentOffset.current.x) * 0.05;
      currentOffset.current.y += (targetOffset.current.y - currentOffset.current.y) * 0.05;

      if (parallaxRef.current) {
        parallaxRef.current.style.transform = `translate3d(${currentOffset.current.x.toFixed(2)}px, ${currentOffset.current.y.toFixed(2)}px, 0)`;
      }

      animationId = requestAnimationFrame(updateParallax);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    animationId = requestAnimationFrame(updateParallax);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none ${
        isDark ? "bg-[#07080e]" : "bg-[#faf9f6]"
      }`}
      style={{ contain: "strict" }}
    >
      {/* Interactive Responsive Parallax Container (GPU Compositor Accelerated) */}
      <div ref={parallaxRef} className="absolute inset-0 gpu-layer">
        {isDark ? (
          <>
            {/* ========================================================
                DARK THEME: 120 FPS NON-STATIC CYBER-PLASMA AURORA
                ======================================================== */}
            {/* 1. Crimson Flame Red Orb (Prime Duration: 19s) */}
            <div
              className="gpu-blur-orb animate-orb-1 -top-[15%] -left-[10%] w-[55vw] h-[55vw]"
              style={{
                background:
                  "radial-gradient(circle, rgba(239, 68, 68, 0.24) 0%, rgba(220, 38, 38, 0.08) 50%, transparent 70%)",
                filter: "blur(75px)",
              }}
            />

            {/* 2. Electric Cyan Flame Orb (Prime Duration: 23s) */}
            <div
              className="gpu-blur-orb animate-orb-2 -top-[10%] -right-[15%] w-[60vw] h-[60vw]"
              style={{
                background:
                  "radial-gradient(circle, rgba(6, 182, 212, 0.25) 0%, rgba(14, 165, 233, 0.08) 50%, transparent 70%)",
                filter: "blur(80px)",
              }}
            />

            {/* 3. Neon Pink Plasma Orb (Prime Duration: 29s) */}
            <div
              className="gpu-blur-orb animate-orb-3 -bottom-[20%] left-[20%] w-[65vw] h-[65vw]"
              style={{
                background:
                  "radial-gradient(circle, rgba(236, 72, 153, 0.23) 0%, rgba(244, 63, 94, 0.07) 50%, transparent 70%)",
                filter: "blur(80px)",
              }}
            />

            {/* 4. Ultraviolet Purple Plasma Orb (Prime Duration: 31s) */}
            <div
              className="gpu-blur-orb animate-orb-4 top-[35%] right-[10%] w-[50vw] h-[50vw]"
              style={{
                background:
                  "radial-gradient(circle, rgba(139, 92, 246, 0.22) 0%, rgba(124, 58, 237, 0.07) 50%, transparent 70%)",
                filter: "blur(75px)",
              }}
            />

            {/* 5. Amber/Indigo Core Glow (Prime Duration: 37s - Non-Static Depth) */}
            <div
              className="gpu-blur-orb animate-orb-5 top-[50%] left-[5%] w-[45vw] h-[45vw]"
              style={{
                background:
                  "radial-gradient(circle, rgba(249, 115, 22, 0.16) 0%, rgba(99, 102, 241, 0.10) 50%, transparent 70%)",
                filter: "blur(70px)",
              }}
            />

            {/* Non-Static Floating Ambient Sparks (Stardust) */}
            <div className="absolute top-[20%] left-[15%] w-2 h-2 rounded-full bg-cyan-400 animate-stardust-1 shadow-[0_0_12px_#06b6d4]" />
            <div className="absolute top-[65%] left-[80%] w-2.5 h-2.5 rounded-full bg-pink-400 animate-stardust-2 shadow-[0_0_14px_#ec4899]" />
            <div className="absolute top-[45%] left-[55%] w-1.5 h-1.5 rounded-full bg-amber-400 animate-stardust-1 shadow-[0_0_10px_#f59e0b]" />
            <div className="absolute top-[80%] left-[25%] w-2 h-2 rounded-full bg-purple-400 animate-stardust-2 shadow-[0_0_12px_#a855f7]" />

            {/* Subtle Living Digital Grid Overlay with Organic Breathing Motion */}
            <div
              className="absolute inset-0 animate-grid-breathe pointer-events-none"
              style={{
                backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.12) 1px, transparent 1px)`,
                backgroundSize: "52px 52px",
              }}
            />
          </>
        ) : (
          <>
            {/* ========================================================
                LIGHT THEME: 120 FPS NON-STATIC ETHEREAL AURORA
                ======================================================== */}
            {/* Ambient Base Radial Gradients */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 15% 15%, rgba(255, 237, 228, 0.85) 0%, transparent 50%), radial-gradient(circle at 85% 20%, rgba(224, 242, 254, 0.85) 0%, transparent 50%), radial-gradient(circle at 50% 80%, rgba(254, 215, 190, 0.65) 0%, transparent 50%), radial-gradient(circle at 80% 85%, rgba(243, 232, 255, 0.7) 0%, transparent 50%)",
              }}
            />

            {/* 1. Warm Peach Orb (Prime Duration: 19s) */}
            <div
              className="gpu-blur-orb animate-orb-1 -top-[10%] left-[20%] w-[52vw] h-[52vw]"
              style={{
                background:
                  "radial-gradient(circle, rgba(253, 147, 110, 0.24) 0%, rgba(254, 215, 190, 0.08) 60%, transparent 85%)",
                filter: "blur(65px)",
              }}
            />

            {/* 2. Soft Sky Blue Orb (Prime Duration: 23s) */}
            <div
              className="gpu-blur-orb animate-orb-2 -bottom-[15%] right-[10%] w-[58vw] h-[58vw]"
              style={{
                background:
                  "radial-gradient(circle, rgba(56, 189, 248, 0.22) 0%, rgba(186, 230, 253, 0.06) 60%, transparent 85%)",
                filter: "blur(70px)",
              }}
            />

            {/* 3. Subtle Ethereal Lavender Orb (Prime Duration: 29s) */}
            <div
              className="gpu-blur-orb animate-orb-3 top-[38%] -left-[12%] w-[48vw] h-[48vw]"
              style={{
                background:
                  "radial-gradient(circle, rgba(216, 180, 254, 0.24) 0%, rgba(233, 213, 255, 0.06) 60%, transparent 80%)",
                filter: "blur(65px)",
              }}
            />

            {/* 4. Golden Honey Dawn Orb (Prime Duration: 31s - Non-Static Warmth) */}
            <div
              className="gpu-blur-orb animate-orb-4 top-[25%] right-[5%] w-[44vw] h-[44vw]"
              style={{
                background:
                  "radial-gradient(circle, rgba(251, 191, 36, 0.18) 0%, rgba(253, 147, 110, 0.06) 50%, transparent 75%)",
                filter: "blur(65px)",
              }}
            />

            {/* Light Mode Stardust Micro-sparks */}
            <div className="absolute top-[25%] left-[20%] w-2 h-2 rounded-full bg-peach-400 animate-stardust-1 shadow-[0_0_10px_rgba(253,147,110,0.6)]" />
            <div className="absolute top-[60%] left-[75%] w-2.5 h-2.5 rounded-full bg-cool-400 animate-stardust-2 shadow-[0_0_12px_rgba(56,189,248,0.6)]" />
            <div className="absolute top-[40%] left-[60%] w-1.5 h-1.5 rounded-full bg-lavender-400 animate-stardust-1 shadow-[0_0_8px_rgba(192,132,252,0.6)]" />

            {/* Delicate Light Grid with Breathing Motion */}
            <div
              className="absolute inset-0 animate-grid-breathe pointer-events-none opacity-[0.025]"
              style={{
                backgroundImage: `linear-gradient(rgba(100, 116, 139, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(100, 116, 139, 0.2) 1px, transparent 1px)`,
                backgroundSize: "48px 48px",
              }}
            />
          </>
        )}
      </div>

      {/* Cinematic Radial Vignette Mask for Depth and Text Contrast */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? "radial-gradient(circle at 50% 50%, transparent 25%, rgba(7, 8, 14, 0.65) 100%)"
            : "radial-gradient(circle at 50% 50%, transparent 45%, rgba(250, 249, 246, 0.45) 100%)",
        }}
      />
    </div>
  );
}
