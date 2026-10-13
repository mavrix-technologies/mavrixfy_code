import { Image, type ImageProps } from "expo-image";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { PixelRatio } from "react-native";
import { artworkPixelSize, youTubeDisplayArtworkUrl, youTubeArtworkFallbackUrl } from "@/services/youtube/YouTubeArtwork";

/** Native image caching/downsampling, with per-image failure state like LastWave. */
export const MusicArtwork = memo(function MusicArtwork({ uri, size = 148, onError, onLoad, ...props }: Omit<ImageProps, "source"> & {
  uri?: string; size?: number;
}) {
  const primary = useMemo(() => youTubeDisplayArtworkUrl(uri, artworkPixelSize(size, PixelRatio.get())), [uri, size]);
  const [failed, setFailed] = useState<{ primary: string; fallback: string }>();
  const display = failed?.primary === primary ? failed.fallback : primary;
  const fallback = useMemo(() => youTubeArtworkFallbackUrl(uri, display), [uri, display]);
  const activeSource = useRef(display);
  activeSource.current = display;
  const source = useMemo(() => display ? { uri: display } : undefined, [display]);
  const handleError = useCallback<NonNullable<ImageProps["onError"]>>(event => {
    if (activeSource.current !== display) return;
    if (fallback !== display) setFailed({ primary, fallback });
    else onError?.(event);
  }, [display, primary, fallback, onError]);
  const handleLoad = useCallback<NonNullable<ImageProps["onLoad"]>>(event => {
    if (activeSource.current !== display) return;
    // Some CDN responses deliver the 120x90 missing-thumbnail bitmap with 200.
    if (/\/vi\/[^/]+\/(?:maxresdefault|sddefault|hqdefault)\.jpg$/.test(display) && event.source.width === 120 && event.source.height === 90) {
      handleError({ error: "Missing video thumbnail" }); return;
    }
    onLoad?.(event);
  }, [display, handleError, onLoad]);
  return <Image cachePolicy="memory-disk" allowDownscaling transition={0}
    {...props} source={source} onError={handleError} onLoad={handleLoad} />;
});
