import { fetchGitHubPullRequestDiff } from "./github-api";
import { readStoredGitHubToken } from "./github-auth";

export interface AIConfig {
  provider: "ollama" | "gemini" | "anthropic";
  ollamaHost?: string;
  ollamaModel?: string;
  geminiKey?: string;
  anthropicKey?: string;
}

export interface AICompletionRequest {
  diff: string;
  action: "changelog" | "security" | "draft-response";
  config: AIConfig;
}

function truncateDiff(diffText: string, maxCharacters: number = 24000): string {
  if (!diffText) return "";
  if (diffText.length <= maxCharacters) return diffText;
  return (
    diffText.slice(0, maxCharacters) +
    "\n\n... [Diff truncated to fit context limits] ..."
  );
}

function buildPrompt(action: AICompletionRequest["action"], diff: string): string {
  const truncatedDiff = truncateDiff(diff);

  switch (action) {
    case "changelog":
      return `You are a professional software architect. Generate a concise, beautifully formatted Markdown changelog summarizing the changes introduced in this Git diff.
Focus on logical sections (e.g., Features, Bug Fixes, Infrastructure) and their high-level impact rather than listing dry file paths. Keep the tone objective and professional.

Git Diff:
\`\`\`diff
${truncatedDiff}
\`\`\``;

    case "security":
      return `You are an expert security auditor and code reviewer. Analyze this Git diff for:
1. Hardcoded credentials, secret keys, or API tokens.
2. Security vulnerabilities (SQLi, XSS, unvalidated inputs, auth bypass, etc.).
3. Code quality smells, syntax bugs, or performance issues.

Generate a constructive Markdown report outlining findings grouped by severity (e.g., CRITICAL, WARNING, INFO) with concrete recommendations for code improvements.

Git Diff:
\`\`\`diff
${truncatedDiff}
\`\`\``;

    case "draft-response":
      return `You are a friendly, highly constructive peer developer reviewing a teammate's pull request. Based on this Git diff, write a collaborative and professional GitHub review comment/response.
If the diff looks clean, draft a supportive approval response (mentioning specific areas that look great). If you notice minor bugs or have suggestions, list them politely. Keep it brief and markdown-friendly.

Git Diff:
\`\`\`diff
${truncatedDiff}
\`\`\``;

    default:
      return `Summarize the following Git diff:
${truncatedDiff}`;
  }
}

export async function getPullRequestDiff(payload: {
  repositorySlug: string;
  pullRequestNumber: number;
}): Promise<string> {
  const token = await readStoredGitHubToken();
  return fetchGitHubPullRequestDiff(
    payload.repositorySlug,
    payload.pullRequestNumber,
    token,
  );
}

export async function generateAICompletion(request: AICompletionRequest): Promise<string> {
  const { action, diff, config } = request;
  const prompt = buildPrompt(action, diff);

  switch (config.provider) {
    case "ollama":
      return callOllama(prompt, config);
    case "gemini":
      return callGemini(prompt, config);
    case "anthropic":
      return callAnthropic(prompt, config);
    default:
      throw new Error(`Unsupported AI model provider: ${config.provider}`);
  }
}

async function callOllama(prompt: string, config: AIConfig): Promise<string> {
  const host = (config.ollamaHost || "http://localhost:11434").replace(/\/$/, "");
  const model = config.ollamaModel || "llama3";
  const url = `${host}/api/generate`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${errText || "Unknown error"}`);
  }

  const data = (await response.json()) as { response: string };
  return data.response;
}

async function callGemini(prompt: string, config: AIConfig): Promise<string> {
  const key = config.geminiKey;
  if (!key) {
    throw new Error("Google Gemini API Key is missing. Please configure it in preferences.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText || "Unknown error"}`);
  }

  interface GeminiPart {
    text: string;
  }
  interface GeminiCandidate {
    content: {
      parts: GeminiPart[];
    };
  }
  interface GeminiResponse {
    candidates?: GeminiCandidate[];
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty response returned from Gemini API.");
  }

  return text;
}

async function callAnthropic(prompt: string, config: AIConfig): Promise<string> {
  const key = config.anthropicKey;
  if (!key) {
    throw new Error("Anthropic API Key is missing. Please configure it in preferences.");
  }

  const url = "https://api.anthropic.com/v1/messages";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errText || "Unknown error"}`);
  }

  interface AnthropicContentPart {
    type: "text";
    text: string;
  }
  interface AnthropicResponse {
    content: AnthropicContentPart[];
  }

  const data = (await response.json()) as AnthropicResponse;
  const text = data.content?.[0]?.text;
  if (!text) {
    throw new Error("Empty response returned from Anthropic API.");
  }

  return text;
}
