# CollegeDecoded hybrid newsroom setup

## Workflow and publication boundary

- Google Sheets is the editorial queue for ideas, drafts, sources and readiness.
- Only rows with status **Ready for Review** or **In CMS Review** are returned to CollegeCMS.
- Editors review and can edit the article in CollegeCMS. Publishing requires an explicit source-check confirmation.
- Only the CMS publish action commits to `vai2110/mba-admission-portal:data/news.json`.
- Changing a spreadsheet status alone never publishes a story.
- After a successful website commit, the CMS asks Apps Script to mark the row **Published** and records the published URL and commit. If the status update fails, the CMS reports a sync warning; the website commit remains published.

## Required CMS environment variables

Configure these on the CollegeCMS host (for example, the Render service running this Express app):

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH` (preferred) or `ADMIN_PASSWORD`
- `SESSION_SECRET` (use a long random secret)
- `GITHUB_TOKEN` with Contents read/write access to `vai2110/mba-admission-portal`
- `WEBSITE_OWNER=vai2110`
- `WEBSITE_REPO=mba-admission-portal`
- `WEBSITE_BRANCH=main`
- `NEWS_SHEET_WEBAPP_URL` — the deployed Google Apps Script web app URL
- `NEWS_SHEET_API_SECRET` — the same long random secret stored in Apps Script project properties

Do not put either newsroom secret in browser JavaScript, a public sheet, or the website repository.

## Deploy the Google Apps Script

1. Open the newsroom spreadsheet and open **Extensions → Apps Script**.
2. Replace the project code with `integrations/google-sheets/NewsroomSync.gs` from the website repository.
3. In Apps Script **Project Settings → Script Properties**, add `NEWS_SHEET_API_SECRET` with the exact same value as the CMS environment variable.
4. Deploy as a **Web app**. Execute as the spreadsheet owner. Restrict access to the narrowest audience supported by your Workspace/account setup; the shared secret is still required for every request.
5. Copy the deployed web app URL into `NEWS_SHEET_WEBAPP_URL` on the CMS host.
6. Ensure the spreadsheet tab is named **News Queue**. The script adds any missing headers while preserving existing columns and data.

The script supports both the existing website-to-sheet published-news sync payload (`{items:[...]}`) and the CMS actions `getDrafts` and `updateStatus`. Re-deploy the Apps Script version after changing its code.

## Sheet columns and statuses

The core columns are `slug`, `headline`, `seoTitle`, `description`, `category`, `status`, `datePublished`, `dateModified`, `author`, `summary`, `image`, `imageAlt`, `body`, `sourceLinks`, `relatedPages`, `relatedNews`, `keywords`, and `editorialNote`. The script adds `publishedUrl`, `cmsStatusUpdatedAt`, `cmsCommit`, and `reviewNotes`.

Recommended statuses:

- `Idea` — an idea only; never sent to the CMS.
- `Draft` — being researched or written; never sent to the CMS.
- `Ready for Review` — ready to enter the CMS review queue.
- `In CMS Review` — an editor has opened the story for review.
- `Needs Changes` — returned to the editorial team; not in the review queue until marked Ready for Review again.
- `Published` — successfully committed to the website.
- `Error` — reserved for manual error tracking; not published.

For `body`, `sourceLinks`, and `relatedPages`, use valid JSON arrays. `relatedNews` and `keywords` can be pipe-separated in Sheets; the CMS normalises them for publication. Source links must be labelled HTTPS URLs.

## Publishing and validation

1. Add a draft in the spreadsheet; verify its sources before setting **Ready for Review**.
2. Open CollegeCMS and select **Newsroom**.
3. Review the headline, description, article sections, source links and relevant internal links. Fix JSON formatting errors before submitting.
4. Use **Mark In CMS Review** or **Request changes** to coordinate editorial status.
5. Check the confirmation box and press **Publish approved article** only after factual and source checks.
6. Verify the article URL shown by the CMS and confirm the website deployment succeeds.

The website build validates article slugs, unique slugs, required fields, article sections and source URLs. A successful GitHub commit triggers the existing Vercel build; it does not guarantee Google News or organic ranking. Use Search Console to inspect crawling and indexing after publication.

## No seed articles

The current website news registry is intentionally empty. Do not create sample or fictional stories in production. Test the integration with a real, sourced draft and verify the review flow before publishing.
