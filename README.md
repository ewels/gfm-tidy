# gfm-tidy

Adds three buttons to the GitHub markdown toolbar, and lets you reorder or hide
every button already on it.

| Button  | What it does                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Unwrap  | Joins hard-wrapped lines back into full-length paragraphs.                                                                    |
| Dedent  | Strips the longest leading-whitespace prefix common to every non-blank line. Refuses to guess when tabs and spaces are mixed. |
| Details | Wraps the text in a `<details>` box with a placeholder `<summary>`, left selected so you can type straight over it.           |

Unwrap is the main feature: GitHub renders single newlines as line breaks, so
text wrapped at 80 columns reads badly in a comment. Unwrap leaves code fences,
headings, tables, thematic breaks, explicit hard breaks and list structure
alone, and unwraps wrapped list items and blockquotes correctly.

Each button works on the selection, or on the whole comment box when nothing is
selected. Edits go through the browser's own insert-text path, so undo still
works. The three buttons sit at the end of the toolbar, after a separator, until
you move them.

Works on issues, pull requests, review comments and discussions.

## Install

1. Install [Violentmonkey](https://violentmonkey.github.io/) or
   [Tampermonkey](https://www.tampermonkey.net/).
2. In Chrome, open the extension's details page and turn on **Allow user
   scripts**. Chrome requires this for every userscript manager under Manifest
   V3, and nothing runs without it.
3. Open
   [`gfm-tidy.user.js`](https://raw.githubusercontent.com/ewels/gfm-tidy/main/gfm-tidy.user.js)
   and confirm the install prompt. Updates are picked up automatically.

## Customising the toolbar

Open the Tampermonkey or Violentmonkey icon on any github.com tab and pick
**Configure toolbar buttons**. Every button in the toolbar is listed with its
icon, its name and what it does, including the three this script adds and the
separators between groups.

- Drag a row by its handle to reorder the toolbar.
- Switch a row off to hide that button.
- **Add separator** appends a new divider to the bottom of the list; drag it
  where you want it.
- **Reset** restores the original order. That is GitHub's own order with these
  three buttons after a separator, not GitHub's toolbar without them.

Changes apply immediately, with no reload, so an unsent comment draft is safe.

Nothing is hidden or moved by default. The panel reads the live toolbar rather
than a hardcoded list, so buttons GitHub adds or removes are picked up on their
own, and a saved layout survives them changing the toolbar.

The layout is stored by the userscript manager rather than by the page, so it
survives script updates and clearing site data, and you can edit it by hand in
Tampermonkey under the script's Storage tab.

## Development

The whole thing is one file with no build step and no dependencies. Edit
`gfm-tidy.user.js` and reload a GitHub page.

```sh
node test.cjs   # the text transforms: unwrap, dedent, details
prek run -a     # prettier and the tests
```

Bump `@version` in the header for any change you want installed copies to pick
up: a userscript manager compares that field against `@updateURL` and updates
only when the remote value is higher.

CI runs `prek` on push and pull requests, so the same two hooks gate every
change.

## Known limits

- GitHub's toolbar normally moves buttons it thinks will not fit into a `...`
  overflow menu. Since you are choosing what the toolbar holds, that is
  overridden: every button you leave switched on stays visible, the `...` menu
  is hidden, and the toolbar wraps onto a second row if a window is too narrow
  for all of them.
- Unwrap treats a line starting with `<` as an HTML block and leaves it alone,
  which also catches a paragraph that happens to start with an autolink.
- Reordering uses HTML5 drag and drop, which needs a mouse. There is no
  touch-friendly way to move a row.
- Needs a manager with synchronous `GM_getValue`, which means Tampermonkey or
  Violentmonkey. Greasemonkey's `GM.getValue` is promise-based and will not work
  unchanged.

## License

[MIT](LICENSE)
