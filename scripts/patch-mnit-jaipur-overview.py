from pathlib import Path
import re

path = Path('content/mnit-jaipur-mba/overview.html')
text = path.read_text(encoding='utf-8')

# Remove any accidental web-citation markers from the published page.
text = re.sub(r'\s*cite[^]+', '', text)

# Give the mobile TOC stable hooks for the navigation behaviour.
text = text.replace(
    '<div class="mobile"><details><summary>On this page</summary>',
    '<div class="mobile" id="mobileToc"><details id="mobileTocDetails"><summary>On this page</summary>',
    1,
)

# Inject deterministic mobile TOC behaviour once. The CSS already keeps the
# control fixed; this script makes each anchor scroll to the requested section
# and closes the disclosure immediately after selection.
marker = '</body>'
script = r'''<script id="mnit-mobile-toc-fix">
(function () {
  function initMobileToc() {
    var details = document.getElementById('mobileTocDetails');
    if (!details) return;

    var links = details.querySelectorAll('nav a[href^="#"]');
    links.forEach(function (link) {
      link.addEventListener('click', function (event) {
        var href = link.getAttribute('href');
        if (!href || href === '#') return;
        var id = href.slice(1);
        var target = document.getElementById(id);
        if (!target) return;

        event.preventDefault();

        // Collapse first so the fixed control cannot cover the destination.
        details.open = false;

        // Keep the URL hash in sync without triggering the browser's default jump.
        if (history.replaceState) {
          history.replaceState(null, '', '#' + id);
        }

        // Account for the sticky site header when positioning the section.
        var header = document.querySelector('.top');
        var headerHeight = header ? header.getBoundingClientRect().height : 0;
        var top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 12;

        window.scrollTo({
          top: Math.max(0, top),
          behavior: 'smooth'
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileToc);
  } else {
    initMobileToc();
  }
})();
</script>
'''

# Avoid duplicate injection if the deployment patch runs more than once.
text = re.sub(r'\s*<script id="mnit-mobile-toc-fix">.*?</script>\s*', '\n', text, flags=re.S)
text = text.replace(marker, script + marker, 1)

path.write_text(text, encoding='utf-8')
