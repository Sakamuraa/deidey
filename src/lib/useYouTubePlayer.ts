import { useEffect, useState } from "react";

/**
 * Minimal shape of the pieces of YouTube's IFrame API this page uses.
 *
 * Declared rather than pulled from `@types/youtube` because that package brings a
 * compiler plugin and a large dependency tree for four methods, and the project
 * already builds without a type dependency on it.
 */
interface PlayerApi {
  playVideo: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy?: () => void;
}

interface YtWindow {
  YT?: {
    Player: new (element: HTMLElement, options?: unknown) => PlayerApi;
  };
}

type State = {
  /** The player instance, ready once the API has loaded. */
  player: PlayerApi | null;
  /** True once the visitor has started playback. */
  started: boolean;
  /** Seconds into the video, sampled while playing. */
  currentTime: number;
};

/** Player state 1 is PLAYING. */
const PLAYING = 1;

/**
 * How often the clock is sampled. A second is what chat needs: the log is lined
 * up against the video, not tracked frame by frame.
 */
const TICK_MS = 1000;

/** How often to check whether the API script has finished loading. */
const READY_POLL_MS = 250;

/**
 * Watch a YouTube embed.
 *
 * The API script is loaded from youtube.com rather than bundled, once per document,
 * and the player is constructed once `YT` appears on the iframe's window. Nothing
 * here relies on the global `onYouTubeIframeAPIReady` callback: it fires once per
 * document and is easy to miss if the script is already loaded by the time this
 * component mounts, which is exactly the case on a client-side navigation.
 *
 * The clock is polled rather than pushed, because the API exposes no time event.
 * Sampling stops when the tab is hidden or playback is paused, so an idle visitor
 * costs nothing.
 */
export function useYouTubePlayer(
  frameRef: React.RefObject<HTMLIFrameElement | null>,
): State {
  const [player, setPlayer] = useState<PlayerApi | null>(null);
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

  // Construct the player as soon as the API is present on the iframe's window.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let cancelled = false;
    let instance: PlayerApi | null = null;

    const probe = setInterval(() => {
      if (cancelled) return;

      const yt = (frame.contentWindow as unknown as YtWindow | null)?.YT;
      if (!yt?.Player) return;

      clearInterval(probe);
      instance = new yt.Player(frame);
      setPlayer(instance);
    }, READY_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(probe);

      // Destroy rather than leave the instance attached: the component unmounts on
      // every route change, and a live instance keeps its listeners and its
      // polling timer.
      instance?.destroy?.();
    };
  }, [frameRef]);

  // Sample the clock while playing, and notice when playback starts.
  useEffect(() => {
    if (!player) return;

    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (player.getPlayerState() !== PLAYING) return;

      setStarted(true);
      setCurrentTime(player.getCurrentTime());
    }, TICK_MS);

    // Playback can start between two samples, so the element's own state change is
    // listened for as well; otherwise the panel would sit on its placeholder for
    // up to a second after the visitor pressed play.
    const target = frameRef.current?.contentWindow as unknown as
      | {
          addEventListener?: (type: string, fn: (e: { data: number }) => void) => void;
          removeEventListener?: (type: string, fn: (e: { data: number }) => void) => void;
        }
      | null;

    const onStateChange = (e: { data: number }) => {
      if (e.data !== PLAYING) return;
      setStarted(true);
      setCurrentTime(player.getCurrentTime());
    };
    target?.addEventListener?.("onStateChange", onStateChange);

    return () => {
      clearInterval(tick);
      target?.removeEventListener?.("onStateChange", onStateChange);
    };
  }, [player, frameRef]);

  return { player, started, currentTime };
}