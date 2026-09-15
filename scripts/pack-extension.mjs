import { createWriteStream } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { ZipArchive } = createRequire(import.meta.url)("archiver");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "extension");
const outputs = [
  path.join(root, "resume-tailor-extension.zip"),
  path.join(root, "public", "resume-tailor-extension.zip"),
];

async function writeZip(out) {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const output = createWriteStream(out);
  const done = new Promise((resolve, reject) => {
    output.on("close", () => resolve(archive.pointer()));
    output.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(output);
  archive.glob("**/*", {
    cwd: source,
    ignore: ["fixtures/**"],
  });
  await archive.finalize();
  const bytes = await done;
  console.log(`Wrote ${out} (${bytes} bytes)`);
}

for (const out of outputs) {
  await writeZip(out);
}
