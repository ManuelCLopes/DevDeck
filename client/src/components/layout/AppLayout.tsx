import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  Settings, 
  GitPullRequest, 
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
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: LayoutGrid, label: "Overview" },
    { href: "/reviews", icon: MessageSquare, label: "Code Reviews" },
    { href: "/projects", icon: FolderGit2, label: "Local Projects" },
    { href: "/activity", icon: Activity, label: "Activity Inbox" },
  ];

  return (
    <div className="flex h-screen bg-[#ececec] overflow-hidden text-[13px] font-sans">
      <div className="flex w-full h-full border border-black/10 rounded-lg shadow-2xl overflow-hidden bg-white/50 backdrop-blur-3xl m-0 sm:m-4 sm:rounded-xl">
        
        {/* Sidebar - macOS visual style */}
        <aside className="w-[240px] bg-[#f5f5f5]/80 border-r border-black/10 flex flex-col flex-shrink-0">
          {/* Traffic Lights & Titlebar Drag Area */}
          <div className="h-[52px] titlebar-drag-region flex items-center px-4 gap-2">
            <div className="mac-window-controls flex items-center gap-2 group">
              <div className="mac-btn mac-btn-close"></div>
              <div className="mac-btn mac-btn-minimize"></div>
              <div className="mac-btn mac-btn-maximize"></div>
            </div>
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
                    {item.label === "Code Reviews" && (
                      <span className="ml-auto text-[10px] font-bold bg-primary-foreground/20 px-1.5 rounded-sm">
                        3
                      </span>
                    )}
                    {item.label === "Activity Inbox" && (
                      <span className="ml-auto text-[10px] font-bold bg-primary-foreground/20 px-1.5 rounded-sm">
                        12
                      </span>
                    )}
                  </a>
                </Link>
              );
            })}
            
            <div className="mt-6 mb-2 px-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground/80">DIRECTORIES</p>
              <button className="text-muted-foreground/50 hover:text-foreground/80">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>
            <div className="space-y-[2px]">
              {["~/Developer/frontend", "~/Developer/backend", "~/Developer/mobile", "~/Developer/data"].map((team) => (
                <a key={team} href="#" className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-foreground/80 hover:bg-black/5 transition-colors group">
                  <HardDrive className="w-3.5 h-3.5 opacity-60 text-primary group-hover:opacity-100 transition-opacity" />
                  <span className="truncate">{team}</span>
                </a>
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
                <span className="text-[9px] text-muted-foreground leading-tight">Secure, zero telemetry</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-white shadow-[-1px_0_0_0_rgba(0,0,0,0.1)] z-10">
          
          {/* Top Titlebar / Toolbar */}
          <header className="h-[52px] border-b border-black/10 flex items-center justify-between px-4 titlebar-drag-region bg-white/90 backdrop-blur-md sticky top-0 z-50">
            <div className="flex items-center gap-4 no-drag">
              <div className="flex items-center gap-1">
                <button className="p-1 rounded text-muted-foreground hover:bg-secondary disabled:opacity-50">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button className="p-1 rounded text-muted-foreground hover:bg-secondary disabled:opacity-50" disabled>
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
              <h1 className="font-semibold text-sm">Oversight</h1>
            </div>

            <div className="flex items-center gap-3 no-drag">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input 
                  type="text" 
                  placeholder="Search projects, PRs..." 
                  className="w-full h-7 pl-8 pr-3 rounded-md bg-secondary/70 border border-black/5 focus:bg-background focus:border-primary/50 focus:ring-1 focus:ring-primary/50 outline-none text-xs transition-all placeholder:text-muted-foreground"
                />
              </div>
              
              <Link href="/activity">
                <a className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-secondary relative">
                  <Bell className="w-4 h-4" />
                  <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary border-2 border-background"></span>
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
  );
}