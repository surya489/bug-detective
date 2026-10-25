import { NextResponse } from "next/server";
import { getAndClearOAuthState, getSession, setSession } from "@/lib/auth/session";
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
    const existingSession = await getSession();

    // If the user is already authenticated via email/password, link their GitHub account
    if (existingSession && existingSession.user.provider === "credentials") {
      await setSession({
        user: {
          ...existingSession.user,
          login: profile.login,
          htmlUrl: profile.html_url,
          githubConnected: true,
          githubUsername: profile.login,
          githubAvatarUrl: profile.avatar_url,
          githubAccessToken: accessToken,
        },
        accessToken,
        createdAt: existingSession.createdAt,
      });

      return NextResponse.redirect(
        new URL("/repositories?connected=github", origin),
      );
    }

    // Direct GitHub login: create session and consider them as a new user
    await setSession({
      user: {
        id: profile.id,
        login: profile.login,
        name: profile.name,
        avatarUrl: profile.avatar_url,
        htmlUrl: profile.html_url,
        email: profile.email,
        provider: "github",
        isNewUser: true,
        githubConnected: true,
        githubUsername: profile.login,
        githubAvatarUrl: profile.avatar_url,
        githubAccessToken: accessToken,
      },
      accessToken,
      createdAt: Date.now(),
    });

    return NextResponse.redirect(
      new URL("/repositories?new_user=true", origin),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(
      new URL(`/repositories?error=${encodeURIComponent(message)}`, origin),
    );
  }
}
