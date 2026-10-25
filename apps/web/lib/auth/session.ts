import { cookies } from "next/headers";
import crypto from "node:crypto";

export type AuthProvider = "github" | "credentials";

export type SessionUser = {
  id: number | string;
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl?: string;
  email?: string | null;
  provider: AuthProvider;
  isNewUser?: boolean;
  githubConnected?: boolean;
  githubUsername?: string | null;
  githubAvatarUrl?: string | null;
  githubAccessToken?: string | null;
};

// Backwards compatibility alias
export type GitHubUser = SessionUser;

export type SessionData = {
  user: SessionUser;
  accessToken?: string;
  createdAt: number;
};

const SESSION_COOKIE_NAME = "bug_detective_session";
const STATE_COOKIE_NAME = "bug_detective_oauth_state";

function getSecretKey(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.GITHUB_CLIENT_SECRET ||
    "bug-detective-local-secret-key-32-chars-long!"
  );
}

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function encodeSession(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data), "utf-8").toString(
    "base64url",
  );
  const signature = sign(payload, getSecretKey());
  return `${payload}.${signature}`;
}

function decodeSession(token: string): SessionData | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expectedSignature = sign(payload, getSecretKey());

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const raw = Buffer.from(payload, "base64url").toString("utf-8");
    const session = JSON.parse(raw) as SessionData;
    // Expire session after 30 days
    if (Date.now() - session.createdAt > 30 * 24 * 60 * 60 * 1000) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return null;
  return decodeSession(cookie.value);
}

export async function setSession(session: SessionData): Promise<void> {
  const cookieStore = await cookies();
  const token = encodeSession(session);
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function setOAuthState(state: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
}

export async function getAndClearOAuthState(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(STATE_COOKIE_NAME);
  if (!cookie?.value) return null;
  cookieStore.delete(STATE_COOKIE_NAME);
  return cookie.value;
}
