// Must run before importing youtubei.js: Hermes does not provide every Web API.
import { Event, EventTarget } from "event-target-shim";
import { randomUUID, getRandomValues } from "expo-crypto";

const runtime = globalThis as any;
runtime.EventTarget ??= EventTarget;
runtime.Event ??= Event;
if (!runtime.CustomEvent) {
  runtime.CustomEvent = class extends runtime.Event {
    detail: unknown;
    constructor(type: string, options: { detail?: unknown } = {}) {
      super(type, options);
      this.detail = options.detail;
    }
  };
}
runtime.crypto ??= {};
runtime.crypto.randomUUID ??= randomUUID;
runtime.crypto.getRandomValues ??= getRandomValues;
