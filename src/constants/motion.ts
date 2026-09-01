import {
  Easing,
  FadeIn,
  FadeOut,
  FadeInRight,
  FadeOutRight,
  FadeInDown,
  FadeOutUp,
  LinearTransition,
} from "react-native-reanimated";

/**
 * Mavrixfy Global Motion System
 * Unified tokens for consistent, 60fps/120fps UI-thread motion across the entire app.
 */
export const Motion = {
  duration: {
    instant: 0,
    fast: 160,
    normal: 240,
    emphasized: 340,
    modal: 420,
  },

  easing: {
    standard: Easing.bezier(0.2, 0.0, 0.0, 1.0),
    emphasized: Easing.bezier(0.05, 0.7, 0.1, 1.0),
    decelerate: Easing.out(Easing.ease),
    accelerate: Easing.in(Easing.ease),
  },

  scale: {
    pressed: 0.96,
    subtle: 0.985,
  },

  opacity: {
    hidden: 0,
    subtle: 0.72,
    visible: 1,
  },

  spring: {
    snappy: { damping: 20, stiffness: 220 },
    bouncy: { damping: 14, stiffness: 180 },
    gentle: { damping: 24, stiffness: 140 },
  },
} as const;

/**
 * Pre-configured Reanimated animation presets built from Motion tokens
 */
export const MotionPresets = {
  fadeIn: FadeIn.duration(Motion.duration.normal).easing(Motion.easing.standard),
  fadeOut: FadeOut.duration(Motion.duration.fast).easing(Motion.easing.standard),

  fadeInFast: FadeIn.duration(Motion.duration.fast).easing(Motion.easing.decelerate),
  fadeOutFast: FadeOut.duration(Motion.duration.fast).easing(Motion.easing.accelerate),

  slideInRight: FadeInRight.duration(Motion.duration.normal).easing(Motion.easing.emphasized),
  slideOutRight: FadeOutRight.duration(Motion.duration.fast).easing(Motion.easing.standard),

  slideInDown: FadeInDown.duration(Motion.duration.normal).easing(Motion.easing.emphasized),
  slideOutUp: FadeOutUp.duration(Motion.duration.fast).easing(Motion.easing.standard),

  layout: LinearTransition.duration(Motion.duration.normal).easing(Motion.easing.standard),
  layoutFast: LinearTransition.duration(Motion.duration.fast).easing(Motion.easing.standard),
};
