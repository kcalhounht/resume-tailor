import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { saveJobPackage } from "@/lib/package";
import { draftProfileSchema } from "@/lib/validate";

export const runtime = "nodejs";

const repackageSchema = z.object({
  index: z.number().int().positive(),
  company: z.string().min(1),
  jobTitle: z.string().min(1),
  personal: draftProfileSchema.shape.personal,
  coverLetter: z.string().min(1),
  resume: z.object({
    summary: z.string(),
    skills: z.array(
      z.object({
        category: z.string(),
        items: z.array(z.string()),
      }),
    ),
    experiences: z.array(
      z.object({
        company: z.string(),
        title: z.string(),
        period: z.string(),
        location: z.string(),
        overview: z.string(),
        bullets: z.array(z.string()),
      }),
    ),
    education: draftProfileSchema.shape.education,
    keywords: z.array(z.string()).optional().default([]),
  }),
});

export async function POST(request: Request) {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = repackageSchema.parse(await request.json());
    const saved = await saveJobPackage({
      index: body.index,
      personal: body.personal,
      tailored: {
        resume: {
          ...body.resume,
          experiences: body.resume.experiences.map((exp) => ({
            ...exp,
            bullets: exp.bullets.map((b) => b.trim()).filter(Boolean),
          })),
          keywords: body.resume.keywords || [],
        },
        coverLetter: body.coverLetter,
      },
      extracted: {
        company: body.company,
        jobTitle: body.jobTitle,
        summary: "",
        type: "Software Engineer",
        salaryExpectation: "Not specified",
        workMode: "Remote",
        hardTechnicalSkills: [],
        softSkills: [],
        mustHave: [],
        niceToHave: [],
        qualifications: [],
        responsibilities: [],
        requiredSkills: [],
        yearsOfExperience: "Not specified",
        educationRequirements: "Not specified",
        benefits: [],
        locationRequirement: "Not specified",
      },
    });

    return NextResponse.json({
      ok: true,
      company: saved.company,
      zipName: saved.zipName,
      folderName: saved.folderName,
      resumeDocxName: saved.resumeDocxName,
      resumePdfName: saved.resumePdfName,
      coverLetterDocxName: saved.coverLetterDocxName,
      coverLetterTxtName: saved.coverLetterTxtName,
      downloads: saved.downloads,
    });
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message || "Invalid request"
        : err instanceof Error
          ? err.message
          : "Failed to update package";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
