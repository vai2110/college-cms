#!/usr/bin/env python3
"""Build a search index from every CollegeDecoded overview page.

Any new content/<slug>/overview.html automatically becomes searchable on the
next GitHub Pages deployment. The browser then handles abbreviations, token
reordering, city variants and minor spelling differences without a hard-coded
college list.
"""
from pathlib import Path
import html
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "search-index.json"

CITY_ALIASES = {
    "bengaluru": ["bangalore", "blr"],
    "bangalore": ["bengaluru", "blr"],
    "mysore": ["mysuru"],
    "mysuru": ["mysore"],
    "bhubaneswar": ["bbsr", "bhubaneshwar"],
    "hyderabad": ["hyd"],
    "ghaziabad": ["gzb", "gaziabad"],
    "navi mumbai": ["nerul"],
    "new delhi": ["delhi"],
}


def strip_tags(s):
    return re.sub(r"<[^>]+>", " ", s)


def clean(s):
    s = html.unescape(s or "")
    s = strip_tags(s)
    return re.sub(r"\s+", " ", s).strip()


def first(pattern, text):
    m = re.search(pattern, text, flags=re.I | re.S)
    return clean(m.group(1)) if m else ""


def slug_words(slug):
    return re.sub(r"[-_]+", " ", slug).strip()


def title_for(text, slug):
    title = first(r"<title[^>]*>(.*?)</title>", text)
    if title:
        # Remove year/SEO suffixes while retaining the college identity.
        title = re.sub(r"\s*[:|–—-]\s*(?:Courses|Admission|Fees|Cutoff|Placements|Overview|College|MBA|PGDM).*?$", "", title, flags=re.I)
        title = re.sub(r"\s+20(?:2[4-9]|3\d)\b.*$", "", title, flags=re.I)
    h1 = first(r"<h1[^>]*>(.*?)</h1>", text)
    return title or h1 or slug_words(slug).title()


def extract_meta(text):
    title = title_for(text, "")
    h1 = first(r"<h1[^>]*>(.*?)</h1>", text)
    heading_text = h1 or title
    # Prefer a concise college heading when the page contains one.
    if len(heading_text) > 140:
        heading_text = title
    return clean(heading_text), clean(title)


def aliases_for(name, slug, title):
    values = {name, title, slug_words(slug)}
    tokens = re.findall(r"[a-z0-9]+", clean(name).lower())
    title_tokens = re.findall(r"[a-z0-9]+", clean(title).lower())
    slug_tokens = re.findall(r"[a-z0-9]+", slug_words(slug).lower())
    all_tokens = []
    for t in tokens + title_tokens + slug_tokens:
        if t not in all_tokens and len(t) > 1:
            all_tokens.append(t)

    # Initials/acronyms: e.g. Symbiosis Institute of Business Management -> SIBM.
    stop = {"of", "and", "the", "for", "in", "at", "to", "a", "an", "deemed", "university"}
    initials = "".join(t[0] for t in title_tokens if t not in stop and t)
    if 3 <= len(initials) <= 12:
        values.add(initials)

    # First-letter acronym from the full heading, including small words when useful.
    initials_all = "".join(t[0] for t in title_tokens if t)
    if 3 <= len(initials_all) <= 14:
        values.add(initials_all)

    # Add compact token combinations for common student shorthand.
    for i in range(len(all_tokens)):
        for j in range(i + 1, min(len(all_tokens), i + 4)):
            combo = " ".join(all_tokens[i:j + 1])
            if len(combo) >= 4:
                values.add(combo)

    # City spelling variants.
    current = list(values)
    for value in current:
        low = value.lower()
        for city, variants in CITY_ALIASES.items():
            if city in low:
                for variant in variants:
                    values.add(re.sub(re.escape(city), variant, low, flags=re.I))

    return sorted({clean(v) for v in values if clean(v)}, key=lambda x: (len(x), x.lower()))


items = []
for page in sorted((ROOT / "content").glob("*/overview.html")):
    slug = page.parent.name
    text = page.read_text(encoding="utf-8", errors="ignore")
    name, title = extract_meta(text)
    # Keep the page's title/heading, but strip generic SEO wording.
    if not name:
        name = slug_words(slug).title()
    items.append({
        "slug": slug,
        "name": name,
        "title": title or name,
        "url": f"./content/{slug}/overview.html",
        "aliases": aliases_for(name, slug, title or name),
    })

OUT.write_text(json.dumps({"version": 2, "generated_from": "content/*/overview.html", "colleges": items}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated {OUT} with {len(items)} overview pages.")
