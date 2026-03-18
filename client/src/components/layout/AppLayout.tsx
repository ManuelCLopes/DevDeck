import { ReactNode, startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import AddProjectsDialog from "@/components/workspace/AddProjectsDialog";
import WindowControls from "@/components/layout/WindowControls";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { useAppPreferences } from "@/lib/app-preferences";
import {
  goBackInApp,
  goForwardInApp,
  useAppNavigation,
} from "@/lib/app-navigation";
import { useWorkspaceAlerts } from "@/hooks/use-workspace-alerts";
import { getOpenAddProjectsDialogEvent } from "@/lib/project-import-events";
import { getMonitoredProjects, getWorkspaceSelection } from "@/lib/workspace-selection";
import { 
  Settings, 
  Activity, 
  FolderGit2,
  Bell,
  Search,
  LayoutGrid,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  MessageSquare
} from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const [isAddProjectsOpen, setIsAddProjectsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const monitoredProjects = getMonitoredProjects(getWorkspaceSelection());
  const selectedProjectId = new URLSearchParams(search).get("project");
  const { data: snapshot } = useWorkspaceSnapshot();
  const { preferences } = useAppPreferences();
  const reviewCount = snapshot?.pullRequests.length ?? 0;
  const activityCount = snapshot?.activities.length ?? 0;
  const routeKey = `${location}${search}`;
  const { canGoBack, canGoForward } = useAppNavigation(routeKey);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  useWorkspaceAlerts(snapshot, preferences);

  const searchResults = useMemo(() => {
    if (!snapshot) {
      return {
        activities: [],
        projects: [],
        pullRequests: [],
      };
    }

    const projectResults = snapshot.projects
      .filter((project) =>
        deferredSearchQuery.length === 0
          ? true
          : [
              project.name,
              project.localPath,
              project.currentBranch,
              project.defaultBranch,
              project.language,
            ]
              .join(" ")
              .toLowerCase()
              .includes(deferredSearchQuery),
      )
      .slice(0, 6);
    const pullRequestResults = snapshot.pullRequests
      .filter((pullRequest) =>
        deferredSearchQuery.length === 0
          ? true
          : [
              pullRequest.title,
              pullRequest.repo,
              pullRequest.headBranch,
              pullRequest.baseBranch,
              pullRequest.author ?? "",
              ...pullRequest.reviewerLogins,
            ]
              .join(" ")
              .toLowerCase()
              .includes(deferredSearchQuery),
      )
      .slice(0, 6);
    const activityResults = snapshot.activities
      .filter((activity) =>
        deferredSearchQuery.length === 0
          ? true
          : [
              activity.title,
              activity.description,
              activity.repo,
              activity.author ?? "",
            ]
              .join(" ")
              .toLowerCase()
              .includes(deferredSearchQuery),
      )
      .slice(0, 6);

    return {
      activities: activityResults,
      projects: projectResults,
      pullRequests: pullRequestResults,
    };
  }, [deferredSearchQuery, snapshot]);

  const navItems = [
    { href: "/", icon: LayoutGrid, label: "Overview" },
    { href: "/reviews", icon: MessageSquare, label: "Pull Requests" },
    { href: "/projects", icon: FolderGit2, label: "Local Projects" },
    { href: "/activity", icon: Activity, label: "Activity Inbox" },
  ];

  useEffect(() => {
    const eventName = getOpenAddProjectsDialogEvent();
    const handleOpen = () => {
      setIsAddProjectsOpen(true);
    };

    window.addEventListener(eventName, handleOpen);
    return () => window.removeEventListener(eventName, handleOpen);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNavigate = (targetPath: string) => {
    startTransition(() => {
      setLocation(targetPath);
      setIsSearchOpen(false);
      setSearchQuery("");
    });
  };

  return (
    <>
      <div className="flex h-screen bg-[#ececec] overflow-hidden text-[13px] font-sans">
      <div className="flex w-full h-full border border-black/10 rounded-lg shadow-2xl overflow-hidden bg-white/50 backdrop-blur-3xl m-0 sm:m-4 sm:rounded-xl">
        
        {/* Sidebar - macOS visual style */}
        <aside className="w-[240px] bg-[#f5f5f5]/80 border-r border-black/10 flex flex-col flex-shrink-0">
          {/* Traffic Lights & Titlebar Drag Area */}
          <div className="h-[52px] titlebar-drag-region flex items-center px-4 gap-2">
            <WindowControls />
          </div>
          
          <nav className="flex-1 px-3 pb-4 space-y-[2px] overflow-y-auto">
            <div className="mb-2 mt-2 px-2">
              <p className="text-[11px] font-semibold text-muted-foreground/80">WORKSPACE</p>
            </div>
            {navItems.map((item) => {
              const active = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <a className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-all ${
                    active 
                      ? "bg-primary text-primary-foreground font-medium shadow-sm" 
                      : "text-foreground/80 hover:bg-black/5"
                  }`}>
                    <item.icon className={`w-4 h-4 ${active ? "opacity-100" : "opacity-70 text-primary"}`} />
                    {item.label}
                    {item.label === "Pull Requests" && (
                      <span className="ml-auto text-[10px] font-bold bg-primary-foreground/20 px-1.5 rounded-sm">
                        {reviewCount}
                      </span>
                    )}
                    {item.label === "Activity Inbox" && (
                      <span className="ml-auto text-[10px] font-bold bg-primary-foreground/20 px-1.5 rounded-sm">
                        {activityCount}
                      </span>
                    )}
                  </a>
                </Link>
              );
            })}
            
            <div className="mt-6 mb-2 px-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground/80">PROJECTS</p>
              <button
                type="button"
                onClick={() => setIsAddProjectsOpen(true)}
                className="text-muted-foreground/50 hover:text-foreground/80 no-drag"
              >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>
            <div className="space-y-[2px]">
              {monitoredProjects.map((project) => (
                <Link
                  key={project.localPath ?? project.id}
                  href={`/?project=${encodeURIComponent(project.id)}`}
                >
                  <a
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors group ${
                      selectedProjectId === project.id && location === "/"
                        ? "bg-black/7 text-foreground font-medium"
                        : "text-foreground/80 hover:bg-black/5"
                    }`}
                    title={project.localPath ?? project.name}
                  >
                    <HardDrive className="w-3.5 h-3.5 opacity-60 text-primary group-hover:opacity-100 transition-opacity" />
                    <span className="truncate">{project.name}</span>
                  </a>
                </Link>
              ))}
            </div>
          </nav>

          {/* Local Status Indicator */}
          <div className="p-3">
            <Link href="/settings">
              <a className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors ${
                location === '/settings' 
                  ? "bg-primary text-primary-foreground font-medium shadow-sm" 
                  : "text-foreground/80 hover:bg-black/5"
              }`}>
                <Settings className="w-4 h-4 opacity-70" />
                Preferences
              </a>
            </Link>
            
            <div className="mt-3 px-2 py-2 flex items-center gap-2 bg-black/5 rounded-md">
              <ShieldCheck className="w-3.5 h-3.5 text-chart-1" />
              <div className="flex flex-col">
                <span className="text-[10px] font-medium leading-tight">Local Execution</span>
                <span className="text-[9px] text-muted-foreground leading-tight">Private, local-first by design</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#fbfbfb] shadow-[-1px_0_0_0_rgba(0,0,0,0.1)] z-10">
          
          {/* Top Titlebar / Toolbar */}
          <header className="h-[52px] border-b border-black/10 flex items-center justify-between px-4 titlebar-drag-region bg-white/60 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-4 no-drag">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goBackInApp(setLocation)}
                  disabled={!canGoBack}
                  className="p-1 rounded text-muted-foreground hover:bg-secondary disabled:opacity-50 disabled:hover:bg-transparent"
                  aria-label="Go back"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => goForwardInApp(setLocation)}
                  disabled={!canGoForward}
                  className="p-1 rounded text-muted-foreground hover:bg-secondary disabled:opacity-50 disabled:hover:bg-transparent"
                  aria-label="Go forward"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <h1 className="font-semibold text-sm">DevDeck</h1>
            </div>

            <div className="flex items-center gap-3 no-drag">
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="relative w-64 h-7 pl-8 pr-12 rounded-md bg-secondary/70 border border-black/5 hover:bg-background text-left focus:bg-background focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none text-xs transition-all text-muted-foreground"
              >
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <span>Search projects, PRs, activity...</span>
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground/80">
                  {typeof navigator !== "undefined" && navigator.platform.includes("Mac")
                    ? "⌘K"
                    : "Ctrl K"}
                </span>
              </button>
              
              <Link href="/activity">
                <a className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary relative">
                  <Bell className="w-4 h-4" />
                  {activityCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary border-2 border-background"></span>
                  )}
                </a>
              </Link>
            </div>
          </header>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-auto bg-white p-6 md:p-8 no-drag">
            <div className="max-w-[1200px] mx-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
      
      <style>{`
        .no-drag {
          -webkit-app-region: no-drag;
        }
      `}</style>
      </div>
      <AddProjectsDialog open={isAddProjectsOpen} onOpenChange={setIsAddProjectsOpen} />
      <CommandDialog
        open={isSearchOpen}
        onOpenChange={(open) => {
          setIsSearchOpen(open);
          if (!open) {
            setSearchQuery("");
          }
        }}
      >
        <CommandInput
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search projects, pull requests, and activity..."
        />
        <CommandList>
          <CommandEmpty>No matching results.</CommandEmpty>
          <CommandGroup heading="Projects">
            {searchResults.projects.map((project) => (
              <CommandItem
                key={project.id}
                value={`${project.name} ${project.localPath} ${project.currentBranch}`}
                onSelect={() =>
                  handleNavigate(`/?project=${encodeURIComponent(project.id)}`)
                }
              >
                <HardDrive className="w-4 h-4 text-primary" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{project.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {project.localPath}
                  </span>
                </div>
                <CommandShortcut>{project.currentBranch}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Pull Requests">
            {searchResults.pullRequests.map((pullRequest) => (
              <CommandItem
                key={pullRequest.id}
                value={`${pullRequest.title} ${pullRequest.repo} ${pullRequest.headBranch} ${pullRequest.baseBranch}`}
                onSelect={() =>
                  handleNavigate(`/reviews?pr=${encodeURIComponent(pullRequest.id)}`)
                }
              >
                <MessageSquare className="w-4 h-4 text-primary" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">
                    #{pullRequest.number} {pullRequest.title}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {pullRequest.repo} · {pullRequest.headBranch} into {pullRequest.baseBranch}
                  </span>
                </div>
                <CommandShortcut>{pullRequest.repo}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Activity">
            {searchResults.activities.map((activity) => (
              <CommandItem
                key={activity.id}
                value={`${activity.title} ${activity.description} ${activity.repo}`}
                onSelect={() => handleNavigate("/activity")}
              >
                <Bell className="w-4 h-4 text-primary" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{activity.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {activity.repo} · {activity.description}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
