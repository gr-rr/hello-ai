export const FEATURES = {
  sheetMusic: process.env.NEXT_PUBLIC_FEATURE_SHEET_MUSIC === "true",
} as const;

export type FeatureName = keyof typeof FEATURES;
