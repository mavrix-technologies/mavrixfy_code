import type { YouTubeVideoQualityPreference } from "@/lib/storage";
import * as Animated from "@/lib/nativeAnimated";
import { getPlaybackProgressSnapshot } from "@/services/audio/playbackProgressStore";
import { resolveYouTubeVideoStream, type YouTubeVideoStream } from "@/services/youtube/YouTubeMusic";
import { useQuery } from "@tanstack/react-query";
import { useVideoPlayer, VideoView } from "expo-video";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

export const AMBIENT_VIDEO_INTRO_SKIP_SEC = 4;
// Preserve the original backdrop's overscan, including crop of encoded letterbox bars.
export const BACKGROUND_VIDEO_CROP_PX = 260;
export type BackgroundYoutubeVideoProps = {
  videoId: string;
  active: boolean;
  initialOffsetMs: number;
  containerHeight: number;
  isLowEnd?: boolean;
  quality: YouTubeVideoQualityPreference;
  onVideoActive?: (active: boolean) => void;
  onVideoError?: (error: string) => void;
};

function NativeVisual({ stream, active, initialOffsetMs, onVideoActive, onVideoError }: BackgroundYoutubeVideoProps & { stream: YouTubeVideoStream }) {
  const player = useVideoPlayer({ uri: stream.url, headers: stream.headers }, instance => {
    instance.loop = true;
    instance.muted = true;
    instance.volume = 0;
    instance.audioMixingMode = "mixWithOthers";
    instance.showNowPlayingNotification = false;
    instance.staysActiveInBackground = false;
    instance.bufferOptions = { preferredForwardBufferDuration: 5 };
  });
  const [opacity] = useState(() => new Animated.Value(0));
  const reveal = useRef<Animated.CompositeAnimation | null>(null);
  const hasFrame = useRef(false);
  const failed = useRef(false);
  const initialOffset = useRef(initialOffsetMs);
  const callbacks = useRef({ onVideoActive, onVideoError });
  useEffect(() => { callbacks.current = { onVideoActive, onVideoError }; }, [onVideoActive, onVideoError]);
  const onFrame = useCallback(() => {
    if (hasFrame.current) return;
    hasFrame.current = true;
    callbacks.current.onVideoActive?.(true);
    reveal.current = Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true });
    reveal.current.start();
  }, [opacity]);

  useEffect(() => {
    const subscription = player.addListener("statusChange", event => {
      if (event.status !== "error" || failed.current) return;
      failed.current = true;
      callbacks.current.onVideoActive?.(false);
      callbacks.current.onVideoError?.("Background video unavailable");
    });
    return () => { subscription.remove(); reveal.current?.stop(); callbacks.current.onVideoActive?.(false); };
  }, [player]);
  useEffect(() => {
    if (!active) { player.pause(); return; }
    const audioPosition = getPlaybackProgressSnapshot().positionMillis;
    player.seekBy(Math.max(AMBIENT_VIDEO_INTRO_SKIP_SEC,
      (Number.isFinite(audioPosition) ? audioPosition : initialOffset.current) / 1000) - player.currentTime);
    player.play();
    // The owning hook releases the decoder; no native calls in unmount cleanup.
  }, [active, player]);
  return <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]} pointerEvents="none">
    <VideoView player={player} style={{ position: "absolute", left: 0, right: 0,
      top: -BACKGROUND_VIDEO_CROP_PX, bottom: -BACKGROUND_VIDEO_CROP_PX }} contentFit="cover"
      nativeControls={false} surfaceType="textureView" onFirstFrameRender={onFrame}
      allowsPictureInPicture={false} fullscreenOptions={{ enable: false }} />
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "rgba(0,0,0,0.36)" }]} />
  </Animated.View>;
}

export const BackgroundYoutubeVideo = memo(function BackgroundYoutubeVideo(props: BackgroundYoutubeVideoProps) {
  const quality = props.quality === "auto" ? (props.isLowEnd ? "low" : "auto") : props.quality;
  const { data: stream, error } = useQuery({
    queryKey: ["visualStream", props.videoId, quality],
    queryFn: ({ signal }) => resolveYouTubeVideoStream(props.videoId, quality, signal),
    enabled: props.active,
    staleTime: 60_000,
    gcTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; }, [props]);
  useEffect(() => {
    if (error) callbacks.current.onVideoError?.("Background video unavailable");
  }, [error]);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { overflow: "hidden", backgroundColor: "#000" }]}>
    {stream && <NativeVisual key={`${props.videoId}:${quality}:${stream.url}`} {...props} stream={stream} />}
  </View>;
});
export default BackgroundYoutubeVideo;
