// src/components/ThemeToggle.jsx
import { useEffect, useState } from "react";
import "./themeToggle.css";

function getInitialTheme() {
  const saved =
    (typeof localStorage !== "undefined" && localStorage.getItem("theme")) || "";
  if (saved === "light" || saved === "dark") return saved;

  // fallback to system preference
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  return prefersDark ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {isDark ? "🌙" : "☀️"}
      </span>
      <span className="theme-toggle__label">{isDark ? "Dark" : "Light"}</span>
      <span className={`theme-toggle__switch ${isDark ? "on" : ""}`} aria-hidden="true">
        <span className="theme-toggle__knob" />
      </span>
    </button>
  );
}
