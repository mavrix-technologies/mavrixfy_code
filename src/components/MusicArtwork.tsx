import { Image, type ImageProps } from "expo-image";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { PixelRatio } from "react-native";
import { artworkPixelSize, youTubeDisplayArtworkUrl, youTubeArtworkFallbackUrl } from "@/services/youtube/YouTubeArtwork";

/** Native image caching/downsampling, with per-image failure state like LastWave. */
export const MusicArtwork = memo(function MusicArtwork({ uri, size = 148, onError, onLoad, ...props }: Omit<ImageProps, "source"> & {
  uri?: string; size?: number;
}) {
  const primary = useMemo(() => youTubeDisplayArtworkUrl(uri, artworkPixelSize(size, PixelRatio.get())), [uri, size]);
  const fallback = useMemo(() => youTubeArtworkFallbackUrl(uri), [uri]);
  const [failed, setFailed] = useState<string>();
  const display = failed === primary && fallback !== primary ? fallback : primary;
  const activeSource = useRef(display);
  activeSource.current = display;
  const source = useMemo(() => display ? { uri: display } : undefined, [display]);
  const handleError = useCallback<NonNullable<ImageProps["onError"]>>(event => {
    if (activeSource.current !== display) return;
    if (display === primary && fallback !== primary) setFailed(primary);
    else onError?.(event);
  }, [display, primary, fallback, onError]);
  const handleLoad = useCallback<NonNullable<ImageProps["onLoad"]>>(event => {
    if (activeSource.current !== display) return;
    // Some CDN responses deliver the 120x90 missing-thumbnail bitmap with 200.
    if (display === primary && primary.includes("/maxresdefault.jpg") && event.source.width === 120 && event.source.height === 90) {
      setFailed(primary); return;
    }
    onLoad?.(event);
  }, [display, primary, onLoad]);
  return <Image cachePolicy="memory-disk" allowDownscaling enforceEarlyResizing transition={0}
    {...props} source={source} onError={handleError} onLoad={handleLoad} />;
});
