# CollegeCMS Core v2

## What this version adds
- Dynamic college registry
- Add new colleges without changing code
- Add new pages under any college
- Reusable page templates: Overview, Placement, Admission, Courses & Fees, Custom
- Existing pages and future pages in one editorial dashboard
- Single continuous editor for each page
- Draft + Publish workflow
- Local page registry designed for GitHub auto-discovery

## GitHub auto-sync (next connection)
The `/api/sync/discover` endpoint is included as the registration layer. In production, connect it to:
1. GitHub webhook on push, or
2. Scheduled GitHub repository scan.

When a new HTML file is pushed, the sync service should classify its college/page and call this endpoint. The CMS then registers it automatically.

## Run
npm install
npm start
Open http://localhost:3000

## Production recommendation
Keep GitHub as the source repository for frontend code. Add a server-side GitHub integration that:
- scans/discovers new pages,
- imports them into the CMS registry,
- writes CMS edits back through commits or pull requests,
- lets the existing deployment pipeline make the changes live.
