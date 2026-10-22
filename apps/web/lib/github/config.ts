export interface GitHubAppConfig {
  clientId: string;
  callbackUrl: string;
  appOrigin: string;
}

export function getGitHubAppConfig(): GitHubAppConfig | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackValue = process.env.GITHUB_CALLBACK_URL;
  const encodedKey = process.env.GITHUB_SESSION_SECRET;
  if (!clientId || !clientSecret || !callbackValue || !encodedKey) return null;

  let callback: URL;
  try {
    callback = new URL(callbackValue);
  } catch {
    return null;
  }
  const key = Buffer.from(encodedKey, "base64url");
  const localHttp =
    process.env.NODE_ENV !== "production" &&
    callback.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(callback.hostname);
  if (
    callback.pathname !== "/api/github/callback" ||
    callback.search ||
    callback.hash ||
    callback.username ||
    callback.password ||
    (callback.protocol !== "https:" && !localHttp) ||
    key.byteLength !== 32 ||
    !/^[A-Za-z0-9_-]+$/.test(encodedKey)
  ) {
    return null;
  }
  return {
    clientId,
    callbackUrl: callback.toString(),
    appOrigin: callback.origin,
  };
}

export function appDestination(path: "/repositories"): URL | null {
  const config = getGitHubAppConfig();
  return config ? new URL(path, config.appOrigin) : null;
}
