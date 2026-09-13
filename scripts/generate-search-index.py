#!/usr/bin/env python3
"""Build the CollegeDecoded homepage search index.

The 100-college master list is the canonical naming source. Only colleges that
have an actual live overview.html in this repository receive a redirect URL.
This prevents dead redirects while making search vocabulary match the master
list and the existing CollegeDecoded overview pages.
"""
from pathlib import Path
import html
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "search-index.json"
MASTER = ROOT / "data" / "college-search-master.json"

CITY_ALIASES = {
    "bengaluru": ["bangalore", "blr"], "bangalore": ["bengaluru", "blr"],
    "mysore": ["mysuru"], "mysuru": ["mysore"],
    "bhubaneswar": ["bbsr", "bhubaneshwar"], "bbsr": ["bhubaneswar"],
    "hyderabad": ["hyd"], "hyd": ["hyderabad"],
    "ghaziabad": ["gzb", "gaziabad"], "gzb": ["ghaziabad"],
    "navi mumbai": ["nerul"], "nerul": ["navi mumbai"],
    "new delhi": ["delhi"], "delhi": ["new delhi"],
}

EXTRA_ALIASES = {
    "iit-delhi-dms": ["IIT Delhi", "IIT Delhi DMS", "DMS IIT Delhi", "DMS IIT", "IIT DMS", "Department of Management Studies IIT Delhi", "IITD DMS"],
    "soa-bhubaneswar": ["Siksha O Anusandhan", "Siksha 'O' Anusandhan", "SOA", "SOA University", "SOA Bhubaneswar", "SOA BBSR"],
    "sibm-nagpur": ["SIBM Nagpur", "Symbiosis Nagpur", "Symbiosis Institute Nagpur", "SIBM Nagpur MBA"],
    "sicsr-pune": ["SICSR", "SICSR Pune", "Symbiosis SICSR"],
    "sims-pune": ["SIMS", "SIMS Pune", "Symbiosis SIMS"],
    "scit-pune": ["SCIT", "SCIT Pune", "Symbiosis SCIT"],
    "ssmc-bangalore": ["SSMC", "SSMC Bangalore", "SSMC Bengaluru", "Symbiosis SSMC"],
    "asia-pacific-institute-management-new-delhi": ["APIM", "APIM Delhi", "Asia Pacific Institute", "Asia Pacific Institute Delhi", "Asia Pacific Management Delhi"],
    "pumba-pune": ["PUMBA", "PUMBA Pune", "DMS Pune", "DMS PUMBA", "SPPU MBA"],
    "vjim-hyderabad": ["VJIM", "VJIM Hyderabad", "VJIM Hyd", "Vignana Jyothi"],
    "xime-bangalore": ["XIME", "XIME Bangalore", "XIME Bengaluru", "Xavier Management Entrepreneurship Bangalore"],
    "ims-ghaziabad": ["IMS Ghaziabad", "IMS Gzb", "IMS Gaziabad"],
    "ipe-hyderabad": ["IPE", "IPE Hyderabad", "IPE Hyd", "Institute of Public Enterprise Hyderabad"],
    "ibs-hyderabad": ["IBS", "IBS Hyderabad", "IBS Hyd", "ICFAI Business School Hyderabad", "ICFAI Hyderabad", "IBSH"],
    "sdmimd-mysore": ["SDMIMD", "SDM IMD", "SDM Mysore", "SDMIMD Mysuru", "SDMIMD Mysore"],
    "siescoms-navi-mumbai": ["SIESCOMS", "SIES COMS", "SIES", "SIES MMS", "SIES Nerul", "SIESCOMS Navi Mumbai"],
}

STOP = {"of", "the", "and", "for", "in", "at", "to", "a", "an", "deemed", "university", "institute", "school", "college"}

def strip_tags(s): return re.sub(r"<[^>]+>", " ", s)
def clean(s):
    s = html.unescape(s or "")
    return re.sub(r"\s+", " ", strip_tags(s)).strip()
def first(pattern, text):
    m = re.search(pattern, text, flags=re.I | re.S)
    return clean(m.group(1)) if m else ""
def norm(s): return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", (s or "").lower())).strip()
def tokens(s): return norm(s).split()
def acronym(s): return "".join(t[0] for t in tokens(s) if t not in STOP)
def slug_words(slug): return re.sub(r"[-_]+", " ", slug).strip()

def title_for(text, slug):
    title = first(r"<title[^>]*>(.*?)</title>", text)
    if title:
        title = re.sub(r"\s*[:|–—-]\s*(?:Courses|Admission|Fees|Cutoff|Placements|Overview|College|MBA|PGDM).*?$", "", title, flags=re.I)
        title = re.sub(r"\s+20(?:2[4-9]|3\d)\b.*$", "", title, flags=re.I)
    h1 = first(r"<h1[^>]*>(.*?)</h1>", text)
    return title or h1 or slug_words(slug).title()

def aliases_for(name, slug, title):
    values = {name, title, slug_words(slug)}
    values.update(EXTRA_ALIASES.get(slug, []))
    seed = list(values)
    for value in seed:
        a = acronym(value)
        if 3 <= len(a) <= 14: values.add(a)
        ts = [t for t in tokens(value) if len(t) > 1]
        for i in range(len(ts)):
            for j in range(i + 1, min(len(ts), i + 4)):
                combo = " ".join(ts[i:j+1])
                if len(combo) >= 4: values.add(combo)
        low = norm(value)
        for city, variants in CITY_ALIASES.items():
            if city in low:
                for v in variants:
                    values.add(re.sub(r"\b" + re.escape(city) + r"\b", v, low))
    return sorted({norm(v) for v in values if norm(v)})

master = json.loads(MASTER.read_text(encoding="utf-8"))
master_names = [x["name"] for x in master.get("colleges", [])]

items = []
registry_path = ROOT / "data" / "registry.json"
registry = json.loads(registry_path.read_text(encoding="utf-8")) if registry_path.exists() else {"colleges": []}
registry_by_slug = {c.get("slug"): c.get("name", "") for c in registry.get("colleges", [])}

for page in sorted((ROOT / "content").glob("*/overview.html")):
    slug = page.parent.name
    text = page.read_text(encoding="utf-8", errors="ignore")
    title = title_for(text, slug)
    name = registry_by_slug.get(slug) or first(r"<h1[^>]*>(.*?)</h1>", text) or title or slug_words(slug).title()
    items.append({
        "slug": slug,
        "name": clean(name),
        "title": clean(title),
        "url": f"./content/{slug}/overview.html",
        "aliases": aliases_for(clean(name), slug, clean(title)),
    })

OUT.write_text(json.dumps({
    "version": 3,
    "master_list_count": len(master_names),
    "master_list_source": "data/college-search-master.json",
    "live_overview_count": len(items),
    "colleges": items,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated {OUT}: {len(items)} live overview pages indexed against {len(master_names)} master colleges.")
