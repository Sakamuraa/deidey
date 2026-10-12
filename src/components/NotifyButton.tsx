import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellSlash, Spinner, X } from "@phosphor-icons/react";

import { ActionButton } from "@/components/Action";
import { site } from "@/content/site";

/** This fan site's creator slug — must match the portal's slug for the store. */
const SITE_SLUG = "deidey";

/** Portal that owns the subscription store + VAPID keypair. */
const PORTAL = "https://vtube-info.xyz";

/** Public VAPID key (safe to ship); must pair with the portal's private key. */
const VAPID_PUBLIC_KEY =
  "BFb2PHUUF7tax3Do8UgomcDgip6q9k58kELWKsQ-iA77gRiMdDYPzO7R7QUB__UIF93HxDY76BVaY7vRrDWl55g";

/** Matches the nav's icon controls so the bell sits flush next to the theme toggle. */
const ICON_BUTTON =
  "grid size-10 shrink-0 place-items-center rounded-btn border border-line-strong " +
  "text-fg-muted transition-colors duration-200 hover:bg-surface hover:text-fg";

type Status = "unsupported" | "idle" | "working" | "on" | "denied" | "blocked" | "error";

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
 * The browser's own notification/push settings address. Pages are not allowed to
 * navigate to these internal pages by script, so the dialog copies the address
 * and tells the visitor to paste it — the window.open is only a best-effort try.
 */
function settingsAddress(): string {
  const nav = navigator as { brave?: unknown; userAgent: string };
  if (nav.brave) return "brave://settings/privacy";
  const ua = nav.userAgent;
  if (/Edg\//.test(ua)) return "edge://settings/content/notifications";
  if (/Firefox\//.test(ua)) return "about:preferences#privacy";
  if (/Chrome\//.test(ua)) return "chrome://settings/content/notifications";
  return "";
}
/** Why the push service refused, tailored to the browser (desktop AbortError). */
function blockedMessage(): string {
  const nav = navigator as { brave?: unknown; userAgent: string };
  if (nav.brave)
    return 'Brave memblokir push secara bawaan. Buka setelan privasi Brave, aktifkan "Use Google services for push messaging", mulai ulang Brave, lalu coba lagi.';
  const ua = nav.userAgent;
  if (/Edg\//.test(ua))
    return "Edge tidak bisa mendaftar ke layanan push. Pastikan notifikasi tidak diblokir dan tak ada VPN/firewall yang menghalanginya, lalu coba lagi.";
  if (/Firefox\//.test(ua))
    return "Firefox tidak bisa mendaftar ke layanan push. Pastikan notifikasi diizinkan untuk situs ini, lalu coba lagi.";
  return "Browser tidak bisa mendaftar ke layanan push Google (FCM). Pastikan notifikasi tidak diblokir dan koneksi tak dihalangi VPN/firewall, lalu coba lagi.";
}

/**
 * "Ingatkan saat live" — opt-in Web Push, delivered even when the site is closed.
 *
 * Lives in the top nav next to the theme toggle. Clicking opens a custom consent
 * dialog rather than firing the browser permission prompt straight away; only the
 * dialog's "Aktifkan" triggers the real `Notification.requestPermission()` +
 * `pushManager.subscribe`, then registers the subscription with the portal (which
 * does the sending from its live cron). When the browser blocks push it shows how
 * to fix it. Renders nothing where push is unsupported.
 */
export function NotifyButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState("");

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
  const enable = useCallback(async () => {
    if (!supported()) return;
    setStatus("working");
    setDetail("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
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
        const why = await res.text().catch(() => "");
        await sub.unsubscribe().catch(() => {});
        console.error("[notify] portal menolak langganan:", res.status, why);
        setStatus("error");
        setDetail(`Server menolak langganan (HTTP ${res.status}).`);
      }
    } catch (err) {
      // On desktop this is almost always a browser/OS push block rather than our
      // backend (which mobile proves healthy): AbortError = push service blocked,
      // NotAllowedError = permission denied.
      console.error("[notify] gagal berlangganan push:", err);
      const name = (err as { name?: string } | undefined)?.name;
      if (name === "NotAllowedError") setStatus("denied");
      else if (name === "AbortError") setStatus("blocked");
      else {
        setStatus("error");
        setDetail((err as { message?: string } | undefined)?.message || "Gagal, coba lagi.");
      }
    }
  }, []);
  const disable = useCallback(async () => {
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
      }
      setStatus("idle");
    } catch {
      setStatus("idle");
    }
  }, []);

  if (status === "unsupported") return null;

  const on = status === "on";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={on ? "Notifikasi live aktif" : "Ingatkan saat live"}
        title={on ? "Notifikasi live aktif" : "Ingatkan saat live"}
        className={ICON_BUTTON}
      >
        {status === "working" ? (
          <Spinner size={20} aria-hidden="true" className="animate-spin" />
        ) : on ? (
          <Bell size={20} weight="fill" aria-hidden="true" className="text-glow" />
        ) : (
          <BellSlash size={20} aria-hidden="true" />
        )}
      </button>

      {open ? (
        <NotifyDialog
          status={status}
          detail={detail}
          onEnable={enable}
          onDisable={disable}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
/** The custom consent / status popup. Focus starts on close, Escape and backdrop
 *  both dismiss, and the card stops click-through so a drag inside never closes. */
function NotifyDialog({
  status,
  detail,
  onEnable,
  onDisable,
  onClose,
}: {
  status: Status;
  detail: string;
  onEnable: () => void;
  onDisable: () => void;
  onClose: () => void;
}) {
  const addr = settingsAddress();
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function openSettings() {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the address is shown below for manual copy */
    }
    // Browsers block navigation to internal pages; this is a best-effort no-op.
    try {
      window.open(addr, "_blank", "noopener");
    } catch {
      /* ignore */
    }
  }

  const blocked = status === "denied" || status === "blocked";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pengingat live"
      onClick={onClose}
      className="fixed inset-0 z-[60] grid place-items-center bg-obsidian/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-card border border-line bg-bg p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-fg">Ingatkan saat live</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid size-8 shrink-0 place-items-center rounded-btn text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-3 space-y-2 text-sm leading-relaxed text-fg-muted">
          {status === "on" ? (
            <p>
              Notifikasi aktif. Kamu akan diingatkan di browser ini saat {site.name} mulai live —
              walau tab-nya tertutup.
            </p>
          ) : blocked ? (
            <>
              <p>{status === "denied"
                ? "Izin notifikasi diblokir untuk situs ini. Buka setelan notifikasi browser, ubah situs ini jadi “Izinkan”, lalu buka ulang halaman."
                : blockedMessage()}</p>
              {addr ? (
                <p className="rounded-btn bg-surface px-2.5 py-1.5 font-mono text-xs text-fg">{addr}</p>
              ) : null}
            </>
          ) : status === "error" ? (
            <p>{detail || "Gagal, coba lagi."}</p>
          ) : (
            <p>
              Dapat notifikasi di browser ini saat {site.name} mulai live, bahkan ketika tab-nya
              tertutup. Bisa dimatikan kapan saja.
            </p>
          )}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          {status === "on" ? (
            <>
              <ActionButton variant="quiet" onClick={onClose}>
                Tutup
              </ActionButton>
              <ActionButton variant="primary" onClick={onDisable}>
                Matikan notifikasi
              </ActionButton>
            </>
          ) : blocked ? (
            <>
              <ActionButton variant="quiet" onClick={onClose}>
                Tutup
              </ActionButton>
              {addr ? (
                <ActionButton variant="primary" onClick={openSettings}>
                  {copied ? "Alamat disalin" : "Salin & buka setelan"}
                </ActionButton>
              ) : null}
            </>
          ) : (
            <>
              <ActionButton variant="quiet" onClick={onClose}>
                Nanti
              </ActionButton>
              <ActionButton variant="primary" onClick={onEnable} disabled={status === "working"}>
                {status === "working"
                  ? "Memproses…"
                  : status === "error"
                    ? "Coba lagi"
                    : "Aktifkan notifikasi"}
              </ActionButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
