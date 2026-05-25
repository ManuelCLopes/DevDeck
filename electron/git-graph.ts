import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface GitCommitNode {
  hash: string;
  parents: string[];
  refs: string[];
  authorName: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
}

export async function getGitCommitGraph(repositoryPath: string, limit = 250): Promise<GitCommitNode[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "log",
        "--all",
        `--max-count=${limit}`,
        "--pretty=format:%H|%P|%d|%an|%ae|%at|%s",
      ],
      { cwd: repositoryPath, maxBuffer: 1024 * 1024 * 4 }
    );

    const commits: GitCommitNode[] = [];
    const lines = stdout.split(/\r?\n/);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const parts = trimmed.split("|");
      if (parts.length < 7) continue;

      const hash = parts[0];
      const parents = parts[1] ? parts[1].split(" ").filter(Boolean) : [];
      
      // Parsed refs like "(HEAD -> main, origin/main, origin/HEAD)" -> ["HEAD -> main", "origin/main"]
      let refs: string[] = [];
      const rawRefs = parts[2].trim();
      if (rawRefs) {
        const cleaned = rawRefs.replace(/^\((.*)\)$/, "$1");
        refs = cleaned.split(",").map(r => r.trim()).filter(Boolean);
      }

      const authorName = parts[3];
      const authorEmail = parts[4];
      const timestamp = parseInt(parts[5], 10) * 1000; // milliseconds
      const subject = parts.slice(6).join("|");

      commits.push({
        hash,
        parents,
        refs,
        authorName,
        authorEmail,
        timestamp,
        subject,
      });
    }

    return commits;
  } catch (error) {
    console.error("Failed to read git graph log:", error);
    return [];
  }
}
