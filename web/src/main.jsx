// src/main.jsx
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

import { BrowserRouter } from "react-router-dom";
import { UserProvider } from "./contexts/UserContext.jsx";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <ThemeProvider>
      <UserProvider>
        <App />
      </UserProvider>
    </ThemeProvider>
  </BrowserRouter>
);

if ("serviceWorker" in navigator) {
  // Register the worker, but never force-reload the running app when a newly
  // deployed worker takes control. On iOS Safari, controllerchange can happen
  // as the page resumes, which made simply returning to ShiftCensus look like
  // a cold restart. The new worker will naturally be used on the next real
  // navigation/relaunch instead.
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
    } catch (err) {
      console.warn("ShiftCensus service worker registration failed", err);
    }
  });
}
