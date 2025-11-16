/**
 * Global rule: RV never shows calls-to-action or sponsorship segments.
 *
 * - No "like, comment, subscribe" overlays or speech.
 * - No "follow me on Instagram/Twitter/etc." overlays.
 * - No Patreon/merch/self-promo blocks.
 * - No "This video is sponsored by ..." segments.
 *
 * This is always enabled and not user-configurable.
 * The clip selection pipeline must detect and remove these segments
 * entirely or skip the clip if it cannot be cleanly trimmed.
 */

export const CTA_FILTER_ENABLED = true;

export const CTA_TEXT_PATTERNS: string[] = [
  "like and subscribe",
  "like, comment, and subscribe",
  "don't forget to like",
  "smash that like button",
  "hit the bell",
  "turn on notifications",
  "subscribe to my channel",
  "follow me on",
  "check out my instagram",
  "check out my tiktok",
  "follow my twitter",
  "link in the description",
  "support me on patreon",
  "today's sponsor is",
  "this video is sponsored by",
  "use my discount code",
  "use code",
  "brought to you by",
];

export const CTA_BRAND_KEYWORDS: string[] = [
  "raid shadow legends",
  "honey",
  "squarespace",
  "expressvpn",
  "nordvpn",
  "audible",
  "skillshare",
  "betterhelp",
  "manscaped",
  "keeps",
  "established titles",
];

export const CTA_SOCIAL_KEYWORDS: string[] = [
  "instagram",
  "tiktok",
  "twitter",
  "x.com",
  "patreon",
  "twitch",
  "youtube.com/",
  "subscribe!",
];
