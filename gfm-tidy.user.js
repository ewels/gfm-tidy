// ==UserScript==
// @name         GFM Tidy
// @namespace    https://github.com/ewels/gfm-tidy
// @version      1.0.0
// @description  Unwrap, dedent and <details> buttons for the GitHub markdown toolbar, and reorder or hide any button on it
// @author       Phil Ewels
// @license      MIT
// @match        https://github.com/*
// @homepageURL  https://github.com/ewels/gfm-tidy
// @supportURL   https://github.com/ewels/gfm-tidy/issues
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
  const QUOTE = /^\s{0,3}>\s?/;
  const LIST = /^(\s*)([-*+]|\d+[.)])(\s+)/;
  const BREAK = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
  const SETEXT = /^\s{0,3}=+\s*$/;
  const TABLE = /^\s*\|/;
  const HTML = /^\s{0,3}</;
  const CODE = /^(\s{4,}|\t)/;
  const HARDBREAK = /(\s{2,}|\\)$/;

  // Constructs that end the paragraph they appear in, whichever side you look
  // from. Keeping them in one list means a new block type is added once.
  const BLOCK = [BLANK, FENCE, HEADING, BREAK, SETEXT, TABLE, HTML];
  const isBlock = (line) => BLOCK.some((re) => re.test(line));

  // A line that can never be absorbed into the line above it. Indented code
  // only counts outside a list; inside one it is a wrapped item.
  const startsBlock = (line, inList) =>
    isBlock(line) || LIST.test(line) || (!inList && CODE.test(line));

  // A line that can never absorb the line below it.
  const endsBlock = (line) => isBlock(line) || HARDBREAK.test(line);

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
        const tail = QUOTE.test(line) ? line.replace(QUOTE, "") : line;
        out[out.length - 1] = prev.trimEnd() + " " + tail.trim();
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
    // Every non-blank line starts with prefix by construction, so no fallback
    // is reachable; whitespace-only lines simply become empty.
    return lines
      .map((l) => (BLANK.test(l) ? "" : l.slice(prefix.length)))
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
  const HIDDEN = "data-gfm-tidy-hidden";
  const MANAGED = "data-gfm-tidy-managed";
  const LAYOUT_KEY = "layout";
  const SEPARATOR = "|";
  const HOME = "https://github.com/ewels/gfm-tidy";
  const ITEM = ".ActionBar-item";
  const DIVIDER = ".ActionBar-divider";
  const BUTTON_SELECTOR = "button[data-analytics-event], button[" + MARK + "]";
  const ICON_CSS = "flex:none;width:16px;height:16px;fill:currentColor";
  const MUTED = "var(--fgColor-muted,GrayText)";

  // Bold is the stable landmark. GitHub's current toolbar labels its buttons
  // with data-md-button and an aria-labelledby <tool-tip>; the aria-label form
  // is a fallback in case a future editor drops the data attribute.
  const ANCHOR = 'button[data-md-button="bold"], button[aria-label="Bold"]';

  // Short explanations for the settings panel. Titles and icons are read from
  // the live toolbar, so only the prose lives here; an unrecognised button just
  // shows no description rather than breaking the panel.
  const DESCRIPTIONS = {
    COPILOT: "Ask Copilot to draft or summarise.",
    HEADING: "Turn the current line into a heading.",
    BOLD: "Bold the selected text.",
    ITALIC: "Italicise the selected text.",
    QUOTE: "Quote the selected text.",
    CODE: "Format the selection as code.",
    LINK: "Turn the selection into a link.",
    ORDERED_LIST: "Start a numbered list.",
    UNORDERED_LIST: "Start a bulleted list.",
    TASK_LIST: "Start a checkbox task list.",
    ATTACH_FILES: "Attach a file or image.",
    MENTION: "Insert an @username mention.",
    REFERENCE: "Link to another issue or pull request.",
    SAVED_REPLIES: "Insert one of your saved replies.",
    SLASH_COMMANDS: "Open the slash command menu.",
    UNWRAP: "Join hard-wrapped lines into full-length paragraphs.",
    DEDENT: "Strip the indentation shared by every line.",
    DETAILS: "Wrap the selection in a collapsible box.",
    [SEPARATOR]: "A divider between groups of buttons.",
  };

  const GRABBER =
    "M10 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM6 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z";
  const SEP_ICON = "M7.25 1.5h1.5v13h-1.5z";

  const BUTTONS = [
    {
      key: "UNWRAP",
      label: "Unwrap",
      icon: "M1 2.5h14V4H1zM1 12h14v1.5H1zM4.5 5.5 1.5 8l3 2.5V9h7v1.5L14.5 8l-3-2.5V7h-7z",
      fn: unwrap,
    },
    {
      key: "DEDENT",
      label: "Dedent",
      icon: "M1 2h14v1.5H1zM1 12.5h14V14H1zM6.5 5.5h8.5V7H6.5zM6.5 9h8.5v1.5H6.5zM4.5 5.25 1.5 7.75l3 2.5z",
      fn: dedent,
    },
    {
      key: "DETAILS",
      label: "Details",
      icon: "M2 4l4 3-4 3zM8 4h6v1.5H8zM8 9.5h6V11H8z",
      fn: detailsWrap,
    },
  ];
  const OURS = new Set(BUTTONS.map((spec) => spec.key));

  // Attributes that would make a cloned button behave like the one it copies.
  // Bold carries only the first few, but ANCHOR's fallback can match another
  // editor's Bold button, and an inherited handler is expensive to debug.
  const STRIP = [
    "data-md-button",
    "data-hotkey",
    "data-hotkey-scope",
    "data-analytics-event",
    "aria-labelledby",
    "data-show-dialog-id",
    "popovertarget",
    "aria-controls",
    "data-file-attachment-for",
  ];

  // The toolbar as GitHub first rendered it, captured before anything is moved.
  // This is what Reset restores, so the defaults never need storing.
  let defaultLayout = null;

  // A toolbar item and the button inside it are used interchangeably all over
  // this file; these two are the only places that know how they relate.
  const buttonIn = (el) =>
    el.matches("button") ? el : el.querySelector("button");
  const slotOf = (btn) => btn.closest(ITEM) || btn;

  function svgIcon(d, className) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "currentColor");
    if (className) svg.setAttribute("class", className);
    else svg.style.cssText = ICON_CSS;
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }

  // <action-bar> hides items it thinks overflow by setting inline visibility,
  // and it gets that calculation badly wrong once we add items it does not
  // manage and hide items it does: it hid almost the whole toolbar. We curate
  // the toolbar now, so override it outright. A stylesheet beats its inline
  // styles, and wrapping is a friendlier overflow than its kebab menu.
  let styleEl = null;

  function installStyle() {
    if (styleEl && styleEl.isConnected) return;
    const style = document.createElement("style");
    style.id = "gfm-tidy-style";
    style.textContent =
      `[${MANAGED}]{flex-wrap:wrap}` +
      `[${MANAGED}] ${ITEM}{visibility:visible!important}` +
      `[${HIDDEN}]{display:none!important}` +
      `[${MANAGED}] ~ .ActionBar-more-menu{display:none!important}`;
    document.head.appendChild(style);
    styleEl = style;
  }

  // Every toolbar on the page. Both lookups are tag-name lookups, which are
  // cheap; matching ANCHOR against the whole document is not, because an
  // attribute-selector list has no fast path and visits every element. The
  // second tag is the fallback for an editor that drops <markdown-toolbar>.
  function* containers() {
    for (const tag of ["markdown-toolbar", "action-bar"]) {
      let found = false;
      for (const host of document.getElementsByTagName(tag)) {
        const anchor = host.querySelector(ANCHOR);
        const slot = anchor && slotOf(anchor);
        if (slot && slot.parentElement) {
          found = true;
          yield { slot, container: slot.parentElement };
        }
      }
      if (found) return;
    }
  }

  function readStored() {
    try {
      const raw = GM_getValue(LAYOUT_KEY, "");
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null; // corrupt value, fall back to the defaults
    }
  }

  // null clears the setting and restores the defaults.
  function saveLayout(layout) {
    GM_setValue(LAYOUT_KEY, layout ? JSON.stringify(layout) : "");
    inject();
  }

  // A button's action name never changes, and parsing the analytics blob for
  // every layout entry of every toolbar was the bulk of each pass.
  const actions = new WeakMap();

  function actionOf(btn) {
    const own = btn.getAttribute(MARK); // our own buttons name themselves
    if (own) return own;
    let action = actions.get(btn);
    if (action === undefined) {
      try {
        action =
          JSON.parse(btn.getAttribute("data-analytics-event") || "{}").action ||
          "";
      } catch (err) {
        action = "";
      }
      if (action) actions.set(btn, action); // never cache a failure
    }
    return action;
  }

  // One walk per container, so everything downstream is an O(1) lookup.
  function buttonsByAction(container) {
    const found = new Map();
    for (const btn of container.querySelectorAll(BUTTON_SELECTOR)) {
      const action = actionOf(btn);
      if (action && !found.has(action)) found.set(action, btn);
    }
    return found;
  }

  // A container's present order, every entry on. Only ever used for defaults,
  // which are all-on by construction, so it does not read HIDDEN.
  function readOrder(container) {
    const order = [];
    for (const item of container.children) {
      if (item.matches(DIVIDER)) {
        order.push({ id: SEPARATOR, on: true });
        continue;
      }
      const btn = buttonIn(item);
      const action = btn && actionOf(btn);
      if (action) order.push({ id: action, on: true });
    }
    return order;
  }

  // The default is GitHub's own order with our buttons after a separator.
  // Expressed here rather than by appending a divider to the DOM, so that
  // separators are only ever materialised in one place: applyLayout.
  function captureDefault(container) {
    const order = readOrder(container);
    const first = order.findIndex((entry) => OURS.has(entry.id));
    if (first > 0 && container.querySelector(DIVIDER)) {
      order.splice(first, 0, { id: SEPARATOR, on: true });
    }
    return order;
  }

  // Drop entries whose button has gone and append ones GitHub has added, so a
  // saved layout survives GitHub changing its toolbar.
  function reconcile(layout, buttons) {
    const out = layout.filter((e) => e.id === SEPARATOR || buttons.has(e.id));
    for (const action of buttons.keys()) {
      if (!out.some((e) => e.id === action)) out.push({ id: action, on: true });
    }
    return out;
  }

  function layoutFor(container, buttons, stored) {
    return reconcile(stored || defaultLayout || readOrder(container), buttons);
  }

  function applyLayout(container, stored) {
    const buttons = buttonsByAction(container);
    // Separators are interchangeable, so reuse the ones already present and
    // clone more only when the layout asks for more than GitHub shipped.
    const spare = [...container.querySelectorAll(DIVIDER)];
    const wanted = [];
    let next = 0;

    for (const entry of layoutFor(container, buttons, stored)) {
      let item;
      if (entry.id === SEPARATOR) {
        item = spare[next++];
        if (!item && spare[0]) {
          item = spare[0].cloneNode(true);
          // Keep <action-bar>'s overflow bookkeeping away from ones we own.
          item.removeAttribute("data-targets");
        }
      } else {
        const btn = buttons.get(entry.id);
        item = btn && slotOf(btn);
      }
      if (!item) continue;

      if (entry.on) item.removeAttribute(HIDDEN);
      else item.setAttribute(HIDDEN, "");
      wanted.push(item);
    }
    for (; next < spare.length; next++) spare[next].setAttribute(HIDDEN, "");

    // Only touch the DOM when the order is actually wrong. Moving a node fires
    // a mutation even when it lands where it already was, which would have the
    // observer calling us forever.
    const current = [...container.children].filter((el) => wanted.includes(el));
    const ordered =
      current.length === wanted.length &&
      current.every((el, i) => el === wanted[i]);
    if (!ordered) container.append(...wanted);
  }

  // GitHub keeps each button's visible name in a sibling <tool-tip>, so the
  // panel can show the same words the tooltips do, in the same language.
  function labelOf(btn) {
    const id = btn.getAttribute("aria-labelledby");
    const tip = id && document.getElementById(id);
    return (
      (tip && tip.textContent.trim()) ||
      btn.getAttribute("aria-label") ||
      actionOf(btn)
    );
  }

  function configure() {
    const first = containers().next().value;
    if (!first) {
      alert("Open a GitHub page with a comment box, then try again.");
      return;
    }
    const container = first.container;
    const buttons = buttonsByAction(container);

    const dialog = document.createElement("dialog");
    // showModal() otherwise focuses the first focusable child, drawing a
    // focus ring on the repo link. Focus the container instead, so no ring
    // shows until the user actually tabs.
    dialog.tabIndex = -1;
    dialog.style.cssText =
      "padding:16px 20px;width:min(90vw,30rem);border-radius:12px;" +
      // cap the height and scroll the list, so the footer stays reachable
      "max-height:85vh;display:flex;flex-direction:column;outline:none;" +
      "font:14px/1.4 system-ui,sans-serif;" +
      "border:1px solid var(--borderColor-default,#d0d7de);" +
      "background:var(--bgColor-default,Canvas);" +
      "color:var(--fgColor-default,CanvasText)";

    const heading = document.createElement("h2");
    heading.textContent = "GFM Tidy";
    heading.style.cssText = "margin:0;font-size:16px";
    const link = document.createElement("a");
    link.href = HOME;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "ewels/gfm-tidy";
    link.style.cssText = "margin-left:8px;font-size:12px;font-weight:400";
    heading.appendChild(link);

    const hint = document.createElement("p");
    hint.textContent = "Drag to reorder. Switch off what you never use.";
    hint.style.cssText =
      "margin:4px 0 8px;flex:none;font-size:12px;color:" + MUTED;

    const list = document.createElement("div");
    // padding-right keeps the checkboxes clear of the scrollbar. Overlay
    // scrollbars draw over content and take no width, so scrollbar-gutter
    // would not help here.
    list.style.cssText =
      "flex:1;min-height:0;overflow-y:auto;padding-right:12px";
    let dragging = null;

    const commit = () =>
      saveLayout(
        [...list.children].map((row) => ({
          id: row.dataset.id,
          on: row.querySelector("input").checked,
        })),
      );

    function buildRow(entry) {
      const sep = entry.id === SEPARATOR;
      const btn = sep ? null : buttons.get(entry.id);

      const row = document.createElement("div");
      row.dataset.id = entry.id;
      row.style.cssText =
        "display:flex;align-items:center;gap:10px;padding:8px 0;" +
        "border-top:1px solid var(--borderColor-muted,#d8dee4)" +
        // separators are structure rather than features, so let them recede
        (sep ? ";opacity:0.65" : "");

      const handle = svgIcon(GRABBER);
      handle.style.cursor = "grab";
      handle.style.color = MUTED;
      // draggable only while the handle is held, so the row still selects text
      // and the drag image is the whole row rather than the handle alone.
      handle.addEventListener("mousedown", () => {
        row.draggable = true;
      });
      row.addEventListener("dragstart", (event) => {
        dragging = row;
        row.style.opacity = "0.4";
        event.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        row.style.opacity = "";
        row.draggable = false;
        dragging = null;
        commit();
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (!dragging || dragging === row) return;
        const box = row.getBoundingClientRect();
        const below = event.clientY > box.top + box.height / 2;
        list.insertBefore(dragging, below ? row.nextSibling : row);
      });

      const label = document.createElement("label");
      label.style.cssText =
        "flex:1;display:flex;align-items:center;gap:10px;cursor:pointer";

      const source = btn && btn.querySelector("svg");
      if (source) {
        const copy = source.cloneNode(true);
        copy.removeAttribute("class"); // drop Primer's button-specific sizing
        copy.style.cssText = ICON_CSS;
        label.appendChild(copy);
      } else {
        label.appendChild(svgIcon(SEP_ICON));
      }

      const text = document.createElement("span");
      text.style.cssText = "flex:1";
      const title = document.createElement("strong");
      title.textContent = sep ? "Separator" : labelOf(btn);
      text.appendChild(title);
      if (btn && OURS.has(entry.id)) {
        const own = document.createElement("span");
        own.textContent = " (gfm-tidy)";
        own.style.cssText = "font-weight:400;font-size:11px;color:" + MUTED;
        title.appendChild(own);
      }
      if (DESCRIPTIONS[entry.id]) {
        const blurb = document.createElement("span");
        blurb.textContent = DESCRIPTIONS[entry.id];
        blurb.style.cssText = "display:block;font-size:12px;color:" + MUTED;
        text.appendChild(blurb);
      }

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = entry.on;
      toggle.style.cssText = "flex:none;width:16px;height:16px";
      toggle.addEventListener("change", commit);

      label.append(text, toggle);
      row.append(handle, label);
      return row;
    }

    const render = () =>
      list.replaceChildren(
        ...layoutFor(container, buttons, readStored()).map(buildRow),
      );
    render();

    const addSeparator = document.createElement("button");
    addSeparator.type = "button";
    addSeparator.className = "btn";
    addSeparator.textContent = "Add separator";
    // Nothing to clone from means the entry would store but never render.
    addSeparator.disabled = !container.querySelector(DIVIDER);
    addSeparator.addEventListener("click", () => {
      list.appendChild(buildRow({ id: SEPARATOR, on: true }));
      commit();
    });

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "btn";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => {
      if (!confirm("Reset the toolbar to its original order?")) return;
      saveLayout(null);
      render();
    });

    const done = document.createElement("button");
    done.type = "button";
    // GitHub's own button classes, so they match the page and follow its theme.
    done.className = "btn-primary btn";
    done.textContent = "Done";
    done.style.marginLeft = "auto";
    done.addEventListener("click", () => dialog.close());

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;gap:8px;flex:none;margin-top:16px";
    footer.append(addSeparator, reset, done);

    dialog.append(heading, hint, list, footer);
    dialog.addEventListener("close", () => dialog.remove());
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.focus();
  }

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

    // The replacement began at start, so offsets are relative to it.
    if (out.selectionStart !== undefined) {
      ta.setSelectionRange(
        start + out.selectionStart,
        start + out.selectionEnd,
      );
    } else {
      ta.setSelectionRange(start, start + out.text.length);
    }
  }

  let uid = 0; // ids must be unique, and a page can hold many toolbars

  // Clone GitHub's own toolbar item so we inherit its markup and styling,
  // then strip everything that made the original behave like Bold.
  function buildItem(slot, spec) {
    const item = slot.cloneNode(true);
    const btn = buttonIn(item);
    if (!btn) return null;

    // Rewire GitHub's <tool-tip> rather than using a title attribute, so
    // hovering gives their styled bubble below the button like every other.
    const tips = item.querySelectorAll("tool-tip");
    const tip = tips[0];
    for (let i = 1; i < tips.length; i++) tips[i].remove();

    // Keep <action-bar>'s overflow bookkeeping away from our items.
    item.removeAttribute("data-targets");
    for (const attr of STRIP) btn.removeAttribute(attr);

    const n = ++uid;
    btn.id = "gfm-tidy-button-" + n;
    btn.setAttribute(MARK, spec.key);
    btn.setAttribute("type", "button");
    btn.setAttribute("tabindex", "0");
    btn.replaceChildren(svgIcon(spec.icon, "octicon Button-visual"));

    if (tip) {
      tip.id = "gfm-tidy-tooltip-" + n;
      tip.setAttribute("for", btn.id);
      tip.removeAttribute("style"); // stale position from the button we copied
      tip.setAttribute("data-direction", "s"); // below the button, like the rest
      tip.textContent = spec.label;
      btn.setAttribute("aria-labelledby", tip.id);
    } else {
      btn.setAttribute("aria-label", spec.label);
      btn.setAttribute("title", spec.label);
    }

    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const ta = findTextarea(btn);
      if (ta) apply(ta, spec.fn);
    });
    return item;
  }

  function inject() {
    installStyle(); // cheap, and reinstalls it if the head is ever swapped
    const stored = readStored(); // once per pass, not once per toolbar
    for (const { slot, container } of containers()) {
      if (!container.hasAttribute(MANAGED)) {
        container.setAttribute(MANAGED, "");
      }
      // Only our own buttons answer this: a reused divider must not count, or
      // one failed buildItem would lose the buttons for the session.
      if (!container.querySelector("button[" + MARK + "]")) {
        for (const spec of BUTTONS) {
          const item = buildItem(slot, spec);
          if (item) container.appendChild(item);
        }
      }
      // Capture GitHub's order once our buttons are in it, before any move.
      if (!defaultLayout) defaultLayout = captureDefault(container);
      applyLayout(container, stored);
    }
  }

  if (typeof document !== "undefined") {
    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("Configure toolbar buttons", configure);
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
