import { useEffect, useState } from "react";

export type ContentItem = {
  videoId: string;
  url: string;
  title: string;
  thumbnail: string;
  live: boolean;
  viewers: number | null;
  /** "5 jam lalu", as the channel's own grid writes it. */
  age: string | null;
  /** Runtime of a finished video, e.g. "2.03.50". Null on a broadcast. */
  duration: string | null;
  /** Publishing channel, on the clips tab only. */
  channel?: string;
};

type ApiPayload = {
  fetchedAt: string;
  liveCount: number;
  sources: Record<"streams" | "videos" | "clips", boolean>;
  streams: ContentItem[];
  videos: ContentItem[];
  clips: ContentItem[];
};

type State = {
  streams: ContentItem[];
  videos: ContentItem[];
  clips: ContentItem[];
  /** True when at least one broadcast is confirmed live. */
  live: boolean;
  /** "api" once a response lands, "snapshot" while on the bundled copy. */
  source: "api" | "snapshot" | "loading";
  error: string | null;
};

/** When the snapshot's ages were measured, so the client can keep them honest. */
const SNAPSHOT_AT = "2026-10-08T05:49:31.714Z";

/**
 * Bundled copies of the three lists, taken 2026-10-08.
 *
 * The fallback for a static host with no serverless runtime, and for the window
 * before the fetch resolves. Ages are the channel's own labels from that moment,
 * stored as seconds so `formatAge` can advance them: a snapshot that keeps
 * saying "1 jam lalu" a week later would be lying, and this is the only part of
 * the page that can go stale with no server to refresh it.
 */
const SNAPSHOT_STREAMS: ContentItem[] = [
  { videoId: "S6PD4T8H4Cw", url: "https://www.youtube.com/watch?v=S6PD4T8H4Cw", title: "『UNTIL THEN』kelanjutan setelah ketemu anak baru", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "bgnGUHwGNqs", url: "https://www.youtube.com/watch?v=bgnGUHwGNqs", title: "『KuloNiku: Bowl Up !』Pinter masak bakso = menantu idaman", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "XYDuOH8Q4-Y", url: "https://www.youtube.com/watch?v=XYDuOH8Q4-Y", title: "『RABUATIF』design apa ya tudayyy", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "8UlKFnlvo00", url: "https://www.youtube.com/watch?v=8UlKFnlvo00", title: "『UNTIL THEN』kali ini beneran main until then", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "M1ANn11KH2Q", url: "https://www.youtube.com/watch?v=M1ANn11KH2Q", title: "『PHASMOPHOBIA』nakutin atau ditakutin? ft. SilveragonAri dan RayRxyz", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "j533fLKIn4k", url: "https://www.youtube.com/watch?v=j533fLKIn4k", title: "『NOBAR』sapi-sapi apa yang nempel di dinding? sapidermen", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "618FhJnhs8g", url: "https://www.youtube.com/watch?v=618FhJnhs8g", title: "『GARTIC.IO』tebak gambar apa tebak perasaan?", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "It9c17pa3UY", url: "https://www.youtube.com/watch?v=It9c17pa3UY", title: "『Super Market Simulator』until then ngecrash", thumbnail: "", live: false, viewers: null, age: null, duration: null },
];

const SNAPSHOT_VIDEOS: ContentItem[] = [
  { videoId: "iO2_xI8y6OQ", url: "https://www.youtube.com/watch?v=iO2_xI8y6OQ", title: "Aku dan Dirimu - Cover by Mizu Hamzazu & @naplive7", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "KjhKjXLqO0s", url: "https://www.youtube.com/watch?v=KjhKjXLqO0s", title: "【ROLEPLAY】Sayang? Masih Bangun?", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "YcAqZoRfJII", url: "https://www.youtube.com/watch?v=YcAqZoRfJII", title: "Kaktus - Suara Kayu, Cover by Mizu Hamzazu", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "qkVWgPhqo7g", url: "https://www.youtube.com/watch?v=qkVWgPhqo7g", title: "Would You Be So Kind, Cover oleh Mizu Hamzazu", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "W_Ze-4gYSBU", url: "https://www.youtube.com/watch?v=W_Ze-4gYSBU", title: "Will You come to my special day?", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "9y7f7ntlNtY", url: "https://www.youtube.com/watch?v=9y7f7ntlNtY", title: "【ROLEPLAY】Kamu Manggil Aku Lagi, Boss?", thumbnail: "", live: false, viewers: null, age: null, duration: null },
];

const SNAPSHOT_CLIPS: ContentItem[] = [
  { videoId: "HX3YxahVsQY", url: "https://www.youtube.com/watch?v=HX3YxahVsQY", title: "Bang Al Buat Kak Tri Salting Gak Karuan", thumbnail: "", live: false, viewers: null, age: null, duration: null, channel: "Exile Syahputra" },
  { videoId: "ERx7I0-inKY", url: "https://www.youtube.com/watch?v=ERx7I0-inKY", title: "Kak Tri Ngedate Bersama Bang Al Ternyata?", thumbnail: "", live: false, viewers: null, age: null, duration: null, channel: "Exile Syahputra" },
  { videoId: "3HrLBePvVbc", url: "https://www.youtube.com/watch?v=3HrLBePvVbc", title: "Kak Tri Juga Cinta Bang Al Seperti Mizu?", thumbnail: "", live: false, viewers: null, age: null, duration: null, channel: "Exile Syahputra" },
  { videoId: "FNDvvq3H8OU", url: "https://www.youtube.com/watch?v=FNDvvq3H8OU", title: "Mizu Aku Cinta Kamu", thumbnail: "", live: false, viewers: null, age: null, duration: null, channel: "putra clip" },
];

/** Ages as measured at capture time, in seconds. */
const SNAPSHOT_AGES: Record<string, number> = {
  S6PD4T8H4Cw: 3600,
  bgnGUHwGNqs: 64800,
  "XYDuOH8Q4-Y": 86400,
  "8UlKFnlvo00": 86400,
  M1ANn11KH2Q: 172800,
  j533fLKIn4k: 172800,
  "618FhJnhs8g": 259200,
  It9c17pa3UY: 432000,
  iO2_xI8y6OQ: 36000,
  KjhKjXLqO0s: 2592000,
  YcAqZoRfJII: 2592000,
  qkVWgPhqo7g: 5184000,
  "W_Ze-4gYSBU": 5184000,
  "9y7f7ntlNtY": 7776000,
  HX3YxahVsQY: 10368000,
  "ERx7I0-inKY": 20736000,
  "3HrLBePvVbc": 20736000,
  FNDvvq3H8OU: 31536000,
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/**
 * Re-render a duration as the age label the card shows.
 *
 * Boundaries match YouTube's own grids closely enough to read the same: they drop
 * to days around a day, to weeks around a week, to months around a month. A value
 * under a minute reads as "beberapa detik", which is what YouTube says for that
 * window rather than the number zero.
 */
export function formatAge(ms: number): string {
  if (ms < MINUTE) return "beberapa detik lalu";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} menit lalu`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} jam lalu`;
  if (ms < WEEK) return `${Math.floor(ms / DAY)} hari lalu`;
  if (ms < MONTH) return `${Math.floor(ms / WEEK)} minggu lalu`;
  return `${Math.floor(ms / MONTH)} bulan lalu`;
}

/**
 * The age to render for one item, from whichever source supplied it.
 *
 * The API path needs no work: its label was read moments ago. The snapshot path
 * carries the measured duration, so the label advances on its own instead of
 * ageing in place.
 */
export function ageLabel(item: ContentItem): string | null {
  if (item.age) return item.age;

  const captured = SNAPSHOT_AGES[item.videoId];
  if (captured === undefined) return null;

  const elapsed = Date.now() - new Date(SNAPSHOT_AT).getTime();
  // A clock behind the capture would produce a negative age, which is worse than
  // showing nothing.
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;

  return formatAge(captured * SECOND + elapsed);
}

const INITIAL: State = {
  streams: [],
  videos: [],
  clips: [],
  live: false,
  source: "loading",
  error: null,
};

/**
 * All three content lists.
 *
 * `/api/content` supplies the fresh lists and the one thing a bundled snapshot
 * cannot know: whether a stream is running right now. Until it answers the cards
 * come from the snapshot, so no section is ever empty. If the endpoint is missing
 * or errors, the snapshot stays and the visitor sees a correct, slightly older
 * page with no error.
 */
/**
 * How often to re-read the feed.
 *
 * Short enough that a stream starting is noticed while someone is looking at the
 * page, long enough not to hammer a serverless function. The endpoint's own edge
 * cache is what this sits behind.
 */
const POLL_MS = 60_000;

export function useContent(): State {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failed = false;

    /*
     * Re-reads on a timer rather than once.
     *
     * A stream starts and ends while the page is open. Fetched once on mount, the
     * page would keep calling a finished broadcast live, or miss one that began
     * after it loaded, until the visitor reloaded by hand. The same reasoning the
     * endpoint caches for: a stale answer is worse here than a slightly late one,
     * because "live" is a claim about right now.
     *
     * Polling stops while the tab is hidden and resumes when it comes back, so a
     * tab left open in the background costs nothing.
     */
    async function load() {
      try {
        const res = await fetch("/api/content", {
          signal: controller.signal,
          // The edge holds this for minutes; without a bypass a poll would read
          // the same cached copy it just read.
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`api returned ${res.status}`);

        const payload = (await res.json()) as ApiPayload;
        if (!Array.isArray(payload.streams) || payload.streams.length === 0) {
          throw new Error("api returned no streams");
        }

        failed = false;
        setState({
          streams: payload.streams,
          videos: Array.isArray(payload.videos) ? payload.videos : [],
          clips: Array.isArray(payload.clips) ? payload.clips : [],
          live: payload.streams.some((item) => item.live),
          source: "api",
          error: null,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        failed = true;
        setState({
          streams: SNAPSHOT_STREAMS,
          videos: SNAPSHOT_VIDEOS,
          clips: SNAPSHOT_CLIPS,
          live: false,
          source: "snapshot",
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Give up rather than retry a broken endpoint forever.
      if (!failed && !controller.signal.aborted) timer = setTimeout(load, POLL_MS);
    }

    void load();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        void load();
      } else if (timer) {
        clearTimeout(timer);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (timer) clearTimeout(timer);
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return state;
}