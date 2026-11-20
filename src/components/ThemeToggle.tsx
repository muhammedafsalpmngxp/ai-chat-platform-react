import { Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { applyTheme, getInitialTheme, saveTheme, THEME_KEY, type Theme } from "@/lib/theme";

/**
 * Light/dark switch. The sun and moon icons spin and swap, and the new theme
 * spreads out from the button in a circle (View Transitions API). Browsers
 * without it, or users who prefer reduced motion, get an instant switch.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Follow the OS setting until the user picks a theme themselves.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem(THEME_KEY);
      } catch {
        // ignore
      }
      if (saved) return;
      const next: Theme = media.matches ? "dark" : "light";
      setTheme(next);
      applyTheme(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = async () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    saveTheme(next);

    const switchTheme = () => {
      flushSync(() => setTheme(next));
      applyTheme(next);
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || !document.startViewTransition) {
      switchTheme();
      return;
    }

    // Grow a circle from the button's centre until it covers the whole screen.
    const rect = buttonRef.current!.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    const transition = document.startViewTransition(switchTheme);
    try {
      await transition.ready;
    } catch {
      return; // transition skipped — the theme is already applied
    }
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 550, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  };

  const isDark = theme === "dark";

  return (
    <button
      ref={buttonRef}
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className="theme-toggle relative h-9 w-9 overflow-hidden rounded-full text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] active:scale-90"
      data-theme-state={theme}
    >
      {/* Shown in dark mode: click for light */}
      <Sun size={19} className="theme-icon theme-icon-sun" aria-hidden />
      {/* Shown in light mode: click for dark */}
      <Moon size={18} className="theme-icon theme-icon-moon" aria-hidden />
    </button>
  );
}
