# gfm-tidy

Three extra buttons in the GitHub markdown toolbar, next to bold and italic.

| Button  | What it does                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Unwrap  | Joins hard-wrapped lines back into full-length paragraphs.                                                                    |
| Dedent  | Strips the longest leading-whitespace prefix common to every non-blank line. Refuses to guess when tabs and spaces are mixed. |
| Details | Wraps the text in a `<details>` box with a placeholder `<summary>`, left selected so you can type straight over it.           |

Unwrap is the main feature: GitHub renders single newlines as line breaks, so text wrapped at 80 columns reads badly in a comment. Unwrap leaves code fences, headings, tables, thematic breaks, explicit hard breaks and list structure alone, and unwraps wrapped list items and blockquotes correctly.

Each button works on the selection, or on the whole comment box when nothing is
selected. Edits go through the browser's own insert-text path, so undo still works.

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

## Hiding stock buttons

The toolbar is crowded. To hide buttons you never use, open the Tampermonkey or
Violentmonkey icon on any github.com tab and pick **Configure hidden buttons**.
Enter a comma-separated list, or leave it empty to show everything. The change
applies immediately, with no reload, so an unsent comment draft is safe.

Nothing is hidden by default. The names are the ones GitHub puts in each
button's `data-analytics-event`:

`COPILOT`, `HEADING`, `BOLD`, `ITALIC`, `QUOTE`, `CODE`, `LINK`,
`ORDERED_LIST`, `UNORDERED_LIST`, `TASK_LIST`, `ATTACH_FILES`, `MENTION`,
`REFERENCE`, `SAVED_REPLIES`, `SLASH_COMMANDS`

The setting is stored by the userscript manager rather than by the page, so it
survives script updates and clearing site data, and you can edit it by hand in
Tampermonkey under the script's Storage tab.

## Tests

```sh
node test.cjs     # the text transforms
```

## Known limits

- The toolbar moves buttons into an overflow menu on narrow viewports. These
  three stay visible instead, so they can crowd a very narrow window.
- Unwrap treats a line starting with `<` as an HTML block and leaves it alone,
  which also catches a paragraph that happens to start with an autolink.
