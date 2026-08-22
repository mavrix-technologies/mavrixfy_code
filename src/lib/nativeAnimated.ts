import * as ReactNative from "react-native";

const NativeAnimated = ReactNative.Animated;

export type Value = ReactNative.Animated.Value;
// eslint-disable-next-line @typescript-eslint/no-redeclare
export const Value = NativeAnimated.Value;
export const View = NativeAnimated.View;
export const Text = NativeAnimated.Text;
export const FlatList = NativeAnimated.FlatList;
export const Image = NativeAnimated.Image;
export const ScrollView = NativeAnimated.ScrollView;
export const createAnimatedComponent = NativeAnimated.createAnimatedComponent;
export const timing = NativeAnimated.timing;
export const spring = NativeAnimated.spring;
export const loop = NativeAnimated.loop;
export const sequence = NativeAnimated.sequence;
export const parallel = NativeAnimated.parallel;
export const delay = NativeAnimated.delay;
export const event = NativeAnimated.event;
export const multiply = NativeAnimated.multiply;
export const add = NativeAnimated.add;
export const divide = NativeAnimated.divide;

export type AnimatedValue = ReactNative.Animated.Value;
export type CompositeAnimation = ReactNative.Animated.CompositeAnimation;
export type AnimatedInterpolation<T extends string | number = number> =
  ReactNative.Animated.AnimatedInterpolation<T>;
