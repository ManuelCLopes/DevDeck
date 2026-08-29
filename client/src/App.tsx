import { Router as WouterRouter, Switch, Route, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy, useEffect, useState } from "react";
import { hasCompletedOnboarding } from "@/lib/onboarding-state";
import { getDesktopApi } from "@/lib/desktop";
import { navigateInApp } from "@/lib/app-navigation";
import { useBacklogFeatureFlags } from "@/hooks/use-backlog-feature-flags";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import {
  hasValidWorkspaceSelection,
} from "@/lib/workspace-selection";
import {
  applyAppThemePreferences,
  getAppPreferences,
  useAppPreferences,
} from "@/lib/app-preferences";

const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Settings = lazy(() => import("@/pages/Settings"));
const Reviews = lazy(() => import("@/pages/Reviews"));
const Activity = lazy(() => import("@/pages/Activity"));
const Projects = lazy(() => import("@/pages/Projects"));
const Agents = lazy(() => import("@/pages/Agents"));
const Terminals = lazy(() => import("@/pages/Terminals"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Backlog = lazy(() => import("@/pages/Backlog"));
const BacklogIssueDetail = lazy(() => import("@/pages/BacklogIssueDetail"));

function AppLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#ececec] dark:bg-background p-4 text-[13px] font-sans">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 dark:border-white/10 bg-white/90 px-6 py-8 text-center shadow-xl backdrop-blur-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          DevDeck
        </p>
        <p className="mt-3 text-sm text-foreground">Loading workspace shell...</p>
      </div>
    </div>
  );
}

function LegacyRepositoriesRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    navigateInApp("/projects", setLocation);
  }, [setLocation]);

  return null;
}

/**
 * Guards /backlog/issues/:issueKey behind the backlogIntelligenceEnabled
 * master switch. Unlike /backlog (Backlog.tsx renders its own disabled
 * state), this route has no fallback of its own — reaching
 * BacklogIssueDetail while disabled would still mount its Jira-issue,
 * mapping, and evidence queries (and let evidence gathering start), so
 * the redirect has to happen before that component is ever rendered.
 */
function BacklogIssueDetailGate({
  backlogIntelligenceEnabled,
  issueKey,
}: {
  backlogIntelligenceEnabled: boolean;
  issueKey?: string;
}) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!backlogIntelligenceEnabled) {
      navigateInApp("/backlog", setLocation);
    }
  }, [backlogIntelligenceEnabled, setLocation]);

  if (!backlogIntelligenceEnabled) {
    return null;
  }

  return <BacklogIssueDetail issueKey={issueKey} />;
}

function AppRouter() {
  const [location, setLocation] = useLocation();
  const [isInitializing, setIsInitializing] = useState(true);
  const workspaceSelection = useWorkspaceSelection();
  const { data: featureFlags } = useBacklogFeatureFlags();
  const backlogIntelligenceEnabled = featureFlags?.backlogIntelligenceEnabled ?? false;

  useEffect(() => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.onNavigate) {
      return;
    }

    return desktopApi.onNavigate((targetPath) => {
      navigateInApp(targetPath, setLocation);
    });
  }, [setLocation]);

  useEffect(() => {
    const isDesktopApp = Boolean(getDesktopApi());
    const hasValidDesktopWorkspace =
      !isDesktopApp || hasValidWorkspaceSelection(workspaceSelection);

    // Only redirect to onboarding if they haven't completed it AND they aren't already there
    if ((!hasCompletedOnboarding() || !hasValidDesktopWorkspace) && location !== '/onboarding') {
      navigateInApp('/onboarding', setLocation);
    }
    
    setIsInitializing(false);
  }, [location, setLocation, workspaceSelection]);

  if (isInitializing) {
    return null; // Or a very subtle loading state
  }

  return (
    <Suspense fallback={<AppLoadingScreen />}>
      <Switch>
        <Route path="/onboarding">{() => <Onboarding />}</Route>
        <Route path="/">{() => <Dashboard />}</Route>
        <Route path="/reviews">{() => <Reviews />}</Route>
        <Route path="/team">{() => <Dashboard />}</Route>
        <Route path="/repositories">{() => <LegacyRepositoriesRedirect />}</Route>
        <Route path="/projects">{() => <Projects />}</Route>
        <Route path="/agents">{() => <Agents />}</Route>
        <Route path="/terminals">{() => <Terminals />}</Route>
        <Route path="/activity">{() => <Activity />}</Route>
        <Route path="/backlog">{() => <Backlog />}</Route>
        <Route path="/backlog/issues/:issueKey">
          {(params) => (
            <BacklogIssueDetailGate
              backlogIntelligenceEnabled={backlogIntelligenceEnabled}
              issueKey={params.issueKey}
            />
          )}
        </Route>
        <Route path="/settings">{() => <Settings />}</Route>
        <Route>{() => <NotFound />}</Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  const locationHook = getDesktopApi() ? useHashLocation : undefined;
  const { preferences } = useAppPreferences();

  // Run synchronously during initial render to prevent light mode flash
  useState(() => {
    applyAppThemePreferences(getAppPreferences());
  });

  useEffect(() => {
    applyAppThemePreferences(preferences);

    if (preferences.themeMode === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      const handleChange = (e: MediaQueryListEvent) => {
        window.document.documentElement.classList.toggle("dark", e.matches);
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [preferences.themeMode, preferences.themePreset]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <WouterRouter hook={locationHook}>
          <AppRouter />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
