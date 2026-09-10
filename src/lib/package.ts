import { ZipArchive } from "archiver";
import { createWriteStream, existsSync } from "fs";
import { mkdir, readFile, rm, unlink, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { ExtractedJD, PersonalInfo, TailoredPackage } from "./types";
import { isEphemeralFilesystem } from "./runtime";
import {
  buildCoverLetterDocx,
  buildResumeDocx,
  buildResumePdf,
} from "./documents";
import { formatExtractedJd } from "./keywords";
import {
  buildDocumentFileNames,
  buildZipFileName,
  sanitizeCompanyFolderName,
} from "./filenames";

export { isEphemeralFilesystem } from "./runtime";

export function getOutputRoot() {
  if (isEphemeralFilesystem()) {
    return path.join(os.tmpdir(), "resume-tailor-output");
  }
  return path.join(process.cwd(), "output");
}

async function zipDirectory(
  sourceDir: string,
  zipPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}

export async function saveJobPackage(options: {
  index: number;
  rawJd: string;
  extracted: ExtractedJD;
  personal: PersonalInfo;
  tailored: TailoredPackage;
  suffix?: string;
}): Promise<{
  folderPath: string;
  zipPath: string;
  zipName: string;
  folderName: string;
  company: string;
  resumeDocxName: string;
  resumePdfName: string;
  coverLetterDocxName: string;
  /** Present on serverless so the client can download without shared disk. */
  downloads?: {
    zipBase64: string;
    resumeDocxBase64: string;
    coverLetterDocxBase64: string;
  };
}> {
  const { index, rawJd, extracted, personal, tailored, suffix } = options;
  const outputRoot = getOutputRoot();
  await mkdir(outputRoot, { recursive: true });

  const baseName = sanitizeCompanyFolderName(extracted.company);
  const folderName = suffix
    ? `${baseName}_${index}_${suffix}`
    : `${baseName}_${index}`;
  const folderPath = path.join(outputRoot, folderName);
  await mkdir(folderPath, { recursive: true });

  const files = buildDocumentFileNames(personal.name);
  const extractedText = formatExtractedJd(extracted);
  const resumeDocx = await buildResumeDocx(personal, tailored.resume);
  const resumePdf = await buildResumePdf(personal, tailored.resume);
  const coverDocx = await buildCoverLetterDocx(
    personal,
    extracted.company,
    extracted.jobTitle,
    tailored.coverLetter,
    tailored.resume.keywords,
  );

  await writeFile(path.join(folderPath, "jd.txt"), rawJd, "utf8");
  await writeFile(path.join(folderPath, "extracted_jd.txt"), extractedText, "utf8");
  await writeFile(path.join(folderPath, files.resumeDocx), resumeDocx);
  await writeFile(path.join(folderPath, files.resumePdf), resumePdf);
  await writeFile(path.join(folderPath, files.coverLetterDocx), coverDocx);
  await writeFile(
    path.join(folderPath, files.coverLetterTxt),
    tailored.coverLetter,
    "utf8",
  );

  const zipName = buildZipFileName(
    extracted.company,
    extracted.jobTitle,
    suffix,
  );
  const zipPath = path.join(outputRoot, zipName);
  await zipDirectory(folderPath, zipPath);

  const downloads = isEphemeralFilesystem()
    ? {
        zipBase64: (await readFile(zipPath)).toString("base64"),
        resumeDocxBase64: resumeDocx.toString("base64"),
        coverLetterDocxBase64: coverDocx.toString("base64"),
      }
    : undefined;

  return {
    folderPath,
    zipPath,
    zipName,
    folderName,
    company: extracted.company,
    resumeDocxName: files.resumeDocx,
    resumePdfName: files.resumePdf,
    coverLetterDocxName: files.coverLetterDocx,
    downloads,
  };
}

export async function deleteJobOutput(input: {
  folderName?: string;
  zipName?: string;
}) {
  const outputRoot = path.resolve(getOutputRoot());

  if (input.folderName && /^[A-Za-z0-9_-]+$/.test(input.folderName)) {
    const folderPath = path.resolve(outputRoot, input.folderName);
    if (folderPath.startsWith(outputRoot) && existsSync(folderPath)) {
      await rm(folderPath, { recursive: true, force: true });
    }
  }

  if (
    input.zipName &&
    input.zipName.toLowerCase().endsWith(".zip") &&
    !input.zipName.includes("..") &&
    !input.zipName.includes("/") &&
    !input.zipName.includes("\\")
  ) {
    const zipPath = path.resolve(outputRoot, input.zipName);
    if (zipPath.startsWith(outputRoot) && existsSync(zipPath)) {
      await unlink(zipPath);
    }
  }
}
