import { useEffect, useRef, useState } from "react";

/**
 * Minimal shape of the pieces of YouTube's IFrame API this page uses.
 *
 * Declared rather than pulled from `@types/youtube` because that package brings a
 * compiler plugin and a large dependency tree for a handful of methods, and the
 * project already builds without a type dependency on it.
 */
interface PlayerApi {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  addEventListener: (type: string, fn: (e: { data: number }) => void) => void;
  removeEventListener: (type: string, fn: (e: { data: number }) => void) => void;
  destroy: () => void;
}

interface YtGlobal {
  YT?: {
    Player: new (element: HTMLElement, options?: { videoId: string; playerVars?: Record<string, unknown> }) => PlayerApi;
  };
  onYouTubeIframeAPIReady?: (() => void) | undefined;
}

type State = {
  /** True once the visitor has started playback. */
  started: boolean;
  /** Seconds into the video, sampled while playing. */
  currentTime: number;
};

/** Player state 1 is PLAYING. */
const PLAYING = 1;

/** How often the clock is sampled. A second is what chat needs. */
const TICK_MS = 1000;

/** How often to check whether the API script has finished loading. */
const READY_POLL_MS = 200;

/**
 * Watch a YouTube embed and report when it plays and where it has got to.
 *
 * `YT` lives on this window, not on the iframe's. The embed is served from
 * youtube.com, so reaching into `iframe.contentWindow` for the API hits a
 * cross-origin wall and reads undefined forever — which looks like a player that
 * never starts. The API script is loaded here on the parent page precisely so
 * that `YT` is reachable from here.
 *
 * The player is constructed by YouTube into a plain <div> that this hook owns,
 * with the video id handed over as a playerVar. Handing YT an iframe it did not
 * create is fiddly — YT expects to own the element and annotate it as a
 * ytp-youtube-player — and it does not reliably take over one the page built, so
 * the mount point is empty and YT fills it.
 *
 * Readiness is detected by polling `window.YT` as well as by the API's own
 * callback. That callback fires once per document and is already gone by the time
 * this mounts on a client-side navigation, so it alone would work on a hard reload
 * and nowhere else.
 *
 * The clock is polled because the API exposes no time event. Sampling stops when
 * the tab is hidden or playback is paused, so an idle visitor costs nothing.
 */
export function useYouTubePlayer(videoId: string): State & { mountRef: React.RefObject<HTMLDivElement> } {
  const mountRef = useRef<HTMLDivElement>(null!);
  const playerRef = useRef<PlayerApi | null>(null);
  const [started, setStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Load the API script, once.
  useEffect(() => {
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    document.head.appendChild(tag);
  }, []);

  // Build the player as soon as the API is present on this window.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let cancelled = false;

    const attach = () => {
      if (playerRef.current || cancelled) return true;

      const YT = (window as unknown as YtGlobal).YT;
      if (!YT?.Player) return false;

      const instance = new YT.Player(mount, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
      });

      playerRef.current = instance;
      setStarted(false);
      return true;
    };

    // Fast path: the API calls this itself once it has loaded.
    const w = window as unknown as YtGlobal;
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      attach();
    };

    // Slow path: covers the case where the script loaded before this mounted.
    const probe = setInterval(() => {
      if (cancelled) return;
      if (attach()) clearInterval(probe);
    }, READY_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(probe);
      w.onYouTubeIframeAPIReady = previous;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [videoId]);

  // Notice when playback starts and sample the clock while it runs.
  useEffect(() => {
    const onStateChange = (e: { data: number }) => {
      if (e.data !== PLAYING) return;
      setStarted(true);

      const at = position();
      if (at !== null) setCurrentTime(at);
    };

    /*
     * The object YT.Player hands back is a proxy, and its methods are not all in
     * place the instant it is constructed: getPlayerState can still be missing for
     * a moment while the embed is being set up. Calling it then throws inside the
     * interval callback, which surfaces as a page error and stops the clock for the
     * rest of the session — so playback is never noticed and the chat panel never
     * opens. Treated as "not playing yet" until it turns up.
     */
    const state = (): number | null => {
      const p = playerRef.current;
      if (!p || typeof p.getPlayerState !== "function") return null;
      return p.getPlayerState();
    };

    const position = (): number | null => {
      const p = playerRef.current;
      if (!p || typeof p.getCurrentTime !== "function") return null;
      return p.getCurrentTime();
    };

    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (state() !== PLAYING) return;

      setStarted(true);
      const at = position();
      if (at !== null) setCurrentTime(at);
    }, TICK_MS);

    // The player object only exists once the API has loaded, so the listener is
    // attached from a small interval that gives up once it has.
    let attempts = 0;
    const bind = setInterval(() => {
      const p = playerRef.current;
      if (p) {
        p.addEventListener("onStateChange", onStateChange);
        clearInterval(bind);
        return;
      }
      if (++attempts > 50) clearInterval(bind);
    }, 200);

    return () => {
      clearInterval(tick);
      clearInterval(bind);
      playerRef.current?.removeEventListener?.("onStateChange", onStateChange);
    };
  }, []);

  return { started, currentTime, mountRef };
}