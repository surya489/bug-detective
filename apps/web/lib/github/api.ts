export const GITHUB_API_ORIGIN = "https://api.github.com";
const PER_PAGE = 100;
const MAX_INSTALLATIONS = 1_000;
const MAX_REPOSITORIES = 5_000;
const MAX_API_RESPONSE_BYTES = 32 * 1024 * 1024;

export type GitHubErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limit"
  | "upstream"
  | "limit";

export class GitHubApiError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "GitHubApiError";
  }
}

async function readJsonLimited<T>(
  response: Response,
  maximumBytes: number,
): Promise<T> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maximumBytes) {
    await response.body?.cancel();
    throw new GitHubApiError("limit", response.status);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new GitHubApiError("upstream", response.status);
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel();
      throw new GitHubApiError("limit", response.status);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new GitHubApiError("upstream", response.status);
  }
}

export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  defaultBranch: string | null;
  visibility: "public" | "private" | "internal";
  updatedAt: string | null;
}

export interface GitHubInstallation {
  accountLogin: string;
  accountType: string | null;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string | null;
  date: string | null;
}

export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
}

interface InstallationsResponse {
  total_count?: number;
  installations?: unknown[];
}

interface InstallationRepositoriesResponse {
  total_count?: number;
  repositories?: unknown[];
}

interface GitHubCommitResponse {
  sha?: unknown;
  commit?: {
    message?: unknown;
    author?: { name?: unknown; date?: unknown } | null;
  };
  author?: { login?: unknown } | null;
}

interface GitTreeResponse {
  truncated?: boolean;
  tree?: GitHubTreeEntry[];
}

function errorFor(response: Response): GitHubApiError {
  if (
    response.status === 429 ||
    response.headers.get("x-ratelimit-remaining") === "0" ||
    response.headers.has("retry-after")
  ) {
    return new GitHubApiError("rate_limit", response.status);
  }
  if (response.status === 401) return new GitHubApiError("unauthorized", 401);
  if (response.status === 403) return new GitHubApiError("forbidden", 403);
  if (response.status === 404) return new GitHubApiError("not_found", 404);
  return new GitHubApiError("upstream", response.status);
}

export async function githubGet<T>(
  path: string,
  accessToken: string,
  timeoutMs = 10_000,
): Promise<{ data: T; response: Response }> {
  const url = new URL(path, GITHUB_API_ORIGIN);
  if (url.origin !== GITHUB_API_ORIGIN || !path.startsWith("/") || path.startsWith("//")) {
    throw new GitHubApiError("upstream", 0);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: "Bearer " + accessToken,
        "x-github-api-version": "2022-11-28",
        "user-agent": "bug-detective-read-only",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(10_000, Math.floor(timeoutMs))),
      ),
    });
  } catch {
    throw new GitHubApiError("upstream", 0);
  }
  if (!response.ok) throw errorFor(response);
  return {
    data: await readJsonLimited<T>(response, MAX_API_RESPONSE_BYTES),
    response,
  };
}

function installationInfo(value: unknown): {
  id: number;
  accountLogin: string;
  accountType: string | null;
} | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as {
    id?: unknown;
    account?: { login?: unknown; type?: unknown } | null;
  };
  if (
    !Number.isSafeInteger(item.id) ||
    (item.id as number) < 1 ||
    typeof item.account?.login !== "string" ||
    !item.account.login ||
    item.account.login.length > 255
  ) {
    return null;
  }
  return {
    id: item.id as number,
    accountLogin: item.account.login,
    accountType:
      typeof item.account.type === "string" ? item.account.type : null,
  };
}

function repositoryInfo(value: unknown): GitHubRepository | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as {
    id?: unknown;
    name?: unknown;
    full_name?: unknown;
    owner?: { login?: unknown } | null;
    description?: unknown;
    default_branch?: unknown;
    visibility?: unknown;
    private?: unknown;
    updated_at?: unknown;
  };
  const visibility =
    item.visibility === "public" ||
      item.visibility === "private" ||
      item.visibility === "internal"
      ? item.visibility
      : item.private === true
        ? "private"
        : item.private === false
          ? "public"
          : null;
  if (
    !Number.isSafeInteger(item.id) ||
    (item.id as number) < 1 ||
    typeof item.name !== "string" ||
    item.name.length > 255 ||
    typeof item.full_name !== "string" ||
    item.full_name.length > 511 ||
    typeof item.owner?.login !== "string" ||
    item.owner.login.length > 255 ||
    item.full_name !== `${item.owner.login}/${item.name}` ||
    !visibility
  ) {
    return null;
  }
  return {
    id: item.id as number,
    name: item.name,
    fullName: item.full_name,
    owner: item.owner.login,
    description:
      typeof item.description === "string" ? item.description.slice(0, 500) : null,
    defaultBranch:
      typeof item.default_branch === "string" ? item.default_branch : null,
    visibility,
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : null,
  };
}

type Installation = NonNullable<ReturnType<typeof installationInfo>>;

async function loadInstallations(accessToken: string): Promise<Installation[]> {
  const result: Installation[] = [];
  for (let page = 1; page <= Math.ceil(MAX_INSTALLATIONS / PER_PAGE); page += 1) {
    const { data } = await githubGet<InstallationsResponse>(
      `/user/installations?per_page=${PER_PAGE}&page=${page}`,
      accessToken,
    );
    if (
      !Array.isArray(data.installations) ||
      !Number.isSafeInteger(data.total_count) ||
      (data.total_count as number) < 0
    ) {
      throw new GitHubApiError("upstream", 200);
    }
    const parsed = data.installations.map(installationInfo);
    if (parsed.some((installation) => installation === null)) {
      throw new GitHubApiError("upstream", 200);
    }
    result.push(...(parsed as Installation[]));
    const total = data.total_count;
    if (
      Number.isSafeInteger(total) &&
      (total as number) > MAX_INSTALLATIONS
    ) {
      throw new GitHubApiError("limit", 0);
    }
    if (
      data.installations.length < PER_PAGE ||
      (Number.isSafeInteger(total) && page * PER_PAGE >= (total as number))
    ) {
      return result;
    }
  }
  throw new GitHubApiError("limit", 0);
}

export async function listInstallations(
  accessToken: string,
): Promise<GitHubInstallation[]> {
  return (await loadInstallations(accessToken)).map(
    ({ accountLogin, accountType }) => ({ accountLogin, accountType }),
  );
}

export async function listAccessibleRepositories(
  accessToken: string,
): Promise<{ repositories: GitHubRepository[]; truncated: boolean }> {
  const installations = await loadInstallations(accessToken);
  const repositories = new Map<number, GitHubRepository>();
  let truncated = false;
  for (const installation of installations) {
    for (let page = 1; page <= Math.ceil(MAX_REPOSITORIES / PER_PAGE); page += 1) {
      const { data } = await githubGet<InstallationRepositoriesResponse>(
        `/user/installations/${installation.id}/repositories?per_page=${PER_PAGE}&page=${page}`,
        accessToken,
      );
      if (
        !Array.isArray(data.repositories) ||
        !Number.isSafeInteger(data.total_count) ||
        (data.total_count as number) < 0
      ) {
        throw new GitHubApiError("upstream", 200);
      }
      for (const item of data.repositories) {
        const repository = repositoryInfo(item);
        if (!repository) throw new GitHubApiError("upstream", 200);
        if (!repositories.has(repository.id) && repositories.size >= MAX_REPOSITORIES) {
          truncated = true;
          break;
        }
        repositories.set(repository.id, repository);
      }
      if (
        truncated ||
        data.repositories.length < PER_PAGE ||
        (Number.isSafeInteger(data.total_count) &&
          page * PER_PAGE >= (data.total_count as number))
      ) {
        break;
      }
      if (page === Math.ceil(MAX_REPOSITORIES / PER_PAGE)) {
        truncated = true;
        break;
      }
    }
    if (truncated) break;
  }
  return {
    repositories: [...repositories.values()].sort((left, right) =>
      left.fullName.localeCompare(right.fullName, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    ),
    truncated,
  };
}

export async function findAccessibleRepository(
  accessToken: string,
  repositoryId: number,
): Promise<GitHubRepository | null> {
  if (!Number.isSafeInteger(repositoryId) || repositoryId < 1) return null;
  try {
    const { repositories } = await listAccessibleRepositories(accessToken);
    const found = repositories.find((repository) => repository.id === repositoryId);
    if (found) return found;
  } catch {
    // If installations listing fails or empty, attempt direct repository lookup
  }
  try {
    const { data } = await githubGet<unknown>(
      `/repositories/${repositoryId}`,
      accessToken,
    );
    return repositoryInfo(data);
  } catch {
    return null;
  }
}

export async function listRepositoryCommits(
  accessToken: string,
  repository: GitHubRepository,
  page: number,
): Promise<{ commits: GitHubCommit[]; hasMore: boolean }> {
  const queryPage = Number.isSafeInteger(page) && page > 0 && page <= 100 ? page : 0;
  if (!queryPage) throw new GitHubApiError("limit", 400);
  const path = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/commits?per_page=30&page=${queryPage}`;
  const { data, response } = await githubGet<unknown[]>(path, accessToken);
  if (!Array.isArray(data)) throw new GitHubApiError("upstream", 200);
  const commits = data.map((value): GitHubCommit => {
    if (typeof value !== "object" || value === null) {
      throw new GitHubApiError("upstream", 200);
    }
    const item = value as GitHubCommitResponse;
    if (typeof item.sha !== "string" || !/^[0-9a-f]{40}$/i.test(item.sha)) {
      throw new GitHubApiError("upstream", 200);
    }
    return {
      sha: item.sha.toLowerCase(),
      message:
        typeof item.commit?.message === "string"
          ? item.commit.message.split(/\r?\n/, 1)[0]
          : "(no commit message)",
      author:
        typeof item.author?.login === "string"
          ? item.author.login
          : typeof item.commit?.author?.name === "string"
            ? item.commit.author.name
            : null,
      date:
        typeof item.commit?.author?.date === "string"
          ? item.commit.author.date
          : null,
    };
  });
  const link = response.headers.get("link") ?? "";
  return { commits, hasMore: /rel="next"/.test(link) || data.length === 30 };
}

export async function validateRepositoryCommit(
  accessToken: string,
  repository: GitHubRepository,
  commitSha: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  if (!/^[0-9a-f]{40}$/i.test(commitSha)) return false;
  const path = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/commits/${commitSha.toLowerCase()}`;
  const { data } = await githubGet<GitHubCommitResponse>(
    path,
    accessToken,
    timeoutMs,
  );
  return typeof data.sha === "string" && data.sha.toLowerCase() === commitSha.toLowerCase();
}

export async function getCommitTree(
  accessToken: string,
  repository: GitHubRepository,
  commitSha: string,
  timeoutMs = 10_000,
): Promise<{ entries: GitHubTreeEntry[]; truncated: boolean }> {
  const path = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/git/trees/${commitSha}?recursive=1`;
  const { data } = await githubGet<GitTreeResponse>(path, accessToken, timeoutMs);
  if (
    !Array.isArray(data.tree) ||
    typeof data.truncated !== "boolean" ||
    data.tree.some(
      (entry) =>
        typeof entry.path !== "string" ||
        typeof entry.mode !== "string" ||
        typeof entry.type !== "string" ||
        typeof entry.sha !== "string",
    )
  ) {
    throw new GitHubApiError("upstream", 200);
  }
  return { entries: data.tree, truncated: data.truncated };
}

export async function getBlob(
  accessToken: string,
  repository: GitHubRepository,
  blobSha: string,
  timeoutMs = 10_000,
): Promise<{ content: string; encoding: string; size: number }> {
  if (!/^[0-9a-f]{40}$/i.test(blobSha)) {
    throw new GitHubApiError("upstream", 0);
  }
  const path = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/git/blobs/${blobSha}`;
  const { data } = await githubGet<{
    content?: unknown;
    encoding?: unknown;
    size?: unknown;
  }>(path, accessToken, timeoutMs);
  if (
    typeof data.content !== "string" ||
    data.encoding !== "base64" ||
    !Number.isSafeInteger(data.size) ||
    (data.size as number) < 0
  ) {
    throw new GitHubApiError("upstream", 200);
  }
  return {
    content: data.content,
    encoding: "base64",
    size: data.size as number,
  };
}

export async function exchangeGitHubCode(
  code: string,
  callbackUrl: string,
): Promise<OAuthTokenResult> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new GitHubApiError("upstream", 0);
  let response: Response;
  try {
    response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GitHubApiError("upstream", 0);
  }
  if (!response.ok) throw errorFor(response);
  try {
    const token = await readJsonLimited<OAuthTokenResult>(response, 16 * 1024);
    if (
      typeof token.access_token !== "string" ||
      !token.access_token ||
      token.error ||
      (token.expires_in !== undefined &&
        (!Number.isSafeInteger(token.expires_in) || token.expires_in <= 0)) ||
      (token.refresh_token !== undefined &&
        (typeof token.refresh_token !== "string" || !token.refresh_token)) ||
      (token.refresh_token_expires_in !== undefined &&
        (!Number.isSafeInteger(token.refresh_token_expires_in) ||
          token.refresh_token_expires_in <= 0))
    ) {
      throw new GitHubApiError("unauthorized", response.status);
    }
    return token;
  } catch (error) {
    if (error instanceof GitHubApiError) throw error;
    throw new GitHubApiError("upstream", response.status);
  }
}

export interface OAuthTokenResult {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
}

export async function getGitHubLogin(accessToken: string): Promise<string> {
  const { data } = await githubGet<{ login?: unknown }>("/user", accessToken);
  if (typeof data.login !== "string" || !data.login) {
    throw new GitHubApiError("upstream", 200);
  }
  return data.login;
}

export async function revokeGitHubAuthorization(
  accessToken: string,
): Promise<boolean> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return false;
  console.log("GITHUB_CLIENT_ID", process.env.GITHUB_CLIENT_ID);
  try {
    const response = await fetch(
      `${GITHUB_API_ORIGIN}/applications/${encodeURIComponent(clientId)}/grant`,
      {
        method: "DELETE",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "content-type": "application/json",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({ access_token: accessToken }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export function safeGitHubError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (!(error instanceof GitHubApiError)) {
    return {
      status: 502,
      code: "GITHUB_UNAVAILABLE",
      message: "GitHub could not complete this request. Try again shortly.",
    };
  }
  switch (error.code) {
    case "unauthorized":
      return {
        status: 401,
        code: "GITHUB_AUTHORIZATION_EXPIRED",
        message: "GitHub authorization expired or was revoked. Connect again.",
      };
    case "forbidden":
      return {
        status: 403,
        code: "GITHUB_PERMISSION_REQUIRED",
        message: "The GitHub App does not have permission to access this resource.",
      };
    case "not_found":
      return {
        status: 404,
        code: "GITHUB_RESOURCE_UNAVAILABLE",
        message: "The repository or commit is unavailable to this GitHub account.",
      };
    case "rate_limit":
      return {
        status: 429,
        code: "GITHUB_RATE_LIMIT",
        message: "GitHub rate limits were reached. Try again later.",
      };
    case "limit":
      return {
        status: 422,
        code: "GITHUB_RESULT_LIMIT",
        message: "The GitHub result exceeds the supported request limits.",
      };
    default:
      return {
        status: 502,
        code: "GITHUB_UNAVAILABLE",
        message: "GitHub could not complete this request. Try again shortly.",
      };
  }
}
