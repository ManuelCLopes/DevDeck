import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useClearJiraConnection,
  useJiraConnection,
  useTestAndSaveJiraConnection,
} from "@/hooks/use-jira-connection";
import { AlertTriangle, CheckCircle2, Link2, Link2Off } from "lucide-react";

/**
 * Connect / disconnect a single Jira Cloud account (Phase 2 supports
 * one connection — see shared/jira.ts). Credentials never round-trip
 * back to the renderer: testAndSaveConnection only returns the
 * non-secret JiraConnection + a health check result.
 */
export default function JiraConnectionCard() {
  const connectionQuery = useJiraConnection();
  const testAndSave = useTestAndSaveJiraConnection();
  const clearConnection = useClearJiraConnection();

  const [baseUrl, setBaseUrl] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [apiToken, setApiToken] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    testAndSave.mutate(
      { accountEmail, apiToken, baseUrl },
      {
        onSuccess: () => {
          setApiToken("");
        },
      },
    );
  };

  if (connectionQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jira connection</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  const connection = connectionQuery.data;

  if (connection) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Jira connection</CardTitle>
            <Badge variant="default">Connected</Badge>
          </div>
          <CardDescription>
            <span className="font-mono text-xs">{connection.baseUrl}</span> ·{" "}
            {connection.accountEmail}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {connection.lastSuccessfulSyncAt ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Last successful sync {new Date(connection.lastSuccessfulSyncAt).toLocaleString()}
            </div>
          ) : (
            <p className="text-muted-foreground">No successful sync yet.</p>
          )}
          {connection.lastError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{connection.lastError}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            disabled={clearConnection.isPending}
            onClick={() => clearConnection.mutate()}
            size="sm"
            variant="outline"
          >
            <Link2Off className="mr-2 h-4 w-4" />
            Disconnect
          </Button>
          <p className="text-xs text-muted-foreground">
            Disconnecting removes the stored credential only — synced issues stay available
            offline until you sync again or clear them yourself.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Connect Jira</CardTitle>
        </div>
        <CardDescription>
          API-token authentication. The token is validated against Jira before it is stored,
          and never leaves the desktop app once saved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label htmlFor="jira-base-url">Base URL</Label>
            <Input
              id="jira-base-url"
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://your-domain.atlassian.net"
              required
              type="url"
              value={baseUrl}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="jira-account-email">Account email</Label>
            <Input
              id="jira-account-email"
              onChange={(event) => setAccountEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={accountEmail}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="jira-api-token">API token</Label>
            <Input
              id="jira-api-token"
              onChange={(event) => setApiToken(event.target.value)}
              placeholder="Created at id.atlassian.com/manage-profile/security/api-tokens"
              required
              type="password"
              value={apiToken}
            />
          </div>
          {testAndSave.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {testAndSave.error instanceof Error
                  ? testAndSave.error.message
                  : "Could not connect to Jira."}
              </AlertDescription>
            </Alert>
          ) : null}
          <Button disabled={testAndSave.isPending} type="submit">
            {testAndSave.isPending ? "Testing…" : "Test & connect"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
