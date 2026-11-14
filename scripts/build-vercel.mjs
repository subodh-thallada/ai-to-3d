// Builds Protoforge for Vercel using the Build Output API (v3):
//   .vercel/output/static            <- Vite build of web/ (served from the CDN)
//   .vercel/output/functions/api.func <- the Express API bundled by esbuild into one ESM file
//   .vercel/output/config.json       <- routes: /api/* -> function, SPA fallback -> index.html
// Vercel runs this via `npm run vercel-build` (see vercel.json). Works locally too: `npm run vercel-build`.
import { build } from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".vercel", "output");
const fnDir = path.join(out, "functions", "api.func");
const maxDuration = Number(process.env.PF_MAX_DURATION || 300);

const step = (msg) => console.log(`\n▸ ${msg}`);

step("Building web (vite)");
execSync("npm run build -w web", { cwd: root, stdio: "inherit" });

step("Preparing .vercel/output");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(fnDir, { recursive: true });
fs.cpSync(path.join(root, "web", "dist"), path.join(out, "static"), { recursive: true });

step("Bundling API function (esbuild)");
await build({
  entryPoints: [path.join(root, "server", "src", "vercel.ts")],
  outfile: path.join(fnDir, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  // CJS dependencies bundled into ESM still call require()/__dirname
  banner: {
    js: [
      "import { createRequire as __pfCreateRequire } from 'module';",
      "import { fileURLToPath as __pfFileURLToPath } from 'url';",
      "import { dirname as __pfDirname } from 'path';",
      "const require = __pfCreateRequire(import.meta.url);",
      "const __filename = __pfFileURLToPath(import.meta.url);",
      "const __dirname = __pfDirname(__filename);",
    ].join("\n"),
  },
  // Optional native/cloud extras of the MongoDB driver — loaded lazily inside try/catch, not needed here
  external: [
    "kerberos",
    "snappy",
    "@mongodb-js/zstd",
    "@aws-sdk/credential-providers",
    "gcp-metadata",
    "mongodb-client-encryption",
    "socks",
    "aws4",
  ],
  logLevel: "info",
});

fs.writeFileSync(
  path.join(fnDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs20.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration,
    },
    null,
    2,
  ),
);
fs.writeFileSync(path.join(fnDir, "package.json"), JSON.stringify({ type: "module" }));

fs.writeFileSync(
  path.join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        // pass the original path along so Express can route even if req.url is rewritten
        { src: "^/api/(.*)$", dest: "/api?__pf_path=/api/$1" },
        { src: "^/api$", dest: "/api?__pf_path=/api" },
        { handle: "filesystem" },
        { src: "^/(.*)$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

const size = (fs.statSync(path.join(fnDir, "index.mjs")).size / 1024 / 1024).toFixed(2);
console.log(`\n✓ Vercel output ready (.vercel/output) — function bundle ${size} MB, maxDuration ${maxDuration}s`);
