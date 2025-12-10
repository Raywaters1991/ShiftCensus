// src/components/ThemeToggle.jsx
import { useTheme } from "../contexts/ThemeContext";
import "./themeToggle.css";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="theme-toggle-wrapper">
      <label className="theme-switch">
        <input
          type="checkbox"
          checked={theme === "light"}
          onChange={toggleTheme}
        />
        <span className="slider"></span>
      </label>
    </div>
  );
}
