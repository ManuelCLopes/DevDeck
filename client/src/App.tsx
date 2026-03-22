import { Router as WouterRouter, Switch, Route, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy, useEffect, useState } from "react";
import { hasCompletedOnboarding } from "@/lib/onboarding-state";
import { getDesktopApi } from "@/lib/desktop";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import {
  hasValidWorkspaceSelection,
} from "@/lib/workspace-selection";

const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Settings = lazy(() => import("@/pages/Settings"));
const Reviews = lazy(() => import("@/pages/Reviews"));
const Activity = lazy(() => import("@/pages/Activity"));
const Projects = lazy(() => import("@/pages/Projects"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));

function AppLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#ececec] p-4 text-[13px] font-sans">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white/90 px-6 py-8 text-center shadow-xl backdrop-blur-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          DevDeck
        </p>
        <p className="mt-3 text-sm text-foreground">Loading workspace shell...</p>
      </div>
    </div>
  );
}

function AppRouter() {
  const [location, setLocation] = useLocation();
  const [isInitializing, setIsInitializing] = useState(true);
  const workspaceSelection = useWorkspaceSelection();

  useEffect(() => {
    const desktopApi = getDesktopApi();
    if (!desktopApi?.onNavigate) {
      return;
    }

    return desktopApi.onNavigate((targetPath) => {
      setLocation(targetPath);
    });
  }, [setLocation]);

  useEffect(() => {
    const isDesktopApp = Boolean(getDesktopApi());
    const hasValidDesktopWorkspace =
      !isDesktopApp || hasValidWorkspaceSelection(workspaceSelection);

    // Only redirect to onboarding if they haven't completed it AND they aren't already there
    if ((!hasCompletedOnboarding() || !hasValidDesktopWorkspace) && location !== '/onboarding') {
      setLocation('/onboarding');
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
        <Route path="/projects">{() => <Projects />}</Route>
        <Route path="/activity">{() => <Activity />}</Route>
        <Route path="/settings">{() => <Settings />}</Route>
        <Route>{() => <NotFound />}</Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  const locationHook = getDesktopApi() ? useHashLocation : undefined;

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
