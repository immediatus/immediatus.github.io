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
