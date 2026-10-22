import { appDestination, getGitHubAppConfig } from "@/lib/github/config";
import {
  exchangeGitHubCode,
  getGitHubLogin,
} from "@/lib/github/api";
import {
  clearOAuthStateCookie,
  createGitHubSession,
  setGitHubSessionCookie,
  verifyOAuthState,
} from "@/lib/github/session";

function failureRedirect(result: "state_error" | "denied" | "error"): Response {
  const destination = appDestination("/repositories");
  if (!destination) {
    return Response.json(
      { error: { code: "GITHUB_NOT_CONFIGURED", message: "GitHub connection is not configured." } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  destination.searchParams.set("github", result);
  const response = new Response(null, {
    status: 303,
    headers: { location: destination.toString() },
  });
  clearOAuthStateCookie(response);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const config = getGitHubAppConfig();
  if (!config) {
    return Response.json(
      { error: { code: "GITHUB_NOT_CONFIGURED", message: "GitHub connection is not configured." } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const states = url.searchParams.getAll("state");
  const codes = url.searchParams.getAll("code");
  if (
    states.length !== 1 ||
    !verifyOAuthState(request, states[0] ?? "") ||
    (url.searchParams.has("error") && codes.length !== 0)
  ) {
    return failureRedirect("state_error");
  }
  if (url.searchParams.has("error")) return failureRedirect("denied");
  if (
    codes.length !== 1 ||
    codes[0].length > 1024 ||
    !/^[A-Za-z0-9._-]+$/.test(codes[0])
  ) {
    return failureRedirect("state_error");
  }

  try {
    const token = await exchangeGitHubCode(codes[0], config.callbackUrl);
    const login = await getGitHubLogin(token.access_token);
    const session = createGitHubSession(token, login);
    const destination = appDestination("/repositories");
    if (!destination) return failureRedirect("error");
    destination.searchParams.set("github", "connected");
    const response = new Response(null, {
      status: 303,
      headers: { location: destination.toString() },
    });
    clearOAuthStateCookie(response);
    response.headers.set("cache-control", "no-store");
    return setGitHubSessionCookie(response, session);
  } catch {
    return failureRedirect("error");
  }
}
