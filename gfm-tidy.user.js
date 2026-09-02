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
  // GitHub links a bare commit hash but not one inside a code span, and models
  // habitually wrap them in backticks. 7-40 hex digits is GitHub's own rule for
  // what counts as a hash; the lookarounds leave ``double-backtick`` spans and
  // longer hex strings alone.
  const HASH_SPAN = /(?<!`)`([0-9a-f]{7,40})`(?!`)/g;

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

    for (let line of lines) {
      if (FENCE.test(line)) {
        fenced = !fenced;
        out.push(line);
        continue;
      }
      if (fenced) {
        out.push(line);
        continue;
      }
      // Outside a fence, free any backticked commit hash so GitHub links it.
      line = line.replace(HASH_SPAN, "$1");

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

  // Returns a transform wrapping the text in a GitHub alert of one kind. With
  // nothing selected the caller passes "", which yields an empty alert with the
  // caret on its body line, ready to type into.
  function alertWrap(kind) {
    return (text) => {
      const head = "> [!" + kind + "]\n> ";
      const body = text.trim().split("\n").join("\n> ");
      return {
        text: head + body + "\n",
        selectionStart: head.length + body.length,
        selectionEnd: head.length + body.length,
      };
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

  // GitHub renders each alert kind with its own octicon; these are those paths.
  const ALERTS = [
    {
      kind: "NOTE",
      label: "Note",
      icon: "M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    },
    {
      kind: "TIP",
      label: "Tip",
      off: true,
      icon: "M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z",
    },
    {
      kind: "IMPORTANT",
      label: "Important",
      off: true,
      icon: "M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
    },
    {
      kind: "WARNING",
      label: "Warning",
      icon: "M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
    },
    {
      kind: "CAUTION",
      label: "Caution",
      off: true,
      icon: "M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    },
  ];

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
    CONFIG: "Open this settings panel.",
    [SEPARATOR]: "",
    ...Object.fromEntries(
      ALERTS.map((alert) => [
        "ALERT_" + alert.kind,
        "Insert a > [!" + alert.kind + "] alert.",
      ]),
    ),
  };

  const GRABBER =
    "M10 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM6 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z";
  const SEP_ICON = "M7.25 1.5h1.5v13h-1.5z";

  const BUTTONS = [
    {
      key: "UNWRAP",
      separatorBefore: true,
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
    ...ALERTS.map((alert, i) => ({
      key: "ALERT_" + alert.kind,
      separatorBefore: i === 0, // the alerts are their own group
      label: alert.label,
      icon: alert.icon,
      off: alert.off,
      fn: alertWrap(alert.kind),
    })),
    {
      key: "CONFIG",
      separatorBefore: true,
      label: "Configure",
      // GitHub's own gear octicon
      icon: "M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z",
      onClick: configure,
    },
  ];
  const OURS = new Set(BUTTONS.map((spec) => spec.key));

  // GitHub buttons hidden on a first install. Their keyboard shortcuts are
  // quicker than the buttons and the toolbar is crowded; one click in the
  // panel brings any of them back.
  const HIDE_ON_INSTALL = ["HEADING", "BOLD", "ITALIC", "MENTION", "REFERENCE"];

  // Buttons that ship switched off: they exist in the layout so the panel can
  // offer them, but the toolbar stays uncluttered until you turn one on. Only
  // consulted for entries new to a layout, so an existing setup is untouched.
  const DEFAULT_OFF = new Set([
    ...BUTTONS.filter((spec) => spec.off).map((spec) => spec.key),
    ...HIDE_ON_INSTALL,
  ]);
  const defaultOn = (action) => !DEFAULT_OFF.has(action);

  // Buttons that start a group, so the default layout puts a separator before
  // each of them rather than that separator being appended to the DOM.
  const SEP_BEFORE = new Set(
    BUTTONS.filter((spec) => spec.separatorBefore).map((spec) => spec.key),
  );

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

  // A container's default layout: its present DOM order, with each entry on
  // unless its button ships switched off. Never reads HIDDEN, because it only
  // ever describes defaults.
  function readOrder(container) {
    const order = [];
    for (const item of container.children) {
      if (item.matches(DIVIDER)) {
        order.push({ id: SEPARATOR, on: true });
        continue;
      }
      const btn = buttonIn(item);
      const action = btn && actionOf(btn);
      if (action) order.push({ id: action, on: defaultOn(action) });
    }
    return order;
  }

  // A separator only earns its place with a visible entry on either side of it,
  // so no divider is left stranded at an end of the toolbar or doubled up next
  // to another. Hidden buttons between it and the next visible one are fine.
  function pruneSeparators(order) {
    let before = false;
    order.forEach((entry, i) => {
      if (entry.id !== SEPARATOR) {
        if (entry.on) before = true;
        return;
      }
      const after = order.slice(i + 1).find((e) => e.id !== SEPARATOR && e.on);
      entry.on = before && !!after;
      if (entry.on) before = false; // the next one needs its own content
    });
    return order;
  }

  // The default is GitHub's own order with our buttons appended, and a
  // separator before each one whose spec starts a group. Walking backwards so
  // the splices do not shift the indices still to check.
  function captureDefault(container) {
    const order = readOrder(container);
    if (!container.querySelector(DIVIDER)) return order; // nothing to clone
    for (let i = order.length - 1; i >= 0; i--) {
      if (SEP_BEFORE.has(order[i].id)) {
        order.splice(i, 0, { id: SEPARATOR, on: true });
      }
    }
    return pruneSeparators(order);
  }

  // Drop entries whose button has gone and append ones GitHub has added, so a
  // saved layout survives GitHub changing its toolbar.
  function reconcile(layout, buttons) {
    const out = layout.filter((e) => e.id === SEPARATOR || buttons.has(e.id));
    for (const action of buttons.keys()) {
      if (!out.some((e) => e.id === action)) {
        out.push({ id: action, on: defaultOn(action) });
      }
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

    const fallback = document.createElement("p");
    fallback.textContent =
      "Switch off Configure and you can still reopen this panel from your " +
      "userscript manager's icon in the browser toolbar, under " +
      '"Configure toolbar buttons".';
    fallback.style.cssText =
      "margin:0;padding:8px 0 0;font-size:12px;color:" +
      MUTED +
      ";border-top:1px solid var(--borderColor-muted,#d8dee4)";

    const list = document.createElement("div");
    // padding-right keeps the checkboxes clear of the scrollbar. Overlay
    // scrollbars draw over content and take no width, so scrollbar-gutter
    // would not help here.
    list.style.cssText =
      "flex:1;min-height:0;overflow-y:auto;padding-right:12px";
    let dragging = null;

    const commit = () =>
      saveLayout(
        [...list.children]
          .filter((row) => row.dataset.id)
          .map((row) => ({
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
        "border-top:1px solid var(--borderColor-muted,#d8dee4)";

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
      let glyph;
      if (source) {
        glyph = source.cloneNode(true);
        glyph.removeAttribute("class"); // drop Primer's button-specific sizing
        glyph.style.cssText = ICON_CSS;
      } else {
        glyph = svgIcon(SEP_ICON);
      }
      label.appendChild(glyph);

      const text = document.createElement("span");
      text.style.cssText = "flex:1";
      const title = document.createElement("strong");
      title.textContent = sep ? "Separator" : labelOf(btn);
      text.appendChild(title);
      if (DESCRIPTIONS[entry.id]) {
        const blurb = document.createElement("span");
        blurb.textContent = DESCRIPTIONS[entry.id];
        blurb.style.cssText = "display:block;font-size:12px;color:" + MUTED;
        text.appendChild(blurb);
      }

      // Primer's own pill, the same one GitHub marks "Beta" and "Preview"
      // with, so it follows the page theme. It gets its own column beside the
      // checkbox rather than crowding the name.
      let pill = null;
      if (btn && OURS.has(entry.id)) {
        pill = document.createElement("span");
        pill.className = "Label Label--secondary";
        pill.textContent = "gfm-tidy";
        pill.style.flex = "none";
      }

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = entry.on;
      toggle.style.cssText = "flex:none;width:16px;height:16px";
      // Dim what the row describes, not its controls, so a switched-off button
      // reads as off without the handle or checkbox looking disabled.
      const dim = () => {
        const faded = toggle.checked ? "" : "0.5";
        glyph.style.opacity = faded;
        text.style.opacity = faded;
      };
      dim();
      toggle.addEventListener("change", () => {
        dim();
        commit();
      });

      label.append(text);
      if (pill) label.append(pill);
      label.append(toggle);
      row.append(handle, label);
      return row;
    }

    const render = () =>
      list.replaceChildren(
        ...layoutFor(container, buttons, readStored()).map(buildRow),
        fallback,
      );
    render();

    const addSeparator = document.createElement("button");
    addSeparator.type = "button";
    addSeparator.className = "btn";
    addSeparator.textContent = "Add separator";
    // Nothing to clone from means the entry would store but never render.
    addSeparator.disabled = !container.querySelector(DIVIDER);
    addSeparator.addEventListener("click", () => {
      list.insertBefore(buildRow({ id: SEPARATOR, on: true }), fallback);
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
    // A native <dialog> ignores backdrop clicks, and the click lands on the
    // dialog itself, so compare against its box rather than the target.
    dialog.addEventListener("click", (event) => {
      const box = dialog.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      ) {
        dialog.close();
      }
    });
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
      if (spec.onClick) return spec.onClick();
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
    module.exports = { unwrap, dedent, detailsWrap, alertWrap };
})();
