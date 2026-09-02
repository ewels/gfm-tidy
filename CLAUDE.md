# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this is

A single-file userscript (`gfm-tidy.user.js`) that adds three buttons to
GitHub's markdown comment toolbar (unwrap, dedent, wrap in `<details>`) and lets
the user reorder or hide every button on that toolbar. No build step, no
dependencies.

Note the directory is still named `gfm-fixup` while the project is `gfm-tidy`.

## Commands

```sh
node test.cjs   # the text transforms
prek run -a     # prettier + tests, the same two hooks CI runs
```

There is no test runner. `test.cjs` is a flat list of `assert.strictEqual` calls
that stops at the first failure, so there is no way to select one test — to
exercise one function, `require("./gfm-tidy.user.js")` and call it directly.

`node` can require the userscript because it ends with a `module.exports` of the
three transforms, and its DOM setup is behind a
`typeof document !== "undefined"` guard. Keep both if you move code around.

Bump `@version` in the header for any change, or installed copies never update:
userscript managers compare that field against `@updateURL`.

## Architecture

Two layers inside one IIFE, split at the `// dom layer` comment:

**Transforms** (`unwrap`, `dedent`, `detailsWrap`) are pure string functions and
the only tested code. `unwrap` classifies each line via the regexes at the top
and joins it to the previous one only when both `startsBlock` and `endsBlock`
allow it — that pair is what protects code fences, tables, headings, hard breaks
and list structure. It also frees backticked commit hashes (`HASH_SPAN`), done
inside the loop's fence check so code blocks keep theirs.

**DOM layer** injects the buttons and owns the toolbar's layout.

### Reading GitHub's toolbar

GitHub uses no `<md-bold>` elements and no `aria-label` on toolbar buttons.
Buttons are `<button data-md-button="bold">` inside
`<div class="ActionBar-item">` within `<action-bar>`, labelled by a sibling
`<tool-tip>` through `aria-labelledby`. Consequences encoded in the script:

- `ANCHOR` finds the Bold button; everything else is located relative to it.
- A `BUTTONS` spec either carries `fn`, a pure text transform run through
  `apply`, or `onClick`, which handles the click itself — that is how the
  Configure button opens the panel. A spec with `off: true` ships switched off:
  `defaultOn` is consulted by both `readOrder` and `reconcile`, so a newly added
  default-off button stays off for people who already have a saved layout.
- `buildItem` clones a whole `.ActionBar-item` to inherit GitHub's markup and
  styling, then removes every attribute in `STRIP`. **Leaving `data-md-button`
  on a clone makes our button also apply bold**, and leaving `aria-labelledby`
  makes screen readers announce it as "Bold".
- Button identity is the action name in `data-analytics-event`, memoised per
  node in a `WeakMap`. `actionOf` reads our own `MARK` attribute first, so our
  buttons and GitHub's share one vocabulary (`UNWRAP`, `MENTION`, …). That is
  also the config's vocabulary.
- Labels and icons in the settings panel are read from the live toolbar
  (`labelOf`, cloned `<svg>`), never hardcoded, so they track GitHub's changes.
- Our buttons get a rewired clone of GitHub's `<tool-tip>` rather than a `title`
  attribute, so hovering matches every other button.

### Layout model

Config is one `GM_setValue` key, `layout`: an ordered array of `{id, on}`.
Separators are entries with `id === SEPARATOR` (`"|"`) whose position is their
only identity, so they need no ids and any number can exist.

- `readOrder` reads a container's current order; `reconcile` drops entries whose
  button has gone and appends ones GitHub has added, so a saved layout survives
  GitHub changing the toolbar.
- `defaultLayout` is captured by `captureDefault` on the first `inject` pass
  **before anything is moved**, and splices in the separator that precedes our
  buttons rather than that separator being appended to the DOM, which is what
  Reset restores. It is deliberately never stored: a reload always re-renders
  GitHub's own order, so the snapshot cannot go stale.
- `applyLayout` reorders by re-appending the items in sequence. It compares
  current against desired order first and only touches the DOM when they differ
  — **moving a node fires a mutation even when it lands where it already was, so
  without that guard the MutationObserver calls itself forever.**

### Two things that fight back

`<action-bar>` runs its own overflow manager: it measures widths and hides what
it thinks will not fit by setting inline `visibility: hidden`, while the item
still occupies space. Once we add items it does not manage and hide items it
does, its arithmetic breaks and it hides most of the toolbar. `installStyle`
overrides it wholesale with a stylesheet keyed off `MANAGED` and `HIDDEN` —
`!important` in a stylesheet beats its inline styles. That is why the toolbar
wraps instead of overflowing and why the `...` menu is hidden.

React remounts comment boxes, so the MutationObserver re-runs `inject`, which
must stay idempotent, and `findTextarea` resolves the textarea at click time
rather than injection time. Its ancestor walk is the fallback for when
`markdown-toolbar[for]` is absent, and it stops at `<body>` on purpose: failing
closed beats grabbing an unrelated comment box.

Text edits go through `document.execCommand("insertText")`. It is deprecated but
is the only route that preserves the native undo stack and fires the events
GitHub's autosize and preview listen for; `replaceSelection` has a fallback that
loses undo.

## Testing DOM changes

There is no DOM test harness — a `fixture.html` existed and was deliberately
deleted as not worth its keep. For DOM work, build a throwaway fixture in the
scratchpad from real GitHub markup, drive it with `agent-browser`, and verify on
a real GitHub page before claiming it works.

Two traps found the hard way: CDP synthetic mouse events do **not** trigger
Chrome's HTML5 drag and drop (dispatch real `DragEvent`s with a `DataTransfer`
instead), and Primer's classes and CSS variables only exist on github.com, so a
local fixture renders buttons unstyled.

## Repo conventions

Workflows under `.github/` follow the user's global rules: run `ghactionsup`
after editing, then `zizmor`.
