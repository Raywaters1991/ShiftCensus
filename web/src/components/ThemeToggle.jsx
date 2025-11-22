import { useTheme } from "../ThemeContext";
import "./themeToggle.css";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  const isLight = theme === "light";

  return (
    <label className="theme-switch">
      <input
        type="checkbox"
        checked={isLight}
        onChange={toggleTheme}
      />
      <span className="slider">
        <span className="icon">{isLight ? "🌞" : "🌙"}</span>
      </span>
    </label>
  );
}
