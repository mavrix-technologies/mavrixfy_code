// One lazy WebView engine, shared by audio/video resolution on both platforms.
// Tokens stay in memory and are scoped to the actual visitor and video ID.
export type PoChallenge = {
  program: string; globalName: string;
  interpreterJavascript?: { privateDoNotAccessOrElseSafeScriptWrappedValue?: string };
  interpreterUrl?: { privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string };
};
export type PoCommand = { id: number; operation: "bootstrap" | "mint"; challenge?: PoChallenge; videoId?: string };
type Reply = { id: number; ok: boolean; token?: string; expiresAt?: number; stage?: string };
type Pending = { command: PoCommand; resolve: (reply: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

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
  private active = false;
  private failures = 0;
  private cooldownUntil = 0;
  failureReason = "not_started";

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.active ? this.generation : -1;
  private publish() { this.listeners.forEach(listener => listener()); }

  attach(send: (command: PoCommand) => void) {
    this.bridge = send;
    for (const pending of this.commands.values()) send(pending.command);
    return () => { if (this.bridge === send) this.reset(); };
  }
  receive(reply: Reply) {
    const pending = this.commands.get(reply.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.commands.delete(reply.id);
    if (reply.ok) pending.resolve(reply);
    else pending.reject(new Error(`Attestation ${["interpreter", "snapshot", "integrity", "mint"].includes(reply.stage || "") ? reply.stage : "bootstrap"} failed`));
  }
  reset() {
    this.generation++;
    this.active = false;
    this.bridge = undefined;
    this.expiresAt = 0;
    this.bootstrap = undefined;
    this.tokens.clear();
    this.mints.clear();
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
    this.active = true;
    const id = ++this.sequence;
    const request = { ...command, id };
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.commands.delete(id);
        reject(new Error("YouTube attestation timed out"));
      }, timeout);
      this.commands.set(id, { command: request, resolve, reject, timer });
      this.publish();
      this.bridge?.(request);
    });
  }
  mint(videoId: string, visitor: string, challenge: () => Promise<PoChallenge>): Promise<string | null> {
    if (!/^[\w-]{11}$/.test(videoId) || !visitor || Date.now() < this.cooldownUntil) return Promise.resolve(null);
    if (this.visitor !== visitor) { this.reset(); this.visitor = visitor; }
    const cached = this.tokens.get(videoId);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.token);
    const previous = this.mints.get(videoId);
    if (previous) return previous;
    const generation = this.generation;
    const pending = this.resolve(videoId, challenge, generation).finally(() => {
      if (this.mints.get(videoId) === pending) this.mints.delete(videoId);
    });
    this.mints.set(videoId, pending);
    return pending;
  }
  private async resolve(videoId: string, challenge: () => Promise<PoChallenge>, generation: number) {
    try {
      if (this.expiresAt <= Date.now()) {
        this.bootstrap ??= (async () => {
          const data = await challenge();
          if (generation !== this.generation) throw new Error("Stale attestation session");
          const reply = await this.call({ operation: "bootstrap", challenge: data }, 10000);
          if (generation !== this.generation) throw new Error("Stale attestation session");
          if (!Number.isFinite(reply.expiresAt) || reply.expiresAt! <= Date.now()) throw new Error("Invalid token lifetime");
          this.expiresAt = reply.expiresAt!;
        })().finally(() => { if (generation === this.generation) this.bootstrap = undefined; });
        await this.bootstrap;
      }
      if (generation !== this.generation) return null;
      const reply = await this.call({ operation: "mint", videoId }, 3000);
      if (generation !== this.generation) return null;
      if (!reply.token || !/^[\w-]{80,2048}={0,2}$/.test(reply.token)) throw new Error("Invalid proof token");
      const token = reply.token.replace(/=+$/, "");
      if (this.tokens.size >= 200) this.tokens.delete(this.tokens.keys().next().value!);
      this.tokens.set(videoId, { token, expiresAt: this.expiresAt });
      this.failures = 0;
      this.failureReason = "none";
      return token;
    } catch (error) {
      // Count one failed engine, not every concurrent song waiting for it.
      if (generation === this.generation) {
        this.failureReason = error instanceof Error ? error.message : "Attestation unavailable";
        if (++this.failures >= 3) this.cooldownUntil = Date.now() + 15 * 60000;
        this.reset();
      }
      return null;
    }
  }
}

export const youtubePoTokens = new YouTubePoTokenManager();
