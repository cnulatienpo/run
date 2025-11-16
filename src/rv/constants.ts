/**
 * Global rule: RV never shows calls-to-action or sponsorship segments.
 * - No "like, comment, subscribe" overlays
 * - No social media handles, "follow me", Patreon pushes, etc.
 * - No "This video is sponsored by ..." segments
 *
 * The clip selection pipeline must detect and remove these segments entirely
 * or skip the clip if it cannot be cleanly trimmed.
 */
export const CTA_FILTER_ENABLED = true;
