# <img src="docs/images/gfm-tidy_icon.svg" width="32" align="top" alt=""> gfm-tidy

Extra buttons for the GitHub markdown toolbar, and control over which of
GitHub's own buttons you keep. Works on issues, pull requests, review comments
and discussions.

AI agents often write annoying GitHub issues, PR descriptions and comments:

- **Text hard-wrapped at 80 columns.** GitHub flavoured markdown renders a
  single line break as a `<br>`, unlike most markdown, so every wrap shows up in
  the rendered text.
- **Commit hashes in backticks.** GitHub links a bare hash, but not one inside a
  code span.
- **Code indented to wherever it sat in the source.**

This extension adds a button to fix those things. And more.

## Buttons

| Button        | What it does                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unwrap**    | Joins hard-wrapped lines into full-length paragraphs, and frees commit hashes from backticks.                                                                                                                                       |
| **Dedent**    | Strips the leading whitespace common to every line. Refuses to guess on mixed tabs and spaces.                                                                                                                                      |
| **Details**   | Wraps the text in a `<details>` box, with the `<summary>` placeholder selected so you can type over it.                                                                                                                             |
| **Alerts**    | One button per [GitHub alert](https://docs.github.com/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts) kind: Note, Tip, Important, Warning, Caution. |
| **Configure** | Opens the settings panel, where you can show/hide and reorder toolbar buttons (including native GitHub).                                                                                                                            |

Unwrap, Dedent and Details act on the selection, or on the whole comment box
when nothing is selected. Alerts insert an empty alert at the caret or wrap
selected text. Undo works as you'd expect.

https://github.com/user-attachments/assets/271c9fcc-7a62-4c1e-b409-9bc1460a02a5

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/) or
   [Tampermonkey](https://www.tampermonkey.net/).
2. In Chrome, open the extension's details page and turn on **Allow user
   scripts**. Manifest V3 requires this for every userscript manager, and
   nothing runs without it.
3. Open
   [`gfm-tidy.user.js`](https://raw.githubusercontent.com/ewels/gfm-tidy/main/gfm-tidy.user.js)
   and confirm the install prompt. Updates are automatic.

## Defaults

Hidden on a fresh install, each one click away in the panel:

- GitHub's Heading, Bold, Italic, Code, Mention, Reference and Attach files. The
  first four have quicker keyboard shortcuts, and the toolbar wraps onto a
  second row otherwise.
- The Tip, Important and Caution alerts.

These apply only to a layout you have never customised.

## Settings panel

Click **Configure**. If you switch that button off, the panel is still reachable
from the Tampermonkey or Violentmonkey icon, under **Configure toolbar
buttons**.

- Drag a row by its handle to reorder the toolbar.
- Switch a row off to hide that button.
- **Add separator** adds a divider to the bottom of the list; drag it where you
  want it.
- **Reset** restores the default order: GitHub's own, with the added buttons in
  groups.

Changes apply immediately with no reload. The layout is stored by the userscript
manager. The panel reads the live toolbar, so buttons GitHub adds or removes are
picked up on their own.

## Development

One file, no build step, no dependencies. Edit `gfm-tidy.user.js` and reload a
GitHub page.

```sh
node tests/test.cjs       # the text transforms
python3 tests/fixtures.py # the toolbar, in headless Chrome
prek run -a               # all of it, the same hooks CI runs
```

`tests/classic.html` and `tests/react.html` are trimmed copies of the two
toolbars GitHub renders: the classic one on pull requests and discussions, the
Primer React one on issues. Open either in a browser to watch the checks run.
Both assert the same expected toolbar order, which is what keeps the two editors
consistent.

Bump `@version` when ready.

## Known limits

- Reordering needs a mouse. HTML5 drag and drop has no touch equivalent.
- Tampermonkey or Violentmonkey only. Greasemonkey's `GM.getValue` is
  promise-based and will not work unchanged.
- GitHub's `...` overflow menu is replaced by wrapping onto a second row, since
  you are the one choosing what the toolbar holds.
- Unwrap skips any line starting with `<`, which also catches a paragraph
  beginning with an autolink.
- A code span of 7 to 40 lowercase hex digits is treated as a commit hash
  wherever it appears, including inside an indented code block.

## License

[MIT](LICENSE)
