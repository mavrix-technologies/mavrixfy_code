// One lazy WebView engine, shared by audio/video resolution on both platforms.
// Tokens stay in memory and are scoped to the actual visitor and video ID.
export type PoCommand = { id: number; operation: "bootstrap" | "mint"; videoId?: string };
type Reply = { id: number; ok: boolean; token?: string; expiresAt?: number; stage?: string };
type Pending = { command: PoCommand; resolve: (reply: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const ENGINE_BUDGET_MS = 8000;

export class YouTubePoTokenManager {
  private listeners = new Set<() => void>();
  private bridge?: (command: PoCommand) => void;
  private commands = new Map<number, Pending>();
  private tokens = new Map<string, { token: string; expiresAt: number }>();
  private mints = new Map<string, Promise<string | null>>();
  private bootstrap?: Promise<void>;
  private visitor = "";
  private expiresAt = 0;
  private sequence = 0;
  private generation = 0;
  private contextGeneration = 0;
  private active = false;
  private failures = 0;
  private cooldownUntil = 0;
  failureReason = "not_started";

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.active ? this.generation : -1;
  private publish() { this.listeners.forEach(listener => listener()); }

  attach(send: (command: PoCommand) => void, generation = this.generation) {
    if (generation !== this.generation) return () => {};
    this.bridge = send;
    for (const pending of this.commands.values()) send(pending.command);
    return () => { if (this.bridge === send) this.engineFailed(generation); };
  }
  receive(reply: Reply, generation = this.generation) {
    if (generation !== this.generation) return;
    const pending = this.commands.get(reply.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.commands.delete(reply.id);
    if (reply.ok) pending.resolve(reply);
    else pending.reject(new Error(`Attestation ${["page", "interpreter", "snapshot", "integrity", "mint"].includes(reply.stage || "") ? reply.stage : "bootstrap"} failed`));
  }
  reset() {
    this.contextGeneration++;
    this.mints.clear();
    this.replaceEngine();
  }
  engineFailed(generation = this.generation) {
    if (generation !== this.generation) return;
    this.failureReason = "YouTube attestation renderer unavailable";
    if (++this.failures >= 3) this.cooldownUntil = Date.now() + 15 * 60000;
    this.replaceEngine();
  }
  private replaceEngine() {
    this.generation++;
    this.active = false;
    this.bridge = undefined;
    this.expiresAt = 0;
    this.bootstrap = undefined;
    this.tokens.clear();
    for (const pending of this.commands.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("YouTube attestation engine closed"));
    }
    this.commands.clear();
    this.publish();
  }
  networkChanged() {
    this.failures = 0;
    this.cooldownUntil = 0;
    this.visitor = "";
    this.reset();
  }
  private call(command: Omit<PoCommand, "id">, timeout: number) {
    if (timeout <= 0) return Promise.reject<Reply>(new Error("YouTube attestation timed out"));
    this.active = true;
    const id = ++this.sequence;
    const request = { ...command, id };
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.commands.delete(id);
        reject(new Error("YouTube attestation timed out"));
      }, timeout);
      this.commands.set(id, { command: request, resolve, reject, timer });
      const send = this.bridge;
      this.publish();
      // A listener can attach a new host during publish; attach already sent it.
      if (this.bridge === send) send?.(request);
    });
  }
  mint(videoId: string, visitor: string): Promise<string | null> {
    if (!/^[\w-]{11}$/.test(videoId) || !visitor || Date.now() < this.cooldownUntil) return Promise.resolve(null);
    if (this.visitor !== visitor) { this.reset(); this.visitor = visitor; }
    const cached = this.tokens.get(videoId);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.token);
    const previous = this.mints.get(videoId);
    if (previous) return previous;
    if (this.expiresAt && this.expiresAt <= Date.now()) this.replaceEngine();
    const pending = this.resolve(videoId, this.contextGeneration).finally(() => {
      if (this.mints.get(videoId) === pending) this.mints.delete(videoId);
    });
    this.mints.set(videoId, pending);
    return pending;
  }
  private async resolve(videoId: string, context: number) {
    const deadline = Date.now() + ENGINE_BUDGET_MS;
    // A previously working renderer may have been culled in the background.
    // Recreate it once. A fresh engine failure must not cause a retry storm.
    const attempts = this.expiresAt > Date.now() ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const generation = this.generation;
      try {
        if (context !== this.contextGeneration) return null;
        if (this.expiresAt <= Date.now()) {
          this.bootstrap ??= (async () => {
            const reply = await this.call({ operation: "bootstrap" }, deadline - Date.now());
            if (generation !== this.generation) throw new Error("Stale attestation engine");
            if (!Number.isFinite(reply.expiresAt) || reply.expiresAt! <= Date.now()) throw new Error("Invalid token lifetime");
            this.expiresAt = reply.expiresAt!;
          })().finally(() => { if (generation === this.generation) this.bootstrap = undefined; });
          await this.bootstrap;
        }
        if (context !== this.contextGeneration) return null;
        if (generation !== this.generation) throw new Error("Stale attestation engine");
        const reply = await this.call({ operation: "mint", videoId }, Math.min(3000, deadline - Date.now()));
        if (context !== this.contextGeneration) return null;
        if (generation !== this.generation) throw new Error("Stale attestation engine");
        if (!reply.token || !/^[\w-]{80,2048}={0,2}$/.test(reply.token)) throw new Error("Invalid proof token");
        const token = reply.token.replace(/=+$/, "");
        if (this.tokens.size >= 200) this.tokens.delete(this.tokens.keys().next().value!);
        this.tokens.set(videoId, { token, expiresAt: this.expiresAt });
        this.failures = 0;
        this.cooldownUntil = 0;
        this.failureReason = "none";
        return token;
      } catch (error) {
        if (context !== this.contextGeneration) return null;
        if (attempt + 1 < attempts && Date.now() < deadline) {
          // Concurrent mints join the replacement that the first failure made.
          if (generation === this.generation) this.replaceEngine();
          continue;
        }
        if (generation === this.generation) {
          this.failureReason = error instanceof Error ? error.message : "Attestation unavailable";
          if (++this.failures >= 3) this.cooldownUntil = Date.now() + 15 * 60000;
          this.replaceEngine();
        }
        return null;
      }
    }
    return null;
  }
}

export const youtubePoTokens = new YouTubePoTokenManager();
