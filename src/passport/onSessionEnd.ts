// src/passport/onSessionEnd.ts
import { SessionLog } from "./types";
import { makePassportStampFromSession } from "./createStamp";
import { appendStamp } from "./storage";

export interface SessionEndOptions {
  autoNote: string;
  appVersion?: string;
}

export interface SessionEndComposerResult {
  userNote?: string;
  emojis?: string[];
}

export function writePassportStampForSession(
  session: SessionLog,
  options: SessionEndOptions,
  composerResult: SessionEndComposerResult
) {
  const stamp = makePassportStampFromSession(session, {
    autoNote: options.autoNote,
    userNote: composerResult.userNote,
    emojis: composerResult.emojis,
    appVersion: options.appVersion,
  });

  appendStamp(stamp);
}
