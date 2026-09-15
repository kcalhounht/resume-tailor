export const dynamic = "force-dynamic";

export default function SampleJobPage() {
  return (
    <main className="sample-job">
      <p className="sample-job-kicker">Sample posting</p>
      <article className="job-description" id="job-details">
        <h1>Senior Software Engineer</h1>
        <p>
          Acme Health is hiring a Senior Software Engineer to build ATS-friendly
          hiring tools. Use the <strong>Send job to Resume Tailor</strong>{" "}
          bookmark on this page to try capturing a posting.
        </p>
        <h2>About the role</h2>
        <p>
          You will own end-to-end features in a Next.js app: job capture, resume
          generation, and document packaging. The stack is TypeScript, React,
          and PostgreSQL. You will work with product to keep the Generate resume
          flow fast for people who are applying from LinkedIn, Indeed, and
          company career sites.
        </p>
        <h2>What you will do</h2>
        <ul>
          <li>Ship UI for profile, generate, and records</li>
          <li>Integrate OpenRouter models for JD extraction</li>
          <li>Keep PDF and DOCX output ATS-safe</li>
          <li>Support capturing a posting from the bookmarks bar on any job tab</li>
        </ul>
        <h2>Requirements</h2>
        <ul>
          <li>5+ years building web applications</li>
          <li>Strong TypeScript and React</li>
          <li>Experience with document generation or hiring products</li>
          <li>
            Comfortable debugging browser popups, session storage, and
            postMessage
          </li>
        </ul>
      </article>
    </main>
  );
}
