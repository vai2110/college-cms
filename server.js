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
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-before-production';

app.set('trust proxy', 1);
app.use(express.json({ limit: '25mb' }));
app.use(session({
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
}));

const regFile = path.join(ROOT, 'data', 'registry.json');
const load = () => JSON.parse(fs.readFileSync(regFile, 'utf8'));
const save = data => fs.writeFileSync(regFile, JSON.stringify(data, null, 2));
const slug = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const now = () => new Date().toISOString();

function findPage(id) {
  for (const college of load().colleges) {
    const page = college.pages.find(item => `${college.id}:${item.id}` === id);
    if (page) return { college, page };
  }
  return null;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Please sign in to access CollegeCMS.' });
}

function githubRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const request = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'User-Agent': 'CollegeCMS',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
        ...(payload ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        } : {})
      }
    }, response => {
      let raw = '';
      response.on('data', chunk => raw += chunk);
      response.on('end', () => {
        let parsed = {};
        try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { raw }; }
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(parsed);
        reject(new Error(parsed.message || `GitHub API error (${response.statusCode})`));
      });
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function getWebsiteFile(targetPath) {
  const apiPath = `/repos/${WEBSITE_OWNER}/${WEBSITE_REPO}/contents/${encodeURIComponent(targetPath)}?ref=${encodeURIComponent(WEBSITE_BRANCH)}`;
  const data = await githubRequest('GET', apiPath);
  if (!data.content) throw new Error('Website file could not be read from GitHub.');
  return {
    html: Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8'),
    sha: data.sha
  };
}

async function putWebsiteFile(targetPath, html, message) {
  if (!GITHUB_TOKEN) throw new Error('GitHub publishing is not configured. Add GITHUB_TOKEN to your deployment environment variables.');
  let sha = null;
  try {
    sha = (await getWebsiteFile(targetPath)).sha;
  } catch (error) {
    if (!/Not Found|404/i.test(error.message)) throw error;
  }
  return githubRequest(
    'PUT',
    `/repos/${WEBSITE_OWNER}/${WEBSITE_REPO}/contents/${encodeURIComponent(targetPath)}`,
    {
      message,
      content: Buffer.from(html, 'utf8').toString('base64'),
      branch: WEBSITE_BRANCH,
      ...(sha ? { sha } : {})
    }
  );
}

function defaultTargetPath(collegeId, pageId, type) {
  if (type === 'overview') return `${collegeId}.html`;
  if (type === 'placement') return `${collegeId}-placements.html`;
  if (type === 'admission') return `${collegeId}-admission.html`;
  if (type === 'fees') return `${collegeId}-fees.html`;
  return `${collegeId}-${pageId}.html`;
}

function classifyPath(filePath) {
  const base = path.basename(filePath, '.html');
  if (base === 'index' || ['college', 'colleges', 'exams', 'content-audit'].includes(base)) return null;
  if (base.endsWith('-placements')) return { collegeId: base.replace(/-placements$/, ''), pageId: 'placements', name: 'Placements', type: 'placement' };
  if (base.endsWith('-admission')) return { collegeId: base.replace(/-admission$/, ''), pageId: 'admission', name: 'Admission', type: 'admission' };
  if (base.endsWith('-fees')) return { collegeId: base.replace(/-fees$/, ''), pageId: 'fees', name: 'Courses & Fees', type: 'fees' };
  if (/^(cat|cmat|gmat|mat|nmat)$/i.test(base)) return null;
  return { collegeId: base, pageId: 'overview', name: 'Overview', type: 'overview' };
}

/* Authentication */
app.post('/api/login', async (req, res) => {
  try {
    const username = String(req.body.username || '');
    const password = String(req.body.password || '');
    if (!ADMIN_USERNAME || (!ADMIN_PASSWORD_HASH && !ADMIN_PASSWORD)) {
      return res.status(503).json({ error: 'CMS login has not been configured on the server yet.' });
    }
    const validUser = username === ADMIN_USERNAME;
    const validPassword = ADMIN_PASSWORD_HASH
      ? await bcrypt.compare(password, ADMIN_PASSWORD_HASH)
      : password === ADMIN_PASSWORD;

    if (!validUser || !validPassword) return res.status(401).json({ error: 'Invalid username or password.' });
    req.session.user = { username: ADMIN_USERNAME, role: 'admin' };
    res.json({ ok: true, user: req.session.user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ authenticated: !!req.session?.user, user: req.session?.user || null });
});

/* Protected CMS APIs */
app.use('/api', requireAuth);

app.get('/api/config', (req, res) => {
  res.json({
    website: `${WEBSITE_OWNER}/${WEBSITE_REPO}`,
    branch: WEBSITE_BRANCH,
    githubPublishingConfigured: !!GITHUB_TOKEN
  });
});

app.get('/api/colleges', (req, res) => res.json(load()));

app.post('/api/colleges', (req, res) => {
  const data = load();
  const name = req.body.name?.trim();
  if (!name) return res.status(400).json({ error: 'College name required' });
  const id = slug(req.body.slug || name);
  if (data.colleges.some(college => college.id === id)) {
    return res.status(409).json({ error: 'College already exists' });
  }
  data.colleges.push({ id, name, slug: id, pages: [] });
  fs.mkdirSync(path.join(ROOT, 'content', id), { recursive: true });
  save(data);
  res.json({ ok: true, id });
});

app.post('/api/pages', (req, res) => {
  const data = load();
  const college = data.colleges.find(item => item.id === req.body.collegeId);
  if (!college) return res.status(404).json({ error: 'College not found' });

  const type = req.body.type || 'custom';
  const pageName = req.body.name || type;
  const id = slug(req.body.slug || pageName);

  if (college.pages.some(page => page.id === id)) {
    return res.status(409).json({ error: 'Page already exists' });
  }

  const templatePath = path.join(ROOT, 'templates', `${type}.html`);
  if (!fs.existsSync(templatePath)) return res.status(400).json({ error: 'Invalid page template' });

  const html = fs.readFileSync(templatePath, 'utf8')
    .replaceAll('{{COLLEGE_NAME}}', college.name)
    .replaceAll('{{PAGE_NAME}}', pageName)
    .replaceAll('{{SEO_TITLE}}', `${college.name} ${pageName}`)
    .replaceAll('{{META_DESCRIPTION}}', `${college.name} ${pageName} information.`);

  const rel = `content/${college.id}/${id}.html`;
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, html, 'utf8');

  const page = {
    id,
    name: pageName,
    type,
    source: rel,
    targetPath: defaultTargetPath(college.id, id, type),
    status: 'draft',
    createdAt: now()
  };

  college.pages.push(page);
  save(data);
  res.json({ ok: true, page: `${college.id}:${id}` });
});

/* Load the actual live website file whenever a target path exists */
app.get('/api/page/:id', async (req, res) => {
  try {
    const found = findPage(decodeURIComponent(req.params.id));
    if (!found) return res.status(404).json({ error: 'Not found' });

    let html = null;
    let source = 'draft';

    if (found.page.targetPath) {
      try {
        html = (await getWebsiteFile(found.page.targetPath)).html;
        source = 'live';
      } catch (error) {
        if (!fs.existsSync(path.join(ROOT, found.page.source))) throw error;
      }
    }

    if (!html) html = fs.readFileSync(path.join(ROOT, found.page.source), 'utf8');

    res.json({ college: found.college, page: found.page, html, source });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* Save a CMS draft locally; publishing is the only action that changes the website repo */
app.put('/api/page/:id', (req, res) => {
  try {
    const found = findPage(decodeURIComponent(req.params.id));
    if (!found) return res.status(404).json({ error: 'Not found' });
    if (!req.body.html) return res.status(400).json({ error: 'HTML is required' });

    const abs = path.join(ROOT, found.page.source);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, req.body.html, 'utf8');

    const data = load();
    const page = data.colleges
      .find(college => college.id === found.college.id)
      .pages.find(item => item.id === found.page.id);

    page.status = page.status === 'live' ? 'live-draft' : 'draft';
    page.draftUpdatedAt = now();
    save(data);

    res.json({ ok: true, savedAt: page.draftUpdatedAt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* Publish commits the final HTML to mba-admission-portal */
app.post('/api/page/:id/publish', async (req, res) => {
  try {
    const found = findPage(decodeURIComponent(req.params.id));
    if (!found) return res.status(404).json({ error: 'Not found' });

    const abs = path.join(ROOT, found.page.source);
    if (!fs.existsSync(abs)) return res.status(400).json({ error: 'Save a draft before publishing.' });

    const targetPath = found.page.targetPath || defaultTargetPath(found.college.id, found.page.id, found.page.type);
    const html = fs.readFileSync(abs, 'utf8');

    const commit = await putWebsiteFile(
      targetPath,
      html,
      `CMS publish: ${found.college.name} – ${found.page.name}`
    );

    const data = load();
    const page = data.colleges
      .find(college => college.id === found.college.id)
      .pages.find(item => item.id === found.page.id);

    page.targetPath = targetPath;
    page.status = 'live';
    page.publishedAt = now();
    page.lastCommit = commit.commit?.sha || null;
    save(data);

    res.json({
      ok: true,
      message: 'Published to the website repository.',
      targetPath,
      commit: page.lastCommit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* Discover existing and future HTML pages from the live website repository */
app.post('/api/sync/discover', async (req, res) => {
  try {
    const tree = await githubRequest(
      'GET',
      `/repos/${WEBSITE_OWNER}/${WEBSITE_REPO}/git/trees/${encodeURIComponent(WEBSITE_BRANCH)}?recursive=1`
    );

    const htmlFiles = (tree.tree || [])
      .filter(item => item.type === 'blob' && item.path.endsWith('.html'));

    const data = load();
    const added = [];

    for (const item of htmlFiles) {
      const classified = classifyPath(item.path);
      if (!classified) continue;

      let college = data.colleges.find(entry => entry.id === classified.collegeId);
      if (!college) {
        const readable = classified.collegeId
          .replace(/-/g, ' ')
          .replace(/\b\w/g, letter => letter.toUpperCase());

        college = {
          id: classified.collegeId,
          name: readable,
          slug: classified.collegeId,
          pages: []
        };
        data.colleges.push(college);
      }

      let page = college.pages.find(
        entry => entry.id === classified.pageId || entry.targetPath === item.path
      );

      if (!page) {
        const rel = `content/${college.id}/${classified.pageId}.html`;
        page = {
          id: classified.pageId,
          name: classified.name,
          type: classified.type,
          source: rel,
          targetPath: item.path,
          status: 'live'
        };
        college.pages.push(page);
        added.push(`${college.id}:${classified.pageId}`);
      } else {
        page.targetPath = item.path;
        if (!page.status || page.status === 'discovered') page.status = 'live';
      }
    }

    save(data);
    res.json({ ok: true, added, scanned: htmlFiles.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/content', express.static(path.join(ROOT, 'content')));
app.use(express.static(path.join(ROOT, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`CollegeCMS running on http://localhost:${PORT}`);
});
