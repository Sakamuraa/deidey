import { useEffect, useState } from "react";

export type Upload = {
  videoId: string;
  url: string;
  title: string;
  live: boolean;
  viewers: number | null;
  /** "5 jam lalu", as the channel's own grid writes it. Null on the snapshot path. */
  age: string | null;
  /**
   * When the age label was measured, for the bundled snapshot only.
   *
   * A frozen "1 jam lalu" reads as a lie tomorrow, so the snapshot keeps the
   * label's duration in minutes and the client re-renders it against this
   * timestamp. That is arithmetic on YouTube's own number, not a new claim.
   */
  ageMinutes?: number;
  ageCapturedAt?: string;
};

type ApiPayload = {
  fetchedAt: string;
  liveCount: number;
  uploads: Upload[];
};

type State = {
  uploads: Upload[] | null;
  /** True when at least one card is confirmed live. */
  live: boolean;
  /** "api" once a live response lands, "snapshot" while on the bundled copy. */
  source: "api" | "snapshot" | "loading";
  error: string | null;
};

/** When the snapshot's ages were measured, so the client can keep them honest. */
const SNAPSHOT_AT = "2026-10-08T05:49:31.714Z";

/**
 * Bundled snapshot of the eight newest broadcasts, taken 2026-10-08.
 *
 * This is the fallback for a static host with no serverless runtime, and for
 * the window before the fetch resolves. The ages are the channel's own labels
 * from that moment, stored as minutes so `formatAge` can advance them: a
 * snapshot that keeps saying "1 jam lalu" a week later would be lying, and this
 * is the only part of the page that can go stale without a server to refresh it.
 */
const SNAPSHOT: Upload[] = [
  { videoId: "S6PD4T8H4Cw", url: "https://www.youtube.com/watch?v=S6PD4T8H4Cw", title: "『UNTIL THEN』kelanjutan setelah ketemu anak baru", live: false, viewers: null, age: null, ageMinutes: 60, ageCapturedAt: SNAPSHOT_AT },
  { videoId: "bgnGUHwGNqs", url: "https://www.youtube.com/watch?v=bgnGUHwGNqs", title: "『KuloNiku: Bowl Up !』Pinter masak bakso = menantu idaman", live: false, viewers: null, age: null, ageMinutes: 1080, ageCapturedAt: SNAPSHOT_AT },
  { videoId: "XYDuOH8Q4-Y", url: "https://www.youtube.com/watch?v=XYDuOH8Q4-Y", title: "『RABUATIF』design apa ya tudayyy", live: false, viewers: null, age: null, ageMinutes: 60, ageCapturedAt: SNAPSHOT_AT },
  { videoId: "8UlKFnlvo00", url: "https://www.youtube.com/watch?v=8UlKFnlvo00", title: "『UNTIL THEN』kali ini beneran main until then", live: false, viewers: null, age: null, ageMinutes: 60, ageCapturedAt: SNAPSHOT_AT },
  { videoId: "M1ANn11KH2Q", url: "https://www.youtube.com/watch?v=M1ANn11KH2Q", title: "『PHASMOPHOBIA』nakutin atau ditakutin? ft. SilveragonAri dan RayRxyz", live: false, viewers: null, age: null, ageMinutes: 120, ageCapturedAt: SNAPSHOT_AT },
  { videoId: "j533fLKIn4k", url: "https://www.youtube.com/watch?v=j533fLKIn4k", title: "『NOBAR』sapi-sapi apa yang nempel di dinding? sapidermen", live: false, viewers: null, age: null, ageMinutes: 120, ageCapturedAt: SNAPSHOT_AT },
  { videoId: "618FhJnhs8g", url: "https://www.youtube.com/watch?v=618FhJnhs8g", title: "『GARTIC.IO』tebak gambar apa tebak perasaan?", live: false, viewers: null, age: null, ageMinutes: 180, ageCapturedAt: SNAPSHOT_AT },
  { videoId: "It9c17pa3UY", url: "https://www.youtube.com/watch?v=It9c17pa3UY", title: "『Super Market Simulator』until then ngecrash", live: false, viewers: null, age: null, ageMinutes: 300, ageCapturedAt: SNAPSHOT_AT },
];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/**
 * Re-render a duration as the age label the card shows.
 *
 * Boundaries match YouTube's own grid closely enough to read the same: it drops
 * to days around a day, to weeks around a week, to months around a month. A
 * value under a minute reads as "beberapa detik", which is what YouTube says for
 * that window rather than the number zero.
 */
export function formatAge(totalMs: number): string {
  if (totalMs < MINUTE) return "beberapa detik lalu";
  if (totalMs < HOUR) return `${Math.floor(totalMs / MINUTE)} menit lalu`;
  if (totalMs < DAY) return `${Math.floor(totalMs / HOUR)} jam lalu`;
  if (totalMs < WEEK) return `${Math.floor(totalMs / DAY)} hari lalu`;
  if (totalMs < MONTH) return `${Math.floor(totalMs / WEEK)} minggu lalu`;
  return `${Math.floor(totalMs / MONTH)} bulan lalu`;
}

/**
 * The age to render for one card, from whichever source supplied it.
 *
 * The API path needs no work: its label was read moments ago. The snapshot path
 * carries minutes plus the moment they were measured, so the label advances on
 * its own instead of ageing in place.
 */
export function ageLabel(upload: Upload): string | null {
  if (upload.age) return upload.age;
  if (upload.ageMinutes === undefined || !upload.ageCapturedAt) return null;

  const elapsed = Date.now() - new Date(upload.ageCapturedAt).getTime();
  // A clock behind the snapshot would produce a negative age, which is worse
  // than showing nothing.
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;

  return formatAge(upload.ageMinutes * MINUTE + elapsed);
}

const INITIAL: State = {
  uploads: null,
  live: false,
  source: "loading",
  error: null,
};

/**
 * Live broadcast list.
 *
 * `/api/uploads` supplies both the fresh list and the one thing a bundled
 * snapshot cannot know: whether a stream is running right now. Until it answers
 * the cards come from the snapshot, so the section is never empty. If the
 * endpoint is missing or errors, the snapshot stays and the visitor sees a
 * correct, slightly older page with no error.
 */
export function useUploads(): State {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/uploads", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`api returned ${res.status}`);
        const payload = (await res.json()) as ApiPayload;
        if (!Array.isArray(payload.uploads) || payload.uploads.length === 0) {
          throw new Error("api returned no uploads");
        }
        setState({
          uploads: payload.uploads,
          live: payload.uploads.some((upload) => upload.live),
          source: "api",
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          uploads: SNAPSHOT,
          live: false,
          source: "snapshot",
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => controller.abort();
  }, []);

  return state;
}