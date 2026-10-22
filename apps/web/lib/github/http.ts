import type { GitHubSession } from "./session";
import { clearGitHubSessionCookie, setGitHubSessionCookie } from "./session";

export function githubJson(
  data: unknown,
  status = 200,
  session?: GitHubSession,
): Response {
  const response = Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
  return session ? setGitHubSessionCookie(response, session) : response;
}

export function githubError(
  status: number,
  code: string,
  message: string,
  session?: GitHubSession,
): Response {
  return githubJson({ error: { code, message } }, status, session);
}

export function unauthorized(): Response {
  return clearGitHubSessionCookie(
    githubError(
      401,
      "GITHUB_SESSION_REQUIRED",
      "Connect GitHub to continue.",
    ),
  );
}
