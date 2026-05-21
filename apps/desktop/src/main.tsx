import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { useAppStore } from "./lib/store";
import { isTauri } from "./lib/platform";
import { initTheme } from "./lib/theme";
import "./index.css";

let didInitialHydrate = false;

function Bootstrap() {
  const projectPath = useAppStore((s) => s.projectPath);
  const settings = useAppStore((s) => s.settings);

  useEffect(() => {
    initTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (!isTauri()) return;
    void useAppStore.getState().checkEasAuth();
  }, []);

  useEffect(() => {
    if (didInitialHydrate || !projectPath) return;
    didInitialHydrate = true;
    void useAppStore.getState().hydrateProject(projectPath);
  }, [projectPath]);

  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
);
