// src/passport/PassportScreen.tsx
import React, { useMemo, useState } from "react";
import { usePassport } from "./usePassport";
import { PassportStamp } from "./types";
import { computePassportStats } from "./stats";
import styles from "./Passport.module.css";

interface FilterState {
  range: "all" | "7d" | "30d";
  query: string;
}

function filterStamps(stamps: PassportStamp[], filter: FilterState): PassportStamp[] {
  const now = new Date();
  let minDate: Date | null = null;

  if (filter.range === "7d") {
    minDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (filter.range === "30d") {
    minDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return stamps.filter((stamp) => {
    if (minDate) {
      const d = new Date(stamp.date);
      if (!isNaN(d.getTime()) && d < minDate) {
        return false;
      }
    }

    const q = filter.query.trim().toLowerCase();
    if (!q) return true;

    const haystack = (
      stamp.routeLabel +
      " " +
      stamp.mood +
      " " +
      stamp.pack +
      " " +
      stamp.note
    ).toLowerCase();

    return haystack.includes(q);
  });
}

interface StampCardProps {
  stamp: PassportStamp;
}

const StampCard: React.FC<StampCardProps> = ({ stamp }) => {
  const isAuto = stamp.noteSource === "auto";
  const noteClassName = [
    styles.note,
    isAuto ? styles.noteAuto : ""
  ].join(" ").trim();

  return (
    <article className={styles.stampCard}>
      <div className={styles.stampHeaderLeft}>
        {new Date(stamp.date).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </div>
      <div className={styles.stampHeaderRight}>
        {stamp.routeLabel}
      </div>

      <div className={styles.stampMetrics}>
        <span className={styles.miles}>{stamp.miles.toFixed(1)} mi</span>
        <div className={styles.badges}>
          <span className={styles.badge}>{stamp.mood}</span>
          <span className={styles.badge}>{stamp.pack}</span>
        </div>
      </div>

      <div className={noteClassName}>
        {stamp.note}
        {stamp.emojis && stamp.emojis.length > 0 && (
          <div className={styles.emojis}>
            {stamp.emojis.join(" ")}
          </div>
        )}
      </div>

      <div className={styles.thumbnail}>
        {stamp.thumbnailUrl ? (
          <img
            src={stamp.thumbnailUrl}
            alt=""
            className={styles.thumbnailImage}
          />
        ) : (
          <div
            className={styles.thumbnailSwatch}
            style={{ background: stamp.swatchColor || "#111827" }}
          />
        )}
      </div>
    </article>
  );
};

export const PassportScreen: React.FC = () => {
  const { stamps } = usePassport();
  const [filter, setFilter] = useState<FilterState>({
    range: "all",
    query: "",
  });

  const filtered = useMemo(
    () => filterStamps(stamps, filter),
    [stamps, filter]
  );

  const stats = useMemo(
    () => computePassportStats(stamps),
    [stamps]
  );

  return (
    <div className={styles.passportRoot}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>Passport</div>

        <select
          className={styles.headerSelect}
          value={filter.range}
          onChange={(e) =>
            setFilter((prev) => ({
              ...prev,
              range: e.target.value as FilterState["range"],
            }))
          }
        >
          <option value="all">All</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>

        <input
          type="search"
          className={styles.headerSearch}
          placeholder="Search route / mood / notes"
          value={filter.query}
          onChange={(e) =>
            setFilter((prev) => ({
              ...prev,
              query: e.target.value,
            }))
          }
        />
      </header>

      <main className={styles.list}>
        {filtered.map((stamp) => (
          <StampCard key={stamp.stampId} stamp={stamp} />
        ))}
        {filtered.length === 0 && (
          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
            No sessions yet. Once you complete a run, your stamps will appear here.
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <div>
          <span className={styles.footerItemLabel}>Sessions:</span>
          <span className={styles.footerItemValue}>{stats.totalSessions}</span>
        </div>
        <div>
          <span className={styles.footerItemLabel}>Miles:</span>
          <span className={styles.footerItemValue}>
            {stats.totalMiles.toFixed(1)}
          </span>
        </div>
        <div>
          <span className={styles.footerItemLabel}>Favorite pack:</span>
          <span className={styles.footerItemValue}>
            {stats.favoritePack ?? "—"}
          </span>
        </div>
      </footer>
    </div>
  );
};
