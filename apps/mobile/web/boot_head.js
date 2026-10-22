/* Owner 2026-10-22 (audit #7): moved out of index.html so the page's
   Content-Security-Policy needs no 'unsafe-inline' for scripts. Runs in
   <head>, before the engine. */
/* Owner 2026-10-18 (iPhone): Flutter replaces this tag with one that
       allows zoom up to 5x, and its hidden text fields are 14px, so iOS
       Safari zoomed into the page on every tap in a field and half the
       screen went off the edge. Keep our tag: no automatic zoom (pinch still
       works on iOS), and the notch area is ours (viewport-fit=cover). */
    (function () {
      var want = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
      function fix() {
        var tags = document.querySelectorAll('meta[name="viewport"]');
        for (var i = 0; i < tags.length; i++) {
          if (tags[i].getAttribute('content') !== want) tags[i].setAttribute('content', want);
        }
      }
      new MutationObserver(fix).observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
      /* After the keyboard closes iOS can leave the page shifted up. */
      document.addEventListener('focusout', function () {
        setTimeout(function () { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); }, 60);
      });
    })();
