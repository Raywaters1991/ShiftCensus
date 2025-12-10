import { createContext, useContext, useEffect, useState } from "react";

// ------------------------------------------
// CREATE CONTEXT
// ------------------------------------------
const ThemeContext = createContext();

// Custom Hook
export const useTheme = () => useContext(ThemeContext);

// ------------------------------------------
// PROVIDER
// ------------------------------------------
export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    // Load saved theme OR default to dark
    return localStorage.getItem("theme") || "dark";
  });

  // Save theme + apply to <html> attribute
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  };

  const value = {
    theme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
