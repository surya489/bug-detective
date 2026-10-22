import {
  findAccessibleRepository,
  listRepositoryCommits,
  safeGitHubError,
} from "@/lib/github/api";
import { githubError, githubJson, unauthorized } from "@/lib/github/http";
import {
  clearGitHubSessionCookie,
  readGitHubSession,
} from "@/lib/github/session";

export async function GET(
  request: Request,
  context: { params: Promise<{ repositoryId: string }> },
) {
  const session = await readGitHubSession(request);
  if (!session) return unauthorized();
  const { repositoryId: id } = await context.params;
  if (!/^[1-9]\d{0,14}$/.test(id)) {
    return githubError(
      400,
      "INVALID_REPOSITORY",
      "Select a valid repository.",
      session,
    );
  }
  const repositoryId = Number(id);
  if (!Number.isSafeInteger(repositoryId)) {
    return githubError(
      400,
      "INVALID_REPOSITORY",
      "Select a valid repository.",
      session,
    );
  }
  const pageValue = new URL(request.url).searchParams.get("page") ?? "1";
  if (!/^[1-9]\d{0,2}$/.test(pageValue) || Number(pageValue) > 100) {
    return githubError(400, "INVALID_PAGE", "Select a valid commit page.", session);
  }

  try {
    const repository = await findAccessibleRepository(
      session.accessToken,
      repositoryId,
    );
    if (!repository) {
      return githubError(
        404,
        "REPOSITORY_UNAVAILABLE",
        "This repository is not available to the connected GitHub App.",
        session,
      );
    }
    const result = await listRepositoryCommits(
      session.accessToken,
      repository,
      Number(pageValue),
    );
    return githubJson({ repository, ...result }, 200, session);
  } catch (error) {
    const safe = safeGitHubError(error);
    const response = githubError(safe.status, safe.code, safe.message, session);
    return safe.status === 401 ? clearGitHubSessionCookie(response) : response;
  }
}
