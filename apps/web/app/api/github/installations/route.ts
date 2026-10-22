import { listInstallations, safeGitHubError } from "@/lib/github/api";
import { githubError, githubJson, unauthorized } from "@/lib/github/http";
import {
  clearGitHubSessionCookie,
  readGitHubSession,
} from "@/lib/github/session";

export async function GET(request: Request) {
  const session = await readGitHubSession(request);
  if (!session) return unauthorized();
  try {
    const installations = await listInstallations(session.accessToken);
    return githubJson({ installations }, 200, session);
  } catch (error) {
    const safe = safeGitHubError(error);
    const response = githubError(safe.status, safe.code, safe.message, session);
    return safe.status === 401 ? clearGitHubSessionCookie(response) : response;
  }
}
