// Shared by the fixture pages. Each one builds a mock toolbar, loads the real
// userscript against it, then asserts. Results go into #results, and the
// summary line is what tests/fixtures.py greps for.
window.gfmTest = (() => {
  const results = [];

  const check = (name, got, want) =>
    results.push(
      (got === want ? "PASS " : "FAIL ") +
        name +
        (got === want
          ? ""
          : `\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`),
    );

  // What a toolbar child is, in whichever editor drew it.
  const nameOf = (el) => {
    if (
      el.matches(
        '.ActionBar-divider, [data-component="ActionBar.VerticalDivider"]',
      )
    ) {
      return "|";
    }
    const btn = el.matches("button") ? el : el.querySelector("button");
    if (!btn) return null;
    const svg = btn.querySelector("svg");
    const icon =
      svg && (svg.getAttribute("class").match(/octicon-([\w-]+)/) || [])[1];
    const name = btn.getAttribute("data-gfm-tidy") || icon;
    return name ? name.toUpperCase().replace(/-/g, "_") : null;
  };

  const shown = (bar) =>
    [...bar.children]
      .filter((el) => !el.hasAttribute("data-gfm-tidy-hidden"))
      .map(nameOf)
      .filter(Boolean)
      .join(" ");

  const frame = () => new Promise(requestAnimationFrame);
  const settle = async () => {
    document.body.appendChild(document.createElement("span"));
    await frame();
    await frame();
  };

  const report = () => {
    const failed = results.filter((line) => line.startsWith("FAIL")).length;
    document.getElementById("results").textContent =
      (failed ? `${failed} FAILED` : `ALL ${results.length} PASSED`) +
      "\n\n" +
      results.join("\n");
  };

  // Both fixtures carry the same buttons, so both must produce this. That is
  // the point: the toolbar has to be identical whichever editor drew it.
  const EXPECTED_ORDER =
    "QUOTE LINK | LIST_ORDERED LIST_UNORDERED TASKLIST | " +
    "REPLY DIFF_IGNORED | UNWRAP DEDENT DETAILS | " +
    "ALERT_NOTE ALERT_WARNING | CONFIG";

  // Octicon name per button, in the order GitHub's own markup uses.
  const BUTTONS = [
    ["heading", "Heading"],
    ["bold", "Bold"],
    ["italic", "Italic"],
    ["quote", "Quote"],
    ["code", "Code"],
    ["link", "Link"],
    ["list-ordered", "Numbered list"],
    ["list-unordered", "Unordered list"],
    ["tasklist", "Task list"],
    ["mention", "Mention"],
    ["cross-reference", "Reference"],
    ["reply", "Saved replies"],
    ["diff-ignored", "Slash commands"],
  ];
  const PATH = "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Z"; // shape is irrelevant here

  // Stubs the page needs before the userscript loads.
  const gmStub = () => {
    // Headless Chrome paints no frames, so requestAnimationFrame never fires
    // and the script's observer debounce would never run. Timers do fire, and
    // are equivalent for what these fixtures check.
    window.requestAnimationFrame = (fn) => setTimeout(fn, 0);

    const store = {};
    window.GM_getValue = (key, fallback) =>
      key in store ? store[key] : fallback;
    window.GM_setValue = (key, value) => {
      store[key] = value;
    };
    window.GM_registerMenuCommand = (name, fn) => {
      window.openPanel = fn;
    };
  };

  return {
    check,
    nameOf,
    shown,
    frame,
    settle,
    report,
    EXPECTED_ORDER,
    BUTTONS,
    PATH,
    gmStub,
  };
})();
