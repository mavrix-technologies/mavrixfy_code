import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import * as Animated from "@/lib/nativeAnimated";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import YoutubePlayer from "react-native-youtube-iframe";
import Colors from "@/constants/colors";
import { IS_ANDROID } from "@/constants/platform";

export const YOUTUBE_PLAYER_REFERRER_URL = "https://mavrixfy.site/";
export const BACKGROUND_YOUTUBE_CHROME_CROP_PX = 260;
export const BACKGROUND_YOUTUBE_CHROME_CROP_TOTAL_PX = BACKGROUND_YOUTUBE_CHROME_CROP_PX * 2;

// Injected after DOM is ready (injectedJavaScript only — not Before — so window.innerHeight is valid on Android)
export const BACKGROUND_YOUTUBE_CROP_SCRIPT = `
(function () {
  function applyAmbientCrop() {
    var head = document.head || document.getElementsByTagName("head")[0];
    if (!head) {
      setTimeout(applyAmbientCrop, 16);
      return;
    }

    var viewportHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0, 220);
    var videoHeight = Math.ceil(viewportHeight + ${BACKGROUND_YOUTUBE_CHROME_CROP_TOTAL_PX});
    var videoWidth = Math.ceil(videoHeight * 16 / 9);
    var style = document.getElementById("mavrixfy-ambient-youtube-crop");
    if (!style) {
      style = document.createElement("style");
      style.id = "mavrixfy-ambient-youtube-crop";
      head.appendChild(style);
    }
    style.textContent = [
      "html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: ${Colors.background}; }",
      ".container { position: relative !important; width: 100% !important; height: 100vh !important; padding-bottom: 0 !important; overflow: hidden !important; background: ${Colors.background}; }",
      "#player, .container iframe { position: absolute !important; top: -${BACKGROUND_YOUTUBE_CHROME_CROP_PX}px !important; left: 50% !important; width: " + videoWidth + "px !important; height: " + videoHeight + "px !important; max-width: none !important; max-height: none !important; transform: translateX(-50%) !important; border: 0 !important; pointer-events: none !important; }"
    ].join("\\n");

    document.documentElement.style.overflow = "hidden";
    if (document.body) {
      document.body.style.overflow = "hidden";
      document.body.style.background = "${Colors.background}";
    }
  }

  applyAmbientCrop();
  setTimeout(applyAmbientCrop, 250);
  setTimeout(applyAmbientCrop, 1000);
  window.addEventListener("resize", applyAmbientCrop);
})();
true;
`;

// Injected BEFORE content loads — patches the YT player hooks so playVideo() is called
// the instant the player is ready, with no postMessage round-trip needed.
export const BACKGROUND_YOUTUBE_PRELOAD_HOOK = `
(function () {
  function wrapHooks() {
    var _origAPIReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function() {
      if (_origAPIReady) _origAPIReady();
      var _origPlayerReady = window.onPlayerReady;
      window.onPlayerReady = function(event) {
        if (_origPlayerReady) _origPlayerReady(event);
        try { player.mute(); } catch(e) {}
        try { player.setVolume(0); } catch(e) {}
        try { player.playVideo(); } catch(e) {}
      };
    };
  }
  wrapHooks();
  var attempts = 0;
  function tryPlayDirect() {
    attempts++;
    if (typeof player !== "undefined" && player && typeof player.playVideo === "function") {
      try { player.mute(); } catch(e) {}
      try { player.setVolume(0); } catch(e) {}
      try { player.playVideo(); } catch(e) {}
      return;
    }
    if (attempts < 40) setTimeout(tryPlayDirect, 250);
  }
  setTimeout(tryPlayDirect, 600);
})();
true;
`;

export type BackgroundYoutubeVideoProps = {
  videoId: string;
  active: boolean;
  initialOffsetMs: number;
  containerHeight: number;
  isLowEnd?: boolean;
  onVideoActive?: (active: boolean) => void;
};

export const BackgroundYoutubeVideo = memo(function BackgroundYoutubeVideo({
  videoId,
  active,
  initialOffsetMs,
  containerHeight,
  isLowEnd = false,
  onVideoActive,
}: BackgroundYoutubeVideoProps) {
  const { width: winW } = useWindowDimensions();
  const playerRef = useRef<any>(null);
  const initialPositionSeconds = Math.max(0, Math.floor(initialOffsetMs / 1000));
  const lastPositionRef = useRef(initialPositionSeconds);
  const [playerReady, setPlayerReady] = useState(false);
  const videoOpacity = useRef<Animated.Value | null>(null);
  if (videoOpacity.current === null) {
    videoOpacity.current = new Animated.Value(0);
  }
  const videoScaleRef = useRef<Animated.Value | null>(null);
  if (videoScaleRef.current === null) {
    videoScaleRef.current = new Animated.Value(1.05);
  }
  const videoScale = videoScaleRef.current;
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealVideo = useCallback(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (videoOpacity.current) {
      onVideoActive?.(true);
      Animated.parallel([
        Animated.timing(videoOpacity.current!, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(videoScale, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [onVideoActive, videoScale]);

  const onReady = useCallback(() => {
    setPlayerReady(true);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(revealVideo, 600);
  }, [revealVideo]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  const handleBackgroundStateChange = useCallback(
    (state: string) => {
      if (state === "playing" || state === "buffering") {
        revealVideo();
      } else if (state === "paused" || state === "ended") {
        if (active && playerRef.current) {
          playerRef.current.playVideo?.();
        }
      }
    },
    [active, revealVideo]
  );

  useEffect(() => {
    if (playerReady && playerRef.current) {
      if (active) {
        playerRef.current.playVideo?.();
        const targetSeconds = lastPositionRef.current;
        if (targetSeconds > 0) {
          playerRef.current.seekTo?.(targetSeconds, true);
        }
      } else {
        playerRef.current.pauseVideo?.();
      }
    }
  }, [active, playerReady]);

  useEffect(() => {
    if (isLowEnd) return;
    const targetSeconds = Math.max(0, Math.floor(initialOffsetMs / 1000));
    if (playerReady && Math.abs(targetSeconds - lastPositionRef.current) > 10) {
      playerRef.current?.seekTo?.(targetSeconds, true);
    }
    lastPositionRef.current = targetSeconds;
  }, [initialOffsetMs, playerReady, isLowEnd]);

  const dimensions = useMemo(() => {
    const frameW = Math.max(winW, 220);
    const frameH = Math.max(containerHeight, 220);

    const containerAspect = frameW / frameH;
    const videoAspect = 16 / 9;

    let videoW = frameW;
    let videoH = frameH;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspect > containerAspect) {
      videoH = frameH;
      videoW = Math.round(frameH * videoAspect);
      offsetX = Math.round(-(videoW - frameW) / 2);
    } else {
      videoW = frameW;
      videoH = Math.round(frameW / videoAspect);
      offsetY = Math.round(-(videoH - frameH) / 2);
    }

    return {
      frameW: videoW,
      frameH: videoH,
      offsetX,
      offsetY,
    };
  }, [winW, containerHeight]);

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { overflow: "hidden", backgroundColor: Colors.background },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: dimensions.offsetY,
          left: dimensions.offsetX,
          width: dimensions.frameW,
          height: dimensions.frameH,
          opacity: videoOpacity.current!,
          transform: [{ scale: videoScale }],
        }}
      >
        <YoutubePlayer
          key={videoId}
          ref={playerRef}
          height={dimensions.frameH}
          width={dimensions.frameW}
          play={active}
          mute={true}
          volume={0}
          videoId={videoId}
          onReady={onReady}
          onChangeState={handleBackgroundStateChange}
          onError={() => undefined}
          forceAndroidAutoplay
          useLocalHTML
          baseUrlOverride={YOUTUBE_PLAYER_REFERRER_URL}
          initialPlayerParams={{
            autoplay: true,
            controls: false,
            modestbranding: true,
            rel: false,
            preventFullScreen: true,
            showClosedCaptions: false,
            iv_load_policy: 3,
            start: initialPositionSeconds,
            disablekb: true,
            fs: false,
            playsinline: true,
            cc_load_policy: 0,
            enablejsapi: 1,
            mute: 1,
          }}
          webViewProps={{
            javaScriptEnabled: true,
            domStorageEnabled: true,
            thirdPartyCookiesEnabled: true,
            injectedJavaScriptBeforeContentLoaded: IS_ANDROID
              ? BACKGROUND_YOUTUBE_PRELOAD_HOOK
              : undefined,
            injectedJavaScript: BACKGROUND_YOUTUBE_CROP_SCRIPT,
            setSupportMultipleWindows: false,
            allowsFullscreenVideo: false,
            allowsInlineMediaPlayback: true,
            allowsBackgroundMediaPlayback: true,
            mediaPlaybackRequiresUserAction: false,
            scrollEnabled: false,
            overScrollMode: "never" as const,
            pointerEvents: "none",
          }}
        />
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: "rgba(0, 0, 0, 0.36)" }
          ]}
        />
      </Animated.View>
    </View>
  );
});

BackgroundYoutubeVideo.displayName = "BackgroundYoutubeVideo";

export default BackgroundYoutubeVideo;
