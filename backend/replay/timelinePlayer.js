import { EventEmitter } from 'events';

function normaliseEvents(noodle = {}) {
  const baseTimestamp = new Date(noodle.timestamp ?? Date.now()).getTime();
  const events = Array.isArray(noodle.events) ? noodle.events : [];
  const sorted = events
    .filter(Boolean)
    .map((event) => {
      const eventTime = event.time ? new Date(event.time).getTime() : baseTimestamp;
      const offsetMs = Number.isFinite(eventTime) ? Math.max(0, eventTime - baseTimestamp) : 0;
      return {
        ...event,
        offsetMs,
      };
    })
    .sort((a, b) => a.offsetMs - b.offsetMs);
  return { baseTimestamp, events: sorted };
}

function normaliseNotes(noodle = {}) {
  const notes = Array.isArray(noodle.event_notes) ? noodle.event_notes : [];
  return notes
    .filter((note) => Number.isFinite(note?.t_ms))
    .map((note) => ({ ...note, offsetMs: Number(note.t_ms) }))
    .sort((a, b) => a.offsetMs - b.offsetMs);
}

export class TimelinePlayer {
  constructor(noodle, options = {}) {
    if (!noodle) {
      throw new Error('A noodle payload is required for playback.');
    }
    this.noodle = noodle;
    const { baseTimestamp, events } = normaliseEvents(noodle);
    this.baseTimestamp = baseTimestamp;
    this.timeline = events;
    this.notes = normaliseNotes(noodle);
    this.noteIndex = 0;
    this.emitter = new EventEmitter();
    this.speed = options.speed ?? noodle?.playback_profile?.speed ?? 1;
    this.loop = options.loop ?? noodle?.playback_profile?.loop ?? false;
    this.style = noodle?.playback_profile?.style;
    this.audioTrackId = noodle?.playback_profile?.audio_track_id;
    this.currentIndex = 0;
    this.playing = false;
    this.timer = null;
    this.startedAt = 0;
    this.elapsedBeforePause = 0;
  }

  onStep(handler) {
    this.emitter.on('step', handler);
    return this;
  }

  onPause(handler) {
    this.emitter.on('pause', handler);
    return this;
  }

  onResume(handler) {
    this.emitter.on('resume', handler);
    return this;
  }

  onEnd(handler) {
    this.emitter.on('end', handler);
    return this;
  }

  onNote(handler) {
    this.emitter.on('note', handler);
    return this;
  }

  setSpeed(multiplier) {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return;
    }
    this.speed = multiplier;
    if (this.playing) {
      this._restartScheduling();
    }
  }

  play() {
    this.stop();
    this.currentIndex = 0;
    this.noteIndex = 0;
    this.elapsedBeforePause = 0;
    this.playing = true;
    this.startedAt = Date.now();
    this.emitter.emit('resume');
    this._scheduleNext();
  }

  pause() {
    if (!this.playing) {
      return;
    }
    this.playing = false;
    this.elapsedBeforePause = this._elapsed();
    clearTimeout(this.timer);
    this.timer = null;
    this.emitter.emit('pause');
  }

  resume() {
    if (this.playing) {
      return;
    }
    this.playing = true;
    this.startedAt = Date.now() - this.elapsedBeforePause;
    this.emitter.emit('resume');
    this._scheduleNext();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.playing = false;
  }

  _elapsed() {
    if (!this.startedAt) {
      return this.elapsedBeforePause;
    }
    return Date.now() - this.startedAt;
  }

  _restartScheduling() {
    clearTimeout(this.timer);
    this.startedAt = Date.now() - this._elapsed();
    this._scheduleNext();
  }

  _emitNotesUntil(offsetMs) {
    while (this.noteIndex < this.notes.length && this.notes[this.noteIndex].offsetMs <= offsetMs) {
      const note = this.notes[this.noteIndex];
      this.emitter.emit('note', note);
      this.noteIndex += 1;
    }
  }

  _scheduleNext() {
    if (!this.playing) {
      return;
    }
    if (this.currentIndex >= this.timeline.length) {
      this.emitter.emit('end', {
        loop: this.loop,
        style: this.style,
        audioTrackId: this.audioTrackId,
      });
      if (this.loop) {
        this.play();
      } else {
        this.stop();
      }
      return;
    }

    const nextEvent = this.timeline[this.currentIndex];
    const elapsed = this._elapsed();
    const target = nextEvent.offsetMs / this.speed;
    const delay = Math.max(0, target - elapsed);

    this.timer = setTimeout(() => {
      if (!this.playing) {
        return;
      }
      this._emitNotesUntil(nextEvent.offsetMs);
      this.emitter.emit('step', {
        ...nextEvent,
        playback: {
          speed: this.speed,
          loop: this.loop,
          style: this.style,
          audioTrackId: this.audioTrackId,
        },
      });
      this.currentIndex += 1;
      this._scheduleNext();
    }, delay);
  }
}
