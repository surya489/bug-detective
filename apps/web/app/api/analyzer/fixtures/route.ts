import { requestAnalyzer } from "@/lib/api/analyzer";

export async function GET() {
  const response = await requestAnalyzer("/fixtures");
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
