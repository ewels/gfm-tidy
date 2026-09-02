# gfm-tidy

Adds buttons to the GitHub markdown toolbar, and lets you reorder or hide every
button already on it.

| Button    | What it does                                                                                                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unwrap    | Joins hard-wrapped lines back into full-length paragraphs.                                                                                                                                                                                                                   |
| Dedent    | Strips the longest leading-whitespace prefix common to every non-blank line. Refuses to guess when tabs and spaces are mixed.                                                                                                                                                |
| Details   | Wraps the text in a `<details>` box with a placeholder `<summary>`, left selected so you can type straight over it.                                                                                                                                                          |
| Alerts    | Wraps the text in a [GitHub alert](https://docs.github.com/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts), quoting every line. One button per kind: Note, Tip, Important, Warning, Caution. |
| Configure | Opens the settings panel described below.                                                                                                                                                                                                                                    |

Unwrap is the main feature: GitHub renders single newlines as line breaks, so
text wrapped at 80 columns reads badly in a comment. Unwrap leaves code fences,
headings, tables, thematic breaks, explicit hard breaks and list structure
alone, and unwraps wrapped list items and blockquotes correctly.

It also frees commit hashes from backticks. GitHub links a bare hash but not one
inside a code span, and models habitually write `` `6f3caa3a4` ``. Anything from
7 to 40 lowercase hex digits alone in a code span loses its backticks; a longer
hex string, uppercase hex, a command such as `` `git show 6f3caa3a4` ``, and
anything inside a code fence are all left alone.

Only Note and Warning are shown to begin with. Tip, Important and Caution ship
switched off, and can be turned on in the settings panel.

Each formatting button works on the selection, or on the whole comment box when
nothing is selected; with an empty box an alert button gives you the empty
`> [!NOTE]` skeleton with the caret on its body line. Edits go through the
browser's own insert-text path, so undo still works. The added buttons sit at
the end of the toolbar, after a separator, until you move them.

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

Click the **Configure** button in the toolbar. If you switch that button off,
the panel is still reachable from the Tampermonkey or Violentmonkey icon on any
github.com tab, under **Configure toolbar buttons**. Every button in the toolbar
is listed with its icon, its name and what it does, including the three this
script adds and the separators between groups.

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
- A code span holding 7 to 40 lowercase hex digits is assumed to be a commit
  hash. Anything else of that shape, in a comment or an indented code block,
  loses its backticks too.
- Reordering uses HTML5 drag and drop, which needs a mouse. There is no
  touch-friendly way to move a row.
- Needs a manager with synchronous `GM_getValue`, which means Tampermonkey or
  Violentmonkey. Greasemonkey's `GM.getValue` is promise-based and will not work
  unchanged.

## License

[MIT](LICENSE)
