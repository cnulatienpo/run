// src/passport/NoteComposerOverlay.tsx
import React, { useEffect, useState } from "react";
import styles from "./Passport.module.css";

const EMOJI_CHOICES = ["⭐", "💧", "🔥", "🚀", "🌲", "🌧️", "🎧", "🏙️"];

export interface NoteComposerResult {
  note: string;
  emojis: string[];
}

interface NoteComposerOverlayProps {
  durationMs?: number; // default 10000
  onComplete: (result: NoteComposerResult) => void;
  onCancel?: () => void;
}

export const NoteComposerOverlay: React.FC<NoteComposerOverlayProps> = ({
  durationMs = 10000,
  onComplete,
  onCancel,
}) => {
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [remainingMs, setRemainingMs] = useState(durationMs);

  useEffect(() => {
    const startedAt = performance.now();
    let frameId: number;

    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const left = Math.max(durationMs - elapsed, 0);
      setRemainingMs(left);

      if (left <= 0) {
        onComplete({ note: note.trim(), emojis: selected });
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs, onComplete]);

  const progress = Math.max(0, Math.min(1, remainingMs / durationMs));

  function toggleEmoji(emoji: string) {
    setSelected((prev) =>
      prev.includes(emoji) ? prev.filter((e) => e !== emoji) : [...prev, emoji]
    );
  }

  function handleDoneClick() {
    onComplete({ note: note.trim(), emojis: selected });
  }

  function handleSkipClick() {
    if (onCancel) onCancel();
    onComplete({ note: "", emojis: [] });
  }

  const secondsLeft = Math.round(remainingMs / 1000);

  return (
    <div className={styles.composerOverlay}>
      <div className={styles.composerTopRow}>
        <span>Log a quick note?</span>
        <span>{secondsLeft}s</span>
      </div>

      <div className={styles.composerTimerBar}>
        <div
          className={styles.composerTimerFill}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className={styles.composerInputRow}>
        <input
          className={styles.composerInput}
          placeholder="Felt fast, overlays looked perfect…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={140}
        />
      </div>

      <div className={styles.composerEmojiRow}>
        {EMOJI_CHOICES.map((emoji) => {
          const isActive = selected.includes(emoji);
          const className = [
            styles.composerEmojiButton,
            isActive ? styles.composerEmojiButtonActive : "",
          ].join(" ").trim();

          return (
            <button
              key={emoji}
              type="button"
              className={className}
              onClick={() => toggleEmoji(emoji)}
            >
              {emoji}
            </button>
          );
        })}
      </div>

      <div className={styles.composerTopRow}>
        <button type="button" onClick={handleSkipClick}>
          Skip
        </button>
        <button type="button" onClick={handleDoneClick}>
          Save now
        </button>
      </div>
    </div>
  );
};
