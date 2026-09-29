import Svg,{ Circle,Path,Rect } from "react-native-svg";

export interface NavIconProps {
  size?: number;
  color?: string;
  isFocused?: boolean;
}

export function NavHomeIcon({ size = 24, color = "#FFFFFF", isFocused = true }: NavIconProps) {
  return isFocused ? (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.2 3.5 10v10.5h6v-6h5v6h6V10L12 3.2Z" fill={color} />
    </Svg>
  ) : (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.5 3.5 10.2V21h6v-6.2h5V21h6V10.2L12 3.5Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function NavSearchIcon({ size = 24, color = "#FFFFFF", isFocused = false }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="10.5"
        cy="10.5"
        r="6.5"
        stroke={color}
        strokeWidth={isFocused ? 2.8 : 2.2}
      />
      <Path
        d="M15.5 15.5 20.5 20.5"
        stroke={color}
        strokeWidth={isFocused ? 3.2 : 2.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function NavLibraryIcon({ size = 24, color = "#FFFFFF", isFocused = true }: NavIconProps) {
  return isFocused ? (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3.8" y="4" width="3.2" height="16" rx="1.6" fill={color} />
      <Rect x="9.8" y="4" width="3.2" height="16" rx="1.6" fill={color} />
      <Rect
        x="15.8"
        y="4.2"
        width="3.2"
        height="16"
        rx="1.6"
        fill={color}
        transform="rotate(18 17.4 12.2)"
      />
    </Svg>
  ) : (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="4.2" width="2.8" height="15.6" rx="1.4" stroke={color} strokeWidth={1.8} />
      <Rect x="10" y="4.2" width="2.8" height="15.6" rx="1.4" stroke={color} strokeWidth={1.8} />
      <Rect
        x="16"
        y="4.4"
        width="2.8"
        height="15.6"
        rx="1.4"
        stroke={color}
        strokeWidth={1.8}
        transform="rotate(18 17.4 12.2)"
      />
    </Svg>
  );
}

export function NavLikedIcon({ size = 24, color = "#FFFFFF", isFocused = true }: NavIconProps) {
  return isFocused ? (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={color}
      />
    </Svg>
  ) : (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function NavImportIcon({ size = 24, color = "#FFFFFF", isFocused = true }: NavIconProps) {
  return isFocused ? (
    <Svg width={size} height={size} viewBox="-2 -2 28 28" fill="none">
      <Path
        d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96ZM14 13v4h-4v-4H7l5-5 5 5h-3Z"
        fill={color}
      />
    </Svg>
  ) : (
    <Svg width={size} height={size} viewBox="-2 -2 28 28" fill="none">
      <Path
        d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 11.5v6.5M9.5 14 12 11.5l2.5 2.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
