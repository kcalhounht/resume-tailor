import { ZipArchive } from "archiver";
import { createWriteStream } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { ExtractedJD, PersonalInfo, TailoredPackage } from "./types";
import {
  buildCoverLetterDocx,
  buildResumeDocx,
  buildResumePdf,
} from "./documents";
import {
  buildDocumentFileNames,
  buildZipFileName,
  sanitizeCompanyFolderName,
} from "./scrape";

/** Vercel/Lambda only allow writes under /tmp — cwd (/var/task) is read-only. */
export function isEphemeralFilesystem() {
  return Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

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
  extracted: ExtractedJD;
  personal: PersonalInfo;
  tailored: TailoredPackage;
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
    resumePdfBase64: string;
    coverLetterDocxBase64: string;
  };
}> {
  const { index, extracted, personal, tailored } = options;
  const outputRoot = getOutputRoot();
  await mkdir(outputRoot, { recursive: true });

  const baseName = sanitizeCompanyFolderName(extracted.company);
  const folderName = `${baseName}_${index}`;
  const folderPath = path.join(outputRoot, folderName);
  await mkdir(folderPath, { recursive: true });

  const files = buildDocumentFileNames(personal.name);
  const resumeDocx = await buildResumeDocx(personal, tailored.resume);
  const resumePdf = await buildResumePdf(personal, tailored.resume);
  const coverDocx = await buildCoverLetterDocx(
    personal,
    extracted.company,
    extracted.jobTitle,
    tailored.coverLetter,
    tailored.resume.keywords,
  );

  await writeFile(path.join(folderPath, files.resumeDocx), resumeDocx);
  await writeFile(path.join(folderPath, files.resumePdf), resumePdf);
  await writeFile(path.join(folderPath, files.coverLetterDocx), coverDocx);
  await writeFile(
    path.join(folderPath, files.coverLetterTxt),
    tailored.coverLetter,
    "utf8",
  );

  const zipName = buildZipFileName(extracted.company, extracted.jobTitle);
  const zipPath = path.join(outputRoot, zipName);
  await zipDirectory(folderPath, zipPath);

  const downloads = isEphemeralFilesystem()
    ? {
        zipBase64: (await readFile(zipPath)).toString("base64"),
        resumeDocxBase64: resumeDocx.toString("base64"),
        resumePdfBase64: resumePdf.toString("base64"),
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
