import { useLayoutEffect } from "react";

/** The CSS variable the panels start below: the bottom of the top bar on screen. */
export const APP_TOP_VAR = "--app-top";

/**
 * Keeps `--app-top`, on the root element, at the bottom of the top of the
 * interface as it shows: the bar and the banners under it (impersonation, session
 * expired, notices). The panels open below it rather than over it. The page
 * scrolls the bar away: the value then shrinks down to 0, and the panels take the
 * whole height again. Followed as the page scrolls and as the bar changes height.
 *
 * The element is given rather than a ref: the shell draws the bar only once
 * signed in, and the value follows it from then on.
 */
export function useAppTop(el: HTMLElement | null) {
  useLayoutEffect(() => {
    if (el === null) return;
    const root = document.documentElement;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const bottom = Math.max(0, Math.round(el.getBoundingClientRect().bottom));
      root.style.setProperty(APP_TOP_VAR, `${String(bottom)}px`);
    };
    const schedule = () => {
      frame ??= requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      root.style.removeProperty(APP_TOP_VAR);
    };
  }, [el]);
}
