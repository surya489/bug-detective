import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { fetchUserRepositories } from "@/lib/github/repositories";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message: "Connect your GitHub account to access your repositories.",
        },
      },
      { status: 401 },
    );
  }

  try {
    const repositories = await fetchUserRepositories(session.accessToken);
    return NextResponse.json({ repositories });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch repositories from GitHub.";
    return NextResponse.json(
      {
        error: {
          code: "GITHUB_API_ERROR",
          message,
        },
      },
      { status: 502 },
    );
  }
}
