import { useCallback, useEffect, useState } from "react";
import { Bell, BellSlash, Spinner } from "@phosphor-icons/react";

/** This fan site's creator slug — must match the portal's slug for the store. */
const SITE_SLUG = "deidey";

/** Portal that owns the subscription store + VAPID keypair. */
const PORTAL = "https://vtube-info.xyz";

/** Public VAPID key (safe to ship); must pair with the portal's private key. */
const VAPID_PUBLIC_KEY =
  "BFb2PHUUF7tax3Do8UgomcDgip6q9k58kELWKsQ-iA77gRiMdDYPzO7R7QUB__UIF93HxDY76BVaY7vRrDWl55g";

type Status = "unsupported" | "idle" | "working" | "on" | "denied" | "error";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const supported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

/**
 * "Ingatkan saat live" — opt-in push, even when the site is closed.
 *
 * Registers the service worker, subscribes via the browser's PushManager with
 * the portal's public VAPID key, and registers the subscription (plus this
 * site's slug) with the portal, which does the actual sending from its live
 * cron. Toggling off unsubscribes. Renders nothing where push is unsupported.
 */
export function NotifyButton() {
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!supported()) {
      setStatus("unsupported");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStatus(sub ? "on" : "idle"))
      .catch(() => setStatus("idle"));
  }, []);

  const toggle = useCallback(async () => {
    if (!supported()) return;
    setStatus("working");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const existing = await reg.pushManager.getSubscription();

      if (existing) {
        await fetch(`${PORTAL}/api/unsubscribe`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subscription: existing.toJSON(), slug: SITE_SLUG }),
        }).catch(() => {});
        await existing.unsubscribe().catch(() => {});
        setStatus("idle");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "idle");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const res = await fetch(`${PORTAL}/api/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON(), slug: SITE_SLUG }),
      });
      if (res.ok) {
        setStatus("on");
      } else {
        // Roll back the browser subscription so a retry starts clean.
        await sub.unsubscribe().catch(() => {});
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, []);

  if (status === "unsupported") return null;

  const on = status === "on";
  const label =
    status === "working"
      ? "Memproses…"
      : on
        ? "Notifikasi aktif"
        : status === "denied"
          ? "Notifikasi diblokir"
          : status === "error"
            ? "Gagal, coba lagi"
            : "Ingatkan saat live";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={status === "working" || status === "denied"}
      aria-pressed={on}
      title={status === "denied" ? "Izin notifikasi diblokir di browser" : label}
      className="inline-flex items-center gap-2 rounded-pill border border-line px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-raised disabled:opacity-60"
    >
      {status === "working" ? (
        <Spinner size={16} aria-hidden="true" className="animate-spin" />
      ) : on ? (
        <Bell size={16} weight="fill" aria-hidden="true" className="text-glow" />
      ) : (
        <BellSlash size={16} aria-hidden="true" />
      )}
      <span>{label}</span>
    </button>
  );
}
