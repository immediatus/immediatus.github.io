/* =============================================================
   site.js — sitewide JavaScript
   Referenced by: templates/footer.html
   ============================================================= */

/* ---------------------------------------------------------------
   feather-icons initialisation
   Used by: templates/nav.html (icon elements), sitewide
   --------------------------------------------------------------- */
feather.replace();

/* ---------------------------------------------------------------
   Tooltip nudge — keeps .defined-term tooltips inside viewport
   Used by: templates/shortcodes/term.html (.defined-term elements)
   CSS counterpart: sass/css/main.scss (.defined-term::after / --tip-nudge)
   --------------------------------------------------------------- */
(function () {
  var MARGIN = 10;   /* min px from viewport edge */
  var TIP_W  = 300;  /* matches max-width in CSS  */

  function nudge(term) {
    var r  = term.getBoundingClientRect();
    var vw = window.innerWidth;
    var w  = Math.min(TIP_W, vw - MARGIN * 2);
    var ideal   = r.left + r.width / 2 - w / 2;
    var clamped = Math.max(MARGIN, Math.min(ideal, vw - w - MARGIN));
    var shift   = clamped - ideal;
    term.style.setProperty('--tip-nudge', shift + 'px');
  }

  document.addEventListener('mouseover', function (e) {
    var t = e.target && e.target.closest && e.target.closest('.defined-term');
    if (t) nudge(t);
  }, true);

  document.addEventListener('focusin', function (e) {
    var t = e.target && e.target.closest && e.target.closest('.defined-term');
    if (t) nudge(t);
  }, true);
}());

/* ---------------------------------------------------------------
   Touch tooltip — bottom-sheet for mobile (hover: none) devices
   CSS counterpart: sass/css/main.scss (#tip-popup)
   First tap on a .defined-term shows its definition in a panel
   that slides up from the bottom of the screen; second tap on
   the same term (or any tap outside) dismisses it.  For <a>
   terms the second tap also allows the browser to follow the link.
   --------------------------------------------------------------- */
(function () {
  if (!window.matchMedia('(hover: none)').matches) return;

  var popup  = null;   /* created lazily on first use */
  var active = null;   /* the .defined-term currently shown */

  function getPopup() {
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'tip-popup';
    popup.setAttribute('role', 'tooltip');
    popup.setAttribute('aria-live', 'polite');
    document.body.appendChild(popup);
    return popup;
  }

  function show(term) {
    var def = term.getAttribute('data-def');
    if (!def) return;
    var p = getPopup();
    p.textContent = def;
    p.classList.add('visible');
    active = term;
  }

  function hide() {
    if (popup) popup.classList.remove('visible');
    active = null;
  }

  document.addEventListener('touchend', function (e) {
    var term = e.target && e.target.closest && e.target.closest('.defined-term');
    if (term) {
      if (active === term) {
        /* Second tap on the same term: dismiss and let <a> links navigate */
        hide();
        return;
      }
      /* First tap: show tooltip; suppress default action (focus jump, link nav) */
      e.preventDefault();
      show(term);
      return;
    }
    /* Tap outside any .defined-term: dismiss */
    if (popup && popup.classList.contains('visible')) {
      hide();
    }
  }, false);
}());
