const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const webRoot = path.resolve(__dirname, "..");
const sharedTypes = path.resolve(webRoot, "..", "..", "packages", "shared-types", "src", "index.ts");

require.extensions[".ts"] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  const transformed = output
    .replace(/require\("@\/([^"]+)"\)/g, (_match, request) =>
      `require(${JSON.stringify(path.join(webRoot, request))})`,
    )
    .replace(
      /require\("@bug-detective\/shared-types"\)/g,
      `require(${JSON.stringify(sharedTypes)})`,
    );
  module._compile(transformed, filename);
};
