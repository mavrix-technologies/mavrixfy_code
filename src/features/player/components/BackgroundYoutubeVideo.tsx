import type { YouTubeVideoQualityPreference } from "@/lib/storage";
import * as Animated from "@/lib/nativeAnimated";
import { getPlaybackProgressSnapshot } from "@/services/audio/playbackProgressStore";
import { resolveYouTubeVideoStream, type YouTubeVideoStream } from "@/services/youtube/YouTubeMusic";
import { logger } from "@/lib/logger";
import type { Song } from "@/lib/musicData";
import { resolveOfficialYouTubeMusicVideo } from "@/services/youtube/YouTubeMusic";
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
  isLowEnd?: boolean;
  quality: YouTubeVideoQualityPreference;
  song: Song;
  onFirstFrame?: () => void;
};

function NativeVisual({ videoId, stream, active, initialOffsetMs, onFirstFrame }: BackgroundYoutubeVideoProps & { stream: YouTubeVideoStream }) {
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
  const initialOffset = useRef(initialOffsetMs);
  const onFrame = useCallback(() => {
    if (hasFrame.current) return;
    hasFrame.current = true;
    if (__DEV__) console.info("[VideoBackground] first frame rendered", { videoId, height: stream.height });
    onFirstFrame?.();
    reveal.current = Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true });
    reveal.current.start();
  }, [onFirstFrame, opacity, stream.height, videoId]);

  useEffect(() => () => { reveal.current?.stop(); }, []);
  useEffect(() => {
    const subscription = player.addListener("statusChange", ({ status, error }) => {
      if (status !== "error") return;
      logger.warn("[VideoBackground] native decoder failed", {
        videoId,
        client: stream.clientProfile,
        height: stream.height,
        error: error?.message ?? "Unknown video decoder error",
      });
    });
    return () => subscription.remove();
  }, [player, stream.clientProfile, stream.height, videoId]);
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
      playsInline
      allowsPictureInPicture={false} fullscreenOptions={{ enable: false }} />
  </Animated.View>;
}

export const BackgroundYoutubeVideo = memo(function BackgroundYoutubeVideo(props: BackgroundYoutubeVideoProps) {
  const quality = props.quality === "auto" ? (props.isLowEnd ? "low" : "auto") : props.quality;
  const officialVideo = useQuery({
    queryKey: ["officialMusicVideo", { videoId: props.videoId, title: props.song.title,
      artist: props.song.artist, duration: props.song.duration,
      artists: props.song.artistRefs?.map(artist => artist.id) || [] }],
    queryFn: ({ signal }) => resolveOfficialYouTubeMusicVideo(props.song, signal),
    enabled: props.active,
    // A successful miss is catalog data, not a transient stream failure.
    // Reopening the player must not immediately repeat both searches.
    staleTime: query => query.state.data ? 60 * 60_000 : 10 * 60_000,
    gcTime: 6 * 60 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const officialVideoId = officialVideo.data || null;
  const { data: stream, error } = useQuery({
    queryKey: ["visualStream", officialVideoId, quality],
    queryFn: ({ signal }) => resolveYouTubeVideoStream(officialVideoId!, quality, signal),
    enabled: props.active && Boolean(officialVideoId),
    staleTime: 60_000,
    gcTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (officialVideo.error) {
      logger.warn("[VideoBackground] official video match failed", {
        audioVideoId: props.videoId,
        title: props.song.title,
        error: officialVideo.error instanceof Error ? officialVideo.error.message : String(officialVideo.error),
      });
    } else if (officialVideo.data) {
      if (__DEV__) console.info("[VideoBackground] official music video selected", {
        audioVideoId: props.videoId,
        officialVideoId: officialVideo.data,
      });
    } else if (officialVideo.isSuccess && __DEV__) {
      console.info("[VideoBackground] no official music video match", {
        audioVideoId: props.videoId,
        title: props.song.title,
      });
    }
  }, [officialVideo.data, officialVideo.error, officialVideo.isSuccess, props.song.title, props.videoId]);
  useEffect(() => {
    if (error && officialVideoId) {
      logger.warn("[VideoBackground] video stream resolution failed", {
        videoId: officialVideoId,
        quality,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [error, officialVideoId, quality]);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { overflow: "hidden", backgroundColor: "#000" }]}>
    {stream && officialVideoId && <NativeVisual key={`${officialVideoId}:${quality}:${stream.url}`}
      {...props} videoId={officialVideoId} stream={stream} />}
  </View>;
});
export default BackgroundYoutubeVideo;
