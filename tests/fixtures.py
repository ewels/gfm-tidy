#!/usr/bin/env python3
"""Run the HTML fixtures in headless Chrome and fail on any failed check.

The fixtures assert in the page and write a summary line into #results; this
dumps the rendered DOM and reads that line. Chrome is the only requirement,
and GitHub's ubuntu runners ship it.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

CANDIDATES = [
    os.environ.get("CHROME"),
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def find_chrome():
    for name in CANDIDATES:
        if not name:
            continue
        path = shutil.which(name) or (name if Path(name).exists() else None)
        if path:
            return path
    sys.exit(
        "No Chrome found. Set CHROME=/path/to/chrome, or install Google Chrome."
    )


def run(chrome, fixture):
    # virtual-time-budget lets the page's own rAF-driven checks finish before
    # the DOM is dumped; without it we would read "running...".
    out = subprocess.run(
        [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--no-sandbox",
            "--virtual-time-budget=8000",
            "--dump-dom",
            fixture.as_uri(),
        ],
        capture_output=True,
        text=True,
        timeout=120,
    ).stdout

    body = out.split('id="results">', 1)
    if len(body) < 2:
        print(f"{fixture.name}: could not find the results element")
        return False
    report = body[1].split("</div>", 1)[0].replace("&nbsp;", " ")
    ok = "FAILED" not in report and "PASSED" in report
    print(f"--- {fixture.name} ---")
    print(report.strip() if not ok else report.strip().splitlines()[0])
    return ok


def main():
    chrome = find_chrome()
    here = Path(__file__).resolve().parent
    fixtures = sorted(here.glob("*.html"))
    if not fixtures:
        sys.exit("No fixtures found")
    if not all([run(chrome, f) for f in fixtures]):
        sys.exit(1)


if __name__ == "__main__":
    main()
