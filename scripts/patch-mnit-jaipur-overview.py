from pathlib import Path
import re

path = Path('content/mnit-jaipur-mba/overview.html')
text = path.read_text(encoding='utf-8')
clean = re.sub(r'\s*cite[^]+', '', text)
path.write_text(clean, encoding='utf-8')
