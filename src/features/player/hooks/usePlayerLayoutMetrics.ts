import { IS_WEB } from "@/constants/platform";
import { useMemo } from "react";
import { type EdgeInsets } from "react-native-safe-area-context";

export function usePlayerLayoutMetrics(
  screenWidth: number,
  screenHeight: number,
  insets: EdgeInsets
) {
  const topInset = IS_WEB ? 67 : insets.top;
  const isShortScreen = screenHeight <= 760;
  const isVeryShortScreen = screenHeight <= 700;
  const topBarHeight = isShortScreen ? 50 : 54;
  const controlButtonSize = 48;
  const prevNextButtonSize = isVeryShortScreen ? 48 : isShortScreen ? 50 : 54;
  const prevNextIconSize = isVeryShortScreen ? 32 : isShortScreen ? 36 : 40;
  const shuffleRepeatIconSize = isVeryShortScreen ? 24 : isShortScreen ? 26 : 28;
  const playButtonSize = isVeryShortScreen ? 60 : isShortScreen ? 64 : 68;
  const playIconSize = isVeryShortScreen ? 28 : isShortScreen ? 31 : 34;
  const controlsRowGap = Math.max(0, Math.min(isVeryShortScreen ? 8 : isShortScreen ? 10 : 12,
    (screenWidth - (isShortScreen ? 32 : 40) - controlButtonSize * 2 - prevNextButtonSize * 2 - playButtonSize) / 4));
  const songDetailActionSize = 48;
  const songDetailIconSize = isVeryShortScreen ? 21 : 23;
  const bottomContentPadding =
    IS_WEB ? 16 : Math.max(insets.bottom, 0) + 24;

  const trackSwipeHeightByWidth = Math.min(
    screenWidth - (isShortScreen ? 44 : 38),
    isShortScreen ? 348 : 388
  );
  const trackSwipeHeightByScreen = Math.max(
    isVeryShortScreen ? 220 : 240,
    Math.floor(screenHeight * (isVeryShortScreen ? 0.34 : isShortScreen ? 0.38 : 0.42))
  );
  const trackSwipeAreaHeight = Math.min(trackSwipeHeightByWidth, trackSwipeHeightByScreen);

  const ctrlBtnBase = useMemo(
    () => ({
      width: controlButtonSize,
      height: controlButtonSize,
      borderRadius: controlButtonSize / 2,
    }),
    [controlButtonSize]
  );

  const playerIconBtnStyle = useMemo(
    () => ({ ...ctrlBtnBase, backgroundColor: "transparent", borderColor: "transparent" }),
    [ctrlBtnBase]
  );

  const songDetailActionBtnStyle = useMemo(
    () => ({
      width: songDetailActionSize,
      height: songDetailActionSize,
      borderRadius: songDetailActionSize / 2,
      backgroundColor: "transparent",
      borderColor: "transparent",
    }),
    [songDetailActionSize]
  );

  const prevNextBtnSizeStyle = useMemo(
    () => ({
      width: prevNextButtonSize,
      height: prevNextButtonSize,
      borderRadius: prevNextButtonSize / 2,
    }),
    [prevNextButtonSize]
  );

  const trackSwipePageWidth = screenWidth;

  return {
    topInset,
    isShortScreen,
    isVeryShortScreen,
    topBarHeight,
    controlButtonSize,
    prevNextButtonSize,
    prevNextIconSize,
    shuffleRepeatIconSize,
    playButtonSize,
    playIconSize,
    controlsRowGap,
    songDetailActionSize,
    songDetailIconSize,
    bottomContentPadding,
    trackSwipeAreaHeight,
    playerIconBtnStyle,
    songDetailActionBtnStyle,
    prevNextBtnSizeStyle,
    trackSwipePageWidth,
  };
}
