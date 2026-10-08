import { ThemeToggle } from "@/components/Nav";
import { ChannelButtons } from "@/components/Nav";
import { channels, colophon, navigation, site, type Route } from "@/content/site";

/**
 * Colophon and footer. The pinstripe texture lives here rather than on a
 * section, because this is the only place on the page with enough density to
 * carry it without fighting the copy.
 */
export function Footer({ route }: { route: Route }) {
  const year = new Date().getFullYear();

  return (
    <footer className="relative isolate overflow-hidden border-t border-line-strong">
      <div aria-hidden="true" className="pinstripe absolute inset-0 -z-10 opacity-60" />

      <div className="shell py-16">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="font-display text-xl font-semibold tracking-tight">{site.name}</p>
            <p className="mt-2 font-mono text-sm text-fg-muted">{channels.youtube.handle}</p>
            <p className="mt-5 max-w-[38ch] text-sm leading-relaxed text-fg-muted">
              Halaman fans, bukan halaman resmi. Semua navigasi keluar diarahkan
              ke channel kreatornya sendiri.
            </p>
          </div>

          <nav aria-label="Footer" className="md:col-span-3">
            <ul className="flex flex-col gap-1">
              {navigation.map((item) => (
                <li key={item.href}>
                  {/* Real anchors, so a footer link opens in a new tab on
                      middle-click and shows a status-bar URL. The header nav
                      intercepts clicks for in-app routing; this one does not. */}
                  <a
                    href={item.href}
                    aria-current={route === item.href ? "page" : undefined}
                    className="inline-flex min-h-9 items-center text-sm text-fg-muted transition-colors duration-200 hover:text-fg"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="md:col-span-4 md:text-right">
            <ChannelButtons />
            <div className="mt-3 flex md:justify-end">
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="rule my-10" />

        <div className="flex flex-col gap-3 text-xs text-fg-subtle sm:flex-row sm:items-start sm:justify-between">
          <p>
            {year} {site.name}. Konten dan gambar milik kreator yang ditampilkan.
          </p>
          <p className="sm:text-right">{colophon.credit}</p>
        </div>
      </div>
    </footer>
  );
}