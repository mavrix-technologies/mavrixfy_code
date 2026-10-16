import Ionicons from "@expo/vector-icons/Ionicons";
import { Image, type ImageProps } from "expo-image";
import { memo, useCallback, useMemo, useLayoutEffect, useRef, useState } from "react";
import { PixelRatio, View } from "react-native";
import { artworkPixelSize, artworkCandidates } from "@/services/youtube/YouTubeArtwork";

/** Size-aware native loading with a finite fallback order and no stale artwork. */
export const MusicArtwork = memo(function MusicArtwork({ uri, size = 148, onError, onLoad, ...props }: Omit<ImageProps, "source"> & {
  uri?: string; size?: number;
}) {
  const pixels = artworkPixelSize(size, PixelRatio.get());
  const sources = useMemo(() => artworkCandidates(uri, pixels), [uri, pixels]);
  const request = useMemo(() => ({ uri, pixels }), [uri, pixels]);
  const [attempt, setAttempt] = useState({ request, index: 0, exhausted: false });
  const index = attempt.request === request ? attempt.index : 0;
  const exhausted = attempt.request === request && attempt.exhausted;
  if (attempt.request !== request) setAttempt({ request, index: 0, exhausted: false });
  const display = sources[index] || "";
  const activeSource = useRef({ request, display });
  useLayoutEffect(() => { activeSource.current = { request, display }; }, [request, display]);
  const source = useMemo(() => display ? { uri: display } : undefined, [display]);
  const handleError = useCallback<NonNullable<ImageProps["onError"]>>(event => {
    if (activeSource.current.request !== request || activeSource.current.display !== display || exhausted) return;
    activeSource.current = { request, display: "" };
    if (index + 1 < sources.length) setAttempt({ request, index: index + 1, exhausted: false });
    else { setAttempt({ request, index, exhausted: true }); onError?.(event); }
  }, [request, display, index, exhausted, sources.length, onError]);
  const handleLoad = useCallback<NonNullable<ImageProps["onLoad"]>>(event => {
    if (activeSource.current.request !== request || activeSource.current.display !== display) return;
    // YouTube can return a missing-thumbnail bitmap with HTTP 200.
    if (/^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\//i.test(display)
      && event.source.width === 120 && event.source.height === 90) {
      handleError({ error: "Missing video thumbnail" }); return;
    }
    onLoad?.(event);
  }, [request, display, handleError, onLoad]);
  if (!display || exhausted) return (
    <View style={[props.style, { alignItems: "center", justifyContent: "center", backgroundColor: "#171C24" }]}
      accessibilityRole="image" accessibilityLabel={props.accessibilityLabel || props.alt || "Artwork unavailable"}>
      <Ionicons name="musical-notes" size={Math.max(12, Math.min(size * 0.35, 60))} color="#8C98A8" />
    </View>
  );
  return <Image cachePolicy="memory-disk" allowDownscaling transition={0} contentFit="cover"
    contentPosition="center" placeholderContentFit="cover" decodeFormat="argb"
    {...props} recyclingKey={JSON.stringify([props.recyclingKey, display])}
    source={source} onError={handleError} onLoad={handleLoad} />;
});
