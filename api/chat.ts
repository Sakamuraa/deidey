/*
 * GET /api/chat?id={videoId}
 *
 * Recent live chat for one broadcast.
 *
 * Why this is built rather than scraped
 * -------------------------------------
 * The obvious route is to open the watch page and reuse the continuation it
 * carries. That continuation is not a message cursor. It is an *invalidation*
 * token: posting it back returns HTTP 200 with zero messages and a fresh
 * invalidation token, which is indistinguishable from "no chat" until you have
 * already shipped an empty panel and called it correct.
 *
 * A message cursor has to be constructed instead, from the video id and the
 * channel id, using the same wire format YouTube's own players use for the
 * chat replay buffer. It is a length-prefixed varint blob: every field is
 * written as (fieldNumber << 3) | wireType followed by the value, with strings
 * carrying their own byte length. Nothing here is secret and nothing is signed,
 * it is just a positional encoding, so it is reproduced rather than depended on.
 *
 * Where the messages live in the response
 * ---------------------------------------
 * Under continuationContents.liveChatContinuation.actions, as
 * actions[].addChatItemAction.item.<renderer>. Reading the top-level `actions`
 * array instead — which is what the replay endpoint uses, and what a chat
 * library will hand you already flattened — yields nothing at all.
 *
 * Verified on pRUEfcdWeZM (2026-10-08) against the live endpoint.
 */

interface ChatRequest {
  query: Record<string, string | string[] | undefined>;
}

interface ChatResponse {
  status(code: number): ChatResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

const KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const LIVE_CHAT = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${KEY}`;
const LIVE_CHAT_REPLAY = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay?key=${KEY}`;
const WATCH = "https://www.youtube.com/watch";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** How many messages to keep. A stream's recent window is far larger than this. */
const MESSAGE_LIMIT = 60;

/** Seconds of chat to walk back on the first request. */
const BACKFILL_SECONDS = 1800;

/** Vercel will not hold a request open indefinitely; this is the whole budget. */
const TOTAL_TIMEOUT_MS = 12_000;

/* ------------------------------------------------------------------ *
 * Wire encoding
 * ------------------------------------------------------------------ */

/**
 * Base-128 varint, most significant group first.
 *
 * Dividing by 128 rather than shifting right by 7 on purpose: a microsecond
 * timestamp is around 1.8e15, which overflows a 32-bit shift in JavaScript and
 * would silently produce a negative loop bound instead of a varint.
 */
function vn(value: number): number[] {
  if (value < 0) throw new RangeError(`varint out of range: ${value}`);
  const out: number[] = [];
  let v = value;
  while (v >= 128) {
    out.push((v % 128) + 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
}

/**
 * Field header: (fieldNumber << 3) | wireType, then the payload.
 *
 * The wire type is a parameter rather than a constant because the two callers
 * below differ on it, and hardcoding either one silently mislabels every field
 * of the other kind.
 */
function field(fieldNumber: number, wireType: number, payload: number[]): number[] {
  return [...vn((fieldNumber << 3) | wireType), ...payload];
}

/** Length-delimited field, wire type 2. */
function rs(fieldNumber: number, value: string | number[]): number[] {
  const bytes =
    typeof value === "string" ? Array.from(new TextEncoder().encode(value)) : value;
  return field(fieldNumber, 2, [...vn(bytes.length), ...bytes]);
}

/** Varint field, wire type 0. */
function nm(fieldNumber: number, value: number): number[] {
  return field(fieldNumber, 0, vn(value));
}

/**
 * The replay-buffer header, which repeats the video and channel ids in a
 * different field layout than the outer body. Built once and reused.
 */
function buildHeader(videoId: string, channelId: string): string {
  const s1_3 = rs(1, videoId);
  const s1_5 = [...rs(1, channelId), ...rs(2, videoId)];
  const s1 = [...rs(3, s1_3), ...rs(5, s1_5)];
  const s3 = rs(48687757, rs(1, videoId));

  // 4 = one byte of payload, whose value is 1.
  const header = [...rs(1, s1), ...rs(3, s3), ...field(4, 0, [1])];

  return encodeCursor(header);
}

interface Timestamps {
  ts1: number;
  ts2: number;
  ts3: number;
  ts4: number;
  ts5: number;
}

export type { Timestamps };

/**
 * Timestamps in microseconds. The jitter matters: identical timestamps on
 * successive requests make the server treat them as the same window and hand
 * back nothing, which looks exactly like a quiet chat.
 */
function timestamps(pastSeconds: number): Timestamps {
  const now = Math.floor(Date.now() / 1000);
  const jitter = (min: number, max: number) => Math.random() * (max - min) + min;

  const toUsec = (seconds: number) => Math.floor(seconds * 1_000_000);

  return {
    ts1: toUsec(now - jitter(0, 3)),
    ts2: toUsec(now - jitter(0.01, 0.99)),
    ts3: toUsec(now - pastSeconds + jitter(0, 1)),
    ts4: toUsec(now - jitter(600, 3600)),
    ts5: toUsec(now - jitter(0.01, 0.99)),
  };
}

/**
 * The cursor travels as base64url whose padding is percent-encoded, not left
 * as a bare `=`. YouTube rejects the unescaped form with a 400 that carries no
 * explanation, so the encoding is part of the protocol rather than a detail.
 */
function encodeCursor(bytes: number[]): string {
  return Buffer.from(bytes).toString("base64url").replace(/=/g, "%3D");
}

/**
 * Build the message cursor for a video.
 *
 * `overrides` exists so a test can pin the timestamps and compare the encoding
 * against a reference implementation byte for byte. In production it is left
 * out, because YouTube rejects a cursor whose window is exactly the same as
 * the last one it issued.
 */
export function buildContinuation(
  videoId: string,
  channelId: string,
  pastSeconds = BACKFILL_SECONDS,
  overrides?: Timestamps,
): string {
  const { ts1, ts2, ts3, ts4, ts5 } = overrides ?? timestamps(pastSeconds);

  // 1 = the live stream chat window; 4 is the "top chat" variant.
  const chatType = 1;

  const body = rs(9, [
    ...nm(1, 0),
    ...nm(2, 0),
    ...nm(3, 0),
    ...nm(4, 0),
    ...rs(7, ""),
    ...nm(8, 0),
    ...rs(9, ""),
    ...nm(10, ts2),
    ...nm(11, 3),
    ...nm(15, 0),
  ]);

  const entity = [
    ...rs(3, buildHeader(videoId, channelId)),
    ...nm(5, ts1),
    ...nm(6, 0),
    ...nm(7, 0),
    ...nm(8, 1),
    ...body,
    ...nm(10, ts3),
    ...nm(11, ts4),
    ...nm(13, chatType),
    ...rs(16, nm(1, chatType)),
    ...nm(17, 0),
    ...rs(19, nm(1, 0)),
    ...nm(20, ts5),
  ];

  return encodeCursor(rs(119693434, entity));
}

/**
 * The replay cursor.
 *
 * Same header as the live one, but the body is smaller and carries a single
 * position in the recording instead of five wall-clock timestamps. Field 9 is
 * 4 rather than 1, and the chat type is written to field 14 rather than 16,
 * which is what marks the request as a replay seek.
 */
export function buildReplayContinuation(
  videoId: string,
  channelId: string,
  seekSeconds: number,
): string {
  const offset = Math.max(0, Math.floor(seekSeconds)) * 1_000_000;

  const entity = [
    ...rs(3, buildHeader(videoId, channelId)),
    ...nm(5, offset),
    ...nm(6, 0),
    ...nm(7, 0),
    ...nm(8, 0),
    ...nm(9, 4),
    ...rs(10, nm(4, 0)),
    ...rs(14, nm(1, 4)),
    ...nm(15, 0),
  ];

  return encodeCursor(rs(156074452, entity));
}

/* ------------------------------------------------------------------ *
 * Response parsing
 * ------------------------------------------------------------------ */

export interface ChatMessage {
  id: string;
  author: string;
  /** Plain text, custom-channel emoji removed. */
  body: string;
  /** Emojis the channel defines, keyed by their first `:shortcut:`. */
  emojis: Record<string, string>;
  avatar: string | null;
  /** Milliseconds since epoch, or null when the payload carries no timestamp. */
  at: number | null;
  /**
   * Position in the recording, in seconds. Replay only.
   *
   * This is the field that lines chat up with the video: the player reports the
   * time it is at, and the messages worth showing are the ones around that
   * number. Null during a live stream, which has no fixed timeline to line up
   * with, and for entries the payload does not date.
   */
  offsetSeconds: number | null;
  /** "member" for a membership pill, "paid" for super chat and super thanks. */
  badge: string | null;
}

/**
 * One segment of a message body.
 *
 * An emoji run carries its artwork under `image.thumbnails`, not `thumbnails`,
 * and names itself through `shortcuts` — a list from most to least specific,
 * where the leading-underscore forms exist only to stop a custom emoji from
 * colliding with a unicode one. The first shortcut without an underscore is
 * the name a viewer would actually type.
 */
interface Run {
  text?: string;
  emoji?: {
    emojiId?: string;
    shortcuts?: string[];
    image?: { thumbnails?: Array<{ url: string; width: number }> };
  };
}

/** Shortest unescaped shortcut, e.g. ":DadarJilat:" rather than ":_DadarJilat:". */
function emojiName(emoji: NonNullable<Run["emoji"]>): string {
  const shortcuts = emoji.shortcuts ?? [];
  const plain = shortcuts.find((s) => s.startsWith(":") && !s.startsWith(":_"));
  if (plain) return plain;

  // No usable shortcut: fall back to the id's last segment rather than the
  // channel-scoped prefix, which carries no meaning for a reader.
  const id = emoji.emojiId;
  return id ? `:${id.split("/").pop()}:` : ":emoji:";
}

function readEmoji(emoji: NonNullable<Run["emoji"]>): string | null {
  const thumbs = emoji.image?.thumbnails;
  const t = thumbs?.find((x) => x.width >= 24) ?? thumbs?.[0];
  return t?.url ?? null;
}

/**
 * Message runs carry either literal text or an emoji image. Emoji stay separate
 * from the text because the channel defines its own (`:DadarJilat:`) and has no
 * unicode equivalent, so folding them into the string would either drop them or
 * print an internal id. The client renders the text and overlays the images in
 * the order they were sent.
 */
function readRuns(runs: Run[] | undefined): { body: string; emojis: Record<string, string> } {
  let body = "";
  const emojis: Record<string, string> = {};

  for (const run of runs ?? []) {
    if (typeof run.text === "string") {
      body += run.text;
      continue;
    }
    if (!run.emoji) continue;

    const url = readEmoji(run.emoji);
    if (!url) continue;

    const name = emojiName(run.emoji);
    if (!emojis[name]) emojis[name] = url;
  }

  return { body, emojis };
}

function pick<T = unknown>(node: unknown, key: string): T | undefined {
  if (!node || typeof node !== "object") return undefined;
  return (node as Record<string, T>)[key];
}

const firstThumbnail = (thumbs: Array<{ url: string; width: number }> | undefined): string | null => {
  const t = thumbs?.find((x) => x.width >= 64) ?? thumbs?.[0];
  return t?.url ?? null;
};

/**
 * Turn one renderer into a message, or null if it is not a chat message.
 *
 * Shared by both modes. The replay endpoint returns `liveChatTextMessageRenderer`
 * under the same name as the live one, so only the path to reach it differs.
 */
function readRenderer(
  item: Record<string, unknown> | undefined,
  offsetSeconds: number | null,
): ChatMessage | null {
  if (!item) return null;

  const text = pick<Record<string, unknown>>(item, "liveChatTextMessageRenderer");
  const paid = pick<Record<string, unknown>>(item, "liveChatPaidMessageRenderer");
  const membership = pick<Record<string, unknown>>(item, "liveChatMembershipItemRenderer");

  const renderer = text ?? paid ?? membership;
  if (!renderer) return null;

  const { body, emojis } = readRuns(pick<Run[]>(pick(renderer, "message"), "runs"));
  // pick() returns the value, so this is already the display name and not
  // the wrapper object around it.
  const author = pick<string>(pick(renderer, "authorName"), "simpleText") ?? "";

  const usec = pick<string>(renderer, "timestampUsec");
  const id = pick<string>(renderer, "id") ?? `${author}:${usec ?? body}`;

  return {
    id,
    author,
    // An emoji-only post leaves no text. Naming the emoji is honest, and it
    // gives the card something to lay out rather than an empty row.
    body: body.trim() || Object.keys(emojis).join(" "),
    emojis,
    avatar: firstThumbnail(
      pick<Array<{ url: string; width: number }>>(pick(renderer, "authorPhoto"), "thumbnails"),
    ),
    at: usec ? Math.floor(Number(usec) / 1000) : null,
    offsetSeconds,
    badge: membership ? "member" : paid ? "paid" : null,
  };
}

/** The live response: actions[].addChatItemAction.item.<renderer>. */
export function parseChat(json: unknown): {
  messages: ChatMessage[];
  next: string | null;
  timeoutMs: number | null;
} {
  const continuationContents = pick<Record<string, unknown>>(json, "continuationContents");
  const liveChat = pick<Record<string, unknown>>(continuationContents, "liveChatContinuation");

  const actions = pick<Array<Record<string, unknown>>>(liveChat, "actions") ?? [];
  const messages: ChatMessage[] = [];

  for (const action of actions) {
    const message = readRenderer(
      pick<Record<string, unknown>>(pick(action, "addChatItemAction"), "item"),
      null,
    );
    if (message) messages.push(message);
  }

  const continuations =
    pick<Array<Record<string, unknown>>>(liveChat, "continuations") ?? [];
  const first = continuations[0];

  const invalidation = pick<Record<string, unknown>>(first, "invalidationContinuationData");
  const timed = pick<Record<string, unknown>>(first, "timedContinuationData");

  const next =
    pick<string>(invalidation, "continuation") ?? pick<string>(timed, "continuation") ?? null;
  const timeoutMs =
    pick<number>(invalidation, "timeoutMs") ?? pick<number>(timed, "timeoutMs") ?? null;

  return { messages, next, timeoutMs };
}

/**
 * The replay response: actions[].replayChatItemAction.actions[].addChatItemAction.item.
 *
 * One extra layer, because a replay entry wraps the message it carries rather
 * than being one. The entry's own `videoOffsetTimeMsec` is the position in the
 * recording and is what the next seek continues from.
 */
export function parseReplay(json: unknown): {
  messages: ChatMessage[];
  next: string | null;
  offsetMs: number | null;
} {
  const continuationContents = pick<Record<string, unknown>>(json, "continuationContents");
  const liveChat = pick<Record<string, unknown>>(continuationContents, "liveChatContinuation");

  const actions = pick<Array<Record<string, unknown>>>(liveChat, "actions") ?? [];
  const messages: ChatMessage[] = [];
  let offsetMs: number | null = null;

  for (const action of actions) {
    const entry = pick<Record<string, unknown>>(action, "replayChatItemAction");
    if (!entry) continue;

    const at = pick<string>(entry, "videoOffsetTimeMsec");
    if (at !== undefined) offsetMs = Number(at);

    // The entry dates the group, not the individual message inside it, so every
    // message in one entry shares that position. It is a second of resolution,
    // which is what a reader watching the video actually needs.
    const entrySeconds = offsetMs === null ? null : Math.floor(offsetMs / 1000);

    for (const inner of pick<Array<Record<string, unknown>>>(entry, "actions") ?? []) {
      const message = readRenderer(
        pick<Record<string, unknown>>(pick(inner, "addChatItemAction"), "item"),
        entrySeconds,
      );
      if (message) messages.push(message);
    }
  }

  const continuations =
    pick<Array<Record<string, unknown>>>(liveChat, "continuations") ?? [];
  const replay = pick<Record<string, unknown>>(
    continuations[0],
    "liveChatReplayContinuationData",
  );

  return {
    messages,
    next: pick<string>(replay, "continuation") ?? null,
    offsetMs,
  };
}

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

/** InnerTube client version, dated to yesterday like the real players send. */
function clientVersion(): string {
  const d = new Date(Date.now() - 86_400_000);
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, "");
  return `2.${stamp}.01.00`;
}

/** og:title carries HTML entities when the title contains an ampersand. */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Brace-match the JSON object assigned after a marker.
 *
 * A regex cannot do this: the payload is nested and terminated by `};` in a
 * variable that appears inside a much larger script, so the non-greedy form stops
 * at the first closing brace it meets rather than the one that ends the object.
 */
function extractJson(source: string, marker: string): Record<string, unknown> | null {
  const at = source.indexOf(marker);
  if (at < 0) return null;

  const start = source.indexOf("{", at);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];

    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/**
 * Whether the broadcast is still running, read from an already-parsed player
 * response.
 *
 * Matching the text of the whole page does not work, because a watch page embeds
 * the player responses of every recommended and related video too. One of those
 * being live is enough to make an archived broadcast look live, and the live
 * endpoint then returns nothing for it — which is indistinguishable from a stream
 * nobody is talking in. So the state is taken from the player response belonging
 * to this video and nowhere else.
 *
 * When that response is missing the answer is false rather than a guess. Guessing
 * true sends every archived broadcast to the live endpoint, which is the same
 * empty result reached by a much longer route.
 *
 * Takes the parsed response rather than the HTML. This used to re-extract the
 * 1.4 MB blob from the page on every call, which meant parsing the same document
 * twice for one answer — and on a cold instance that is the difference between a
 * request that fits the budget and one that does not.
 */
function readIsLive(player: Record<string, unknown> | null): boolean {
  if (!player) return false;

  const videoDetails = pick<Record<string, unknown>>(player, "videoDetails");
  if (videoDetails?.isLive === true) return true;

  const microformat = pick<Record<string, unknown>>(player, "microformat");
  const broadcast = pick<Record<string, unknown>>(
    pick<Record<string, unknown>>(microformat, "playerMicroformatRenderer"),
    "liveBroadcastDetails",
  );

  return broadcast?.isLiveNow === true;
}

interface WatchFacts {
  channelId: string;
  title: string | null;
  /** True while the broadcast is running, which decides replay versus live. */
  isLive: boolean;
  /** Length of an archived broadcast in seconds, when the page carries it. */
  durationSeconds: number | null;
}

/**
 * Channel id, title and broadcast state, from the watch page behind bpctr.
 *
 * The title rides along because the page is being read anyway. It exists so a
 * `/konten/streams?id=` for a broadcast older than the list the site carries can
 * still name itself, instead of rendering as a bare "Broadcast" because the
 * metadata was never fetched.
 *
 * `isLive` is the reason there are two chat modes rather than one. A finished
 * broadcast has no live chat to read, but it does have a full replay, and the
 * two are served by different endpoints with different cursors.
 *
 * Warm copy, because this is the slowest thing the route does and it was running
 * on every poll. The page is 1.4 MB; re-fetching and re-parsing it every fifteen
 * seconds to learn a fact that changes at most twice an hour is what made chat
 * feel slow to open, and it is the same per-request upstream call the memory cache
 * exists to absorb elsewhere in this codebase.
 *
 * The window is short for a live stream and long for a finished one, and that
 * asymmetry is deliberate rather than a compromise. A running broadcast can start
 * and stop at any moment, so its answer goes stale in the direction that matters
 * — a finished broadcast reported live means chat that silently stops arriving,
 * which is the exact failure this whole fix is about. A recording cannot change,
 * so its facts are held far longer. Everything read out of the response is
 * immutable for a given video anyway: id, title and duration never change, and
 * only `isLive` flips, once, when the stream ends.
 */
let watchCache: { videoId: string; facts: WatchFacts; at: number } | null = null;

async function readWatch(videoId: string, signal: AbortSignal): Promise<WatchFacts | null> {
  // A live stream's window has to be short enough that the transition to finished
  // is noticed; a recording's can be long because nothing about it will change.
  const cached = watchCache?.videoId === videoId ? watchCache : null;
  if (cached) {
    const ttl = cached.facts.isLive ? 20_000 : 5 * 60_000;
    if (Date.now() - cached.at < ttl) return cached.facts;
  }

  // bpctr=9999999999 with has_verified=1 skips the interstitial that otherwise
  // replaces the payload with playabilityStatus LOGIN_REQUIRED.
  const res = await fetch(`${WATCH}?v=${videoId}&bpctr=9999999999&has_verified=1`, {
    headers: { "user-agent": UA, "accept-language": "id-ID,id;q=0.9" },
    signal,
  });
  if (!res.ok) return null;

  const html = await res.text();

  // One parse, reused. Everything below is read out of this player response
  // rather than the page text, because a watch page also carries the responses
  // of every related video and a bare regex cannot tell them apart. readIsLive
  // takes this same object rather than re-extracting it -- it used to parse the
  // 1.4 MB document a second time for the same answer.
  const player = extractJson(html, "var ytInitialPlayerResponse =");
  const videoDetails = player ? pick<Record<string, unknown>>(player, "videoDetails") : null;

  const channelId =
    pick<string>(videoDetails, "channelId") ?? html.match(/"channelId":"(.{24})"/)?.[1];
  if (!channelId) return null;

  // og:title is the video name; the <title> element appends " - YouTube".
  // Read from the player response first and only then the meta tag, because the
  // response is the one already parsed and the meta tag is a second pass over a
  // megabyte of HTML for a string the response already carries.
  const raw =
    pick<string>(pick<Record<string, unknown>>(player, "videoDetails"), "title") ??
    html.match(/<meta property="og:title" content="(.*?)"/)?.[1];
  const title = raw
    ? decodeEntities(raw.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))))
    : null;

  const facts: WatchFacts = {
    channelId,
    title: title?.trim() || null,
    isLive: readIsLive(player),
    durationSeconds: numberOrNull(pick<string>(videoDetails, "lengthSeconds")),
  };

  watchCache = { videoId, facts, at: Date.now() };
  return facts;
}

/** Parse a numeric string, or null when it is absent or not a number. */
function numberOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** InnerTube request envelope, shared by both modes. */
function chatContext(extra: Record<string, unknown> = {}) {
  return {
    context: {
      client: {
        clientName: "WEB",
        clientVersion: clientVersion(),
        hl: "id",
        gl: "ID",
        userAgent: UA,
      },
    },
    ...extra,
  };
}

/** Live chat for a running broadcast: the rolling window plus a poll cursor. */
async function fetchLive(
  videoId: string,
  channelId: string,
  signal: AbortSignal,
): Promise<{ messages: ChatMessage[]; next: string | null; timeoutMs: number | null } | null> {
  const res = await fetch(LIVE_CHAT, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    signal,
    body: JSON.stringify(chatContext({ continuation: buildContinuation(videoId, channelId) })),
  });

  if (!res.ok) return null;
  return parseChat(await res.json());
}

/**
 * Chat for a finished broadcast, read from the recording.
 *
 * `seekSeconds` is the position in the video to start from, so paging forward
 * means asking for the offset the last page ended at. `cursor` short-circuits
 * that when the caller already holds the replay continuation.
 */
async function fetchReplay(
  videoId: string,
  channelId: string,
  seekSeconds: number,
  cursor: string | null,
  signal: AbortSignal,
): Promise<{ messages: ChatMessage[]; next: string | null; offsetMs: number | null } | null> {
  const continuation =
    cursor ?? buildReplayContinuation(videoId, channelId, seekSeconds);

  const res = await fetch(LIVE_CHAT_REPLAY, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    signal,
    body: JSON.stringify(
      chatContext({
        videoId,
        continuation,
        // The replay endpoint reads the seek position from here, not from the
        // cursor, so both have to agree or it serves the wrong stretch.
        currentPlayerState: { playerOffsetMs: String(Math.max(0, seekSeconds) * 1000) },
      }),
    ),
  });

  if (!res.ok) return null;
  return parseReplay(await res.json());
}

interface ChatResult {
  messages: ChatMessage[];
  /** Poll cursor for live chat, or the next page's cursor for a replay. */
  cursor: string | null;
  /** Live chat tells the client how long to wait; a replay pages immediately. */
  timeoutMs: number | null;
  channelId: string;
  title: string | null;
  /** Which endpoint answered, so the client can word itself correctly. */
  mode: "live" | "replay";
  /** Whether the broadcast is still running, regardless of which mode answered. */
  isLive: boolean;
  /** Position in the recording this page covers, in seconds. */
  offsetSeconds: number | null;
  durationSeconds: number | null;
  /** True when the recording has more chat after this page. */
  more: boolean;
}

type Mode = "auto" | "live" | "replay";

async function fetchChat(
  videoId: string,
  mode: Mode,
  seekSeconds: number,
  cursor: string | null,
  signal: AbortSignal,
): Promise<ChatResult | null> {
  const watch = await readWatch(videoId, signal);
  if (!watch) return null;

  const base = {
    channelId: watch.channelId,
    title: watch.title,
    isLive: watch.isLive,
    durationSeconds: watch.durationSeconds,
  };

  /*
   * How to choose between the two endpoints.
   *
   * `auto` used to trust `watch.isLive` outright and pick replay when it was
   * false. That flag is read from the watch page, and a watch page served to a
   * datacenter IP is not always the same one a browser gets: measured on Vercel,
   * `videoDetails.isLive` and `liveBroadcastDetails.isLiveNow` were both absent
   * for a stream that was demonstrably running, so every `auto` request went to
   * the replay endpoint -- which is empty for a broadcast that has not ended.
   * The result was live chat that never appeared, while the very same request
   * with `mode=live` returned sixty messages from the same host.
   *
   * So auto does not decide from the flag at all. It asks the live endpoint
   * first, because that endpoint is the authority: it returns messages while a
   * broadcast is running and nothing once it has ended. A running stream that
   * the flag misreports therefore still gets its chat, and a finished one falls
   * through to the replay on its own. `watch.isLive` is still reported to the
   * client, but it no longer decides anything on its own.
   *
   * An explicit mode still wins, so a page can ask a finished broadcast's replay
   * or a running broadcast's live window without this probing.
   */
  if (mode === "live") {
    const live = await fetchLive(videoId, watch.channelId, signal);
    if (!live) return null;

    return {
      ...base,
      mode: "live",
      messages: live.messages.slice(-MESSAGE_LIMIT),
      cursor: live.next,
      timeoutMs: live.timeoutMs,
      offsetSeconds: null,
      more: false,
    };
  }

  if (mode === "auto") {
    // The live endpoint knows better than the page does. Only treat it as not-live
    // when it comes back with nothing, which is what a finished broadcast does.
    const live = await fetchLive(videoId, watch.channelId, signal);
    if (live && live.messages.length > 0) {
      return {
        ...base,
        // The endpoint answered, so the broadcast is running even where the watch
        // page failed to say so.
        isLive: true,
        mode: "live",
        messages: live.messages.slice(-MESSAGE_LIMIT),
        cursor: live.next,
        timeoutMs: live.timeoutMs,
        offsetSeconds: null,
        more: false,
      };
    }
  }

  const replay = await fetchReplay(videoId, watch.channelId, seekSeconds, cursor, signal);
  if (!replay) return null;

  return {
    ...base,
    mode: "replay",
    messages: replay.messages,
    cursor: replay.next,
    timeoutMs: null,
    offsetSeconds: replay.offsetMs === null ? null : Math.floor(replay.offsetMs / 1000),
    more: replay.next !== null,
  };
}

/* ------------------------------------------------------------------ *
 * Handler
 * ------------------------------------------------------------------ */

function readParam(query: ChatRequest["query"], key: string): string | undefined {
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

/** Read a query value as a non-negative integer, ignoring anything else. */
function readCount(query: ChatRequest["query"], key: string, fallback: number): number {
  const raw = readParam(query, key);
  if (raw === undefined) return fallback;

  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export default async function handler(req: ChatRequest, res: ChatResponse) {
  const videoId = (readParam(req.query, "id") ?? "").trim();

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({ reason: "bad-id", messages: [] });
    return;
  }

  const requested = readParam(req.query, "mode");
  const mode: Mode =
    requested === "live" || requested === "replay" ? requested : "auto";

  // Where to start in the recording. Paging passes the cursor it was given,
  // which already points past the last message, and the offset keeps the
  // request's own seek field in step with it.
  const seekSeconds = readCount(req.query, "seek", 0);
  const cursor = readParam(req.query, "cursor") ?? null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);

  try {
    const result = await fetchChat(videoId, mode, seekSeconds, cursor, controller.signal);

    if (!result) {
      res.status(200).json({
        reason: "unavailable",
        mode,
        channelId: null,
        title: null,
        isLive: false,
        messages: [],
        cursor: null,
        more: false,
      });
      return;
    }

    // A running stream changes every few seconds, so the window must stay short.
    // A replay page never changes once recorded, and can be cached hard.
    res.setHeader(
      "Cache-Control",
      result.mode === "live"
        ? "public, s-maxage=8, stale-while-revalidate=20"
        : "public, s-maxage=300, stale-while-revalidate=3600",
    );

    res.status(200).json({
      reason:
        result.messages.length > 0 ? (result.mode === "live" ? "live" : "replay") : "quiet",
      ...result,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    res.status(200).json({
      reason: aborted ? "timeout" : "error",
      mode,
      channelId: null,
      title: null,
      isLive: false,
      messages: [],
      cursor: null,
      more: false,
    });
  } finally {
    clearTimeout(timer);
  }
}