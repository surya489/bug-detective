export function getGitHubOAuthUrl(origin: string, state: string): string {
  const clientId =
    process.env.GITHUB_CLIENT_ID || process.env.AUTH_GITHUB_ID;
  if (!clientId) {
    throw new Error("GitHub client ID is not configured");
  }

  const redirectUri = `${origin}/api/auth/callback/github`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });

  // GitHub Apps (IDs starting with Iv) define permissions statically in their
  // settings. Traditional OAuth Apps (IDs starting with Ov or legacy hex)
  // require scope query parameters. We include 'repo' so private repositories
  // and commit trees are accessible.
  if (!clientId.startsWith("Iv")) {
    params.set("scope", "read:user user:email repo");
  }

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  origin: string,
): Promise<string> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth credentials are not configured");
  }

  const redirectUri = `${origin}/api/auth/callback/github`;

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (data.error || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Failed to obtain access token",
    );
  }

  return data.access_token;
}

export async function getGitHubUserProfile(accessToken: string) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Bug-Detective",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub user profile: ${response.status}`);
  }

  return (await response.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string;
    html_url: string;
    email?: string | null;
  };
}
