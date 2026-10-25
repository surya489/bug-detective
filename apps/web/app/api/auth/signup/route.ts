import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { setSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 },
      );
    }

    const trimmedName = typeof name === "string" && name.trim().length > 0
      ? name.trim()
      : trimmedEmail.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const id = "usr_" + crypto.createHash("sha256").update(trimmedEmail).digest("hex").slice(0, 12);
    const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(trimmedEmail)}`;

    const user = {
      id,
      login: trimmedEmail.split("@")[0],
      email: trimmedEmail,
      name: trimmedName,
      avatarUrl,
      provider: "credentials" as const,
      isNewUser: true,
      githubConnected: false,
      githubUsername: null,
    };

    await setSession({
      user,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      user,
    });
  } catch {
    return NextResponse.json(
      { error: "An unexpected error occurred during registration." },
      { status: 500 },
    );
  }
}
