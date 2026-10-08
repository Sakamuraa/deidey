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
 * Pull messages out of the live response.
 *
 * The shape that matters is
 * `continuationContents.liveChatContinuation.actions[].addChatItemAction.item`.
 * Everything else in the response is bookkeeping.
 */
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
    const item = pick<Record<string, unknown>>(pick(action, "addChatItemAction"), "item");
    if (!item) continue;

    const text = pick<Record<string, unknown>>(item, "liveChatTextMessageRenderer");
    const paid = pick<Record<string, unknown>>(item, "liveChatPaidMessageRenderer");
    const membership = pick<Record<string, unknown>>(item, "liveChatMembershipItemRenderer");

    const renderer = text ?? paid ?? membership;
    if (!renderer) continue;

    const { body, emojis } = readRuns(pick<Run[]>(pick(renderer, "message"), "runs"));
    // pick() returns the value, so this is already the display name and not
    // the wrapper object around it.
    const author = pick<string>(pick(renderer, "authorName"), "simpleText") ?? "";

    const usec = pick<string>(renderer, "timestampUsec");
    const id = pick<string>(renderer, "id") ?? `${author}:${usec ?? body}`;

    messages.push({
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
      badge: membership ? "member" : paid ? "paid" : null,
    });
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

/* ------------------------------------------------------------------ *
 * Fetching
 * ------------------------------------------------------------------ */

/** InnerTube client version, dated to yesterday like the real players send. */
function clientVersion(): string {
  const d = new Date(Date.now() - 86_400_000);
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, "");
  return `2.${stamp}.01.00`;
}

interface ChatResult {
  messages: ChatMessage[];
  next: string | null;
  timeoutMs: number | null;
  channelId: string;
}

/** Channel id for a video. Taken from the watch page, behind the bpctr param. */
async function readChannelId(videoId: string, signal: AbortSignal): Promise<string | null> {
  // bpctr=9999999999 with has_verified=1 skips the interstitial that otherwise
  // replaces the payload with playabilityStatus LOGIN_REQUIRED.
  const res = await fetch(`${WATCH}?v=${videoId}&bpctr=9999999999&has_verified=1`, {
    headers: { "user-agent": UA, "accept-language": "id-ID,id;q=0.9" },
    signal,
  });
  if (!res.ok) return null;

  const html = await res.text();
  const match = html.match(/"channelId":"(.{24})"/);
  return match ? match[1] : null;
}

async function fetchChat(videoId: string, signal: AbortSignal): Promise<ChatResult | null> {
  const channelId = await readChannelId(videoId, signal);
  if (!channelId) return null;

  const res = await fetch(LIVE_CHAT, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    signal,
    body: JSON.stringify({
      context: {
        client: {
          clientName: "WEB",
          clientVersion: clientVersion(),
          hl: "id",
          gl: "ID",
          userAgent: UA,
        },
      },
      continuation: buildContinuation(videoId, channelId),
    }),
  });

  if (!res.ok) return null;

  const parsed = parseChat(await res.json());
  return { ...parsed, channelId };
}

/* ------------------------------------------------------------------ *
 * Handler
 * ------------------------------------------------------------------ */

export default async function handler(req: ChatRequest, res: ChatResponse) {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const videoId = typeof id === "string" ? id.trim() : "";

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    res.status(400).json({ reason: "bad-id", messages: [] });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);

  try {
    const result = await fetchChat(videoId, controller.signal);

    if (!result) {
      res.status(200).json({ reason: "unavailable", channelId: null, messages: [] });
      return;
    }

    // Newest last reads like a transcript; the client flips it if it wants.
    res.setHeader("Cache-Control", "public, s-maxage=8, stale-while-revalidate=20");
    res.status(200).json({
      reason: result.messages.length > 0 ? "live" : "quiet",
      channelId: result.channelId,
      messages: result.messages.slice(-MESSAGE_LIMIT),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    res.status(200).json({
      reason: aborted ? "timeout" : "error",
      channelId: null,
      messages: [],
    });
  } finally {
    clearTimeout(timer);
  }
}