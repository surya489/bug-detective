import { requestAnalyzer } from "@/lib/api/analyzer";

export async function GET() {
  const response = await requestAnalyzer("/health");
  if (!response.ok) {
    return Response.json(
      {
        status: "unavailable",
        message: "The analyzer health check failed.",
      },
      { status: 503 },
    );
  }

  let health: unknown;
  try {
    health = await response.json();
  } catch {
    return Response.json(
      {
        status: "unavailable",
        message: "The analyzer returned an invalid health response.",
      },
      { status: 503 },
    );
  }
  if (
    typeof health !== "object" ||
    health === null ||
    !("status" in health) ||
    health.status !== "ok"
  ) {
    return Response.json(
      {
        status: "unavailable",
        message: "The analyzer returned an unexpected health response.",
      },
      { status: 503 },
    );
  }

  return Response.json({ status: "ok" });
}
