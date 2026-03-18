import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getDesktopApi } from "@/lib/desktop";
import {
  Copy,
  ExternalLink,
  Github,
  KeyRound,
  LoaderCircle,
} from "lucide-react";

interface GitHubConnectDialogProps {
  onConnected: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

interface GitHubAuthCapabilities {
  deviceFlowAvailable: boolean;
}

interface GitHubDeviceAuthSession {
  deviceCode: string;
  expiresAt: string;
  intervalSeconds: number;
  userCode: string;
  verificationUri: string;
}

export default function GitHubConnectDialog({
  onConnected,
  onOpenChange,
  open,
}: GitHubConnectDialogProps) {
  const desktopApi = getDesktopApi();
  const [capabilities, setCapabilities] = useState<GitHubAuthCapabilities>({
    deviceFlowAvailable: false,
  });
  const [deviceSession, setDeviceSession] = useState<GitHubDeviceAuthSession | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPollingDeviceFlow, setIsPollingDeviceFlow] = useState(false);
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [isStartingDeviceFlow, setIsStartingDeviceFlow] = useState(false);
  const [tokenValue, setTokenValue] = useState("");

  useEffect(() => {
    if (open) {
      return;
    }

    setCapabilities({ deviceFlowAvailable: false });
    setDeviceSession(null);
    setErrorMessage(null);
    setIsPollingDeviceFlow(false);
    setIsSavingToken(false);
    setIsStartingDeviceFlow(false);
    setTokenValue("");
  }, [open]);

  useEffect(() => {
    if (!open || !desktopApi?.getGitHubAuthCapabilities) {
      return;
    }

    void desktopApi.getGitHubAuthCapabilities().then(setCapabilities).catch(() => {
      setCapabilities({ deviceFlowAvailable: false });
    });
  }, [desktopApi, open]);

  useEffect(() => {
    if (!open || !deviceSession || !desktopApi?.pollGitHubDeviceAuth) {
      return;
    }

    let isCancelled = false;
    let timeoutId: number | null = null;

    const pollForCompletion = async (delaySeconds: number) => {
      timeoutId = window.setTimeout(async () => {
        try {
          const result = await desktopApi.pollGitHubDeviceAuth(deviceSession.deviceCode);
          if (isCancelled) {
            return;
          }

          if (result.status === "pending") {
            setErrorMessage(null);
            void pollForCompletion(result.intervalSeconds ?? delaySeconds);
            return;
          }

          setIsPollingDeviceFlow(false);

          if (result.status === "complete") {
            setDeviceSession(null);
            onConnected();
            onOpenChange(false);
            return;
          }

          setErrorMessage(result.message);
        } catch {
          if (!isCancelled) {
            setIsPollingDeviceFlow(false);
            setErrorMessage("GitHub sign-in could not be completed.");
          }
        }
      }, delaySeconds * 1000);
    };

    setIsPollingDeviceFlow(true);
    setErrorMessage(null);
    void pollForCompletion(deviceSession.intervalSeconds);

    return () => {
      isCancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [desktopApi, deviceSession, onConnected, onOpenChange, open]);

  const handleCopyUserCode = async () => {
    if (!deviceSession) {
      return;
    }

    if (desktopApi?.copyToClipboard) {
      await desktopApi.copyToClipboard(deviceSession.userCode);
      return;
    }

    await navigator.clipboard.writeText(deviceSession.userCode);
  };

  const handleStartDeviceFlow = async () => {
    if (!desktopApi?.startGitHubDeviceAuth) {
      return;
    }

    setIsStartingDeviceFlow(true);
    setErrorMessage(null);

    try {
      const session = await desktopApi.startGitHubDeviceAuth();
      setDeviceSession(session);
      await desktopApi.openExternal(session.verificationUri);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "GitHub sign-in could not be started.",
      );
    } finally {
      setIsStartingDeviceFlow(false);
    }
  };

  const handleSaveToken = async () => {
    if (!desktopApi?.saveGitHubToken) {
      return;
    }

    setIsSavingToken(true);
    setErrorMessage(null);

    try {
      await desktopApi.saveGitHubToken(tokenValue);
      setTokenValue("");
      setDeviceSession(null);
      onConnected();
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "DevDeck could not save that GitHub token.",
      );
    } finally {
      setIsSavingToken(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-border/60 bg-white/95 backdrop-blur-md">
        <DialogHeader className="pr-10">
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5 text-primary" />
            Connect GitHub
          </DialogTitle>
          <DialogDescription>
            DevDeck stores your GitHub credential locally and uses the GitHub API
            directly for pull requests, reviewers, and commit status data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {capabilities.deviceFlowAvailable && (
            <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Sign in with GitHub
                </p>
                <p className="text-xs text-muted-foreground">
                  Use the device authorization flow to connect GitHub without
                  pasting a token.
                </p>
              </div>

              {deviceSession ? (
                <div className="space-y-3 rounded-lg border border-border/60 bg-white p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        User Code
                      </p>
                      <p className="mt-1 font-mono text-lg tracking-[0.2em] text-foreground">
                        {deviceSession.userCode}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleCopyUserCode()}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Finish sign-in at{" "}
                    <button
                      type="button"
                      className="font-medium text-primary underline underline-offset-2"
                      onClick={() => void desktopApi?.openExternal(deviceSession.verificationUri)}
                    >
                      {deviceSession.verificationUri}
                    </button>
                    . This code expires at{" "}
                    {new Date(deviceSession.expiresAt).toLocaleTimeString()}.
                  </p>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {isPollingDeviceFlow && (
                      <>
                        <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                        Waiting for GitHub authorization...
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => void handleStartDeviceFlow()}
                  disabled={isStartingDeviceFlow}
                >
                  {isStartingDeviceFlow && (
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Start GitHub Sign-In
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          )}

          <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                Paste a GitHub Token
              </p>
              <p className="text-xs text-muted-foreground">
                Use a classic token with <span className="font-mono">repo</span>
                {" "}scope, or a fine-grained token with read access to pull
                requests, commit statuses, and repository metadata.
              </p>
            </div>

            <Input
              type="password"
              value={tokenValue}
              onChange={(event) => setTokenValue(event.target.value)}
              placeholder="github_pat_..."
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                The token is stored locally on this Mac and is never committed
                into your repository.
              </p>
              <Button
                type="button"
                onClick={() => void handleSaveToken()}
                disabled={isSavingToken || tokenValue.trim().length === 0}
              >
                {isSavingToken && (
                  <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                )}
                Save Token
              </Button>
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-lg border border-chart-3/20 bg-chart-3/10 px-3 py-2 text-sm text-chart-3">
              {errorMessage}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
