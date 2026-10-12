import { useEffect, useState } from "react";

/**
 * Milliseconds left until a unix-seconds instant, re-rendered once a second.
 *
 * Returns null when there is no target (so a card with no scheduled time renders
 * its plain fallback). Goes negative once the instant passes, which the caller
 * reads as "about to start" rather than a running clock. The interval only exists
 * while there is a target, and is torn down on unmount.
 */
export function useCountdown(targetUnixSeconds: number | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetUnixSeconds == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [targetUnixSeconds]);

  if (targetUnixSeconds == null) return null;
  return targetUnixSeconds * 1000 - now;
}

/** "3 hari 4 jam 12 menit 5 detik" down to "45 detik" — always to the second. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d} hari ${h} jam ${m} menit ${s} detik`;
  if (h > 0) return `${h} jam ${m} menit ${s} detik`;
  if (m > 0) return `${m} menit ${s} detik`;
  return `${s} detik`;
}

/** The scheduled time written in a named zone, e.g. "Sen 20.00" (for WIB/JST). */
export function formatInZone(unixSeconds: number, timeZone: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(unixSeconds * 1000));
}

/** The scheduled time in the viewer's own zone, with the zone name appended. */
export function formatLocal(unixSeconds: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(unixSeconds * 1000));
}
