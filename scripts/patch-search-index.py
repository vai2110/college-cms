import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'search-index.json'

# Keep search results aligned with pages that were moved out of the old MBA portal.
OVERRIDES = {
    'Indian Institute of Technology Kanpur': {
        'url': './content/iit-kanpur-doms/overview.html',
        'location': 'kanpur',
        'aliases': ['iit kanpur', 'iitk', 'iit kanpur doms', 'doms iit kanpur', 'iit kanpur mba']
    }
}

data = json.loads(INDEX.read_text(encoding='utf-8'))
items = data.get('colleges', [])

for name, override in OVERRIDES.items():
    target = next((c for c in items if c.get('name') == name), None)
    if target is None:
        target = {'name': name, 'title': name, 'aliases': []}
        items.append(target)
    target['url'] = override['url']
    target['location'] = override['location']
    target['live'] = True
    target['aliases'] = sorted(set(target.get('aliases', [])) | set(override['aliases']))

data['colleges'] = items
data['searchable_college_count'] = len(items)
data['live_overview_count'] = sum(1 for c in items if c.get('live') and c.get('url'))
INDEX.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print('Search index patched: IIT Kanpur DoMS now points to the live college-cms overview page.')
