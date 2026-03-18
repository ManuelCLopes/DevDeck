import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Reviews from "@/pages/Reviews";
import Activity from "@/pages/Activity";
import Projects from "@/pages/Projects";
import Onboarding from "@/pages/Onboarding";
import { hasCompletedOnboarding } from "@/lib/onboarding-state";
import { getDesktopApi } from "@/lib/desktop";
import { useWorkspaceSelection } from "@/hooks/use-workspace-selection";
import {
  hasValidWorkspaceSelection,
} from "@/lib/workspace-selection";

function Router() {
  const [location, setLocation] = useLocation();
  const [isInitializing, setIsInitializing] = useState(true);
  const workspaceSelection = useWorkspaceSelection();

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
    <Switch>
      <Route path="/onboarding" component={Onboarding}/>
      <Route path="/" component={Dashboard}/>
      <Route path="/reviews" component={Reviews}/>
      <Route path="/projects" component={Projects}/>
      <Route path="/activity" component={Activity}/>
      <Route path="/settings" component={Settings}/>
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
