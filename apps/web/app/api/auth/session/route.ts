import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();

  const isConfigured = Boolean(
    (process.env.GITHUB_CLIENT_ID || process.env.AUTH_GITHUB_ID) &&
    (process.env.GITHUB_CLIENT_SECRET || process.env.AUTH_GITHUB_SECRET),
  );

  if (!session) {
    return NextResponse.json({
      authenticated: false,
      user: null,
      isConfigured,
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: session.user,
    isConfigured,
  });
}
