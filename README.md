# Resume Tailor

Web app that extracts structured JD fields via OpenRouter (DeepSeek V4 Flash by default) from pasted job descriptions, and generates ATS-oriented resumes + cover letters as DOCX/PDF packages.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env and add your OpenRouter key:

```bash
cp .env.example .env.local
```

Set `OPENROUTER_API_KEY` from [openrouter.ai/keys](https://openrouter.ai/keys).  
Default model is `deepseek/deepseek-v4-flash` (override with `OPENROUTER_MODEL`).

For **Vercel**, also set:

- `DATABASE_URL` — Neon connection string (pooled / serverless is fine)
- `AUTH_SECRET` — a long random string

Create a Neon project at [console.neon.tech](https://console.neon.tech), copy the connection string, and paste it into `.env.local` and the Vercel project env vars. Tables are created automatically on the first request. You can also run `src/lib/schema.sql` in the Neon SQL editor.

Without `DATABASE_URL`, local development still uses `data/users.json` and `data/tailor-records.json`.

3. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and **sign up** or **sign in**. The app is private until you have an account.

The first account created on a site is an **administrator**. Admins see an **Admin** link and can open `/admin` to:

- Create accounts at the top of the page
- Select a user from the left list
- Open that user’s **Account**, **Profile**, or **Tailoring record** tab
- Set priority to **able** or **disable** (disabled users cannot sign in)
- Download or delete that user’s generate runs

## Flow

1. Create an account or sign in
2. **Profile** tab: enter your background (contact, experience, education)
3. **Generate resume** tab: paste one or more job descriptions
4. The app extracts each JD and writes a tailored resume + cover letter using **your** background
5. Administrators can manage accounts, profiles, and tailoring records on `/admin`

## Output

For each job (in order):

```
output/
  Company_Name/
    jd.txt
    extracted_jd.txt
    Resume-{FirstName}.docx
    Resume-{FirstName}.pdf
    Coverletter-{FirstName}.docx
    Coverletter-{FirstName}.txt
  Clara-Software Engineer.zip
    ...
```

Each completed job shows an ATS score (/100) in the UI.
Document files use `Resume-{FirstName}` / `Coverletter-{FirstName}`.
Zip files are named `{Company}-{Role}.zip`.
Download links appear after processing.
