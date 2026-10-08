import { DiscordLogo, HeartStraight, XLogo, YoutubeLogo } from "@phosphor-icons/react";

/**
 * Brand glyphs from Phosphor, the same family as the UI icons. Centralised so
 * size and weight stay consistent wherever a channel mark appears.
 */

export function YoutubeMark({ size = 20 }: { size?: number }) {
  return <YoutubeLogo size={size} weight="fill" aria-hidden="true" />;
}

export function XMark({ size = 20 }: { size?: number }) {
  return <XLogo size={size} weight="fill" aria-hidden="true" />;
}

export function DiscordMark({ size = 20 }: { size?: number }) {
  return <DiscordLogo size={size} weight="fill" aria-hidden="true" />;
}

export function HeartMark({ size = 20 }: { size?: number }) {
  return <HeartStraight size={size} weight="fill" aria-hidden="true" />;
}