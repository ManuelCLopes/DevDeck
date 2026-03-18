import { useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { mockActivities } from "@/lib/mock-data";
import { formatDistanceToNow } from "date-fns";
import { 
  CheckCircle2, 
  MessageSquare, 
  AlertCircle,
  FolderGit2,
  Bell,
  XCircle,
  GitPullRequest
} from "lucide-react";

export default function Activity() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filteredActivities = mockActivities.filter(a => filter === 'all' || !a.read);

  const ActivityIcon = ({ type }: { type: string }) => {
    switch (type) {
      case 'build_failed':
        return <XCircle className="w-4 h-4 text-chart-3" />;
      case 'review_requested':
        return <GitPullRequest className="w-4 h-4 text-primary" />;
      case 'mention':
        return <MessageSquare className="w-4 h-4 text-chart-4" />;
      case 'pr_approved':
        return <CheckCircle2 className="w-4 h-4 text-chart-1" />;
      case 'repo_cloned':
        return <FolderGit2 className="w-4 h-4 text-muted-foreground" />;
      default:
        return <Bell className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1 text-foreground">Activity Inbox</h1>
            <p className="text-muted-foreground text-sm">Notifications, alerts, and mentions across repositories tracked by DevDeck.</p>
          </div>
          
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-border/60 hover:bg-black/5 shadow-sm transition-colors">
              Mark all as read
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 border-b border-border/40 pb-4">
          <button 
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              filter === 'all' 
                ? 'bg-foreground text-background border-foreground shadow-sm' 
                : 'bg-white text-muted-foreground hover:text-foreground border-border/60 hover:border-black/20'
            }`}
          >
            All Activity
          </button>
          <button 
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              filter === 'unread' 
                ? 'bg-foreground text-background border-foreground shadow-sm' 
                : 'bg-white text-muted-foreground hover:text-foreground border-border/60 hover:border-black/20'
            }`}
          >
            Unread <span className="ml-1 opacity-80">({mockActivities.filter(a => !a.read).length})</span>
          </button>
        </div>

        {/* Activity List */}
        <div className="bg-white border border-border/60 rounded-xl shadow-sm overflow-hidden">
          <div className="flex flex-col">
            {filteredActivities.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-3">
                <div className="p-3 bg-secondary/50 rounded-full">
                  <CheckCircle2 className="w-6 h-6 text-chart-1 opacity-80" />
                </div>
                <p>Inbox zero. You're all caught up!</p>
              </div>
            ) : (
              filteredActivities.map((activity) => (
                <div 
                  key={activity.id} 
                  className={`group flex items-start gap-4 p-4 border-b border-border/40 last:border-0 hover:bg-black/[0.02] transition-colors cursor-pointer relative ${
                    !activity.read ? 'bg-primary/[0.02]' : ''
                  }`}
                >
                  {/* Unread indicator */}
                  {!activity.read && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />
                  )}
                  
                  <div className={`mt-0.5 p-2 rounded-lg border shadow-sm ${
                    !activity.read ? 'bg-white border-primary/20' : 'bg-secondary/50 border-border/50'
                  }`}>
                    <ActivityIcon type={activity.type} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <p className={`text-[13px] font-semibold ${!activity.read ? 'text-foreground' : 'text-foreground/80'}`}>
                        {activity.title}
                      </p>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                    
                    <p className="text-[13px] text-muted-foreground line-clamp-2 mb-2">
                      {activity.description}
                    </p>
                    
                    <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
                      <span className="font-mono bg-secondary/50 px-1.5 py-0.5 rounded border border-border/50 text-foreground/80">
                        {activity.repo}
                      </span>
                      {activity.author && (
                        <span>by {activity.author}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
