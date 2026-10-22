import { listAccessibleRepositories, safeGitHubError } from "@/lib/github/api";
import { githubError, githubJson, unauthorized } from "@/lib/github/http";
import {
  clearGitHubSessionCookie,
  readGitHubSession,
} from "@/lib/github/session";

const PAGE_SIZE = 25;

export async function GET(request: Request) {
  const session = await readGitHubSession(request);
  if (!session) return unauthorized();
  const pageValue = new URL(request.url).searchParams.get("page") ?? "1";
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
  const params = new URL(request.url).searchParams;
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
    const { repositories, truncated } = await listAccessibleRepositories(
      session.accessToken,
    );
    const filtered = repositories.filter((repository) => {
      const matchesQuery =
        query.length === 0 || repository.fullName.toLowerCase().includes(query);
      const matchesVisibility =
        visibility === "all" ||
        (visibility === "public"
          ? repository.visibility === "public"
          : repository.visibility !== "public");
      return matchesQuery && matchesVisibility;
    });
    const offset = (page - 1) * PAGE_SIZE;
    return githubJson(
      {
        repositories: filtered.slice(offset, offset + PAGE_SIZE),
        page,
        pageSize: PAGE_SIZE,
        total: filtered.length,
        hasMore: offset + PAGE_SIZE < filtered.length,
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
