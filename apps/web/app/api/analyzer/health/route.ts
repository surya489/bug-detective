import { requestAnalyzer } from "@/lib/api/analyzer";

export async function GET() {
  const configuredUrl =
    process.env.ANALYZER_URL ||
    process.env.ANALYZER_BASE_URL ||
    "http://127.0.0.1:8001";

  const response = await requestAnalyzer("/health");
  if (!response.ok) {
    return Response.json(
      {
        status: "unavailable",
        configuredUrl,
        message: `The analyzer at ${configuredUrl} is unreachable or offline.`,
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
        configuredUrl,
        message: "The analyzer returned an invalid response body.",
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
        configuredUrl,
        message: "The analyzer returned an unexpected health payload.",
      },
      { status: 503 },
    );
  }

  return Response.json({
    status: "ok",
    configuredUrl,
    health,
  });
}
