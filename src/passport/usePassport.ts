// src/passport/usePassport.ts
import { useEffect, useState } from "react";
import { PassportStamp, PassportStore } from "./types";
import { loadPassportStore, appendStamp } from "./storage";

export function usePassport() {
  const [store, setStore] = useState<PassportStore>(() => loadPassportStore());

  useEffect(() => {
    // v1: no external events; simply load once at mount
    setStore(loadPassportStore());
  }, []);

  const stamps = store.stamps.slice().sort((a, b) => {
    // sort by date desc, then startedAt desc
    const aKey = `${a.date}T${a.startedAt}`;
    const bKey = `${b.date}T${b.startedAt}`;
    return aKey < bKey ? 1 : aKey > bKey ? -1 : 0;
  });

  function addStamp(stamp: PassportStamp) {
    const updated = appendStamp(stamp);
    setStore(updated);
  }

  return {
    store,
    stamps,
    addStamp,
  };
}
