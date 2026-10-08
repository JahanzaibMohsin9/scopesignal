import { createHash } from "node:crypto";

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

function hashCode(code: string) {
  return createHash("sha256").update(normalizeCode(code), "utf8").digest("hex");
}

const codes = process.argv.slice(2);

if (codes.length === 0) {
  console.error("Usage: npm run license:hash -- CODE-1 CODE-2");
  process.exitCode = 1;
} else {
  for (const code of codes) {
    console.log(`${normalizeCode(code)},${hashCode(code)}`);
  }
}
