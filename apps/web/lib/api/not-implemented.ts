export function notImplemented(endpoint: string): Response {
  return Response.json(
    {
      error: {
        code: "NOT_IMPLEMENTED",
        message: `${endpoint} is not implemented yet.`,
      },
    },
    { status: 501 },
  );
}
