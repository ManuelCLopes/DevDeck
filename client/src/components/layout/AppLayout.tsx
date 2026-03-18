import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Settings, 
  GitPullRequest, 
  Activity, 
  FolderGit2,
  Bell,
  Search
} from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: "Overview" },
    { href: "/projects", icon: FolderGit2, label: "Projects" },
    { href: "/activity", icon: Activity, label: "Activity" },
    { href: "/prs", icon: GitPullRequest, label: "Pull Requests" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-border/50 bg-card/30 backdrop-blur-sm flex flex-col md:h-screen sticky top-0 z-40">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold font-mono text-sm">
            OV
          </div>
          <span className="font-semibold tracking-tight">Oversight</span>
        </div>
        
        <nav className="flex-1 px-4 pb-4 space-y-1 overflow-y-auto">
          <div className="mb-4 mt-2 px-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">VIEWS</p>
          </div>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <a className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                location === item.href 
                  ? "bg-secondary text-secondary-foreground font-medium" 
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              }`}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </a>
            </Link>
          ))}
          
          <div className="mt-8 mb-4 px-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">TEAMS</p>
          </div>
          <div className="space-y-1">
            {["Frontend", "Backend", "Mobile", "Data"].map((team) => (
              <a key={team} href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors">
                <div className="w-2 h-2 rounded-full bg-border" />
                {team}
              </a>
            ))}
          </div>
        </nav>

        <div className="p-4 border-t border-border/50">
          <Link href="/settings">
            <a className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              location === '/settings' 
                ? "bg-secondary text-secondary-foreground font-medium" 
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            }`}>
              <Settings className="w-4 h-4" />
              Settings
            </a>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border/50 flex items-center justify-between px-6 lg:px-10 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-md hidden sm:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search projects, PRs, or teams..." 
                className="w-full h-9 pl-9 pr-4 rounded-md bg-secondary/50 border border-transparent focus:bg-background focus:border-border focus:ring-1 focus:ring-ring outline-none text-sm transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-secondary/50">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive border-2 border-background"></span>
            </button>
            <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-medium">
              ME
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-muted/10">
          {children}
        </div>
      </main>
    </div>
  );
}