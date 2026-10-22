"use client";

import { motion } from "framer-motion";

export default function AnimatedBackground() {
  return (
    <div className="ambient-bg">
      <motion.div
        className="ambient-orb-1"
        animate={{
          x: [0, 50, -30, 0],
          y: [0, -40, 30, 0],
          scale: [1, 1.08, 0.95, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="ambient-orb-2"
        animate={{
          x: [0, -60, 40, 0],
          y: [0, 50, -40, 0],
          scale: [1, 0.92, 1.1, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="ambient-orb-3"
        animate={{
          x: [0, 40, -50, 0],
          y: [0, -30, 40, 0],
          scale: [1, 1.05, 0.94, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
}
