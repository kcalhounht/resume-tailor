import { createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { ZipArchive } = createRequire(import.meta.url)("archiver");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "extension");
const out = path.join(root, "resume-tailor-extension.zip");

const archive = new ZipArchive({ zlib: { level: 9 } });
const output = createWriteStream(out);

output.on("close", () => {
  console.log(`Wrote ${out} (${archive.pointer()} bytes)`);
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);
archive.glob("**/*", {
  cwd: source,
  ignore: ["fixtures/**"],
});
await archive.finalize();
