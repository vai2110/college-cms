# CollegeCMS Production Upgrade

This upgrade adds:
- Private login and protected CMS APIs
- Separate SEO editing controls
- A single continuous editor for page body content
- Live website content loading from `mba-admission-portal`
- Draft saving without changing the live website
- Publish-to-GitHub workflow
- Website page discovery for existing and future HTML pages

## Important setup

1. Replace `server.js`, `package.json`, and `public/index.html`.
2. Add `.env.example` and `.gitignore`.
3. Run `npm install`.
4. Configure environment variables on your deployment host.
5. Use a fine-grained GitHub token with **Contents: Read and write** access to `mba-admission-portal`.
6. Deploy the CMS on a Node.js host such as Render.

Do not commit `.env` or any GitHub token to GitHub.
