import { Capacitor } from "@capacitor/core";

/**
 * Detect if running in a Capacitor native mobile environment.
 */
export function isNativeMobile(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Detect if running on a mobile-sized viewport (regardless of native vs web).
 */
export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
}
