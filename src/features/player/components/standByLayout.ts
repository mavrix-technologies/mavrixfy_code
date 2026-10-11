type Insets = { top: number; right: number; bottom: number; left: number };
export const STANDBY_MIN_CONTROLS_WIDTH = 248;
export const STANDBY_CONTROL_SIZE = 48;

/** Fit square artwork beside controls without reserving unused artwork space. */
export function getStandByLayout(width: number, height: number, fontScale: number, insets: Insets) {
  const edgeGap = height < 360 ? 12 : 16;
  const paddingLeft = Math.max(insets.left, insets.right) + edgeGap;
  const paddingRight = paddingLeft;
  const paddingTop = insets.top + edgeGap;
  const paddingBottom = insets.bottom + edgeGap;
  const contentWidth = Math.max(0, width - paddingLeft - paddingRight);
  const contentHeight = Math.max(0, height - paddingTop - paddingBottom);
  const columnGap = contentWidth < 600 ? 16 : 24;
  const artworkSize = Math.max(0, Math.min(contentHeight, (contentWidth - columnGap) / 2));
  const showArtwork = width > height && artworkSize >= 150 && contentWidth - artworkSize - columnGap >= STANDBY_MIN_CONTROLS_WIDTH;

  return {
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
    contentWidth,
    contentHeight,
    controlsWidth: showArtwork ? contentWidth - artworkSize - columnGap : contentWidth,
    compact: contentHeight < 380 || fontScale > 1.4,
    showArtwork,
    artworkColumnWidth: showArtwork ? artworkSize : 0,
    artworkSize: showArtwork ? artworkSize : 0,
    gap: showArtwork ? columnGap : 0,
  };
}
