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
import { getSession } from "@/lib/auth/session";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ repositoryId: string }> },
) {
  let session = await readGitHubSession(request);
  let accessToken = session?.accessToken;

  if (!accessToken) {
    const authSession = await getSession();
    if (authSession?.accessToken) {
      accessToken = authSession.accessToken;
    }
  }

  if (!accessToken) return unauthorized();
  const { repositoryId: id } = await context.params;
  if (!/^[1-9]\d{0,14}$/.test(id)) {
    return session
      ? githubError(400, "INVALID_REPOSITORY", "Select a valid repository.", session)
      : NextResponse.json({ error: { code: "INVALID_REPOSITORY", message: "Select a valid repository." } }, { status: 400 });
  }
  const repositoryId = Number(id);
  if (!Number.isSafeInteger(repositoryId)) {
    return session
      ? githubError(400, "INVALID_REPOSITORY", "Select a valid repository.", session)
      : NextResponse.json({ error: { code: "INVALID_REPOSITORY", message: "Select a valid repository." } }, { status: 400 });
  }
  const pageValue = new URL(request.url).searchParams.get("page") ?? "1";
  if (!/^[1-9]\d{0,2}$/.test(pageValue) || Number(pageValue) > 100) {
    return session
      ? githubError(400, "INVALID_PAGE", "Select a valid commit page.", session)
      : NextResponse.json({ error: { code: "INVALID_PAGE", message: "Select a valid commit page." } }, { status: 400 });
  }

  try {
    const repository = await findAccessibleRepository(
      accessToken,
      repositoryId,
    );
    if (!repository) {
      const msg = "This repository is not available to the connected account.";
      return session
        ? githubError(404, "REPOSITORY_UNAVAILABLE", msg, session)
        : NextResponse.json({ error: { code: "REPOSITORY_UNAVAILABLE", message: msg } }, { status: 404 });
    }
    const result = await listRepositoryCommits(
      accessToken,
      repository,
      Number(pageValue),
    );
    return session
      ? githubJson({ repository, ...result }, 200, session)
      : NextResponse.json({ repository, ...result });
  } catch (error) {
    const safe = safeGitHubError(error);
    if (session) {
      const response = githubError(safe.status, safe.code, safe.message, session);
      return safe.status === 401 ? clearGitHubSessionCookie(response) : response;
    }
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
