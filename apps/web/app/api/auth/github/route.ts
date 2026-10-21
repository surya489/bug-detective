import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { setOAuthState } from "@/lib/auth/session";
import { getGitHubOAuthUrl } from "@/lib/github/oauth";
import { getRequestOrigin } from "@/lib/utils";

export async function GET(request: Request) {
  const clientId =
    process.env.GITHUB_CLIENT_ID || process.env.AUTH_GITHUB_ID;
  const origin = getRequestOrigin(request);

  if (!clientId) {
    return NextResponse.redirect(
      new URL("/repositories?error=oauth_not_configured", origin),
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  await setOAuthState(state);

  const authUrl = getGitHubOAuthUrl(origin, state);
  return NextResponse.redirect(authUrl);
}
