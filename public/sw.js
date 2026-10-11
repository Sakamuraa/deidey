/* Service worker for "Ingatkan saat live" web push.
 *
 * Receives a push from the portal's notify-live cron and shows a notification;
 * a click focuses an existing tab (navigating it) or opens the stream. The
 * payload is {title, body, url, icon}. Static file — not part of the build. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Live sekarang";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: data.icon || "/og-image.png",
      badge: "/og-image.png",
      tag: data.url || "live",
      renotify: true,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.focus();
          if ("navigate" in w) w.navigate(url);
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
