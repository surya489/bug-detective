const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { test } = require("node:test");

const {
  GitHubApiError,
  listAccessibleRepositories,
  listRepositoryCommits,
  safeGitHubError,
  validateRepositoryCommit,
} = require("../lib/github/api.ts");
const {
  createGitHubSession,
  createOAuthState,
  readGitHubSession,
  setGitHubSessionCookie,
  setOAuthStateCookie,
  verifyCsrf,
  verifyOAuthState,
} = require("../lib/github/session.ts");
const { retrieveRepositorySource } = require("../lib/github/source.ts");

const fullSha = "a".repeat(40);
const repository = {
  id: 42,
  name: "sample",
  fullName: "owner/sample",
  owner: "owner",
  description: null,
  defaultBranch: "main",
  visibility: "private",
  updatedAt: null,
};

function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function configureSessionKey() {
  process.env.GITHUB_SESSION_SECRET = randomBytes(32).toString("base64url");
  process.env.NODE_ENV = "test";
}

function createSessionRequest() {
  configureSessionKey();
  const session = createGitHubSession({ access_token: "ghs-test-secret" }, "octocat");
  const response = setGitHubSessionCookie(new Response(null), session);
  const cookie = response.headers.get("set-cookie").split(";", 1)[0];
  return {
    session,
    request: new Request("http://localhost/api/test", {
      headers: { cookie },
    }),
    cookie,
  };
}

test("repository listing follows only installations authorized to the user", async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (input, init) => {
    requests.push({ url: String(input), headers: init.headers });
    if (String(input).includes("/user/installations?")) {
      return jsonResponse({
        total_count: 1,
        installations: [{ id: 7, account: { login: "owner", type: "Organization" } }],
      });
    }
    if (String(input).includes("/user/installations/7/repositories")) {
      return jsonResponse({
        total_count: 1,
        repositories: [
          {
            id: 42,
            name: "sample",
            full_name: "owner/sample",
            owner: { login: "owner" },
            private: true,
            visibility: "private",
            default_branch: "main",
            description: null,
            updated_at: null,
          },
        ],
      });
    }
    throw new Error("Unexpected API URL");
  };
  try {
    const result = await listAccessibleRepositories("ghs-test-secret");
    assert.equal(result.repositories.length, 1);
    assert.equal(result.repositories[0].id, 42);
    assert.equal(result.repositories[0].visibility, "private");
    assert.ok(requests.every((request) => new URL(request.url).host === "api.github.com"));
    assert.ok(requests.every((request) => request.headers.authorization === "Bearer ghs-test-secret"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("commit browsing accepts and returns only full immutable SHA values", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    jsonResponse(
      [
        {
          sha: fullSha,
          commit: {
            message: "Fix the bug\nMore details",
            author: { name: "Dev", date: "2026-10-20T00:00:00Z" },
          },
          author: { login: "octocat" },
        },
      ],
      200,
      { link: '<https://api.github.com/repos/owner/sample/commits?page=2>; rel="next"' },
    );
  try {
    const page = await listRepositoryCommits("token", repository, 1);
    assert.equal(page.commits.length, 1);
    assert.equal(page.commits[0].sha, fullSha);
    assert.equal(page.commits[0].message, "Fix the bug");
    assert.equal(page.hasMore, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("unexpected commit API shapes are not treated as complete pages", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse([{ sha: "short" }]);
  try {
    await assert.rejects(
      listRepositoryCommits("token", repository, 1),
      (error) => error instanceof GitHubApiError && error.code === "upstream",
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("commit validation is repository-bound and rejects abbreviated SHAs", async () => {
  const originalFetch = global.fetch;
  let requested = "";
  global.fetch = async (input) => {
    requested = String(input);
    return jsonResponse({ sha: fullSha });
  };
  try {
    assert.equal(await validateRepositoryCommit("token", repository, "abc123"), false);
    assert.equal(await validateRepositoryCommit("token", repository, fullSha), true);
    assert.ok(requested.includes(`/repos/owner/sample/commits/${fullSha}`));
  } finally {
    global.fetch = originalFetch;
  }
});

test("source retrieval excludes secrets, symlinks, unsupported files, and invalid UTF-8", async () => {
  const originalFetch = global.fetch;
  const source = Buffer.from('const value: number = "bad";\n');
  const invalidUtf8 = Buffer.from([0xff, 0xfe]);
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes(`/commits/${fullSha}`)) return jsonResponse({ sha: fullSha });
    if (url.includes(`/git/trees/${fullSha}`)) {
      return jsonResponse({
        truncated: false,
        tree: [
          { path: "src/App.ts", mode: "100644", type: "blob", sha: "b".repeat(40), size: source.length },
          { path: ".env.production", mode: "100644", type: "blob", sha: "c".repeat(40), size: 14 },
          { path: "src/link.ts", mode: "120000", type: "blob", sha: "d".repeat(40), size: 8 },
          { path: "README.md", mode: "100644", type: "blob", sha: "e".repeat(40), size: 10 },
          { path: "src/Bad.ts", mode: "100644", type: "blob", sha: "f".repeat(40), size: invalidUtf8.length },
        ],
      });
    }
    if (url.includes(`/git/blobs/${"b".repeat(40)}`)) {
      return jsonResponse({ content: source.toString("base64"), encoding: "base64", size: source.length });
    }
    if (url.includes(`/git/blobs/${"f".repeat(40)}`)) {
      return jsonResponse({ content: invalidUtf8.toString("base64"), encoding: "base64", size: invalidUtf8.length });
    }
    throw new Error("Excluded files must never be retrieved");
  };
  try {
    const result = await retrieveRepositorySource("token", repository, fullSha);
    assert.deepEqual(result.files.map((file) => file.path), ["src/App.ts"]);
    assert.equal(result.inspections.find((file) => file.path === ".env.production").reason, "sensitive_environment_file");
    assert.equal(result.inspections.find((file) => file.path === "src/link.ts").reason, "symlink");
    assert.equal(result.inspections.find((file) => file.path === "README.md").reason, "unsupported_file_type");
    assert.equal(result.inspections.find((file) => file.path === "src/Bad.ts").reason, "non_utf8_file");
    assert.equal(result.files[0].content, source.toString("utf8"));
    assert.ok(!JSON.stringify(result).includes("SHOULD_NOT_BE_INCLUDED"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("source retrieval rejects traversal before requesting a blob", async () => {
  const originalFetch = global.fetch;
  let blobRequested = false;
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes(`/commits/${fullSha}`)) return jsonResponse({ sha: fullSha });
    if (url.includes(`/git/trees/${fullSha}`)) {
      return jsonResponse({
        truncated: false,
        tree: [{ path: "../outside.ts", mode: "100644", type: "blob", sha: "b".repeat(40), size: 1 }],
      });
    }
    blobRequested = true;
    throw new Error("Traversal content must not be requested");
  };
  try {
    const result = await retrieveRepositorySource("token", repository, fullSha);
    assert.equal(result.files.length, 0);
    assert.equal(result.inspections[0].reason, "invalid_path");
    assert.equal(blobRequested, false);
    assert.ok(result.warnings.length > 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("source retrieval enforces file size limits before fetching blobs", async () => {
  const originalFetch = global.fetch;
  let blobRequested = false;
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes(`/commits/${fullSha}`)) return jsonResponse({ sha: fullSha });
    if (url.includes(`/git/trees/${fullSha}`)) {
      return jsonResponse({
        truncated: false,
        tree: [{
          path: "src/large.ts",
          mode: "100644",
          type: "blob",
          sha: "b".repeat(40),
          size: 1_048_577,
        }],
      });
    }
    blobRequested = true;
    throw new Error("Oversized blobs must not be downloaded");
  };
  try {
    const result = await retrieveRepositorySource("token", repository, fullSha);
    assert.equal(blobRequested, false);
    assert.equal(result.inspections[0].reason, "file_size_limit");
    assert.ok(result.warnings.length > 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test("GitHub failures return safe messages without upstream body or token leakage", () => {
  const secret = "ghs-do-not-leak";
  const safe = safeGitHubError(new GitHubApiError("unauthorized", 401));
  assert.equal(safe.status, 401);
  assert.ok(!JSON.stringify(safe).includes(secret));
  assert.equal(safe.code, "GITHUB_AUTHORIZATION_EXPIRED");
});

test("encrypted session cookies are HttpOnly and OAuth state and CSRF are validated", async () => {
  const { session, request, cookie } = createSessionRequest();
  const response = setGitHubSessionCookie(new Response(null), session);
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.ok(!setCookie.includes(session.accessToken));
  assert.equal((await readGitHubSession(request)).login, "octocat");
  assert.equal(verifyCsrf(new Request("http://localhost/api/test", {
    headers: { cookie, "x-csrf-token": session.csrfToken, host: "localhost" },
  }), session), true);
  assert.equal(verifyCsrf(new Request("http://localhost/api/test", {
    headers: { cookie, "x-csrf-token": "wrong", host: "localhost" },
  }), session), false);

  const state = createOAuthState();
  const stateResponse = setOAuthStateCookie(new Response(null), state);
  const stateCookie = stateResponse.headers.get("set-cookie").split(";", 1)[0];
  const stateRequest = new Request(
    `http://localhost/api/github/callback?state=${state}`,
    { headers: { cookie: stateCookie } },
  );
  assert.equal(verifyOAuthState(stateRequest, state), true);
  assert.equal(verifyOAuthState(stateRequest, `${state}x`), false);
});

test("expired GitHub access tokens are refreshed without exposing the replacement", async () => {
  configureSessionKey();
  process.env.GITHUB_CLIENT_ID = "client-id";
  process.env.GITHUB_CLIENT_SECRET = "client-secret";
  const session = {
    ...createGitHubSession({ access_token: "expired-access-token" }, "octocat"),
    refreshToken: "refresh-token-secret",
    accessTokenExpiresAt: Date.now() - 1,
  };
  const response = setGitHubSessionCookie(new Response(null), session);
  const cookie = response.headers.get("set-cookie").split(";", 1)[0];
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    assert.equal(String(input), "https://github.com/login/oauth/access_token");
    return jsonResponse({
      access_token: "replacement-access-token",
      refresh_token: "replacement-refresh-token",
      expires_in: 28_800,
    });
  };
  try {
    const refreshed = await readGitHubSession(
      new Request("http://localhost/api/test", { headers: { cookie } }),
    );
    assert.equal(refreshed.accessToken, "replacement-access-token");
    assert.equal(refreshed.refreshToken, "replacement-refresh-token");
  } finally {
    global.fetch = originalFetch;
  }
});

test("GitHub repository URLs cannot redirect the API client away from api.github.com", async () => {
  const { githubGet } = require("../lib/github/api.ts");
  await assert.rejects(
    githubGet("//attacker.example/path", "token"),
    (error) => error instanceof GitHubApiError && error.code === "upstream",
  );
});

test("callback failures use only the configured local destination", async () => {
  configureSessionKey();
  process.env.GITHUB_CLIENT_ID = "client-id";
  process.env.GITHUB_CLIENT_SECRET = "client-secret";
  process.env.GITHUB_CALLBACK_URL = "http://localhost:3000/api/github/callback";
  const callback = require("../app/api/github/callback/route.ts");
  const response = await callback.GET(
    new Request(
      "http://localhost:3000/api/github/callback?state=invalid&code=abc&next=https%3A%2F%2Fevil.example",
    ),
  );
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "http://localhost:3000/repositories?github=state_error",
  );
  assert.ok(!response.headers.get("location").includes("evil.example"));
});

test("OAuth connect and callback never send tokens to browser-visible URLs", async () => {
  configureSessionKey();
  process.env.GITHUB_CLIENT_ID = "client-id";
  process.env.GITHUB_CLIENT_SECRET = "client-secret";
  process.env.GITHUB_CALLBACK_URL = "http://localhost:3000/api/github/callback";
  const connect = require("../app/api/github/connect/route.ts");
  const connectResponse = await connect.GET();
  assert.equal(connectResponse.status, 302);
  const authorizationUrl = new URL(connectResponse.headers.get("location"));
  assert.equal(authorizationUrl.hostname, "github.com");
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), process.env.GITHUB_CALLBACK_URL);
  const state = authorizationUrl.searchParams.get("state");
  const stateCookie = connectResponse.headers.get("set-cookie").split(";", 1)[0];

  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    if (String(input).startsWith("https://github.com/login/oauth/access_token")) {
      return jsonResponse({
        access_token: "ghu-access-token-secret",
        refresh_token: "ghr-refresh-token-secret",
        expires_in: 28_800,
        refresh_token_expires_in: 15_552_000,
      });
    }
    if (String(input) === "https://api.github.com/user") {
      return jsonResponse({ login: "octocat" });
    }
    throw new Error("Unexpected OAuth request URL");
  };
  try {
    const callback = require("../app/api/github/callback/route.ts");
    const response = await callback.GET(
      new Request(
        `http://localhost:3000/api/github/callback?code=temporary-code&state=${state}`,
        { headers: { cookie: stateCookie } },
      ),
    );
    const setCookies = response.headers.getSetCookie();
    const sessionCookie = setCookies.find((cookie) =>
      cookie.startsWith("bug-detective-session="),
    );
    assert.equal(response.status, 303);
    assert.equal(
      response.headers.get("location"),
      "http://localhost:3000/repositories?github=connected",
    );
    assert.ok(sessionCookie);
    assert.ok(!setCookies.join(";").includes("ghu-access-token-secret"));
    assert.ok(!setCookies.join(";").includes("ghr-refresh-token-secret"));
    const session = await readGitHubSession(
      new Request("http://localhost/api/test", {
        headers: { cookie: sessionCookie.split(";", 1)[0] },
      }),
    );
    assert.equal(session.login, "octocat");
    assert.equal(session.accessToken, "ghu-access-token-secret");
  } finally {
    global.fetch = originalFetch;
  }
});

test("disconnect clears the local cookie and requests GitHub revocation", async () => {
  configureSessionKey();
  process.env.GITHUB_CLIENT_ID = "client-id";
  process.env.GITHUB_CLIENT_SECRET = "client-secret";
  const { session, request } = createSessionRequest();
  const originalFetch = global.fetch;
  let revokedToken = "";
  global.fetch = async (input, init) => {
    assert.ok(String(input).startsWith("https://api.github.com/applications/client-id/grant"));
    revokedToken = JSON.parse(init.body).access_token;
    return new Response(null, { status: 204 });
  };
  try {
    const disconnect = require("../app/api/github/disconnect/route.ts");
    const response = await disconnect.POST(
      new Request("http://localhost/api/github/disconnect", {
        method: "POST",
        headers: {
          cookie: request.headers.get("cookie"),
          "x-csrf-token": session.csrfToken,
        },
      }),
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.authorizationRevoked, true);
    assert.equal(revokedToken, "ghs-test-secret");
    assert.ok(!JSON.stringify(body).includes("ghs-test-secret"));
    assert.ok(response.headers.get("set-cookie").includes("Max-Age=0"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("repository API rejects missing sessions and scopes repository data to installs", async () => {
  const repositoryRoute = require("../app/api/repositories/route.ts");
  const missing = await repositoryRoute.GET(new Request("http://localhost/api/repositories"));
  assert.equal(missing.status, 401);

  const { request } = createSessionRequest();
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    if (String(input).includes("/user/installations?")) {
      return jsonResponse({
        total_count: 1,
        installations: [{ id: 7, account: { login: "owner", type: "Organization" } }],
      });
    }
    return jsonResponse({
      total_count: 1,
      repositories: [
        {
          id: 42,
          name: "sample",
          full_name: "owner/sample",
          owner: { login: "owner" },
          private: true,
          visibility: "private",
          default_branch: "main",
          description: "Authorized only",
          updated_at: "2026-10-20T00:00:00Z",
        },
      ],
    });
  };
  try {
    const response = await repositoryRoute.GET(
      new Request("http://localhost/api/repositories?q=owner&visibility=private", {
        headers: { cookie: request.headers.get("cookie") },
      }),
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.repositories[0].id, 42);
    assert.equal(body.repositories[0].visibility, "private");
    assert.ok(!JSON.stringify(body).includes("ghs-test-secret"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("repository endpoint paginates authorized repositories after server-side filters", async () => {
  const repositoryRoute = require("../app/api/repositories/route.ts");
  const { request } = createSessionRequest();
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    if (String(input).includes("/user/installations?")) {
      return jsonResponse({
        total_count: 1,
        installations: [{ id: 7, account: { login: "owner" } }],
      });
    }
    return jsonResponse({
      total_count: 30,
      repositories: Array.from({ length: 30 }, (_, index) => {
        const number = index + 1;
        return {
          id: number,
          name: `project-${number}`,
          full_name: `owner/project-${number}`,
          owner: { login: "owner" },
          private: number % 2 === 0,
          visibility: number % 2 === 0 ? "private" : "public",
        };
      }),
    });
  };
  try {
    const response = await repositoryRoute.GET(
      new Request(
        "http://localhost/api/repositories?page=2&q=owner&visibility=all",
        { headers: { cookie: request.headers.get("cookie") } },
      ),
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.total, 30);
    assert.equal(body.repositories.length, 5);
    assert.equal(body.repositories[0].name, "project-26");
    assert.equal(body.hasMore, false);
    const privateResponse = await repositoryRoute.GET(
      new Request(
        "http://localhost/api/repositories?page=1&q=owner&visibility=private",
        { headers: { cookie: request.headers.get("cookie") } },
      ),
    );
    const privateBody = await privateResponse.json();
    assert.equal(privateBody.total, 15);
    assert.ok(privateBody.repositories.every((item) => item.visibility === "private"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("commit route does not retrieve commits for a repository outside the installation", async () => {
  const commitRoute = require("../app/api/repositories/[repositoryId]/commits/route.ts");
  const { request } = createSessionRequest();
  const originalFetch = global.fetch;
  let commitRequested = false;
  global.fetch = async (input) => {
    if (String(input).includes("/commits?")) commitRequested = true;
    if (String(input).includes("/user/installations?")) {
      return jsonResponse({
        total_count: 1,
        installations: [{ id: 7, account: { login: "owner" } }],
      });
    }
    return jsonResponse({
      total_count: 1,
      repositories: [{
        id: 42,
        name: "sample",
        full_name: "owner/sample",
        owner: { login: "owner" },
        private: true,
      }],
    });
  };
  try {
    const response = await commitRoute.GET(
      new Request("http://localhost/api/repositories/99/commits", {
        headers: { cookie: request.headers.get("cookie") },
      }),
      { params: Promise.resolve({ repositoryId: "99" }) },
    );
    assert.equal(response.status, 404);
    assert.equal(commitRequested, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("repository scans enforce CSRF and require a full commit SHA", async () => {
  const scanRoute = require("../app/api/github/scans/route.ts");
  const { session, request } = createSessionRequest();
  process.env.ANALYZER_API_KEY = "test-analyzer-key";
  const csrfRejected = await scanRoute.POST(
    new Request("http://localhost/api/github/scans", {
      method: "POST",
      headers: {
        cookie: request.headers.get("cookie"),
        "content-type": "application/json",
      },
      body: JSON.stringify({ repositoryId: 42, commitSha: fullSha }),
    }),
  );
  assert.equal(csrfRejected.status, 403);

  const invalidSha = await scanRoute.POST(
    new Request("http://localhost/api/github/scans", {
      method: "POST",
      headers: {
        cookie: request.headers.get("cookie"),
        "content-type": "application/json",
        "x-csrf-token": session.csrfToken,
      },
      body: JSON.stringify({ repositoryId: 42, commitSha: "abc123" }),
    }),
  );
  assert.equal(invalidSha.status, 422);
});

test("repository scan revalidates the commit and forwards only validated source to FastAPI", async () => {
  const scanRoute = require("../app/api/github/scans/route.ts");
  const { session, request } = createSessionRequest();
  process.env.ANALYZER_API_KEY = "test-analyzer-key";
  process.env.ANALYZER_URL = "http://127.0.0.1:8001";
  const sourceText = 'const count: number = "wrong";\n';
  const sourceBytes = Buffer.from(sourceText);
  const blobSha = "b".repeat(40);
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.startsWith("http://127.0.0.1:8001/analyze/sources")) {
      const payload = JSON.parse(init.body);
      assert.equal(payload.repositoryFullName, "owner/sample");
      assert.equal(payload.commitSha, fullSha);
      assert.deepEqual(payload.files, [{ path: "src/App.ts", content: sourceText }]);
      assert.equal(init.headers["x-analyzer-api-key"], "test-analyzer-key");
      assert.ok(!JSON.stringify(payload).includes("ghs-test-secret"));
      return jsonResponse({
        id: "scan-id",
        fixtureId: "github:owner/sample",
        repositoryFullName: "owner/sample",
        commitSha: fullSha,
        status: "completed",
        findings: [],
        files: [{
          path: "src/App.ts",
          status: "included",
          reason: "supported_source_or_configuration",
          sizeBytes: sourceBytes.length,
        }],
        analyzers: [{
          name: "typescript",
          version: "5.9.3",
          status: "completed",
          message: "completed",
          filesAnalyzed: 1,
          findingsCount: 0,
          durationMs: 10,
        }],
        errors: [],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      });
    }
    if (url.includes("/user/installations?")) {
      return jsonResponse({
        total_count: 1,
        installations: [{ id: 7, account: { login: "owner" } }],
      });
    }
    if (url.includes("/user/installations/7/repositories")) {
      return jsonResponse({
        total_count: 1,
        repositories: [{
          id: 42,
          name: "sample",
          full_name: "owner/sample",
          owner: { login: "owner" },
          private: true,
          visibility: "private",
        }],
      });
    }
    if (url.includes(`/commits/${fullSha}`)) return jsonResponse({ sha: fullSha });
    if (url.includes(`/git/trees/${fullSha}`)) {
      return jsonResponse({
        truncated: true,
        tree: [
          { path: "src/App.ts", mode: "100644", type: "blob", sha: blobSha, size: sourceBytes.length },
          { path: ".env.production", mode: "100644", type: "blob", sha: "c".repeat(40), size: 4 },
        ],
      });
    }
    if (url.includes(`/git/blobs/${blobSha}`)) {
      return jsonResponse({
        content: sourceBytes.toString("base64"),
        encoding: "base64",
        size: sourceBytes.length,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const response = await scanRoute.POST(
      new Request("http://localhost/api/github/scans", {
        method: "POST",
        headers: {
          cookie: request.headers.get("cookie"),
          "content-type": "application/json",
          "x-csrf-token": session.csrfToken,
        },
        body: JSON.stringify({ repositoryId: 42, commitSha: fullSha }),
      }),
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.repositoryFullName, "owner/sample");
    assert.equal(body.commitSha, fullSha);
    assert.equal(body.status, "partial");
    assert.ok(body.errors.some((message) => message.includes("truncated")));
    assert.ok(body.files.some((file) => file.path === ".env.production" && file.status === "skipped"));
    const analyzerRequest = requests.find((item) =>
      item.url.startsWith("http://127.0.0.1:8001"),
    );
    assert.ok(analyzerRequest);
    assert.ok(!JSON.stringify(body).includes("ghs-test-secret"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("GitHub rate limits are surfaced as a safe retryable error", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    jsonResponse(
      { message: "ghs-sensitive-upstream-response" },
      403,
      { "x-ratelimit-remaining": "0" },
    );
  try {
    await assert.rejects(
      require("../lib/github/api.ts").githubGet("/user/installations", "token"),
      (error) => {
        const safe = safeGitHubError(error);
        return (
          error instanceof GitHubApiError &&
          safe.status === 429 &&
          !safe.message.includes("ghs-sensitive-upstream-response")
        );
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});
