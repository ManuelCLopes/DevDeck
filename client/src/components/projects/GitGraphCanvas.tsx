import { useEffect, useState, useMemo } from "react";
import { GitBranch, User, Calendar, MessageSquare, RefreshCw } from "lucide-react";
import { getDesktopApi } from "@/lib/desktop";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import * as HoverCard from "@radix-ui/react-hover-card";

interface GitCommitNode {
  hash: string;
  parents: string[];
  refs: string[];
  authorName: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
}

interface GitGraphCanvasProps {
  repositoryPath: string;
}

const TRACK_SPACING = 16;
const NODE_SPACING = 36;
const PADDING_LEFT = 24;
const PADDING_TOP = 20;

export default function GitGraphCanvas({ repositoryPath }: GitGraphCanvasProps) {
  const [commits, setCommits] = useState<GitCommitNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const desktopApi = getDesktopApi();

  useEffect(() => {
    let active = true;
    async function loadGraph() {
      if (!desktopApi) return;
      setLoading(true);
      setError(null);
      try {
        const data = await desktopApi.getGitGraph({
          repositoryPath,
          limit: 150,
        });
        if (active) {
          setCommits(data);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load branch history");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void loadGraph();
    return () => {
      active = false;
    };
  }, [repositoryPath, refreshTrigger, desktopApi]);

  // Compute Layout Positions
  const { nodes, paths, totalTracks, svgHeight } = useMemo(() => {
    if (commits.length === 0) {
      return { nodes: [], paths: [], totalTracks: 0, svgHeight: 0 };
    }

    const commitMap = new Map<string, GitCommitNode>();
    commits.forEach((c) => commitMap.set(c.hash, c));

    // Track active lanes (each lane holds a commit hash)
    const activeLanes: (string | null)[] = [];
    const commitLanes = new Map<string, number>();

    // Step 1: Assign lanes to commits
    commits.forEach((commit) => {
      // Find if this commit is already in a lane (assigned by its child)
      let laneIndex = activeLanes.indexOf(commit.hash);
      
      if (laneIndex === -1) {
        // Find first empty lane or push new
        laneIndex = activeLanes.findIndex((lh) => lh === null);
        if (laneIndex === -1) {
          laneIndex = activeLanes.length;
          activeLanes.push(commit.hash);
        } else {
          activeLanes[laneIndex] = commit.hash;
        }
      }

      commitLanes.set(commit.hash, laneIndex);

      // Setup lanes for parents
      if (commit.parents.length > 0) {
        // Direct parent takes the current lane
        activeLanes[laneIndex] = commit.parents[0];

        // Additional parents (merges) get new lanes
        for (let p = 1; p < commit.parents.length; p++) {
          const parentHash = commit.parents[p];
          let parentLane = activeLanes.indexOf(parentHash);
          if (parentLane === -1) {
            parentLane = activeLanes.findIndex((lh) => lh === null);
            if (parentLane === -1) {
              activeLanes.push(parentHash);
            } else {
              activeLanes[parentLane] = parentHash;
            }
          }
        }
      } else {
        // No parents, release the lane
        activeLanes[laneIndex] = null;
      }
    });

    // Generate Layout Positions
    const layoutNodes = commits.map((commit, index) => {
      const lane = commitLanes.get(commit.hash) ?? 0;
      const x = PADDING_LEFT + lane * TRACK_SPACING;
      const y = PADDING_TOP + index * NODE_SPACING;
      
      // Dynamic colors based on track index
      const hue = (lane * 137.5) % 360; // Golden angle distribution
      const color = `hsl(${hue}, 85%, 60%)`;

      return {
        ...commit,
        x,
        y,
        lane,
        color,
        index,
      };
    });

    const nodeMap = new Map<string, typeof layoutNodes[0]>();
    layoutNodes.forEach((n) => nodeMap.set(n.hash, n));

    // Step 2: Generate branch paths using smooth bezier curves
    const layoutPaths: { d: string; color: string; hash: string }[] = [];
    
    layoutNodes.forEach((node) => {
      node.parents.forEach((parentHash) => {
        const parentNode = nodeMap.get(parentHash);
        if (!parentNode) return;

        const x1 = node.x;
        const y1 = node.y;
        const x2 = parentNode.x;
        const y2 = parentNode.y;

        const midY = (y1 + y2) / 2;
        // Cubic Bezier curve for highly organic visual transitions
        const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
        
        layoutPaths.push({
          d,
          color: node.lane > parentNode.lane ? node.color : parentNode.color,
          hash: `${node.hash}-${parentNode.hash}`,
        });
      });
    });

    const maxTrack = Math.max(...Array.from(commitLanes.values()), 0);
    const svgHeight = PADDING_TOP + commits.length * NODE_SPACING + 20;

    return {
      nodes: layoutNodes,
      paths: layoutPaths,
      totalTracks: maxTrack + 1,
      svgHeight,
    };
  }, [commits]);

  const sidebarWidth = totalTracks * TRACK_SPACING + PADDING_LEFT + 20;

  if (loading && commits.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
        Scoping topological branch layout...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 border border-dashed border-red-500/20 rounded-xl bg-red-500/5 text-center text-xs text-red-600 dark:text-red-400">
        <p className="font-semibold">Git commit tree failed</p>
        <p className="mt-1 opacity-80">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshTrigger((prev) => prev + 1)}
          className="mt-3 h-8 border-red-500/20 hover:bg-red-500/10"
        >
          Retry Load
        </Button>
      </div>
    );
  }

  return (
    <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden bg-white/50 dark:bg-[#151517]/50 backdrop-blur-md shadow-lg flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5 bg-neutral-100/40 dark:bg-neutral-900/40 shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold text-foreground">Interactive Repository Commit Graph</span>
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Live local history
          </span>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 border-black/10 dark:border-white/10"
          onClick={() => setRefreshTrigger((prev) => prev + 1)}
          title="Refresh Git Graph"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="relative flex w-full" style={{ height: svgHeight }}>
          {/* SVG Graph Overlay */}
          <svg
            className="absolute left-0 top-0 pointer-events-none z-10"
            style={{ width: sidebarWidth, height: svgHeight }}
          >
            {/* Draw bezier connectors */}
            {paths.map((path) => (
              <path
                key={path.hash}
                d={path.d}
                stroke={path.color}
                strokeWidth={2}
                fill="none"
                opacity={0.65}
              />
            ))}

            {/* Draw glowing commit nodes */}
            {nodes.map((node) => (
              <g key={node.hash}>
                {/* Outer Glow */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={5.5}
                  fill={node.color}
                  opacity={0.3}
                />
                {/* Core Dot */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={3.5}
                  fill={node.color}
                  stroke="#ffffff"
                  strokeWidth={1}
                />
              </g>
            ))}
          </svg>

          {/* Text rows synced with SVG coordinates */}
          <div className="w-full relative z-20 flex flex-col">
            {nodes.map((node) => {
              const dateStr = formatDistanceToNow(new Date(node.timestamp), { addSuffix: true });
              
              // Filter out HEAD, ref pointers for clean highlights
              const primaryRefs = node.refs.filter(r => !r.includes("origin/HEAD"));

              return (
                <HoverCard.Root key={node.hash} openDelay={200} closeDelay={100}>
                  <HoverCard.Trigger asChild>
                    <div
                      className="flex items-center hover:bg-primary/5 dark:hover:bg-primary/[0.02] cursor-pointer transition-colors relative"
                      style={{
                        height: NODE_SPACING,
                        paddingLeft: sidebarWidth,
                      }}
                    >
                      <div className="flex items-center gap-3 pr-4 min-w-0 w-full text-left">
                        {/* Ref badges */}
                        {primaryRefs.length > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {primaryRefs.map((ref) => {
                              const isHead = ref.includes("HEAD") || ref.startsWith("HEAD ->");
                              const isRemote = ref.startsWith("origin/");
                              
                              return (
                                <span
                                  key={ref}
                                  className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded-md border tracking-wide ${
                                    isHead
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                      : isRemote
                                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                                      : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                                  }`}
                                >
                                  {ref}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        <span className="text-[11.5px] font-medium text-foreground truncate min-w-0 flex-1">
                          {node.subject}
                        </span>

                        <span className="text-[10px] text-muted-foreground shrink-0 select-none">
                          {dateStr}
                        </span>

                        <span className="text-[10.5px] font-mono text-muted-foreground bg-neutral-100 dark:bg-neutral-900 border border-black/5 dark:border-white/5 px-1.5 py-0.5 rounded-md shrink-0 select-none font-bold">
                          {node.hash.slice(0, 7)}
                        </span>
                      </div>
                    </div>
                  </HoverCard.Trigger>

                  <HoverCard.Portal>
                    <HoverCard.Content
                      side="bottom"
                      align="start"
                      sideOffset={5}
                      className="z-[100] w-80 bg-white dark:bg-[#18181c] border border-black/10 dark:border-white/10 p-4 rounded-xl shadow-2xl space-y-3.5 backdrop-blur-md animate-in fade-in duration-200"
                    >
                      <div className="flex items-start justify-between border-b border-black/5 dark:border-white/5 pb-2">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-muted-foreground font-mono uppercase tracking-wider">
                            Commit Details
                          </span>
                          <h4 className="text-[10.5px] font-mono text-primary font-bold">
                            {node.hash}
                          </h4>
                        </div>
                      </div>

                      <div className="space-y-2 text-[11px]">
                        <div className="flex items-start gap-2">
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-foreground font-semibold leading-normal">
                            {node.subject}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Author:</span>
                          <span className="text-foreground font-medium">
                            {node.authorName} &lt;{node.authorEmail}&gt;
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Committed:</span>
                          <span className="text-foreground font-medium">
                            {new Date(node.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </HoverCard.Content>
                  </HoverCard.Portal>
                </HoverCard.Root>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
