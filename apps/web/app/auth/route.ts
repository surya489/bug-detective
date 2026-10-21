import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/utils";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getRequestOrigin(request);
  // Forward code and state to our standard callback endpoint
  const target = new URL("/api/auth/callback/github", origin);
  url.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return NextResponse.redirect(target);
}
