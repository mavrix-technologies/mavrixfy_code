import { Event, EventTarget } from 'event-target-shim';
import { randomUUID, getRandomValues } from 'expo-crypto';

const runtime = globalThis as any;
if (!runtime.EventTarget) runtime.EventTarget = EventTarget;
if (!runtime.Event) runtime.Event = Event;
if (!runtime.CustomEvent) {
  runtime.CustomEvent = class extends runtime.Event {
    detail: unknown;
    constructor(type: string, options: { detail?: unknown } = {}) {
      super(type, options);
      this.detail = options.detail;
    }
  };
}
if (!runtime.crypto) runtime.crypto = {};
if (!runtime.crypto.randomUUID) runtime.crypto.randomUUID = randomUUID;
if (!runtime.crypto.getRandomValues) runtime.crypto.getRandomValues = getRandomValues;
