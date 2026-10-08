import { useEffect, useState } from "react";

export type Upload = {
  videoId: string;
  url: string;
  title: string;
  live: boolean;
  viewers: number | null;
  /** Real broadcast start in WIB, or null when the watch page was unreadable. */
  startedAt: string | null;
  startedDay: string | null;
  /** Localised date, e.g. "8 Okt 2026". Null only when startedAt is null. */
  startedDate: string | null;
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

/**
 * Bundled snapshot of the eight newest broadcasts, taken 2026-10-08.
 *
 * This is the fallback for a static host with no serverless runtime, and for
 * the window before the fetch resolves. The times in it are real, read from each
 * watch page's `liveBroadcastDetails.startTimestamp` and converted to WIB, so the
 * static path is not a degraded version of the live one. They are frozen: a
 * snapshot cannot notice a new broadcast, which is the only thing it is for.
 */
const SNAPSHOT: Upload[] = [
  { videoId: "S6PD4T8H4Cw", url: "https://www.youtube.com/watch?v=S6PD4T8H4Cw", title: "『UNTIL THEN』kelanjutan setelah ketemu anak baru", live: false, viewers: null, startedAt: "08.00 WIB", startedDay: "Kamis", startedDate: "8 Okt 2026" },
  { videoId: "bgnGUHwGNqs", url: "https://www.youtube.com/watch?v=bgnGUHwGNqs", title: "『KuloNiku: Bowl Up !』Pinter masak bakso = menantu idaman", live: false, viewers: null, startedAt: "16.30 WIB", startedDay: "Rabu", startedDate: "7 Okt 2026" },
  { videoId: "XYDuOH8Q4-Y", url: "https://www.youtube.com/watch?v=XYDuOH8Q4-Y", title: "『RABUATIF』design apa ya tudayyy", live: false, viewers: null, startedAt: "08.01 WIB", startedDay: "Rabu", startedDate: "7 Okt 2026" },
  { videoId: "8UlKFnlvo00", url: "https://www.youtube.com/watch?v=8UlKFnlvo00", title: "『UNTIL THEN』kali ini beneran main until then", live: false, viewers: null, startedAt: "17.00 WIB", startedDay: "Selasa", startedDate: "6 Okt 2026" },
  { videoId: "M1ANn11KH2Q", url: "https://www.youtube.com/watch?v=M1ANn11KH2Q", title: "『PHASMOPHOBIA』nakutin atau ditakutin? ft. SilveragonAri dan RayRxyz", live: false, viewers: null, startedAt: "20.00 WIB", startedDay: "Senin", startedDate: "5 Okt 2026" },
  { videoId: "j533fLKIn4k", url: "https://www.youtube.com/watch?v=j533fLKIn4k", title: "『NOBAR』sapi-sapi apa yang nempel di dinding? sapidermen", live: false, viewers: null, startedAt: "16.32 WIB", startedDay: "Senin", startedDate: "5 Okt 2026" },
  { videoId: "618FhJnhs8g", url: "https://www.youtube.com/watch?v=618FhJnhs8g", title: "『GARTIC.IO』tebak gambar apa tebak perasaan?", live: false, viewers: null, startedAt: "15.30 WIB", startedDay: "Minggu", startedDate: "4 Okt 2026" },
  { videoId: "It9c17pa3UY", url: "https://www.youtube.com/watch?v=It9c17pa3UY", title: "『Super Market Simulator』until then ngecrash", live: false, viewers: null, startedAt: "09.00 WIB", startedDay: "Sabtu", startedDate: "3 Okt 2026" },
];

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