// Version 6 exposes its JS entry through exports but omits the types condition.
declare module "event-target-shim" {
  export const Event: typeof globalThis.Event;
  export const EventTarget: typeof globalThis.EventTarget;
}
