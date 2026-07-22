import { ZipArchive } from "archiver";
import { createWriteStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
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
    const archive = new ZipArchive({ zlib: { level: 1 } });

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
  coverLetterTxtName: string;
  /** Present on serverless so the client can download without shared disk. */
  downloads?: {
    /** Optional — omitted on Vercel to keep SSE payloads small. */
    zipBase64?: string;
    resumeDocxBase64: string;
    resumePdfBase64: string;
    coverLetterDocxBase64: string;
    coverLetterTxtBase64: string;
  };
}> {
  const { index, extracted, personal, tailored } = options;
  const ephemeral = isEphemeralFilesystem();
  const outputRoot = getOutputRoot();
  const baseName = sanitizeCompanyFolderName(extracted.company);
  const folderName = `${baseName}_${index}`;
  const folderPath = path.join(outputRoot, folderName);
  const files = buildDocumentFileNames(personal.name);

  // Build documents in parallel — biggest packaging speedup after the LLM.
  const [resumeDocx, resumePdf, coverDocx] = await Promise.all([
    buildResumeDocx(personal, tailored.resume),
    buildResumePdf(personal, tailored.resume),
    buildCoverLetterDocx(
      personal,
      extracted.company,
      extracted.jobTitle,
      tailored.coverLetter,
      tailored.resume.keywords,
    ),
  ]);

  const zipName = buildZipFileName(extracted.company, extracted.jobTitle);
  const zipPath = path.join(outputRoot, zipName);
  const coverLetterTxtBase64 = Buffer.from(tailored.coverLetter, "utf8").toString(
    "base64",
  );

  if (ephemeral) {
    // No disk I/O on Vercel — stream base64 only. Client builds the zip.
    return {
      folderPath,
      zipPath,
      zipName,
      folderName,
      company: extracted.company,
      resumeDocxName: files.resumeDocx,
      resumePdfName: files.resumePdf,
      coverLetterDocxName: files.coverLetterDocx,
      coverLetterTxtName: files.coverLetterTxt,
      downloads: {
        resumeDocxBase64: resumeDocx.toString("base64"),
        resumePdfBase64: resumePdf.toString("base64"),
        coverLetterDocxBase64: coverDocx.toString("base64"),
        coverLetterTxtBase64,
      },
    };
  }

  await mkdir(folderPath, { recursive: true });
  await Promise.all([
    writeFile(path.join(folderPath, files.resumeDocx), resumeDocx),
    writeFile(path.join(folderPath, files.resumePdf), resumePdf),
    writeFile(path.join(folderPath, files.coverLetterDocx), coverDocx),
    writeFile(
      path.join(folderPath, files.coverLetterTxt),
      tailored.coverLetter,
      "utf8",
    ),
  ]);
  await zipDirectory(folderPath, zipPath);

  return {
    folderPath,
    zipPath,
    zipName,
    folderName,
    company: extracted.company,
    resumeDocxName: files.resumeDocx,
    resumePdfName: files.resumePdf,
    coverLetterDocxName: files.coverLetterDocx,
    coverLetterTxtName: files.coverLetterTxt,
  };
}
