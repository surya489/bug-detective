import { requestAnalyzer } from "@/lib/api/analyzer";

const fixtureIds = new Set(["buggy-react-app", "clean-react-app"]);
const maxRequestBytes = 4 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxRequestBytes) {
    return Response.json(
      { error: { message: "Scan request exceeds the 4 KiB limit." } },
      { status: 413 },
    );
  }

  let rawBody: string;
  try {
    const reader = request.body?.getReader();
    if (!reader) {
      return Response.json(
        { error: { message: "Provide a valid JSON scan request." } },
        { status: 400 },
      );
    }
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maxRequestBytes) {
        await reader.cancel();
        return Response.json(
          { error: { message: "Scan request exceeds the 4 KiB limit." } },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const bodyBytes = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bodyBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    rawBody = new TextDecoder().decode(bodyBytes);
  } catch {
    return Response.json(
      { error: { message: "Provide a valid JSON scan request." } },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json(
      { error: { message: "Provide a valid JSON scan request." } },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("fixtureId" in body) ||
    typeof body.fixtureId !== "string" ||
    !fixtureIds.has(body.fixtureId) ||
    Object.keys(body).some((key) => key !== "fixtureId")
  ) {
    return Response.json(
      { error: { message: "Select a fixture from the available local fixtures." } },
      { status: 422 },
    );
  }

  const response = await requestAnalyzer("/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fixtureId: body.fixtureId }),
  });
  const responseBody = await response.text();
  return new Response(responseBody, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
