"use client";

import { useEffect } from "react";

/**
 * Publishes the on-screen keyboard height as the `--kb` custom property.
 *
 * `interactiveWidget: "resizes-content"` handles this in current browsers, but
 * iOS Safari still overlays the keyboard, so the composer pads itself by the
 * visual-viewport delta to keep the caret and Submit visible.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const set = () =>
      document.documentElement.style.setProperty(
        "--kb",
        `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`
      );

    set();
    vv.addEventListener("resize", set);
    vv.addEventListener("scroll", set);
    return () => {
      vv.removeEventListener("resize", set);
      vv.removeEventListener("scroll", set);
      document.documentElement.style.removeProperty("--kb");
    };
  }, []);
}
