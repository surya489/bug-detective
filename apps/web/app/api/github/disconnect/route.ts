import { revokeGitHubAuthorization } from "@/lib/github/api";
import { githubError, githubJson, unauthorized } from "@/lib/github/http";
import {
  clearGitHubSessionCookie,
  readGitHubSession,
  verifyCsrf,
} from "@/lib/github/session";

export async function POST(request: Request) {
  const session = await readGitHubSession(request);
  if (!session) return unauthorized();
  if (!verifyCsrf(request, session)) {
    return githubError(403, "CSRF_VALIDATION_FAILED", "Reload the page and try again.");
  }
  const revoked = await revokeGitHubAuthorization(session.accessToken);
  const response = githubJson({
    disconnected: true,
    authorizationRevoked: revoked,
  });
  return clearGitHubSessionCookie(response);
}
