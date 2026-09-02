// ==UserScript==
// @name         GFM Tidy
// @namespace    https://github.com/ewels/gfm-tidy
// @version      0.3.0
// @description  Unwrap, dedent and <details>-wrap buttons in the GitHub markdown toolbar
// @author       Phil Ewels
// @match        https://github.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/ewels/gfm-tidy/main/gfm-tidy.user.js
// @updateURL    https://raw.githubusercontent.com/ewels/gfm-tidy/main/gfm-tidy.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ---------------------------------------------------------------- transforms

  const FENCE = /^\s{0,3}(```|~~~)/;
  const BLANK = /^\s*$/;
  const HEADING = /^\s{0,3}#{1,6}(\s|$)/;
  const QUOTE = /^\s{0,3}>/;
  const LIST = /^(\s*)([-*+]|\d+[.)])(\s+)/;
  const BREAK = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
  const SETEXT = /^\s{0,3}=+\s*$/;
  const TABLE = /^\s*\|/;
  const HTML = /^\s{0,3}</;
  const CODE = /^(\s{4,}|\t)/;
  const HARDBREAK = /(\s{2,}|\\)$/;

  // A line that can never be absorbed into the line above it.
  function startsBlock(line, inList) {
    if (BLANK.test(line)) return true;
    if (FENCE.test(line) || HEADING.test(line) || BREAK.test(line)) return true;
    if (SETEXT.test(line) || TABLE.test(line) || HTML.test(line)) return true;
    if (LIST.test(line)) return true;
    // Indented code only counts outside a list; inside one it is a wrapped item.
    if (!inList && CODE.test(line)) return true;
    return false;
  }

  // A line that can never absorb the line below it.
  function endsBlock(line) {
    return (
      BLANK.test(line) ||
      FENCE.test(line) ||
      HEADING.test(line) ||
      BREAK.test(line) ||
      TABLE.test(line) ||
      HTML.test(line) ||
      SETEXT.test(line) ||
      HARDBREAK.test(line)
    );
  }

  // Join hard-wrapped lines back into full-length paragraphs, leaving code
  // fences, headings, tables, list structure and blockquote markers intact.
  function unwrap(text) {
    const lines = text.split("\n");
    const out = [];
    let fenced = false;
    let inList = false;

    for (const line of lines) {
      if (FENCE.test(line)) {
        fenced = !fenced;
        out.push(line);
        continue;
      }
      if (fenced) {
        out.push(line);
        continue;
      }

      if (BLANK.test(line)) inList = false;
      else if (LIST.test(line)) inList = true;

      const prev = out.length ? out[out.length - 1] : null;
      const joinable =
        prev !== null &&
        !startsBlock(line, inList) &&
        !endsBlock(prev) &&
        QUOTE.test(prev) === QUOTE.test(line);

      if (joinable) {
        // Inside a blockquote the continuation carries its own '>' marker.
        const tail = QUOTE.test(line) ? line.replace(/^\s{0,3}>\s?/, "") : line;
        out[out.length - 1] = prev.replace(/\s+$/, "") + " " + tail.trim();
      } else {
        out.push(line);
      }
    }
    return out.join("\n");
  }

  // Strip the longest leading-whitespace prefix common to every non-blank line.
  function dedent(text) {
    const lines = text.split("\n");
    let prefix = null;
    for (const line of lines) {
      if (BLANK.test(line)) continue;
      const indent = line.match(/^[ \t]*/)[0];
      if (prefix === null) {
        prefix = indent;
        continue;
      }
      let i = 0;
      while (i < prefix.length && i < indent.length && prefix[i] === indent[i])
        i++;
      prefix = prefix.slice(0, i);
    }
    if (!prefix) return text;
    return lines
      .map((l) =>
        l.startsWith(prefix)
          ? l.slice(prefix.length)
          : l.replace(/^[ \t]+/, ""),
      )
      .join("\n");
  }

  const SUMMARY = "Details";

  // Returns the replacement text plus the offsets of the placeholder summary,
  // so the caller can leave it selected for the user to type over.
  function detailsWrap(text) {
    const head = "<details>\n<summary>";
    const body =
      "</summary>\n\n" + text.replace(/^\n+|\n+$/g, "") + "\n\n</details>\n";
    return {
      text: head + SUMMARY + body,
      selectionStart: head.length,
      selectionEnd: head.length + SUMMARY.length,
    };
  }

  // ---------------------------------------------------------------- dom layer

  const MARK = "data-gfm-tidy";
  const HIDE_KEY = "hide";
  const HIDDEN = "data-gfm-tidy-hidden";

  // Every toolbar button names itself in its data-analytics-event; those names
  // are the config's vocabulary.
  const STOCK = [
    "COPILOT",
    "HEADING",
    "BOLD",
    "ITALIC",
    "QUOTE",
    "CODE",
    "LINK",
    "ORDERED_LIST",
    "UNORDERED_LIST",
    "TASK_LIST",
    "ATTACH_FILES",
    "MENTION",
    "REFERENCE",
    "SAVED_REPLIES",
    "SLASH_COMMANDS",
  ];

  // Stock buttons the user has chosen to hide. Empty by default.
  function hideList() {
    if (typeof GM_getValue !== "function") return [];
    return String(GM_getValue(HIDE_KEY, ""))
      .toUpperCase()
      .split(/[\s,]+/)
      .filter(Boolean);
  }

  function configure() {
    const answer = prompt(
      "Hide these stock toolbar buttons, comma separated. Leave empty to show all." +
        "\n\n" +
        STOCK.join(", "),
      hideList().join(", "),
    );
    if (answer === null) return;
    GM_setValue(HIDE_KEY, answer.trim());
    inject(); // applies straight away, so no reload and no lost draft
  }

  function actionOf(btn) {
    try {
      return (
        JSON.parse(btn.getAttribute("data-analytics-event") || "{}").action ||
        ""
      );
    } catch (err) {
      return "";
    }
  }

  const icon = (d) =>
    '<svg class="octicon Button-visual" viewBox="0 0 16 16" width="16" height="16" ' +
    'aria-hidden="true" fill="currentColor"><path d="' +
    d +
    '"/></svg>';

  const BUTTONS = [
    {
      key: "unwrap",
      label: "Unwrap hard-wrapped lines",
      icon: icon(
        "M1 2.5h14V4H1zM1 12h14v1.5H1zM4.5 5.5 1.5 8l3 2.5V9h7v1.5L14.5 8l-3-2.5V7h-7z",
      ),
      fn: unwrap,
    },
    {
      key: "dedent",
      label: "Remove common indentation",
      icon: icon(
        "M1 2h14v1.5H1zM1 12.5h14V14H1zM6.5 5.5h8.5V7H6.5zM6.5 9h8.5v1.5H6.5zM4.5 5.25 1.5 7.75l3 2.5z",
      ),
      fn: dedent,
    },
    {
      key: "details",
      label: "Wrap in a <details> box",
      icon: icon("M2 4l4 3-4 3zM8 4h6v1.5H8zM8 9.5h6V11H8z"),
      fn: detailsWrap,
    },
  ];

  // Bold is the stable landmark. GitHub's current toolbar labels its buttons
  // with data-md-button and an aria-labelledby <tool-tip>; the aria-label form
  // is a fallback in case a future editor drops the data attribute.
  const ANCHOR = 'button[data-md-button="bold"], button[aria-label="Bold"]';

  // Attributes that would make a cloned button behave like the one it copies.
  const STRIP = [
    "data-md-button",
    "data-hotkey",
    "data-hotkey-scope",
    "id",
    "data-analytics-event",
    "aria-labelledby",
    "data-show-dialog-id",
    "popovertarget",
    "aria-controls",
    "data-file-attachment-for",
  ];

  // Resolved at click time, not injection time: the textarea can be remounted.
  function findTextarea(el) {
    const toolbar = el.closest("markdown-toolbar");
    const id = toolbar && toolbar.getAttribute("for");
    if (id) {
      const byId = document.getElementById(id);
      if (byId) return byId;
    }
    for (
      let node = el;
      node && node !== document.body;
      node = node.parentElement
    ) {
      const ta = node.querySelector("textarea");
      if (ta) return ta;
    }
    return null;
  }

  function replaceSelection(ta, text) {
    ta.focus();
    // ponytail: execCommand is deprecated but is the only route that keeps the
    // native undo stack and fires the events GitHub's autosize/preview listen
    // for. The branch below is the fallback if it ever stops working.
    if (!document.execCommand("insertText", false, text)) {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set;
      setValue.call(ta, value.slice(0, s) + text + value.slice(e));
      ta.setSelectionRange(s + text.length, s + text.length);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function apply(ta, fn) {
    let start = ta.selectionStart;
    let end = ta.selectionEnd;
    if (start === end) {
      start = 0;
      end = ta.value.length;
    }
    const source = ta.value.slice(start, end);
    const result = fn(source);
    const out = typeof result === "string" ? { text: result } : result;
    if (out.text === source) return;

    ta.setSelectionRange(start, end);
    replaceSelection(ta, out.text);

    const base = ta.selectionStart - out.text.length;
    if (out.selectionStart !== undefined) {
      ta.setSelectionRange(base + out.selectionStart, base + out.selectionEnd);
    } else {
      ta.setSelectionRange(base, base + out.text.length);
    }
  }

  // Clone GitHub's own toolbar item so we inherit its markup and styling,
  // then strip everything that made the original behave like Bold.
  function buildItem(slot, spec) {
    const item = slot.cloneNode(true);
    const btn = item.tagName === "BUTTON" ? item : item.querySelector("button");
    if (!btn) return null;

    for (const tip of item.querySelectorAll("tool-tip")) tip.remove();
    // Keep <action-bar>'s overflow bookkeeping away from our items.
    item.removeAttribute("data-targets");
    for (const attr of STRIP) btn.removeAttribute(attr);

    btn.setAttribute(MARK, spec.key);
    btn.setAttribute("type", "button");
    btn.setAttribute("aria-label", spec.label);
    btn.setAttribute("title", spec.label);
    btn.setAttribute("tabindex", "0");
    btn.innerHTML = spec.icon;
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const ta = findTextarea(btn);
      if (ta) apply(ta, spec.fn);
    });
    return item;
  }

  // Reuse GitHub's own divider rather than inventing one, so it matches the
  // dividers already between the toolbar's groups.
  function buildDivider(container) {
    const source = container.querySelector(".ActionBar-divider");
    if (!source) return null; // no dividers in this editor, so don't invent one
    const sep = source.cloneNode(true);
    sep.removeAttribute("data-targets");
    sep.setAttribute(MARK, "divider");
    return sep;
  }

  function hideStock(container) {
    const hidden = hideList();
    for (const btn of container.querySelectorAll(
      "button[data-analytics-event]",
    )) {
      const item = btn.closest(".ActionBar-item") || btn;
      const hide = hidden.includes(actionOf(btn));
      // Leave buttons we never hid alone, so we only ever undo our own work.
      if (!hide && !item.hasAttribute(HIDDEN)) continue;

      item.style.display = hide ? "none" : "";
      if (hide) item.setAttribute(HIDDEN, "");
      else item.removeAttribute(HIDDEN);
      // The same button also has an entry in the overflow menu.
      const spill =
        btn.id && document.querySelector('[data-for="' + btn.id + '"]');
      if (spill) spill.style.display = hide ? "none" : "";
    }
  }

  function inject() {
    for (const anchor of document.querySelectorAll(ANCHOR)) {
      const slot = anchor.closest(".ActionBar-item") || anchor;
      const container = slot.parentElement;
      if (!container) continue;
      hideStock(container);
      if (container.querySelector("[" + MARK + "]")) continue;

      const sep = buildDivider(container);
      if (sep) container.appendChild(sep);
      for (const spec of BUTTONS) {
        const item = buildItem(slot, spec);
        if (item) container.appendChild(item);
      }
    }
  }

  if (typeof document !== "undefined") {
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("Configure hidden buttons", configure);
    }
    let queued = false;
    // inject() is idempotent, so the mutations it causes settle on the next pass.
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        inject();
      });
    }).observe(document.body, { childList: true, subtree: true });
    inject();
  }

  if (typeof module !== "undefined")
    module.exports = { unwrap, dedent, detailsWrap };
})();
