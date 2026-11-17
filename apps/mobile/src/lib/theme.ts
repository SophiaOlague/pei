/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import "@/global.css";

import { Platform } from "react-native";

export const Colors = {
  background: "#ffffff",
  backgroundElement: "#D9D9D950",
  backgroundSelected: "#2E3135",
  text: "#616161",
  textSecondary: "#D9D9D9",
} as const;

export const Fonts = Platform.select({
  default: {
    mono: "monospace",
    rounded: "normal",
    sans: "normal",
    serif: "serif",
  },
  ios: {
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
  },
  web: {
    mono: "var(--font-mono)",
    rounded: "var(--font-rounded)",
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
  },
});

export const Spacing = {
  five: 32,
  four: 24,
  half: 2,
  one: 4,
  six: 64,
  three: 16,
  two: 8,
} as const;

export const BottomTabInset = Platform.select({ android: 80, ios: 50 }) ?? 0;
export const MaxContentWidth = 800;
