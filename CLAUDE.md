# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this is

A single-file userscript (`gfm-tidy.user.js`) that adds nine buttons to GitHub's
markdown comment toolbar (unwrap, dedent, wrap in `<details>`) and lets the user
reorder or hide every button on that toolbar. No build step, no dependencies.

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

**Transforms** (`unwrap`, `dedent`, `detailsWrap`, `alertWrap`) are pure string
functions and the only tested code. `unwrap` classifies each line via the
regexes at the top and joins it to the previous one only when both `startsBlock`
and `endsBlock` allow it — that pair is what protects code fences, tables,
headings, hard breaks and list structure. It also frees backticked commit hashes
(`HASH_SPAN`), done inside the loop's fence check so code blocks keep theirs.

**DOM layer** injects the buttons and owns the toolbar's layout.

### Reading GitHub's toolbar

**There are two editors, and both must work.** Pull requests and discussions use
the classic one; issues use a Primer React rewrite, and GitHub is migrating the
rest. They share almost nothing:

|           | classic (PRs, discussions)       | React (issues)                                                            |
| --------- | -------------------------------- | ------------------------------------------------------------------------- |
| Bold      | `button[data-md-button="bold"]`  | only `svg.octicon-bold`                                                   |
| Identity  | `data-analytics-event`           | nothing                                                                   |
| Wrapper   | `.ActionBar-item`                | bare `<button>`                                                           |
| Tooltip   | `<tool-tip>` sibling             | `<span class="prc-TooltipV2-…">` sibling                                  |
| Divider   | `<hr class="ActionBar-divider">` | `<div data-component="ActionBar.VerticalDivider">`, inside Group wrappers |
| Container | `<action-bar>` element           | `<div data-component="ActionBar">`                                        |

A React issue page also carries a **hidden decoy**: a `<markdown-toolbar>` with
`display:none` full of _empty_ `<md-bold>` elements, there only for the keyboard
shortcuts. Anchoring on that element finds no buttons. Do not use it.

Consequences encoded in the script:

- `ANCHOR_ICON` is `octicon-bold`, found with `getElementsByClassName`. The icon
  class is the only landmark both editors share, and a class lookup is far
  cheaper than matching an attribute list against the whole document on every
  mutation. Everything else is located relative to that button.
- **"Am I on React?" is decided once, in `inject`**, by
  `container.closest('[data-component="ActionBar"]')`, and recorded as the
  `REACT` attribute on the container and its `[role=toolbar]` ancestor.
  Everything React-only keys off that mark. Do not reintroduce a CSS selector
  that sniffs for React by markup shape: an earlier version scoped a rule with
  `[role=toolbar]:has(…)`, which matched **every** Primer ActionBar on
  github.com, not just comment boxes.
- `prepareReact` does everything React needs and classic does not, in one place:
  adopt buttons left outside the ActionBar (Saved replies is a sibling of the
  whole thing, so the toolbar would otherwise differ from pull requests),
  flatten `ActionBar.Group` wrappers into the flat list the layout code assumes,
  and strip the `data-overflowing` markers described below.
- `slotOf` returns `.ActionBar-item` on the classic editor and the bare button
  on React, which is why the `|| btn` fallback is load-bearing rather than
  defensive.
- The stylesheet's `height`/`overflow` relaxation is scoped to React by its own
  divider element. React's toolbar row is a fixed height with `overflow:hidden`,
  so a wrapped second row would be invisible — but applying the same relaxation
  to the classic toolbar leaves its `<hr>` dividers riding up over the border.
- `DEFAULT_ORDER` is written out rather than read from the DOM, and GitHub's own
  divider positions are discarded. The two editors ship different orders (they
  disagree about numbered vs unordered lists) and the toolbar must not depend on
  which page you are on.
- A `BUTTONS` spec either carries `fn`, a pure text transform run through
  `apply`, or `onClick`, which handles the click itself — that is how the
  Configure button opens the panel. A spec with `off: true` ships switched off:
  `defaultOn` is consulted by `reconcile` for entries new to a layout, so a
  newly added default-off button stays off for people who already have one.
  `HIDE_ON_INSTALL` does the same for GitHub's own buttons, and
  `pruneSeparators` then drops any divider with no visible entry on one side or
  the other, so none is stranded at an end of the toolbar or doubled up. It
  looks past hidden buttons to the next _visible_ entry: skipping that is what
  made the divider after Copilot vanish once Heading, Bold and Italic were
  hidden by default.
- `buildItem` clones a whole `.ActionBar-item` to inherit GitHub's markup and
  styling, then removes every attribute in `STRIP`. **Leaving `data-md-button`
  on a clone makes our button also apply bold**, and leaving `aria-labelledby`
  makes screen readers announce it as "Bold".
- **Button identity is the octicon name**, memoised per node in a `WeakMap`:
  `octicon-list-ordered` becomes `LIST_ORDERED`. Both editors draw named
  octicons, so one vocabulary serves both and a single stored layout applies to
  either — which `data-analytics-event` could not do, since React ships none.
  `actionOf` reads our own `MARK` attribute first, so our buttons share that
  vocabulary (`UNWRAP`, `ALERT_NOTE`, …). It is also the config's vocabulary,
  and `DESCRIPTIONS` and `HIDE_ON_INSTALL` are keyed by it — hence
  opaque-looking keys like `DIFF_IGNORED` for slash commands and `REPLY` for
  saved replies.
- Labels and icons in the settings panel are read from the live toolbar
  (`labelOf`, cloned `<svg>`), never hardcoded, so they track GitHub's changes.
- Our buttons get a **freshly created** `<tool-tip>`, never a cloned one, and
  never a `title` attribute. Three things this got wrong before, each of which
  cost a debugging round:
  - **Never clone it.** `cloneNode` constructs the element while it still
    carries GitHub's `for`, so it binds to _their_ button and silently never
    fires against ours. Nothing in the DOM shows the difference — the clone and
    a working tooltip are attribute-for-attribute identical.
  - **Set `popover="manual"` on it.** GitHub renders that server-side and the
    element assumes it: without it, the element's own `showPopover()` throws
    `NotSupportedError` on hover. Set `role`, `aria-hidden` and
    `sr-only position-absolute` too, or the label sits visible in the toolbar.
  - **Place it beside the button, not inside it.** On React the item _is_ the
    button, so `buildItem` returns `{ item, tip }` and the caller appends the
    tooltip as a sibling.
- The element can be registered lazily, so `buildItem` keeps a `title` until
  `customElements.whenDefined("tool-tip")` resolves. An unregistered
  `<tool-tip>` renders nothing at all.

### Layout model

Config is one `GM_setValue` key, `layout`: an ordered array of `{id, on}`.
Separators are entries with `id === SEPARATOR` (`"|"`) whose position is their
only identity, so they need no ids and any number can exist.

- `DEFAULTS` is `DEFAULT_ORDER` with each entry's default on/off state, and is
  what Reset restores. Nothing is captured from the DOM, so there is no snapshot
  to go stale and no "read the order before anything moves" ordering constraint.
- `reconcile` does the whole merge: keep separators, keep entries whose button
  this toolbar actually has, append ones GitHub has added. It is the only place
  that decides layout membership — that is why a per-editor default capture is
  unnecessary, and why a saved layout survives GitHub changing the toolbar.
- `applyLayout` reorders by re-appending the items in sequence, then re-appends
  everything it does not model (tooltips, React's overflow spacer, a button
  whose icon it could not name) so those are not left bunched in front. It
  compares current against desired order first and only touches the DOM when
  they differ — **moving a node fires a mutation even when it lands where it
  already was, so without that guard the MutationObserver calls itself
  forever.**

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

## Tests

`tests/test.cjs` covers the pure transforms. `tests/classic.html` and
`tests/react.html` cover the DOM layer against trimmed copies of both toolbars;
they assert in the page, so they can be opened in a browser directly, and
`tests/fixtures.py` runs them in headless Chrome for CI. `prek run -a` runs all
three.

**Both fixtures assert the same expected order** (`EXPECTED_ORDER` in
`tests/harness.js`). That is the point of them: the toolbar has to look the same
whichever editor GitHub used, and that guarantee is easy to break by accident.

Two things the fixtures must stub before loading the userscript, both in
`harness.js`: the `GM_*` storage API, and `requestAnimationFrame` — headless
Chrome paints no frames, so rAF never fires and the script's observer debounce
would never run. Timers do fire and are equivalent here.

The mock markup is worth keeping honest, because a fixture that has drifted from
GitHub proves nothing. Two details that were wrong once and cost real time:
React's Saved replies button is a child of the _toolbar wrapper_, not a sibling
of it, and the classic toolbar nests toolbar and textarea in a shared `<form>`,
which is what lets `findTextarea`'s ancestor walk reach it.

Also: CDP synthetic mouse events do **not** trigger Chrome's HTML5 drag and
drop, so the panel's reordering can only be exercised by dispatching real
`DragEvent`s with a `DataTransfer`.

## Repo conventions

Workflows under `.github/` follow the user's global rules: run `ghactionsup`
after editing, then `zizmor`.
