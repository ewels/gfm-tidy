# Changelog

## [1.0.0] - 2026-09-03

First release.

### Added

- **Unwrap** button: joins hard-wrapped lines into full-length paragraphs and
  frees commit hashes from backticks, leaving code fences, tables, headings,
  hard breaks and list structure alone.
- **Dedent** button: strips the whitespace common to every line, and refuses to
  guess on mixed tabs and spaces.
- **Details** button: wraps the text in a `<details>` box with the `<summary>`
  placeholder selected.
- **Alert** buttons: one per GitHub alert kind — Note, Tip, Important, Warning
  and Caution.
- **Configure** button and settings panel: show, hide and drag-reorder every
  button on the toolbar, GitHub's own included. Also reachable from the
  userscript manager's menu.
- Support for both GitHub editors — the classic toolbar on pull requests and
  discussions, and the Primer React one on issues — with the same button order
  on each.
- Edits go through the native undo stack, so Cmd/Ctrl+Z works as expected.

[1.0.0]: https://github.com/ewels/gfm-tidy/releases/tag/v1.0.0
