interface VideoProgressSyncOptions {
  getVideoSeconds: () => Promise<number>;
  getAudioMillis: () => number;
  seek: (seconds: number) => void;
  onUnavailable: () => void;
}

/** One outstanding WebView request; timeout and cleanup discard late replies. */
export function startVideoProgressSync(options: VideoProgressSyncOptions): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(deadline);
  };
  const unavailable = () => {
    if (stopped) return;
    stop();
    options.onUnavailable();
  };
  const check = async () => {
    if (stopped) return;
    deadline = setTimeout(unavailable, 3000);
    try {
      const video = await options.getVideoSeconds();
      if (stopped) return;
      clearTimeout(deadline);
      const audio = options.getAudioMillis() / 1000;
      if (Number.isFinite(video) && Number.isFinite(audio) && Math.abs(video - audio) > 3) options.seek(Math.max(0, audio));
      timer = setTimeout(() => void check(), 5000);
    } catch { unavailable(); }
  };
  void check();
  return stop;
}
