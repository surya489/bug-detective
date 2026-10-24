import { listAccessibleRepositories, safeGitHubError } from "@/lib/github/api";
import { githubError, githubJson, unauthorized } from "@/lib/github/http";
import {
  clearGitHubSessionCookie,
  readGitHubSession,
} from "@/lib/github/session";
import { getSession } from "@/lib/auth/session";
import { fetchUserRepositories } from "@/lib/github/repositories";

const PAGE_SIZE = 25;

export async function GET(request: Request) {
  let session = await readGitHubSession(request).catch(() => null);

  if (!session) {
    try {
      const authSession = await getSession();
      if (authSession?.accessToken) {
        session = {
          accessToken: authSession.accessToken,
          login: authSession.user.login,
          csrfToken: "",
          expiresAt: Date.now() + 8 * 60 * 60 * 1000,
        };
      }
    } catch {
      // Ignored outside Next.js request context (e.g., node test runner)
    }
  }

  if (!session) return unauthorized();

  const url = new URL(request.url);
  const params = url.searchParams;
  const hasPageParam = params.has("page");
  const pageValue = params.get("page") ?? "1";

  if (!/^[1-9]\d{0,2}$/.test(pageValue)) {
    return githubError(
      400,
      "INVALID_PAGE",
      "Page must be an integer between 1 and 200.",
      session,
    );
  }

  const page = Number(pageValue);
  if (page > 200) {
    return githubError(
      400,
      "INVALID_PAGE",
      "Page must be an integer between 1 and 200.",
      session,
    );
  }

  const query = params.get("q")?.trim().toLowerCase() ?? "";
  const visibility = params.get("visibility") ?? "all";

  if (query.length > 100 || !["all", "public", "private"].includes(visibility)) {
    return githubError(
      400,
      "INVALID_FILTER",
      "Search text or repository visibility is invalid.",
      session,
    );
  }

  try {
    let repos: any[] = [];
    let truncated = false;

    try {
      const res = await listAccessibleRepositories(session.accessToken);
      repos = res.repositories;
      truncated = res.truncated;
    } catch {
      // If installation listing fails, fallback to user repositories
    }

    if (repos.length === 0) {
      try {
        const userRepos = await fetchUserRepositories(session.accessToken);
        repos = userRepos.map((r) => ({
          id: r.id,
          name: r.name,
          fullName: r.fullName,
          owner: r.owner.login,
          description: r.description,
          defaultBranch: r.defaultBranch,
          visibility: r.isPrivate ? "private" : "public",
          isPrivate: r.isPrivate,
          starsCount: r.starsCount,
          forksCount: r.forksCount,
          htmlUrl: r.htmlUrl,
          language: r.language,
          updatedAt: r.updatedAt,
        }));
      } catch {
        // Ignored
      }
    } else {
      // Enrich with missing UI properties
      repos = repos.map((r) => ({
        ...r,
        isPrivate: r.visibility === "private",
        htmlUrl: (r as any).htmlUrl || `https://github.com/${r.fullName}`,
        starsCount: (r as any).starsCount ?? 0,
        forksCount: (r as any).forksCount ?? 0,
      }));
    }

    const filtered = repos.filter((repository) => {
      const matchesQuery =
        query.length === 0 ||
        repository.fullName.toLowerCase().includes(query) ||
        (repository.name && repository.name.toLowerCase().includes(query));

      const matchesVisibility =
        visibility === "all" ||
        (visibility === "public"
          ? repository.visibility === "public"
          : repository.visibility !== "public");

      return matchesQuery && matchesVisibility;
    });

    const offset = hasPageParam ? (page - 1) * PAGE_SIZE : 0;
    const paginated = hasPageParam
      ? filtered.slice(offset, offset + PAGE_SIZE)
      : filtered;

    return githubJson(
      {
        repositories: paginated,
        page,
        pageSize: hasPageParam ? PAGE_SIZE : filtered.length,
        total: filtered.length,
        hasMore: hasPageParam ? offset + PAGE_SIZE < filtered.length : false,
        truncated,
      },
      200,
      session,
    );
  } catch (error) {
    const safe = safeGitHubError(error);
    const response = githubError(safe.status, safe.code, safe.message, session);
    return safe.status === 401 ? clearGitHubSessionCookie(response) : response;
  }
}
