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
text = text.replace(
    '<div class="mobile" id="mobileToc"><details id="mobileTocDetails"><summary>On this page</summary>',
    '<div class="mobile" id="mobileToc"><details id="mobileTocDetails"><summary>On this page</summary>',
    1,
)

# Replace the previous navigation script so the build remains idempotent.
text = re.sub(r'\s*<script id="mnit-mobile-toc-fix">.*?</script>\s*', '\n', text, flags=re.S)

script = r'''<script id="mnit-mobile-toc-fix">
(function () {
  function initMobileToc() {
    var widget = document.getElementById('mobileToc');
    var details = document.getElementById('mobileTocDetails');
    var hero = document.querySelector('.hero');
    if (!widget || !details || !hero) return;

    function updateVisibility() {
      // Hidden while the hero is visible; fixed only after the hero has passed.
      var visible = hero.getBoundingClientRect().bottom <= 0;
      widget.classList.toggle('mnit-nav-visible', visible);
      if (!visible) details.open = false;
    }

    details.querySelectorAll('nav a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        var href = link.getAttribute('href');
        if (!href || href === '#') return;
        var id = href.slice(1);
        var target = document.getElementById(id);
        if (!target) return;

        event.preventDefault();
        details.open = false;

        // Wait for the disclosure to collapse, then scroll deterministically.
        requestAnimationFrame(function () {
          var header = document.querySelector('.top');
          var headerHeight = header ? header.getBoundingClientRect().height : 0;
          var top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 12;
          window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
          if (history.replaceState) history.replaceState(null, '', '#' + id);
        });
      });
    });

    details.addEventListener('toggle', function () {
      if (!widget.classList.contains('mnit-nav-visible')) details.open = false;
    });

    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);
    updateVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileToc);
  } else {
    initMobileToc();
  }
})();
</script>
'''

text = text.replace('</body>', script + '</body>', 1)
path.write_text(text, encoding='utf-8')
