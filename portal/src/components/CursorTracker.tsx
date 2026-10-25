"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "./ThemeProvider";

export default function CursorTracker() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [isHovered, setIsHovered] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const dotRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  const isHoveredRef = useRef(false);
  const isClickingRef = useRef(false);
  const hasMovedRef = useRef(false);

  const targetPos = useRef({ x: -100, y: -100 });
  const haloPos = useRef({ x: -100, y: -100 });
  const spotPos = useRef({ x: -100, y: -100 });
  const haloRotation = useRef(0);

  // Sync refs with state
  useEffect(() => {
    isHoveredRef.current = isHovered;
  }, [isHovered]);

  useEffect(() => {
    isClickingRef.current = isClicking;
  }, [isClicking]);

  useEffect(() => {
    // Only activate cursor tracker on non-touch devices
    if (window.matchMedia("(pointer: coarse)").matches) {
      setIsTouchDevice(true);
      return;
    }

    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      targetPos.current.x = x;
      targetPos.current.y = y;

      // 1. INSTANT 1:1 ZERO-LATENCY UPDATE FOR CENTRAL DOT
      // Directly manipulating style.transform completely bypasses React re-render cycles
      // and eliminates JS spring physics lag, achieving instantaneous 120 FPS tracking.
      if (dotRef.current) {
        const dotScale = isClickingRef.current ? 0.6 : isHoveredRef.current ? 1.4 : 1;
        dotRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale3d(${dotScale}, ${dotScale}, 1)`;
        if (!hasMovedRef.current) {
          dotRef.current.style.opacity = "1";
        }
      }

      if (!hasMovedRef.current) {
        hasMovedRef.current = true;
        haloPos.current = { x, y };
        spotPos.current = { x, y };
        if (haloRef.current) haloRef.current.style.opacity = "1";
        if (spotlightRef.current) spotlightRef.current.style.opacity = "1";
      }
    };

    const handleMouseDown = () => {
      setIsClicking(true);
      isClickingRef.current = true;
      if (dotRef.current) {
        const x = targetPos.current.x;
        const y = targetPos.current.y;
        dotRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale3d(0.6, 0.6, 1)`;
      }
    };

    const handleMouseUp = () => {
      setIsClicking(false);
      isClickingRef.current = false;
      if (dotRef.current) {
        const x = targetPos.current.x;
        const y = targetPos.current.y;
        const dotScale = isHoveredRef.current ? 1.4 : 1;
        dotRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale3d(${dotScale}, ${dotScale}, 1)`;
      }
    };

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

    const handleMouseLeave = () => {
      if (dotRef.current) dotRef.current.style.opacity = "0";
      if (haloRef.current) haloRef.current.style.opacity = "0";
      if (spotlightRef.current) spotlightRef.current.style.opacity = "0";
      hasMovedRef.current = false;
    };

    // 2. HIGH-REFRESH 120 FPS LERP TICKER FOR TRAILING HALO & AMBIENT SPOTLIGHT
    const renderMotion = () => {
      if (hasMovedRef.current) {
        // High responsiveness factor (0.22) delivers fluid, silky trailing with zero perceptible drag
        haloPos.current.x += (targetPos.current.x - haloPos.current.x) * 0.22;
        haloPos.current.y += (targetPos.current.y - haloPos.current.y) * 0.22;

        // Ambient spotlight factor (0.16) creates deep fluid atmospheric bloom
        spotPos.current.x += (targetPos.current.x - spotPos.current.x) * 0.16;
        spotPos.current.y += (targetPos.current.y - spotPos.current.y) * 0.16;

        // Continuous subtle rotation for living halo effect
        haloRotation.current = (haloRotation.current + (isHoveredRef.current ? 2.5 : 0.8)) % 360;

        if (haloRef.current) {
          const haloScale = isClickingRef.current ? 0.8 : isHoveredRef.current ? 1.55 : 1;
          haloRef.current.style.transform = `translate3d(${haloPos.current.x.toFixed(2)}px, ${haloPos.current.y.toFixed(2)}px, 0) translate(-50%, -50%) scale3d(${haloScale}, ${haloScale}, 1) rotate(${haloRotation.current.toFixed(1)}deg)`;
        }

        if (spotlightRef.current) {
          const spotScale = isHoveredRef.current ? 1.45 : 1;
          spotlightRef.current.style.transform = `translate3d(${spotPos.current.x.toFixed(2)}px, ${spotPos.current.y.toFixed(2)}px, 0) translate(-50%, -50%) scale3d(${spotScale}, ${spotScale}, 1)`;
        }
      }

      animationFrameId = requestAnimationFrame(renderMotion);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mouseover", handleMouseOver, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);

    animationFrameId = requestAnimationFrame(renderMotion);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mouseover", handleMouseOver);
      document.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  if (isTouchDevice) return null;

  return (
    <div
      aria-hidden="true"
      className="hidden md:block pointer-events-none fixed inset-0 z-[9999] overflow-hidden select-none"
    >
      {/* Dynamic Ambient Spotlight behind the cursor (100% GPU Scale & Compositor Transform) */}
      <div
        ref={spotlightRef}
        className="gpu-layer absolute top-0 left-0 w-[180px] h-[180px] rounded-full pointer-events-none opacity-0 transition-opacity duration-300"
        style={{
          background: isDark
            ? isHovered
              ? "radial-gradient(circle, rgba(236, 72, 153, 0.18) 0%, rgba(6, 182, 212, 0.14) 40%, rgba(139, 92, 246, 0.08) 70%, transparent 100%)"
              : "radial-gradient(circle, rgba(239, 68, 68, 0.13) 0%, rgba(6, 182, 212, 0.09) 45%, transparent 70%)"
            : isHovered
            ? "radial-gradient(circle, rgba(253, 147, 110, 0.20) 0%, rgba(56, 189, 248, 0.14) 45%, transparent 70%)"
            : "radial-gradient(circle, rgba(253, 147, 110, 0.12) 0%, rgba(56, 189, 248, 0.07) 50%, transparent 70%)",
          filter: "blur(22px)",
        }}
      />

      {/* Trailing Outer Flame Halo (GPU Composited 120 FPS Rotation & Scale) */}
      <div
        ref={haloRef}
        className="gpu-layer absolute top-0 left-0 w-[36px] h-[36px] rounded-full pointer-events-none opacity-0 transition-opacity duration-300"
      >
        <div
          className={`w-full h-full rounded-full p-[1.5px] transition-colors duration-300 ${
            isDark
              ? "bg-gradient-to-r from-red-500 via-pink-500 via-purple-500 to-cyan-400 opacity-85 shadow-[0_0_18px_rgba(236,72,153,0.55)]"
              : "bg-gradient-to-r from-peach-500 via-lavender-500 to-cool-500 opacity-80 shadow-[0_0_14px_rgba(253,147,110,0.45)]"
          }`}
        >
          <div
            className={`w-full h-full rounded-full ${
              isDark ? "bg-slate-950/40" : "bg-white/50"
            }`}
          />
        </div>
      </div>

      {/* Central Flame Core Dot (INSTANT 1:1 Zero-Latency Tracking) */}
      <div
        ref={dotRef}
        className="gpu-layer absolute top-0 left-0 w-[8px] h-[8px] rounded-full pointer-events-none opacity-0 transition-opacity duration-150"
      >
        <div
          className={`w-full h-full rounded-full transition-colors duration-300 ${
            isDark
              ? "bg-gradient-to-tr from-cyan-400 via-pink-400 to-red-400 shadow-[0_0_10px_#06b6d4,0_0_16px_#ec4899]"
              : "bg-gradient-to-tr from-peach-500 to-cool-500 shadow-[0_0_9px_rgba(253,147,110,0.75)]"
          }`}
        />
      </div>
    </div>
  );
}
