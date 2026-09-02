// Run with: node test.cjs
const assert = require("assert");
const { unwrap, dedent, detailsWrap } = require("./gfm-tidy.user.js");

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

console.log("all tests passed");
