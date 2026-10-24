const assert = require("node:assert/strict");
const { test } = require("node:test");

// Import the pagination generator
function generatePaginationPages(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "...",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "...",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "...",
    totalPages,
  ];
}

test("pagination returns full array when totalPages <= 7", () => {
  assert.deepEqual(generatePaginationPages(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(generatePaginationPages(4, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test("pagination inserts ellipsis at end when near the start", () => {
  assert.deepEqual(generatePaginationPages(1, 10), [1, 2, 3, 4, 5, "...", 10]);
  assert.deepEqual(generatePaginationPages(3, 20), [1, 2, 3, 4, 5, "...", 20]);
  assert.deepEqual(generatePaginationPages(4, 20), [1, 2, 3, 4, 5, "...", 20]);
});

test("pagination inserts ellipses on both sides when in the middle", () => {
  assert.deepEqual(generatePaginationPages(5, 10), [1, "...", 4, 5, 6, "...", 10]);
  assert.deepEqual(generatePaginationPages(6, 10), [1, "...", 5, 6, 7, "...", 10]);
  assert.deepEqual(generatePaginationPages(10, 20), [1, "...", 9, 10, 11, "...", 20]);
});

test("pagination inserts ellipsis at start when near the end", () => {
  assert.deepEqual(generatePaginationPages(7, 10), [1, "...", 6, 7, 8, 9, 10]);
  assert.deepEqual(generatePaginationPages(10, 10), [1, "...", 6, 7, 8, 9, 10]);
  assert.deepEqual(generatePaginationPages(19, 20), [1, "...", 16, 17, 18, 19, 20]);
});
