import { NextResponse } from "next/server";
import { getAndClearOAuthState, setSession } from "@/lib/auth/session";
import { exchangeCodeForToken, getGitHubUserProfile } from "@/lib/github/oauth";
import { getRequestOrigin } from "@/lib/utils";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/repositories?error=${encodeURIComponent(error)}`, origin),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/repositories?error=missing_code_or_state", origin),
    );
  }

  const savedState = await getAndClearOAuthState();
  if (!savedState || savedState !== state) {
    return NextResponse.redirect(
      new URL("/repositories?error=invalid_state", origin),
    );
  }

  try {
    const accessToken = await exchangeCodeForToken(code, origin);
    const profile = await getGitHubUserProfile(accessToken);

    await setSession({
      user: {
        id: profile.id,
        login: profile.login,
        name: profile.name,
        avatarUrl: profile.avatar_url,
        htmlUrl: profile.html_url,
        email: profile.email,
      },
      accessToken,
      createdAt: Date.now(),
    });

    return NextResponse.redirect(new URL("/repositories", origin));
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(
      new URL(`/repositories?error=${encodeURIComponent(message)}`, origin),
    );
  }
}
