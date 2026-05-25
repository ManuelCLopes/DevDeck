import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ConflictedSegment {
  id: string;
  ourContent: string;
  theirContent: string;
  ourBranch: string;
  theirBranch: string;
}

export interface ConflictedFile {
  filePath: string;
  fileName: string;
  conflicts: ConflictedSegment[];
  rawContent: string;
}

export async function getConflictedFiles(repositoryPath: string): Promise<ConflictedFile[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--name-only", "--diff-filter=U"],
      { cwd: repositoryPath }
    );

    const files = stdout.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
    const result: ConflictedFile[] = [];

    for (const relativePath of files) {
      const fullPath = path.resolve(repositoryPath, relativePath);
      const content = await fs.readFile(fullPath, "utf-8");
      
      const conflicts = parseConflictSegments(content);
      result.push({
        filePath: relativePath,
        fileName: path.basename(relativePath),
        conflicts,
        rawContent: content,
      });
    }

    return result;
  } catch (error) {
    console.error("Failed to fetch conflicted files:", error);
    return [];
  }
}

function parseConflictSegments(content: string): ConflictedSegment[] {
  const lines = content.split(/\r?\n/);
  const conflicts: ConflictedSegment[] = [];
  
  let isInsideConflict = false;
  let ourContentLines: string[] = [];
  let theirContentLines: string[] = [];
  let ourBranch = "HEAD";
  let theirBranch = "Incoming";
  let conflictIndex = 0;
  
  let currentStage: "none" | "our" | "their" = "none";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith("<<<<<<<")) {
      isInsideConflict = true;
      currentStage = "our";
      ourBranch = line.slice(7).trim() || "HEAD";
      ourContentLines = [];
      theirContentLines = [];
    } else if (line.startsWith("=======")) {
      currentStage = "their";
    } else if (line.startsWith(">>>>>>>")) {
      theirBranch = line.slice(7).trim() || "Incoming Changes";
      conflicts.push({
        id: `conflict-${conflictIndex++}`,
        ourContent: ourContentLines.join("\n"),
        theirContent: theirContentLines.join("\n"),
        ourBranch,
        theirBranch,
      });
      isInsideConflict = false;
      currentStage = "none";
    } else {
      if (isInsideConflict) {
        if (currentStage === "our") {
          ourContentLines.push(line);
        } else if (currentStage === "their") {
          theirContentLines.push(line);
        }
      }
    }
  }

  return conflicts;
}

export async function resolveFileConflict(
  repositoryPath: string,
  filePath: string,
  selections: Record<string, "our" | "their" | "both" | "none">
): Promise<void> {
  const fullPath = path.resolve(repositoryPath, filePath);
  const content = await fs.readFile(fullPath, "utf-8");
  const lines = content.split(/\r?\n/);
  
  const resolvedLines: string[] = [];
  let isInsideConflict = false;
  let ourLines: string[] = [];
  let theirLines: string[] = [];
  let conflictIndex = 0;
  let currentStage: "none" | "our" | "their" = "none";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("<<<<<<<")) {
      isInsideConflict = true;
      currentStage = "our";
      ourLines = [];
      theirLines = [];
    } else if (line.startsWith("=======")) {
      currentStage = "their";
    } else if (line.startsWith(">>>>>>>")) {
      const conflictId = `conflict-${conflictIndex++}`;
      const selection = selections[conflictId] ?? "our";

      if (selection === "our") {
        resolvedLines.push(...ourLines);
      } else if (selection === "their") {
        resolvedLines.push(...theirLines);
      } else if (selection === "both") {
        resolvedLines.push(...ourLines, ...theirLines);
      }
      
      isInsideConflict = false;
      currentStage = "none";
    } else {
      if (isInsideConflict) {
        if (currentStage === "our") {
          ourLines.push(line);
        } else if (currentStage === "their") {
          theirLines.push(line);
        }
      } else {
        resolvedLines.push(line);
      }
    }
  }

  await fs.writeFile(fullPath, resolvedLines.join("\n"), "utf-8");
  await execFileAsync("git", ["add", filePath], { cwd: repositoryPath });
}
