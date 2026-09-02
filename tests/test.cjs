// Run with: node tests/test.cjs
const assert = require("assert");
const {
  unwrap,
  dedent,
  detailsWrap,
  alertWrap,
} = require("../gfm-tidy.user.js");

const eq = (name, got, want) => {
  assert.strictEqual(
    got,
    want,
    `\n${name}\n--- got ---\n${got}\n--- want ---\n${want}\n`,
  );
};

// -------------------------------------------------------------------- unwrap

eq(
  "joins a wrapped paragraph",
  unwrap("This is a sentence that\nwas hard wrapped at\nsome column."),
  "This is a sentence that was hard wrapped at some column.",
);

eq(
  "keeps paragraphs apart",
  unwrap("One para\nwrapped.\n\nTwo para\nwrapped."),
  "One para wrapped.\n\nTwo para wrapped.",
);

eq(
  "leaves fenced code alone",
  unwrap(
    "Before this\nfence.\n\n```js\nconst a = 1;\n  const b = 2;\n```\n\nAfter the\nfence.",
  ),
  "Before this fence.\n\n```js\nconst a = 1;\n  const b = 2;\n```\n\nAfter the fence.",
);

eq(
  "leaves tilde fences alone",
  unwrap("~~~\none\ntwo\n~~~"),
  "~~~\none\ntwo\n~~~",
);

eq(
  "never joins across a heading",
  unwrap("# Title\nBody text that\nwraps.\n## Next"),
  "# Title\nBody text that wraps.\n## Next",
);

eq(
  "joins wrapped list items but keeps items apart",
  unwrap(
    "- item one that is\n  wrapped over lines\n- item two\n1. ordered item that\n   wraps",
  ),
  "- item one that is wrapped over lines\n- item two\n1. ordered item that wraps",
);

eq(
  "joins blockquotes and strips the continuation marker",
  unwrap("> quoted text that\n> wraps here"),
  "> quoted text that wraps here",
);

eq(
  "never merges a quote with a plain line",
  unwrap("plain line\n> quoted line"),
  "plain line\n> quoted line",
);

eq(
  "leaves table rows alone",
  unwrap("| a | b |\n| - | - |\n| 1 | 2 |"),
  "| a | b |\n| - | - |\n| 1 | 2 |",
);

eq(
  "leaves thematic breaks alone",
  unwrap("text above\n\n---\n\ntext below"),
  "text above\n\n---\n\ntext below",
);

eq(
  "respects an explicit hard break",
  unwrap("line one  \nline two"),
  "line one  \nline two",
);

eq(
  "respects a backslash hard break",
  unwrap("line one\\\nline two"),
  "line one\\\nline two",
);

eq(
  "leaves indented code blocks alone",
  unwrap("para\n\n    code line\n    more code"),
  "para\n\n    code line\n    more code",
);

eq(
  "leaves setext underlines alone",
  unwrap("Title\n===\nbody"),
  "Title\n===\nbody",
);

eq("handles empty input", unwrap(""), "");

// -------------------------------------------------------------------- dedent

eq("strips a common space indent", dedent("    a\n      b"), "a\n  b");
eq("ignores blank lines when measuring", dedent("  a\n\n  b"), "a\n\nb");
eq("strips a common tab indent", dedent("\ta\n\tb"), "a\nb");
eq("normalises whitespace-only lines", dedent("  a\n   \n  b"), "a\n\nb");
eq("does nothing without a common indent", dedent("a\n  b"), "a\n  b");
eq(
  "refuses to guess on mixed tabs and spaces",
  dedent("\ta\n    b"),
  "\ta\n    b",
);
eq("handles empty input", dedent(""), "");

// -------------------------------------------------------------------- details

const d = detailsWrap("hello\nworld");
eq(
  "wraps in details",
  d.text,
  "<details>\n<summary>Details</summary>\n\nhello\nworld\n\n</details>\n",
);
eq(
  "offsets select the placeholder summary",
  d.text.slice(d.selectionStart, d.selectionEnd),
  "Details",
);
eq(
  "trims stray newlines around the selection",
  detailsWrap("\n\nhi\n\n").text,
  "<details>\n<summary>Details</summary>\n\nhi\n\n</details>\n",
);

// --------------------------------------------------------------- hashes

eq(
  "frees a backticked short hash so GitHub can link it",
  unwrap("Fixed in `6f3caa3a4` yesterday."),
  "Fixed in 6f3caa3a4 yesterday.",
);
eq(
  "frees a full-length hash",
  unwrap("`" + "a".repeat(40) + "`"),
  "a".repeat(40),
);
eq(
  "leaves a too-short hex span alone",
  unwrap("see `abc123` here"),
  "see `abc123` here",
);
eq(
  "leaves hex longer than a hash alone",
  unwrap("`" + "a".repeat(41) + "`"),
  "`" + "a".repeat(41) + "`",
);
eq("leaves uppercase hex alone", unwrap("`6F3CAA3A4`"), "`6F3CAA3A4`");
eq("leaves non-hex alone", unwrap("`zzzzzzz`"), "`zzzzzzz`");
eq(
  "leaves a command containing a hash alone",
  unwrap("run `git show 6f3caa3a4` first"),
  "run `git show 6f3caa3a4` first",
);
eq(
  "leaves a double-backtick span alone",
  unwrap("``6f3caa3a4``"),
  "``6f3caa3a4``",
);
eq(
  "leaves hashes inside a code fence alone",
  unwrap("```\n`6f3caa3a4`\n```"),
  "```\n`6f3caa3a4`\n```",
);
eq(
  "frees hashes while unwrapping the same paragraph",
  unwrap("Broken by `6f3caa3a4` and\nfixed by `1234abc`."),
  "Broken by 6f3caa3a4 and fixed by 1234abc.",
);

// -------------------------------------------------------------------- alerts

const note = alertWrap("NOTE");

eq(
  "inserts an empty alert when nothing is selected",
  note("").text,
  "> [!NOTE]\n> \n",
);
eq(
  "leaves the caret on the body line",
  note("").text.slice(0, note("").selectionStart),
  "> [!NOTE]\n> ",
);
eq("wraps a single line", note("hello").text, "> [!NOTE]\n> hello\n");
eq(
  "quotes every line of a multi-line selection",
  note("one\ntwo").text,
  "> [!NOTE]\n> one\n> two\n",
);
eq(
  "keeps a blank line inside the alert quoted",
  note("a\n\nb").text,
  "> [!NOTE]\n> a\n> \n> b\n",
);
eq(
  "trims stray blank lines around the selection",
  note("\n\nhi\n\n").text,
  "> [!NOTE]\n> hi\n",
);
eq(
  "uses the kind it was built with",
  alertWrap("WARNING")("x").text,
  "> [!WARNING]\n> x\n",
);

console.log("all tests passed");
