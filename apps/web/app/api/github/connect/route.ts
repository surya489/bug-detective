import { getGitHubAppConfig } from "@/lib/github/config";
import { setOAuthStateCookie, createOAuthState } from "@/lib/github/session";

export async function GET() {
  const config = getGitHubAppConfig();
  if (!config) {
    return Response.json(
      { error: { code: "GITHUB_NOT_CONFIGURED", message: "GitHub connection is not configured." } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const state = createOAuthState();
  const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.callbackUrl);
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("allow_signup", "false");
  const response = new Response(null, {
    status: 302,
    headers: {
      location: authorizationUrl.toString(),
      "cache-control": "no-store",
    },
  });
  return setOAuthStateCookie(response, state);
}
