import { githubJson } from "@/lib/github/http";
import { getGitHubAppConfig } from "@/lib/github/config";
import {
  clearGitHubSessionCookie,
  readGitHubSession,
  setGitHubSessionCookie,
} from "@/lib/github/session";

export async function GET(request: Request) {
  const session = await readGitHubSession(request);
  if (!session) {
    const response = githubJson({
      configured: getGitHubAppConfig() !== null,
      connected: false,
      login: null,
      csrfToken: null,
    });
    return clearGitHubSessionCookie(response);
  }
  const response = githubJson({
    configured: true,
    connected: true,
    login: session.login,
    csrfToken: session.csrfToken,
  });
  return setGitHubSessionCookie(response, session);
}
