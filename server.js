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
const NEWS_SHEET_WEBAPP_URL = process.env.NEWS_SHEET_WEBAPP_URL || '';
const NEWS_SHEET_API_SECRET = process.env.NEWS_SHEET_API_SECRET || '';
const NEWS_SITE_URL = 'https://collegedecoded.in';

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

function sheetRequest(payload) {
  if (!NEWS_SHEET_WEBAPP_URL || !NEWS_SHEET_API_SECRET) {
    throw new Error('Google Sheets newsroom sync is not configured. Add NEWS_SHEET_WEBAPP_URL and NEWS_SHEET_API_SECRET to the CMS environment.');
  }
  return fetch(NEWS_SHEET_WEBAPP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, secret: NEWS_SHEET_API_SECRET }),
    redirect: 'follow'
  }).then(async response => {
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); } catch { throw new Error('Google Sheets returned a non-JSON response. Check the Apps Script deployment URL.'); }
    if (!response.ok || !result.ok) throw new Error(result.error || ('Google Sheets HTTP ' + response.status));
    return result;
  });
}

function normaliseNewsArticle(input, publish = false) {
  const a = input && typeof input === 'object' ? input : {};
  const slugValue = String(a.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugValue)) throw new Error('Use a URL slug with lowercase letters, numbers and hyphens only.');
  const headline = String(a.headline || '').trim();
  const description = String(a.description || '').trim();
  const categories = ['MBA Admissions', 'MBA Entrance Exams', 'College Updates', 'MBA Placements', 'Rankings & Results'];
  if (headline.length < 20 || headline.length > 120) throw new Error('Headline must be 20–120 characters.');
  if (description.length < 50 || description.length > 220) throw new Error('Description must be 50–220 characters.');
  if (!categories.includes(a.category)) throw new Error('Choose a valid news category.');
  const sourceLinks = Array.isArray(a.sourceLinks) ? a.sourceLinks : [];
  if (!sourceLinks.length || sourceLinks.some(s => !s || !String(s.label || '').trim() || !/^https:\/\//i.test(String(s.url || '')))) {
    throw new Error('Add at least one labelled HTTPS source link.');
  }
  const body = Array.isArray(a.body) ? a.body : [];
  if (!body.length || body.some(s => !s || !String(s.heading || '').trim() || !Array.isArray(s.paragraphs) || !s.paragraphs.some(p => String(p || '').trim()))) {
    throw new Error('Add at least one article section with a heading and paragraph.');
  }
  const parseArray = (v, fallback = []) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim()) { try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : fallback; } catch { return fallback; } }
    return fallback;
  };
  const datePublished = publish ? now() : (a.datePublished || now());
  const result = {
    slug: slugValue, headline, seoTitle: String(a.seoTitle || '').trim(),
    description, category: a.category, status: publish ? 'published' : 'draft',
    datePublished, dateModified: now(),
    author: 'CollegeDecoded Editorial Team',
    summary: String(a.summary || '').trim(),
    image: String(a.image || '').trim(), imageAlt: String(a.imageAlt || '').trim(),
    body, sourceLinks,
    relatedPages: parseArray(a.relatedPages),
    relatedNews: parseArray(a.relatedNews, typeof a.relatedNews === 'string' ? a.relatedNews.split('|').map(x => x.trim()).filter(Boolean) : []),
    keywords: parseArray(a.keywords, typeof a.keywords === 'string' ? a.keywords.split('|').map(x => x.trim()).filter(Boolean) : [])
  };
  if (result.image && !/^https:\/\//i.test(result.image) && !result.image.startsWith('/')) throw new Error('Image must be an HTTPS URL or a site-relative path.');
  return result;
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

app.get('/newsroom', (req, res) => res.sendFile(path.join(ROOT, 'public', 'newsroom.html')));\n\napp.post('/api/logout', requireAuth, (req, res) => {
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

app.get('/api/publish-history', (req, res) => {
  const items = load().colleges.flatMap(college => (college.pages || [])
    .filter(page => page.publishedAt || page.status === 'live')
    .map(page => ({ college: college.name, page: page.name, publishedAt: page.publishedAt || null, status: page.status, targetPath: page.targetPath || null, lastCommit: page.lastCommit || null })));
  items.sort((a,b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  res.json(items.slice(0, 100));
});

app.get('/api/newsroom/drafts', async (req, res) => {
  try {
    const result = await sheetRequest({ action: 'getDrafts' });
    res.json({ ok: true, items: Array.isArray(result.items) ? result.items : [] });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/newsroom/status', async (req, res) => {
  try {
    const status = String(req.body.status || '');
    if (!['In CMS Review', 'Needs Changes'].includes(status)) return res.status(400).json({ error: 'Unsupported newsroom status.' });
    if (!req.body.slug) return res.status(400).json({ error: 'Article slug is required.' });
    const result = await sheetRequest({
      action: 'updateStatus',
      slug: String(req.body.slug),
      status,
      notes: String(req.body.notes || '').slice(0, 2000),
      item: req.body.article && typeof req.body.article === 'object' ? req.body.article : undefined
    });
    res.json({ ok: true, status: result.status || status });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.post('/api/newsroom/publish', async (req, res) => {
  try {
    if (req.body.confirmVerified !== true) return res.status(400).json({ error: 'Confirm that the facts and source links have been checked before publishing.' });
    if (!GITHUB_TOKEN) return res.status(503).json({ error: 'GitHub publishing is not configured. Add GITHUB_TOKEN to the CMS environment.' });
    const sourceSlug = String(req.body.sourceSlug || req.body.article?.slug || '').trim();
    const article = normaliseNewsArticle(req.body.article, true);
    const file = await getWebsiteFile('data/news.json');
    let registry;
    try { registry = JSON.parse(file.html); } catch { throw new Error('Website data/news.json is not valid JSON.'); }
    const items = Array.isArray(registry) ? registry : (Array.isArray(registry.items) ? registry.items : []);
    const index = items.findIndex(item => item && item.slug === article.slug);
    if (index >= 0) {
      const existing = items[index];
      article.datePublished = existing.datePublished || article.datePublished;
      items[index] = { ...existing, ...article, status: 'published' };
    } else {
      items.push(article);
    }
    if (Array.isArray(registry)) registry = items;
    else registry.items = items;
    const commit = await putWebsiteFile('data/news.json', JSON.stringify(registry, null, 2) + '\n', 'Publish CollegeDecoded news: ' + article.slug);
    const articleUrl = NEWS_SITE_URL + '/news/' + article.slug;
    let syncWarning = '';
    try {
      await sheetRequest({ action: 'updateStatus', slug: sourceSlug || article.slug, status: 'Published', item: article, publishedUrl: articleUrl, cmsCommit: commit.commit?.sha || '' });
    } catch (syncError) {
      syncWarning = 'Article was committed to the website, but the spreadsheet status could not be updated: ' + syncError.message;
    }
    res.json({ ok: true, articleUrl, commit: commit.commit?.sha || null, syncWarning });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

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

app.put('/api/page/:id/seo', (req, res) => {
  try {
    const found = findPage(decodeURIComponent(req.params.id));
    if (!found) return res.status(404).json({ error: 'Page not found.' });
    const seo = req.body.seo && typeof req.body.seo === 'object' ? req.body.seo : {};
    const data = load();
    const college = data.colleges.find(item => item.id === found.college.id);
    const page = college.pages.find(item => item.id === found.page.id);
    page.seo = {
      headerTitle: String(seo.headerTitle || '').slice(0, 200),
      title: String(seo.title || '').slice(0, 200),
      description: String(seo.description || '').slice(0, 500),
      keywords: String(seo.keywords || '').slice(0, 1000)
    };
    page.seoUpdatedAt = now();
    save(data);
    res.json({ ok: true, savedAt: page.seoUpdatedAt });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/media/upload', (req, res) => {
  try {
    const { collegeId, pageId, kind, originalName, dataUrl } = req.body || {};
    if (!collegeId || !pageId || !['image', 'pdf'].includes(kind) || typeof dataUrl !== 'string') return res.status(400).json({ error: 'Invalid upload request.' });
    const match = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ error: 'Invalid file data.' });
    const mime = match[1], buffer = Buffer.from(match[2], 'base64');
    const max = kind === 'image' ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
    if (buffer.length > max) return res.status(413).json({ error: 'File is too large.' });
    if (kind === 'image' && !mime.startsWith('image/')) return res.status(400).json({ error: 'Expected an image file.' });
    if (kind === 'pdf' && mime !== 'application/pdf') return res.status(400).json({ error: 'Expected a PDF file.' });
    const extByMime = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'application/pdf': '.pdf' };
    const ext = extByMime[mime] || (kind === 'pdf' ? '.pdf' : '.img');
    const safe = value => slug(value).slice(0, 60) || 'file';
    const filename = Date.now() + '-' + safe(path.basename(originalName || 'upload')) + ext;
    const rel = path.join('uploads', safe(collegeId), safe(pageId), filename);
    const abs = path.join(ROOT, 'public', rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buffer);
    res.json({ ok: true, url: '/' + rel.split(path.sep).map(encodeURIComponent).join('/') });
  } catch (error) { res.status(500).json({ error: error.message }); }
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
