(function () {
  "use strict";

  function el(tag, attrs) {
    const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function wrapWords(text, maxChars) {
    const words = text.split(" ");
    const lines = [];
    let cur = "";
    words.forEach((w) => {
      const test = cur ? cur + " " + w : w;
      if (test.length > maxChars && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function addMultiline(parent, lines, x, yFirst, lineHeight, extraAttrs) {
    const t = el("text", Object.assign({ x: x, y: yFirst, "text-anchor": "middle" }, extraAttrs || {}));
    lines.forEach((line, i) => {
      const tspan = el("tspan", { x: x, dy: i === 0 ? 0 : lineHeight });
      tspan.textContent = line;
      t.appendChild(tspan);
    });
    parent.appendChild(t);
    return t;
  }

  // Draws a line that reveals itself via stroke-dashoffset, so it looks
  // drawn rather than faded. Caller decides when to reveal it (immediately
  // for root links, on branch-open via a CSS state class for leaf links).
  function drawLine(parent, x1, y1, x2, y2, cls, delayMs) {
    const path = el("path", { class: cls, d: "M" + x1 + "," + y1 + " L" + x2 + "," + y2 });
    parent.appendChild(path);
    const len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    if (delayMs) path.style.transitionDelay = delayMs + "ms";
    return path;
  }

  function initCognitiveMap(widget) {
    const dataScript = widget.querySelector(".cm-data");
    if (!dataScript) return;
    let RAW;
    try {
      RAW = JSON.parse(dataScript.textContent);
    } catch (e) {
      console.error("cognitive-map: invalid JSON data", e);
      return;
    }
    // Body is either the older bare array of groups, or {intro, groups};
    // support both so no existing post's data needs touching to keep working.
    const DATA = Array.isArray(RAW) ? RAW : RAW.groups;
    const INTRO = Array.isArray(RAW) ? "" : (RAW.intro || "");
    const ROOT_TOPIC = widget.dataset.root || "Cognitive Map";
    const svg = widget.querySelector(".cm-svg");
    const deck = widget.querySelector(".cm-deck");
    if (!svg || !deck || !DATA.length) return;

    // Points are either the current [n, topic, text] triples, or an even
    // older format of bare strings, one per point, predating the numbered
    // card/detail-deck split. Normalize once, here, rather than requiring
    // every point-access site below to branch on shape, and rather than
    // editing every older post's own data to match: derive a short topic
    // from the string's own first clause, keep the full string as the body
    // text, and number sequentially within the group.
    function deriveTopic(str) {
      const clause = (str.match(/^[^,;:.]+/) || [str])[0].trim();
      const words = clause.split(/\s+/);
      return words.length > 8 ? words.slice(0, 8).join(" ") + "..." : clause;
    }
    DATA.forEach((group) => {
      group.points = group.points.map((p, i) => (Array.isArray(p) ? p : [i + 1, deriveTopic(p), p]));
    });

    const W = 900, H = 760, CX = 450, CY = 380, HUB_R = 54, THEME_R = 44, LEAF_R = 15;
    const branchDist = 150;

    // A single shared tooltip per widget, in real HTML (not cramped SVG
    // text), so hovering any bubble shows its full label at a readable size.
    // It lives directly on the widget (which is position:relative), not
    // inside the canvas holder, so the canvas's own overflow:hidden never
    // clips it when a bubble near the top or edge is hovered.
    const tooltip = document.createElement("div");
    tooltip.className = "cm-tooltip";
    widget.appendChild(tooltip);

    function attachTooltip(nodeEl, text) {
      function show() {
        tooltip.textContent = text;
        tooltip.classList.add("visible");
        const widgetRect = widget.getBoundingClientRect();
        const nodeRect = nodeEl.getBoundingClientRect();
        const x = nodeRect.left + nodeRect.width / 2 - widgetRect.left;
        const y = nodeRect.top - widgetRect.top;
        tooltip.style.left = x + "px";
        tooltip.style.top = y + "px";
      }
      function hide() {
        tooltip.classList.remove("visible");
      }
      nodeEl.addEventListener("mouseenter", show);
      nodeEl.addEventListener("mouseleave", hide);
      nodeEl.addEventListener("focus", show);
      nodeEl.addEventListener("blur", hide);
    }

    const linkLayer = el("g", {});
    const nodeLayer = el("g", {});
    svg.appendChild(linkLayer);
    svg.appendChild(nodeLayer);

    const hubG = el("g", { class: "mm-node-g mm-node hub", transform: "translate(" + CX + "," + CY + ")", tabindex: "0" });
    hubG.appendChild(el("circle", { class: "halo", r: HUB_R + 12, fill: "var(--accent)" }));
    hubG.appendChild(el("circle", { class: "body", r: HUB_R, fill: "var(--accent)" }));
    const hubLines = wrapWords(ROOT_TOPIC, 13);
    addMultiline(hubG, hubLines, 0, -6 * (hubLines.length - 1), 12, { style: "font-size:11.5px" });
    nodeLayer.appendChild(hubG);
    attachTooltip(hubG, ROOT_TOPIC);

    const angleStep = (2 * Math.PI) / DATA.length;
    const branches = [];
    const leafByKey = {};
    const rootLinks = [];

    DATA.forEach((group, gi) => {
      const angle = -Math.PI / 2 + gi * angleStep;
      const bx = CX + branchDist * Math.cos(angle);
      const by = CY + branchDist * Math.sin(angle);

      rootLinks.push(drawLine(linkLayer, CX, CY, bx, by, "mm-link root-link", gi * 90));

      // Leaf links live in the shared, always-behind link layer (not inside
      // this branch's own group) so a wide-spread branch's own connectors can
      // never paint over a sibling branch's theme bubble, whatever the angle.
      const leafLinks = el("g", { class: "mm-leaf-links", "data-c": group.c });
      linkLayer.appendChild(leafLinks);

      const branchG = el("g", { class: "branch collapsed", "data-idx": gi });
      const themeG = el("g", { class: "mm-node-g mm-node theme", "data-c": group.c, transform: "translate(" + bx + "," + by + ")", tabindex: "0" });
      const themeInner = el("g", { class: "theme-inner" });
      themeInner.appendChild(el("circle", { class: "halo", r: THEME_R + 10, fill: "var(--" + group.c + ")" }));
      themeInner.appendChild(el("circle", { class: "body", r: THEME_R }));
      const themeLines = wrapWords(group.theme, 13);
      addMultiline(themeInner, themeLines, 0, -6 * (themeLines.length - 1), 12.5, { class: "theme-label" });
      const subLabel = el("text", { x: 0, y: THEME_R + 18, "text-anchor": "middle", class: "theme-sub" });
      subLabel.textContent = group.points.length + " points";
      themeInner.appendChild(subLabel);
      themeG.appendChild(themeInner);
      branchG.appendChild(themeG);
      attachTooltip(themeG, group.theme);

      const leafWrap = el("g", { class: "mm-leaf-wrap" });
      const leafAngleSpread = Math.PI * (group.points.length > 4 ? 1.3 : 0.9);
      const startA = angle - leafAngleSpread / 2;
      const CARD_W = 100, CARD_H = 38;

      group.points.forEach((point, li) => {
        const n = point[0], topic = point[1], text = point[2];
        const t = group.points.length === 1 ? 0.5 : li / (group.points.length - 1);
        const la = startA + t * leafAngleSpread;
        const ldist = branchDist + (li % 2 === 0 ? 120 : 190);
        const lx = CX + ldist * Math.cos(la);
        const ly = CY + ldist * Math.sin(la);

        drawLine(leafLinks, bx, by, lx, ly, "mm-link leaf-link", li * 55);

        const leafG = el("g", {
          class: "mm-node-g mm-node leaf", "data-c": group.c, "data-gi": gi, "data-li": li,
          transform: "translate(" + lx + "," + ly + ")", tabindex: "0"
        });
        const leafInner = el("g", { class: "leaf-inner" });
        leafInner.style.transitionDelay = li * 55 + "ms";
        leafInner.style.setProperty("--dx", (bx - lx) + "px");
        leafInner.style.setProperty("--dy", (by - ly) + "px");
        leafInner.appendChild(el("rect", { class: "halo", x: -CARD_W / 2 - 6, y: -CARD_H / 2 - 6, width: CARD_W + 12, height: CARD_H + 12, rx: 14, fill: "var(--" + group.c + ")" }));
        leafInner.appendChild(el("rect", { class: "body", x: -CARD_W / 2, y: -CARD_H / 2, width: CARD_W, height: CARD_H, rx: 9 }));
        const topicLines = wrapWords(topic, 16).slice(0, 2);
        addMultiline(leafInner, topicLines, 0, topicLines.length > 1 ? -3 : 3, 11, { class: "card-topic" });
        const badge = el("g", { class: "num-badge", transform: "translate(" + (-CARD_W / 2 + 2) + "," + (-CARD_H / 2 + 2) + ")" });
        badge.appendChild(el("circle", { r: 9 }));
        const badgeText = el("text", { x: 0, y: 3.5, "text-anchor": "middle" });
        badgeText.textContent = n;
        badge.appendChild(badgeText);
        leafInner.appendChild(badge);
        leafG.appendChild(leafInner);
        leafWrap.appendChild(leafG);
        leafByKey[gi + "-" + li] = leafG;
        attachTooltip(leafG, n + ". " + topic);

        leafG.addEventListener("click", (e) => {
          e.stopPropagation();
          openDeck(gi, li);
        });
      });

      branchG.appendChild(leafWrap);
      nodeLayer.appendChild(branchG);
      branches.push(branchG);

      themeG.addEventListener("click", () => {
        branches.forEach((b) => b.classList.add("collapsed"));
        linkLayer.querySelectorAll(".mm-leaf-links").forEach((g) => g.classList.remove("open"));
        nodeLayer.querySelectorAll(".mm-node.theme").forEach((t) => t.classList.remove("open"));
        nodeLayer.querySelectorAll(".mm-node.theme").forEach((t) => t.classList.toggle("dimmed", t !== themeG));
        branchG.classList.remove("collapsed");
        leafLinks.classList.add("open");
        themeG.classList.add("open");
        openDeck(gi, 0);
      });
    });

    hubG.addEventListener("click", () => {
      branches.forEach((b) => b.classList.add("collapsed"));
      linkLayer.querySelectorAll(".mm-leaf-links").forEach((g) => g.classList.remove("open"));
      nodeLayer.querySelectorAll(".mm-node.theme").forEach((t) => t.classList.remove("open", "dimmed"));
      curGi = null;
      renderIntro();
    });

    function markSelectedLeaf(gi, li) {
      Object.values(leafByKey).forEach((l) => {
        const isSelected = l.dataset.gi == gi && l.dataset.li == li;
        l.classList.toggle("selected", isSelected);
        l.classList.toggle("dimmed", !isSelected);
      });
    }

    let curGi = null, curLi = 0;

    function renderIntro() {
      deck.removeAttribute("data-c");
      const text = INTRO || "Click a theme above to start reading.";
      deck.innerHTML =
        '<div class="crumb"><span class="seg current">' + ROOT_TOPIC + "</span></div>" +
        '<div class="hy-body-holder"><div class="hy-body"><p>' + text + "</p></div></div>";
      const holder = deck.querySelector(".hy-body-holder");
      const body = holder.querySelector(".hy-body");
      holder.style.height = body.scrollHeight + "px";
      requestAnimationFrame(() => body.classList.add("active"));
    }

    function renderDeck() {
      const group = DATA[curGi];
      deck.dataset.c = group.c;
      const bodies = group.points.map((point) => {
        const n = point[0], topic = point[1], text = point[2];
        return '<div class="hy-body"><p><strong>' + n + ". " + topic + '.</strong> ' + text + "</p></div>";
      }).join("");
      const dots = group.points.map((_, li) =>
        '<span class="hy-dot' + (li === curLi ? " current" : "") + '" data-li="' + li + '"></span>'
      ).join("");
      const currentTopic = group.points[curLi][1];
      const crumb =
        '<div class="crumb"><span class="seg">' + ROOT_TOPIC + '</span><span class="sep">&rsaquo;</span>' +
        '<span class="seg">' + group.theme + '</span><span class="sep">&rsaquo;</span>' +
        '<span class="seg current">' + currentTopic + "</span></div>";
      deck.innerHTML =
        crumb +
        '<div class="hy-deck-head"><span class="hy-tag">' + group.theme + '</span><div class="hy-dots">' + dots + "</div></div>" +
        '<div class="hy-body-holder">' + bodies + "</div>" +
        '<div class="hy-nav">' +
        '<button class="hy-navbtn" id="hy-prev" ' + (curLi === 0 ? "disabled" : "") + ">&larr; Prev</button>" +
        '<span class="hy-counter">' + (curLi + 1) + " / " + group.points.length + " in this theme</span>" +
        '<button class="hy-navbtn" id="hy-next" ' + (curLi === group.points.length - 1 ? "disabled" : "") + ">Next &rarr;</button>" +
        "</div>";
      deck.querySelectorAll(".hy-dot").forEach((d) => {
        d.addEventListener("click", () => {
          curLi = +d.dataset.li;
          markSelectedLeaf(curGi, curLi);
          renderDeck();
        });
      });
      const prevBtn = deck.querySelector("#hy-prev");
      const nextBtn = deck.querySelector("#hy-next");
      if (prevBtn) prevBtn.addEventListener("click", () => {
        curLi = Math.max(0, curLi - 1);
        markSelectedLeaf(curGi, curLi);
        renderDeck();
      });
      if (nextBtn) nextBtn.addEventListener("click", () => {
        curLi = Math.min(group.points.length - 1, curLi + 1);
        markSelectedLeaf(curGi, curLi);
        renderDeck();
      });

      // Size the holder to fit the tallest point in *this* theme at the
      // page's actual current width, measured directly rather than guessed,
      // so nothing ever needs to scroll and the height stays constant while
      // stepping through this theme's own points (no nav-button jump).
      const holder = deck.querySelector(".hy-body-holder");
      let maxH = 0;
      holder.querySelectorAll(".hy-body").forEach((b) => {
        maxH = Math.max(maxH, b.scrollHeight);
      });
      holder.style.height = maxH + "px";

      requestAnimationFrame(() => {
        const target = holder.children[curLi];
        if (target) target.classList.add("active");
      });
    }

    function openDeck(gi, li) {
      curGi = gi;
      curLi = li;
      markSelectedLeaf(gi, li);
      renderDeck();
    }

    widget.addEventListener("keydown", (e) => {
      if (curGi === null) return;
      const group = DATA[curGi];
      if (e.key === "ArrowRight" && curLi < group.points.length - 1) {
        curLi++;
        markSelectedLeaf(curGi, curLi);
        renderDeck();
      }
      if (e.key === "ArrowLeft" && curLi > 0) {
        curLi--;
        markSelectedLeaf(curGi, curLi);
        renderDeck();
      }
    });
    widget.setAttribute("tabindex", "0");

    // Re-measure on resize: a viewport width change reflows the same text
    // into a different number of lines, so a height measured at the old
    // width could now be too short (forcing a scrollbar) or too tall.
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { curGi === null ? renderIntro() : renderDeck(); }, 150);
    });

    renderIntro();

    requestAnimationFrame(() => requestAnimationFrame(() => {
      rootLinks.forEach((l) => { l.style.strokeDashoffset = 0; });
    }));
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".cognitive-map-widget").forEach(initCognitiveMap);
  });
})();
