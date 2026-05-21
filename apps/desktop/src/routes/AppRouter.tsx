import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { ProjectHealthScreen } from "@/screens/ProjectHealthScreen";
import { BuildsScreen } from "@/screens/BuildsScreen";
import { UpdatesScreen } from "@/screens/UpdatesScreen";
import { RouterScreen } from "@/screens/RouterScreen";
import { ReleasesScreen } from "@/screens/ReleasesScreen";
import { EnvironmentsScreen } from "@/screens/EnvironmentsScreen";
import { CredentialsScreen } from "@/screens/CredentialsScreen";
import { BundleScreen } from "@/screens/BundleScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";

const SCREENS: Record<string, React.ComponentType> = {
  dashboard: DashboardScreen,
  health: ProjectHealthScreen,
  builds: BuildsScreen,
  updates: UpdatesScreen,
  router: RouterScreen,
  releases: ReleasesScreen,
  environments: EnvironmentsScreen,
  credentials: CredentialsScreen,
  bundle: BundleScreen,
  settings: SettingsScreen,
};

const DEFAULT_SCREEN = "dashboard";

function screenFromHash(hash: string): string {
  const id = hash.replace(/^#\/?/, "");
  return id && id in SCREENS ? id : DEFAULT_SCREEN;
}

/**
 * Sync `activeScreen` in the store with `window.location.hash` so the OS
 * back/forward gestures, deep links, and refresh all land on the same screen.
 */
function useHashRoute() {
  const activeScreen = useAppStore((s) => s.activeScreen);
  const setActiveScreen = useAppStore((s) => s.setActiveScreen);

  // Initialise from hash on mount.
  useEffect(() => {
    const fromHash = screenFromHash(window.location.hash);
    if (fromHash !== activeScreen) setActiveScreen(fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for hash changes (back/forward, manual edits).
  useEffect(() => {
    const onHashChange = () => {
      const next = screenFromHash(window.location.hash);
      if (next !== useAppStore.getState().activeScreen) {
        setActiveScreen(next);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [setActiveScreen]);

  // Push hash updates when activeScreen changes from store-side callers.
  useEffect(() => {
    const desired = `#/${activeScreen}`;
    if (window.location.hash !== desired) {
      // Use replaceState on the *first* sync so the initial render doesn't
      // create a spurious history entry; afterwards use pushState for back/forward.
      if (!window.location.hash) {
        window.history.replaceState(null, "", desired);
      } else {
        window.history.pushState(null, "", desired);
      }
    }
  }, [activeScreen]);
}

export function AppRouter() {
  useHashRoute();
  const activeScreen = useAppStore((s) => s.activeScreen);
  const Screen = SCREENS[activeScreen] ?? DashboardScreen;
  return (
    <ErrorBoundary resetKey={activeScreen}>
      <Screen />
    </ErrorBoundary>
  );
}
