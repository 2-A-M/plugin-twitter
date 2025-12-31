import { createServer } from "node:http";
import { URL } from "node:url";
import { logger } from "@elizaos/core";
import * as readline from "node:readline";

export interface OAuthCallbackResult {
  code: string;
  state?: string;
}

function canPrompt(): boolean {
  return !!process.stdin && !!process.stdout && process.stdin.isTTY === true;
}

export async function promptForRedirectedUrl(promptText: string): Promise<string> {
  if (!canPrompt()) {
    throw new Error(
      "Twitter OAuth requires interactive setup, but stdin is not a TTY. " +
        "Re-run with an interactive terminal or use a runtime with persistent settings storage.",
    );
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (q: string) =>
    new Promise<string>((resolve) => rl.question(q, resolve));

  try {
    const answer = await question(promptText);
    return answer.trim();
  } finally {
    rl.close();
  }
}

export async function waitForLoopbackCallback(
  redirectUri: string,
  expectedState: string,
  timeoutMs = 5 * 60 * 1000,
): Promise<OAuthCallbackResult> {
  const url = new URL(redirectUri);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(
      `Redirect URI must be loopback (127.0.0.1/localhost) to use local callback server; got ${url.hostname}`,
    );
  }

  // Avoid privileged ports by default. If the user doesn't specify a port, use 8080.
  const port = Number(url.port || "8080");
  const path = url.pathname || "/";

  return await new Promise<OAuthCallbackResult>((resolve, reject) => {
    const server = createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url ?? "", `http://${url.hostname}:${port}`);
        if (reqUrl.pathname !== path) {
          res.writeHead(404);
          res.end("Not Found");
          return;
        }

        const code = reqUrl.searchParams.get("code");
        const state = reqUrl.searchParams.get("state") ?? undefined;
        const error = reqUrl.searchParams.get("error");
        const errorDesc = reqUrl.searchParams.get("error_description");

        if (error) {
          res.writeHead(400, { "content-type": "text/plain" });
          res.end(`OAuth error: ${error}${errorDesc ? ` - ${errorDesc}` : ""}`);
          reject(new Error(`OAuth error: ${error}${errorDesc ? ` - ${errorDesc}` : ""}`));
          server.close();
          return;
        }

        if (!code) {
          res.writeHead(400, { "content-type": "text/plain" });
          res.end("Missing code");
          return;
        }

        if (state && state !== expectedState) {
          res.writeHead(400, { "content-type": "text/plain" });
          res.end("State mismatch");
          reject(new Error("OAuth state mismatch"));
          server.close();
          return;
        }

        res.writeHead(200, { "content-type": "text/plain" });
        res.end("Twitter auth completed. You can close this tab.");
        resolve({ code, state });
        server.close();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        server.close();
      }
    });

    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for Twitter OAuth callback"));
      try {
        server.close();
      } catch {
        // ignore
      }
    }, timeoutMs);

    server.on("close", () => clearTimeout(timer));
    server.listen(port, url.hostname, () => {
      logger.info(
        `Twitter OAuth callback server listening on http://${url.hostname}:${port}${path}`,
      );
    });
  });
}

