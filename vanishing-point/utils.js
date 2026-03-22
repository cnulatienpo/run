// utils.js — Shared geometry helpers.

/**
 * Returns the bounding rect of the *visible* video frame within the video
 * element, accounting for object-fit: contain letterboxing / pillarboxing.
 *
 * All measurements are in CSS pixels, relative to the video element's
 * own top-left corner (which coincides with its containing positioned
 * ancestor when the element is inset: 0 inside that ancestor).
 *
 * @param {HTMLVideoElement} video
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function getVideoFrameRect(video) {
  const ew = video.clientWidth;
  const eh = video.clientHeight;
  const vw = video.videoWidth;
  const vh = video.videoHeight;

  // Metadata not loaded yet — treat the whole element as the frame.
  if (!vw || !vh) return { x: 0, y: 0, w: ew, h: eh };

  const videoAspect = vw / vh;
  const elemAspect  = ew / eh;

  let fw, fh;
  if (videoAspect > elemAspect) {
    // Video wider than element → letterboxed top/bottom.
    fw = ew;
    fh = ew / videoAspect;
  } else {
    // Video taller than element → pillarboxed left/right.
    fh = eh;
    fw = eh * videoAspect;
  }

  return {
    x: (ew - fw) / 2,
    y: (eh - fh) / 2,
    w: fw,
    h: fh,
  };
}
