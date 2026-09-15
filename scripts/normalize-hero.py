from pathlib import Path
import re

# Keep the hero focused on the primary keyword/title. Any institutional
# descriptor placed above the H1 is removed from the deployed HTML.
KICKER_RE = re.compile(r'\s*<div\s+class=["\']kicker["\'][^>]*>.*?</div>', re.IGNORECASE | re.DOTALL)

changed = 0
for path in Path("content").rglob("*.html"):
    text = path.read_text(encoding="utf-8")
    if not re.search(r'<section\s+class=["\']hero["\']', text, re.IGNORECASE):
        continue

    # Only remove kicker elements that occur inside a hero section.
    def patch_hero(match):
        nonlocal_changed[0] += 1
        return KICKER_RE.sub("", match.group(0))

    nonlocal_changed = [0]
    updated = re.sub(
        r'<section\s+class=["\']hero["\'][\s\S]*?</section>',
        patch_hero,
        text,
        flags=re.IGNORECASE,
    )
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        changed += 1

print(f"Normalized hero containers in {changed} HTML file(s).")
