import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
const OAUTH_STATE_LIFETIME_SECONDS = 10 * 60;
const sessionCookie =
  process.env.NODE_ENV === "production"
    ? "__Host-bug-detective-session"
    : "bug-detective-session";
const stateCookie =
  process.env.NODE_ENV === "production"
    ? "__Host-bug-detective-oauth-state"
    : "bug-detective-oauth-state";

export interface GitHubSession {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
  expiresAt: number;
  login: string;
  csrfToken: string;
}

interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
}

function secretKey(): Buffer {
  const encoded = process.env.GITHUB_SESSION_SECRET;
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error("GitHub session encryption is not configured.");
  }
  const key = Buffer.from(encoded, "base64url");
  if (key.byteLength !== 32) {
    throw new Error("GitHub session encryption is not configured.");
  }
  return key;
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; path: string; httpOnly: boolean },
): string {
  const attributes = [
    `${name}=${value}`,
    `Path=${options.path}`,
    `Max-Age=${Math.max(0, options.maxAge)}`,
    "SameSite=Lax",
  ];
  if (options.httpOnly) attributes.push("HttpOnly");
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

function encryptSession(session: GitHubSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptSession(value: string): GitHubSession | null {
  try {
    const [ivPart, tagPart, dataPart, extra] = value.split(".");
    if (!ivPart || !tagPart || !dataPart || extra !== undefined) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secretKey(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const session: unknown = JSON.parse(plaintext);
    if (
      typeof session !== "object" ||
      session === null ||
      !("accessToken" in session) ||
      typeof session.accessToken !== "string" ||
      !("login" in session) ||
      typeof session.login !== "string" ||
      !("csrfToken" in session) ||
      typeof session.csrfToken !== "string" ||
      !("expiresAt" in session) ||
      typeof session.expiresAt !== "number"
    ) {
      return null;
    }
    return session as GitHubSession;
  } catch {
    return null;
  }
}

async function refreshSession(
  session: GitHubSession,
): Promise<GitHubSession | null> {
  if (
    !session.refreshToken ||
    (session.refreshTokenExpiresAt !== undefined &&
      session.refreshTokenExpiresAt <= Date.now())
  ) {
    return null;
  }
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: session.refreshToken,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > 16 * 1024) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > 16 * 1024) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const token = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as OAuthTokenResponse;
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
      return null;
    }
    const now = Date.now();
    return {
      ...session,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      accessTokenExpiresAt: token.expires_in
        ? now + token.expires_in * 1000
        : undefined,
      refreshTokenExpiresAt: token.refresh_token_expires_in
        ? now + token.refresh_token_expires_in * 1000
        : session.refreshTokenExpiresAt,
    };
  } catch {
    return null;
  }
}

export async function readGitHubSession(
  request: Request,
): Promise<GitHubSession | null> {
  const value = cookieValue(request, sessionCookie);
  if (!value) return null;
  const session = decryptSession(value);
  if (!session || session.expiresAt <= Date.now()) return null;
  if (
    session.accessTokenExpiresAt !== undefined &&
    session.accessTokenExpiresAt <= Date.now() + 60_000
  ) {
    return refreshSession(session);
  }
  return session;
}

export function setGitHubSessionCookie(
  response: Response,
  session: GitHubSession,
): Response {
  const maxAge = Math.floor((session.expiresAt - Date.now()) / 1000);
  response.headers.append(
    "set-cookie",
    serializeCookie(sessionCookie, encryptSession(session), {
      maxAge,
      path: "/",
      httpOnly: true,
    }),
  );
  response.headers.set("cache-control", "no-store");
  return response;
}

export function clearGitHubSessionCookie(response: Response): Response {
  response.headers.append(
    "set-cookie",
    serializeCookie(sessionCookie, "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
    }),
  );
  response.headers.set("cache-control", "no-store");
  return response;
}

export function createGitHubSession(
  token: OAuthTokenResponse,
  login: string,
): GitHubSession {
  if (
    typeof token.access_token !== "string" ||
    !token.access_token ||
    token.error ||
    !login ||
    login.length > 255
  ) {
    throw new Error("GitHub authorization did not return a valid access token.");
  }
  const now = Date.now();
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    accessTokenExpiresAt: token.expires_in
      ? now + token.expires_in * 1000
      : undefined,
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? now + token.refresh_token_expires_in * 1000
      : undefined,
    expiresAt: now + SESSION_LIFETIME_SECONDS * 1000,
    login,
    csrfToken: randomBytes(32).toString("base64url"),
  };
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function setOAuthStateCookie(response: Response, state: string): Response {
  response.headers.append(
    "set-cookie",
    serializeCookie(stateCookie, state, {
      maxAge: OAUTH_STATE_LIFETIME_SECONDS,
      path: "/",
      httpOnly: true,
    }),
  );
  response.headers.set("cache-control", "no-store");
  return response;
}

export function clearOAuthStateCookie(response: Response): Response {
  response.headers.append(
    "set-cookie",
    serializeCookie(stateCookie, "", {
      maxAge: 0,
      path: "/",
      httpOnly: true,
    }),
  );
  return response;
}

export function verifyOAuthState(request: Request, state: string): boolean {
  const expected = cookieValue(request, stateCookie);
  if (!expected || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(state);
  return (
    expectedBytes.byteLength === actualBytes.byteLength &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

export function verifyCsrf(request: Request, session: GitHubSession): boolean {
  const supplied = request.headers.get("x-csrf-token") ?? "";
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!supplied) return false;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(session.csrfToken);
  return (
    suppliedBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}
