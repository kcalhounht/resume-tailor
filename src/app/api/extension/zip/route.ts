import { NextResponse } from "next/server";
import { PassThrough, Readable } from "node:stream";
import path from "node:path";
import { ZipArchive } from "archiver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const source = path.join(process.cwd(), "extension");
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const pass = new PassThrough();

  archive.on("error", (error: Error) => {
    pass.destroy(error);
  });
  archive.pipe(pass);
  archive.glob("**/*", {
    cwd: source,
    ignore: ["fixtures/**"],
  });
  void archive.finalize();

  return new NextResponse(Readable.toWeb(pass) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition":
        'attachment; filename="resume-tailor-extension.zip"',
      "Cache-Control": "no-store",
    },
  });
}
