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
  /**
   * Absolute publish instant behind `age`.
   *
   * The API path sends this so the label can be re-derived from it rather than
   * read verbatim. The string alone is a snapshot of one moment -- an edge cache
   * happily serves the same payload for an hour, and a card that prints the
   * cached string keeps claiming "6 jam lalu" long after the stream is nine hours
   * old. Measuring from an instant cannot go stale that way.
   */
  publishedAt?: string | null;
  /** Runtime of a finished video, e.g. "2.03.50". Null on a broadcast. */
  duration: string | null;
  /** Publishing channel, on the clips tab only. */
  channel?: string;
  /** Scheduled but not started. Separate from live: one is now, one is later. */
  upcoming?: boolean;
};

type ApiPayload = {
  fetchedAt: string;
  liveCount: number;
  sources: Record<"streams" | "videos" | "clips", boolean>;
  streams: ContentItem[];
  videos: ContentItem[];
  clips: ContentItem[];
  /** Scheduled broadcast, or null. */
  upcoming?: ContentItem | null;
};

type State = {
  streams: ContentItem[];
  videos: ContentItem[];
  clips: ContentItem[];
  /** Scheduled but not started, when there is one. */
  upcoming: ContentItem | null;
  /** True when at least one broadcast is confirmed live. */
  live: boolean;
  /** "api" once a response lands, "snapshot" while on the bundled copy. */
  source: "api" | "snapshot" | "loading";
  error: string | null;
};

/** When the snapshot's ages were measured, so the client can keep them honest. */
const SNAPSHOT_AT = "2026-10-09T13:12:56.177Z";

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
  { videoId: "PQOWJ089Ndc", url: "https://www.youtube.com/watch?v=PQOWJ089Ndc", title: "「Plants vs. Zombies 2 Gardendless」map babi", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "2Jkc4TNrdV4", url: "https://www.youtube.com/watch?v=2Jkc4TNrdV4", title: "「FREE TALK」heehh😏", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "2hViTpQCIsY", url: "https://www.youtube.com/watch?v=2hViTpQCIsY", title: "「DRAWING STREAM」udah lupa cara gambar keknya....", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "iaQi4gKZkTM", url: "https://www.youtube.com/watch?v=iaQi4gKZkTM", title: "「Plants vs. Zombies 2 Gardendless」MAP CHINA CABE LIMA HOTMAXXING", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "acwRjdb20ww", url: "https://www.youtube.com/watch?v=acwRjdb20ww", title: "「 Dungeon Karaoke 」nyanyi lagu indo", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "DWWqB8_P0O8", url: "https://www.youtube.com/watch?v=DWWqB8_P0O8", title: "「FREE TALK」besok hari terakhir....po merch😢😭", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "s7JCfMKFZNI", url: "https://www.youtube.com/watch?v=s7JCfMKFZNI", title: "「Plants vs. Zombies 2 Gardendless」MAP GAMPANG 15 MENIT KELAR", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "onrgg06AQwg", url: "https://www.youtube.com/watch?v=onrgg06AQwg", title: "「 Dungeon Karaoke 」nyanyii selain dry flower", thumbnail: "", live: false, viewers: null, age: null, duration: null },
];

const SNAPSHOT_VIDEOS: ContentItem[] = [
  { videoId: "k39PreAwbCk", url: "https://www.youtube.com/watch?v=k39PreAwbCk", title: "Wo Ai Ni - Shanghai Crab- (Cover by Deidey)", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "lYlFvtJn2ew", url: "https://www.youtube.com/watch?v=lYlFvtJn2ew", title: "ILLIT 'NOT CUTE ANYMORE’ - Versi Indonesia by Deidey x Yuura x Silvia", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "bgyEFFoYwrM", url: "https://www.youtube.com/watch?v=bgyEFFoYwrM", title: "JANE DOE - Kenshi Yonezu, Hikaru Utada \"The Movie: Reze Arc\" (Cover by Deidey)", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "3cK7DxKTqnY", url: "https://www.youtube.com/watch?v=3cK7DxKTqnY", title: "「MV」Andromeda - Hoshimachi Suisei (Cover by Deidey)", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "7qgXV_5dc1g", url: "https://www.youtube.com/watch?v=7qgXV_5dc1g", title: "Satu Bulan - Bernadya (Cover by Deidey)", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "vjyPEkMGP3U", url: "https://www.youtube.com/watch?v=vjyPEkMGP3U", title: "「Deidey's Lore」Episode 1 : Rabbit Warrior ✦", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "3Ajj0ri73vw", url: "https://www.youtube.com/watch?v=3Ajj0ri73vw", title: "「Original Song」Stand One's Ground - Deidey", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "_z-o_VbfiIA", url: "https://www.youtube.com/watch?v=_z-o_VbfiIA", title: "【2.0 DEBUT PV】Deidey New Journey", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "_UEJlemiyJY", url: "https://www.youtube.com/watch?v=_UEJlemiyJY", title: "ku kira kau rumah (AMIGDALA)", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "IImIgcqDUMQ", url: "https://www.youtube.com/watch?v=IImIgcqDUMQ", title: "「Deidey Original BGM」Starry Bubbles", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "HtZ-UqpUZYU", url: "https://www.youtube.com/watch?v=HtZ-UqpUZYU", title: "「COVER」 Komorebi 「木漏れ日」 - Chloe Pawapua ft. Achlys  / Deidey cover. #deylist", thumbnail: "", live: false, viewers: null, age: null, duration: null },
  { videoId: "sksujHqhDn0", url: "https://www.youtube.com/watch?v=sksujHqhDn0", title: "Oh! Asmara - Kobo Kanaeru (Cover by Deidey)", thumbnail: "", live: false, viewers: null, age: null, duration: null },
];

const SNAPSHOT_CLIPS: ContentItem[] = [
  { videoId: "qpox95odcr4", url: "https://www.youtube.com/watch?v=qpox95odcr4", title: "Mediashare nya Semakin Liar Dawg【Deidey】", thumbnail: "", live: false, viewers: null, age: null, duration: null, channel: "Invisible Ch." },
  { videoId: "l7xe91bVw6k", url: "https://www.youtube.com/watch?v=l7xe91bVw6k", title: "Berbagai Kelakuan Mediashare Yang Membuat Ketua Salfok【Deidey】", thumbnail: "", live: false, viewers: null, age: null, duration: null, channel: "Invisible Ch." },
];

/** Ages as measured at capture time, in seconds. */
const SNAPSHOT_AGES: Record<string, number> = {
  PQOWJ089Ndc: 68400,
  "2Jkc4TNrdV4": 259200,
  "2hViTpQCIsY": 432000,
  iaQi4gKZkTM: 604800,
  acwRjdb20ww: 777600,
  DWWqB8_P0O8: 864000,
  s7JCfMKFZNI: 1209600,
  onrgg06AQwg: 1209600,
  k39PreAwbCk: 1814400,
  lYlFvtJn2ew: 12960000,
  bgyEFFoYwrM: 23328000,
  "3cK7DxKTqnY": 25920000,
  "7qgXV_5dc1g": 31536000,
  vjyPEkMGP3U: 31536000,
  "3Ajj0ri73vw": 31536000,
  "_z-o_VbfiIA": 31536000,
  _UEJlemiyJY: 63072000,
  IImIgcqDUMQ: 94608000,
  "HtZ-UqpUZYU": 94608000,
  sksujHqhDn0: 94608000,
  qpox95odcr4: 5184000,
  l7xe91bVw6k: 18144000,
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
/**
 * A year, at 365 days rather than 365.25.
 *
 * The same figure api/content.ts uses for `tahun`, so a label the API is able to
 * produce is one this can render. The labels are coarse either way -- "1 tahun
 * lalu" on YouTube covers anything from 12 to 24 months -- so the extra precision
 * would be precision the source does not have.
 */
const YEAR = 365 * DAY;

/**
 * Re-render a duration as the age label the card shows.
 *
 * Boundaries match YouTube's own grids closely enough to read the same: they drop
 * to days around a day, to weeks around a week, to months around a month, and to
 * years around a year. A value under a minute reads as "beberapa detik", which is
 * what YouTube says for that window rather than the number zero.
 *
 * The year tier exists because two of the endpoints can return "tahun" and this
 * could not say it: an eleven-year-old clip came out as "133 bulan lalu", which is
 * a true number and a meaningless one. Every bundled snapshot also holds entries
 * older than a year, so the same label appeared on those without any API involved.
 */
export function formatAge(ms: number): string {
  if (ms < MINUTE) return "beberapa detik lalu";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} menit lalu`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} jam lalu`;
  if (ms < WEEK) return `${Math.floor(ms / DAY)} hari lalu`;
  if (ms < MONTH) return `${Math.floor(ms / WEEK)} minggu lalu`;
  if (ms < YEAR) return `${Math.floor(ms / MONTH)} bulan lalu`;
  return `${Math.floor(ms / YEAR)} tahun lalu`;
}

/**
 * The age to render for one item, from whichever source supplied it.
 *
 * The API path is measured, not quoted. `publishedAt` is a wall-clock instant, so
 * the label is re-derived from it every render and stays correct however long the
 * payload sat in a cache. The `age` string is kept only as a fallback for a
 * response that predates the field.
 *
 * The snapshot path carries the measured duration instead, so its label advances
 * the same way -- a copy that keeps saying "1 jam lalu" a week later would be
 * lying, and caching is the only part of this page that can go stale with no
 * server to refresh it.
 */
export function ageLabel(item: ContentItem): string | null {
  if (item.publishedAt) {
    const elapsed = Date.now() - new Date(item.publishedAt).getTime();
    if (Number.isFinite(elapsed) && elapsed >= 0) return formatAge(elapsed);
  }

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
  // Null until the endpoint answers, and deliberately not a bundled copy. Every
  // other list falls back to the snapshot because a slightly old upload is still
  // true; a scheduled stream is a claim about a future that can be cancelled.
  upcoming: null,
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
          // The endpoint decides whether anything is scheduled, so its answer
          // replaces any bundled copy outright: a stale upcoming card is a claim
          // about the future and must not age in place.
          upcoming: payload.upcoming ?? null,
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
          // No snapshot copy on this path -- see the note on INITIAL.
          upcoming: null,
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