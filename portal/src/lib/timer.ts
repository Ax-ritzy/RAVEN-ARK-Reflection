export interface TimerState {
  isExpired: boolean;
  remainingMs: number;
  formatted: string;
  urgency: "normal" | "warning" | "critical";
}

/**
 * Computes live countdown timer state from an ISO expires_at timestamp.
 * Returns null if expiresAt is not configured (manual close session).
 */
export function computeTimerState(expiresAt: string | null | undefined): TimerState | null {
  if (!expiresAt) return null;
  const targetTime = new Date(expiresAt).getTime();
  if (isNaN(targetTime)) return null;

  const now = Date.now();
  const diff = targetTime - now;

  if (diff <= 0) {
    return {
      isExpired: true,
      remainingMs: 0,
      formatted: "00:00",
      urgency: "critical",
    };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let formatted = "";
  if (hours > 0) {
    formatted = `${hours}h ${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
  } else {
    formatted = `${minutes.toString().padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;
  }

  let urgency: "normal" | "warning" | "critical" = "normal";
  if (totalSeconds < 60) {
    urgency = "critical";
  } else if (totalSeconds < 300) {
    urgency = "warning";
  }

  return {
    isExpired: false,
    remainingMs: diff,
    formatted,
    urgency,
  };
}

/**
 * Calculates ISO string based on professor's selection in Admin Modal
 */
export function calculateExpiryTimestamp(
  mode: "NONE" | "PRESET" | "CUSTOM" | "DATETIME",
  presetMinutes: number,
  customMinutes: number,
  specificDateTime: string
): string | null {
  if (mode === "NONE") return null;
  if (mode === "PRESET") {
    return new Date(Date.now() + presetMinutes * 60 * 1000).toISOString();
  }
  if (mode === "CUSTOM") {
    const mins = Math.max(1, customMinutes || 1);
    return new Date(Date.now() + mins * 60 * 1000).toISOString();
  }
  if (mode === "DATETIME") {
    if (!specificDateTime) return null;
    const d = new Date(specificDateTime);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}
