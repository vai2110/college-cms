const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const https = require('https');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const WEBSITE_OWNER = process.env.WEBSITE_OWNER || 'vai2110';
const WEBSITE_REPO = process.env.WEBSITE_REPO || 'mba-admission-portal';
const WEBSITE_BRANCH = process.env.WEBSITE_BRANCH || 'main';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET =
  process.env.SESSION_SECRET || 'change-this-before-production';

app.set('trust proxy', 1);

app.use(express.json({ limit: '25mb' }));

app.use(
  session({
    name: 'collegecms.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

const regFile = path.join(ROOT, 'data', 'registry.json');

const load = () =>
  JSON.parse(fs.readFileSync(regFile, 'utf8'));

const save = data =>
  fs.writeFileSync(
    regFile,
    JSON.stringify(data, null, 2)
  );

const slug = value =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const now = () => new Date().toISOString();

function findPage(id) {
  for (const college of load().colleges) {
    const page = college.pages.find(
      item => `${college.id}:${item.id}` === id
    );

    if (page) {
      return { college, page };
    }
  }

  return null;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  return res.status(401).json({
    error: 'Please sign in to access CollegeCMS.'
  });
}

/* =========================================================
   GITHUB API HELPERS
========================================================= */

function githubRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body
      ? JSON.stringify(body)
      : null;

    const request = https.request(
      {
        hostname: 'api.github.com',
        path: apiPath,
        method,
        headers: {
          'User-Agent': 'CollegeCMS',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',

          ...(GITHUB_TOKEN
            ? {
                Authorization: `Bearer ${GITHUB_TOKEN}`
              }
            : {}),

          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length':
                  Buffer.byteLength(payload)
              }
            : {})
        }
      },
      response => {
        let raw = '';

        response.on('data', chunk => {
          raw += chunk;
        });

        response.on('end', () => {
          let parsed = {};

          try {
            parsed = raw
              ? JSON.parse(raw)
              : {};
          } catch {
            parsed = { raw };
          }

          if (
            response.statusCode >= 200 &&
            response.statusCode < 300
          ) {
            return resolve(parsed);
          }

          reject(
            new Error(
              parsed.message ||
                `GitHub API error (${response.statusCode})`
            )
          );
        });
      }
    );

    request.on('error', reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

function githubContentPath(targetPath) {
  return String(targetPath)
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

async function getWebsiteFile(targetPath) {
  const apiPath =
    `/repos/${WEBSITE_OWNER}/${WEBSITE_REPO}` +
    `/contents/${githubContentPath(targetPath)}` +
    `?ref=${encodeURIComponent(WEBSITE_BRANCH)}`;

  const data = await githubRequest(
    'GET',
    apiPath
  );

  if (!data.content) {
    throw new Error(
      'Website file could not be read from GitHub.'
    );
  }

  return {
    html: Buffer.from(
      data.content.replace(/\n/g, ''),
      'base64'
    ).toString('utf8'),

    sha: data.sha
  };
}

async function putWebsiteFile(
  targetPath,
  html,
  message
) {
  if (!GITHUB_TOKEN) {
    throw new Error(
      'GitHub publishing is not configured. Add GITHUB_TOKEN to your deployment environment variables.'
    );
  }

  let sha = null;

  try {
    sha = (
      await getWebsiteFile(targetPath)
    ).sha;
  } catch (error) {
    if (!/Not Found|404/i.test(error.message)) {
      throw error;
    }
  }

  return githubRequest(
    'PUT',
    `/repos/${WEBSITE_OWNER}/${WEBSITE_REPO}` +
      `/contents/${githubContentPath(targetPath)}`,
    {
      message,

      content: Buffer.from(
        html,
        'utf8'
      ).toString('base64'),

      branch: WEBSITE_BRANCH,

      ...(sha ? { sha } : {})
    }
  );
}

/* =========================================================
   PAGE PATH HELPERS
========================================================= */

function defaultTargetPath(
  collegeId,
  pageId,
  type
) {
  if (type === 'overview') {
    return `${collegeId}.html`;
  }

  if (type === 'placement') {
    return `${collegeId}-placements.html`;
  }

  if (type === 'admission') {
    return `${collegeId}-admission.html`;
  }

  if (type === 'fees') {
    return `${collegeId}-fees.html`;
  }

  return `${collegeId}-${pageId}.html`;
}

function classifyPath(filePath) {
  const base = path.basename(
    filePath,
    '.html'
  );

  if (
    base === 'index' ||
    [
      'college',
      'colleges',
      'exams',
      'content-audit'
    ].includes(base)
  ) {
    return null;
  }

  if (base.endsWith('-placements')) {
    return {
      collegeId: base.replace(
        /-placements$/,
        ''
      ),
      pageId: 'placements',
      name: 'Placements',
      type: 'placement'
    };
  }

  if (base.endsWith('-admission')) {
    return {
      collegeId: base.replace(
        /-admission$/,
        ''
      ),
      pageId: 'admission',
      name: 'Admission',
      type: 'admission'
    };
  }

  if (base.endsWith('-fees')) {
    return {
      collegeId: base.replace(
        /-fees$/,
        ''
      ),
      pageId: 'fees',
      name: 'Courses & Fees',
      type: 'fees'
    };
  }

  if (/^(cat|cmat|gmat|mat|nmat)$/i.test(base)) {
    return null;
  }

  return {
    collegeId: base,
    pageId: 'overview',
    name: 'Overview',
    type: 'overview'
  };
}

/* =========================================================
   SEO HELPERS
========================================================= */

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function decodeHtmlText(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function getTagContent(html, tagName) {
  const match = String(html).match(
    new RegExp(
      `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
      'i'
    )
  );

  return match
    ? decodeHtmlText(match[1])
    : '';
}

function getMetaContent(html, name) {
  const tags =
    String(html).match(/<meta\b[^>]*>/gi) ||
    [];

  const target =
    String(name).toLowerCase();

  for (const tag of tags) {
    const nameMatch = tag.match(
      /\bname\s*=\s*(["'])(.*?)\1/i
    );

    if (
      !nameMatch ||
      nameMatch[2]
        .trim()
        .toLowerCase() !== target
    ) {
      continue;
    }

    const contentMatch = tag.match(
      /\bcontent\s*=\s*(["'])([\s\S]*?)\1/i
    );

    return contentMatch
      ? decodeHtmlText(contentMatch[2])
      : '';
  }

  return '';
}

function extractSeoFromHtml(html) {
  return {
    headerTitle: getTagContent(
      html,
      'h1'
    ),

    seoTitle: getTagContent(
      html,
      'title'
    ),

    seoDescription: getMetaContent(
      html,
      'description'
    ),

    seoKeywords: getMetaContent(
      html,
      'keywords'
    )
  };
}

function upsertTitle(html, value) {
  const safe = escapeHtml(value || '');

  if (
    /<title\b[^>]*>[\s\S]*?<\/title>/i.test(
      html
    )
  ) {
    return html.replace(
      /<title\b[^>]*>[\s\S]*?<\/title>/i,
      `<title>${safe}</title>`
    );
  }

  return html.replace(
    /<\/head>/i,
    `  <title>${safe}</title>\n</head>`
  );
}

function upsertMeta(html, name, value) {
  const safe = escapeHtml(value || '');

  const metaPattern = new RegExp(
    `<meta\\b(?=[^>]*\\bname\\s*=\\s*(["'])${name}\\1)[^>]*>`,
    'i'
  );

  if (metaPattern.test(html)) {
    return html.replace(
      metaPattern,
      `<meta name="${name}" content="${safe}">`
    );
  }

  return html.replace(
    /<\/head>/i,
    `  <meta name="${name}" content="${safe}">\n</head>`
  );
}

function upsertFirstH1(html, value) {
  const safe = escapeHtml(value || '');

  const pattern =
    /<h1\b([^>]*)>[\s\S]*?<\/h1>/i;

  if (pattern.test(html)) {
    return html.replace(
      pattern,
      (match, attributes) =>
        `<h1${attributes}>${safe}</h1>`
    );
  }

  return html.replace(
    /<body\b([^>]*)>/i,
    `<body$1>\n<h1>${safe}</h1>`
  );
}

function applySeoToHtml(html, seo = {}) {
  let updated = String(html);

  updated = upsertTitle(
    updated,
    seo.seoTitle || ''
  );

  updated = upsertMeta(
    updated,
    'description',
    seo.seoDescription || ''
  );

  updated = upsertMeta(
    updated,
    'keywords',
    seo.seoKeywords || ''
  );

  if (
    String(
      seo.headerTitle || ''
    ).trim()
  ) {
    updated = upsertFirstH1(
      updated,
      seo.headerTitle.trim()
    );
  }

  return updated;
}

function markPageDraft(found) {
  const data = load();

  const page = data.colleges
    .find(
      college =>
        college.id === found.college.id
    )
    .pages.find(
      item =>
        item.id === found.page.id
    );

  page.status =
    page.status === 'live'
      ? 'live-draft'
      : 'draft';

  page.draftUpdatedAt = now();

  save(data);

  return page;
}

async function getEditablePageHtml(found) {
  const draftPath = path.join(
    ROOT,
    found.page.source
  );

  const hasDraft =
    fs.existsSync(draftPath) &&
    [
      'draft',
      'live-draft'
    ].includes(found.page.status);

  if (hasDraft) {
    return fs.readFileSync(
      draftPath,
      'utf8'
    );
  }

  if (found.page.targetPath) {
    return (
      await getWebsiteFile(
        found.page.targetPath
      )
    ).html;
  }

  if (fs.existsSync(draftPath)) {
    return fs.readFileSync(
      draftPath,
      'utf8'
    );
  }

  throw new Error(
    'No editable source was found for this page.'
  );
}

/* =========================================================
   AUTHENTICATION
========================================================= */

app.post(
  '/api/login',
  async (req, res) => {
    try {
      const username = String(
        req.body.username || ''
      );

      const password = String(
        req.body.password || ''
      );

      if (
        !ADMIN_USERNAME ||
        (
          !ADMIN_PASSWORD_HASH &&
          !ADMIN_PASSWORD
        )
      ) {
        return res.status(503).json({
          error:
            'CMS login has not been configured on the server yet.'
        });
      }

      const validUser =
        username === ADMIN_USERNAME;

      const validPassword =
        ADMIN_PASSWORD_HASH
          ? await bcrypt.compare(
              password,
              ADMIN_PASSWORD_HASH
            )
          : password === ADMIN_PASSWORD;

      if (
        !validUser ||
        !validPassword
      ) {
        return res.status(401).json({
          error:
            'Invalid username or password.'
        });
      }

      req.session.user = {
        username: ADMIN_USERNAME,
        role: 'admin'
      };

      res.json({
        ok: true,
        user: req.session.user
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

app.post(
  '/api/logout',
  requireAuth,
  (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  }
);

app.get('/api/me', (req, res) => {
  res.json({
    authenticated:
      !!req.session?.user,

    user:
      req.session?.user || null
  });
});

/* =========================================================
   PROTECTED CMS APIs
========================================================= */

app.use('/api', requireAuth);

app.get('/api/config', (req, res) => {
  res.json({
    website:
      `${WEBSITE_OWNER}/${WEBSITE_REPO}`,

    branch: WEBSITE_BRANCH,

    githubPublishingConfigured:
      !!GITHUB_TOKEN
  });
});

app.get('/api/colleges', (req, res) => {
  res.json(load());
});

/* =========================================================
   COLLEGES
========================================================= */

app.post('/api/colleges', (req, res) => {
  const data = load();

  const name =
    req.body.name?.trim();

  if (!name) {
    return res.status(400).json({
      error: 'College name required'
    });
  }

  const id = slug(
    req.body.slug || name
  );

  if (
    data.colleges.some(
      college => college.id === id
    )
  ) {
    return res.status(409).json({
      error: 'College already exists'
    });
  }

  data.colleges.push({
    id,
    name,
    slug: id,
    pages: []
  });

  fs.mkdirSync(
    path.join(
      ROOT,
      'content',
      id
    ),
    {
      recursive: true
    }
  );

  save(data);

  res.json({
    ok: true,
    id
  });
});

/* =========================================================
   CREATE PAGE
========================================================= */

app.post('/api/pages', (req, res) => {
  const data = load();

  const college =
    data.colleges.find(
      item =>
        item.id === req.body.collegeId
    );

  if (!college) {
    return res.status(404).json({
      error: 'College not found'
    });
  }

  const type =
    req.body.type || 'custom';

  const pageName =
    req.body.name || type;

  const id = slug(
    req.body.slug || pageName
  );

  if (
    college.pages.some(
      page => page.id === id
    )
  ) {
    return res.status(409).json({
      error: 'Page already exists'
    });
  }

  const templatePath = path.join(
    ROOT,
    'templates',
    `${type}.html`
  );

  if (!fs.existsSync(templatePath)) {
    return res.status(400).json({
      error: 'Invalid page template'
    });
  }

  const html = fs
    .readFileSync(
      templatePath,
      'utf8'
    )
    .replaceAll(
      '{{COLLEGE_NAME}}',
      college.name
    )
    .replaceAll(
      '{{PAGE_NAME}}',
      pageName
    )
    .replaceAll(
      '{{SEO_TITLE}}',
      `${college.name} ${pageName}`
    )
    .replaceAll(
      '{{META_DESCRIPTION}}',
      `${college.name} ${pageName} information.`
    );

  const rel =
    `content/${college.id}/${id}.html`;

  const abs = path.join(
    ROOT,
    rel
  );

  fs.mkdirSync(
    path.dirname(abs),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    abs,
    html,
    'utf8'
  );

  const page = {
    id,
    name: pageName,
    type,

    category:
      req.body.category || 'college',

    source: rel,

    targetPath: defaultTargetPath(
      college.id,
      id,
      type
    ),

    status: 'draft',
    createdAt: now()
  };

  college.pages.push(page);

  save(data);

  res.json({
    ok: true,
    page: `${college.id}:${id}`
  });
});

/* =========================================================
   LOAD PAGE
========================================================= */

app.get(
  '/api/page/:id',
  async (req, res) => {
    try {
      const found = findPage(
        decodeURIComponent(
          req.params.id
        )
      );

      if (!found) {
        return res.status(404).json({
          error: 'Not found'
        });
      }

      const draftPath = path.join(
        ROOT,
        found.page.source
      );

      const hasDraft =
        fs.existsSync(draftPath) &&
        [
          'draft',
          'live-draft'
        ].includes(
          found.page.status
        );

      let html = null;
      let source = 'live';

      if (hasDraft) {
        html = fs.readFileSync(
          draftPath,
          'utf8'
        );

        source = 'draft';

      } else if (
        found.page.targetPath
      ) {
        html = (
          await getWebsiteFile(
            found.page.targetPath
          )
        ).html;

        source = 'live';

      } else if (
        fs.existsSync(draftPath)
      ) {
        html = fs.readFileSync(
          draftPath,
          'utf8'
        );

        source = 'draft';

      } else {
        return res.status(404).json({
          error:
            'No editable source was found for this page.'
        });
      }

      res.json({
        college: found.college,
        page: found.page,
        html,
        source
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

/* =========================================================
   SAVE DRAFT
========================================================= */

app.put(
  '/api/page/:id',
  (req, res) => {
    try {
      const found = findPage(
        decodeURIComponent(
          req.params.id
        )
      );

      if (!found) {
        return res.status(404).json({
          error: 'Not found'
        });
      }

      if (!req.body.html) {
        return res.status(400).json({
          error: 'HTML is required'
        });
      }

      const abs = path.join(
        ROOT,
        found.page.source
      );

      fs.mkdirSync(
        path.dirname(abs),
        {
          recursive: true
        }
      );

      fs.writeFileSync(
        abs,
        req.body.html,
        'utf8'
      );

      const data = load();

      const page = data.colleges
        .find(
          college =>
            college.id === found.college.id
        )
        .pages.find(
          item =>
            item.id === found.page.id
        );

      page.status =
        page.status === 'live'
          ? 'live-draft'
          : 'draft';

      page.draftUpdatedAt = now();

      save(data);

      res.json({
        ok: true,
        savedAt: page.draftUpdatedAt
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

/* =========================================================
   PUBLISH PAGE
========================================================= */

app.post(
  '/api/page/:id/publish',
  async (req, res) => {
    try {
      const found = findPage(
        decodeURIComponent(
          req.params.id
        )
      );

      if (!found) {
        return res.status(404).json({
          error: 'Not found'
        });
      }

      const abs = path.join(
        ROOT,
        found.page.source
      );

      if (!fs.existsSync(abs)) {
        return res.status(400).json({
          error:
            'Save a draft before publishing.'
        });
      }

      const targetPath =
        found.page.targetPath ||
        defaultTargetPath(
          found.college.id,
          found.page.id,
          found.page.type
        );

      const html = fs.readFileSync(
        abs,
        'utf8'
      );

      const commit =
        await putWebsiteFile(
          targetPath,
          html,
          `CMS publish: ${found.college.name} – ${found.page.name}`
        );

      const verified =
        await getWebsiteFile(
          targetPath
        );

      if (
        verified.html !== html
      ) {
        throw new Error(
          `GitHub accepted the request, but the published file could not be verified at ${targetPath}.`
        );
      }

      const data = load();

      const page = data.colleges
        .find(
          college =>
            college.id === found.college.id
        )
        .pages.find(
          item =>
            item.id === found.page.id
        );

      page.targetPath = targetPath;
      page.status = 'live';
      page.publishedAt = now();

      page.lastCommit =
        commit.commit?.sha ||
        verified.sha ||
        null;

      page.draftUpdatedAt =
        page.publishedAt;

      save(data);

      res.json({
        ok: true,

        message:
          `Published successfully to ${targetPath}.`,

        targetPath,

        commit:
          page.lastCommit,

        publishedAt:
          page.publishedAt
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

/* =========================================================
   PUBLISH HISTORY
========================================================= */

app.get(
  '/api/publish-history',
  async (req, res) => {
    try {
      const commits =
        await githubRequest(
          'GET',

          `/repos/${WEBSITE_OWNER}/${WEBSITE_REPO}` +
            `/commits?sha=${encodeURIComponent(
              WEBSITE_BRANCH
            )}&per_page=100`
        );

      const history = (
        Array.isArray(commits)
          ? commits
          : []
      )
        .map(commit => {
          const message = String(
            commit.commit?.message || ''
          );

          const firstLine =
            message.split('\n')[0];

          if (
            !firstLine.startsWith(
              'CMS publish:'
            )
          ) {
            return null;
          }

          const label =
            firstLine.replace(
              /^CMS publish:\s*/,
              ''
            );

          const [
            college = 'Unknown college',
            page = 'Unknown page'
          ] =
            label.split(' – ');

          return {
            college,
            page,
            status: 'live',

            publishedAt:
              commit.commit?.committer?.date ||
              commit.commit?.author?.date ||
              null,

            commit:
              commit.sha || null
          };
        })
        .filter(Boolean);

      res.json(history);

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

/* =========================================================
   SYNC / DISCOVER WEBSITE PAGES
========================================================= */

const syncWebsitePages =
  async (req, res) => {
    try {
      const tree =
        await githubRequest(
          'GET',

          `/repos/${WEBSITE_OWNER}/${WEBSITE_REPO}` +
            `/git/trees/${encodeURIComponent(
              WEBSITE_BRANCH
            )}?recursive=1`
        );

      const htmlFiles =
        (tree.tree || []).filter(
          item =>
            item.type === 'blob' &&
            item.path.endsWith('.html')
        );

      const data = load();
      const added = [];

      for (const item of htmlFiles) {
        const classified =
          classifyPath(item.path);

        if (!classified) {
          continue;
        }

        let college =
          data.colleges.find(
            entry =>
              entry.id ===
              classified.collegeId
          );

        if (!college) {
          const readable =
            classified.collegeId
              .replace(/-/g, ' ')
              .replace(
                /\b\w/g,
                letter =>
                  letter.toUpperCase()
              );

          college = {
            id:
              classified.collegeId,

            name: readable,

            slug:
              classified.collegeId,

            pages: []
          };

          data.colleges.push(
            college
          );
        }

        let page =
          college.pages.find(
            entry =>
              entry.id ===
                classified.pageId ||
              entry.targetPath ===
                item.path
          );

        if (!page) {
          const rel =
            `content/${college.id}/${classified.pageId}.html`;

          page = {
            id:
              classified.pageId,

            name:
              classified.name,

            type:
              classified.type,

            source: rel,

            targetPath:
              item.path,

            status: 'live'
          };

          college.pages.push(
            page
          );

          added.push(
            `${college.id}:${classified.pageId}`
          );

        } else {
          page.targetPath =
            item.path;

          if (
            !page.status ||
            page.status === 'discovered'
          ) {
            page.status = 'live';
          }
        }
      }

      save(data);

      res.json({
        ok: true,
        added,
        scanned:
          htmlFiles.length
      });

    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  };

app.post(
  '/api/sync',
  syncWebsitePages
);

app.post(
  '/api/sync/discover',
  syncWebsitePages
);

/* =========================================================
   STATIC FILES
========================================================= */

app.use(
  '/content',
  express.static(
    path.join(
      ROOT,
      'content'
    )
  )
);

app.use(
  express.static(
    path.join(
      ROOT,
      'public'
    )
  )
);

app.get('*', (req, res) => {
  res.sendFile(
    path.join(
      ROOT,
      'public',
      'index.html'
    )
  );
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {
  console.log(
    `CollegeCMS running on http://localhost:${PORT}`
  );
});
