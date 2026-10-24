const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parseDiffChangedLines, retrieveRepositorySource } = require("../lib/github/source.ts");

test("parseDiffChangedLines extracts lines added in a single hunk", () => {
  const patch = [
    "@@ -10,4 +10,6 @@ export function ChatBubble() {",
    "   const a = 1;",
    "+  const b = 2;",
    "+  const c = 3;",
    "   return null;",
  ].join("\n");

  const lines = parseDiffChangedLines(patch);
  assert.deepEqual(lines, [11, 12]);
});

test("parseDiffChangedLines handles multiple hunks and line deletions", () => {
  const patch = [
    "@@ -5,4 +5,4 @@",
    "-  const old = true;",
    "+  const next = false;",
    "   const stay = 1;",
    "@@ -20,3 +20,5 @@",
    "   const x = 10;",
    "+  const y = 20;",
    "+  const z = 30;",
  ].join("\n");

  const lines = parseDiffChangedLines(patch);
  assert.deepEqual(lines, [5, 21, 22]);
});

test("parseDiffChangedLines handles empty or missing patch safely", () => {
  assert.deepEqual(parseDiffChangedLines(undefined), []);
  assert.deepEqual(parseDiffChangedLines(""), []);
  assert.deepEqual(parseDiffChangedLines("@@ -1,3 +1,0 @@\n-all\n-deleted\n-lines"), []);
});

test("retrieveRepositorySource scopes source files strictly to commit diff", async () => {
  const fullSha = "c".repeat(40);
  const repository = {
    id: 100,
    name: "qikberry-chat-interface",
    fullName: "surya489/qikberry-chat-interface",
    owner: "surya489",
    description: null,
    defaultBranch: "main",
    visibility: "public",
    updatedAt: null,
  };

  const bubbleSource = "export function ChatBubble() { return <div>Chat</div>; }";
  const bubbleBytes = Buffer.from(bubbleSource);
  const bubbleSha = "1".repeat(40);

  const appSource = "export function ChatApp() { return <div>App</div>; }";
  const appBytes = Buffer.from(appSource);
  const appSha = "2".repeat(40);

  const originalFetch = global.fetch;
  const requestedBlobs = [];

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes(`/commits/${fullSha}`)) {
      return new Response(
        JSON.stringify({
          sha: fullSha,
          commit: { message: "Update ChatBubble styling" },
          files: [
            {
              filename: "src/components/chat/ChatBubble.tsx",
              status: "modified",
              additions: 1,
              deletions: 0,
              patch: "@@ -1,1 +1,2 @@\n export function ChatBubble() {\n+  return <div>Chat</div>;\n",
              sha: bubbleSha,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes(`/git/trees/${fullSha}`)) {
      return new Response(
        JSON.stringify({
          truncated: false,
          tree: [
            { path: "src/components/chat/ChatBubble.tsx", mode: "100644", type: "blob", sha: bubbleSha, size: bubbleBytes.length },
            { path: "src/components/chat/ChatApp.tsx", mode: "100644", type: "blob", sha: appSha, size: appBytes.length },
            { path: "src/components/chat/ChatWindow.tsx", mode: "100644", type: "blob", sha: "3".repeat(40), size: 50 },
            { path: "src/components/chat/UserList.tsx", mode: "100644", type: "blob", sha: "4".repeat(40), size: 50 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes(`/git/blobs/${bubbleSha}`)) {
      requestedBlobs.push("ChatBubble.tsx");
      return new Response(
        JSON.stringify({
          content: bubbleBytes.toString("base64"),
          encoding: "base64",
          size: bubbleBytes.length,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes(`/git/blobs/${appSha}`)) {
      requestedBlobs.push("ChatApp.tsx");
      return new Response(
        JSON.stringify({
          content: appBytes.toString("base64"),
          encoding: "base64",
          size: appBytes.length,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected URL requested: ${url}`);
  };

  try {
    const result = await retrieveRepositorySource("test-token", repository, fullSha);
    // ONLY ChatBubble.tsx should be retrieved because it's the only file changed in this commit!
    assert.deepEqual(result.files.map((f) => f.path), ["src/components/chat/ChatBubble.tsx"]);
    assert.deepEqual(requestedBlobs, ["ChatBubble.tsx"]);
    assert.equal(result.files[0].status, "modified");
    assert.deepEqual(result.files[0].changedLines, [2]);
  } finally {
    global.fetch = originalFetch;
  }
});
