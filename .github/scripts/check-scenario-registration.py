"""Check that every scenario is registered in README.md and scenario-authors.json.

- README.md must link the scenario's build artifact, `en-<file name>-color/`.
- scenario-authors.json must list the exact \\addscenariosection title.
  Campaign scenarios (\\addscenariosection[subsection]) are skipped here,
  because their entries use the feedback form names, not the titles.
"""

import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCENARIO_DIRS = ("clash/", "coops/", "campaigns/", "draft-scenarios/")
SECTION = re.compile(
    r"^\\addscenariosection(\[[^\]]*\])?\{[^}]*\}\{[^}]*\}\{([^}]*)\}", re.MULTILINE
)


def scenario_files():
    files = subprocess.run(
        ["git", "ls-files", "*.tex"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    return [
        f for f in files if f.startswith(SCENARIO_DIRS) and "/translated/" not in f
    ]


def main():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    authors = json.loads(
        (ROOT / ".github/scripts/scenario-authors.json").read_text(encoding="utf-8")
    )
    titles = {title for author in authors.values() for title in author["scenarios"]}

    errors = []
    for path in scenario_files():
        match = SECTION.search((ROOT / path).read_text(encoding="utf-8"))
        if not match:
            continue
        stem = pathlib.Path(path).stem
        is_campaign = match.group(1) is not None
        title = match.group(2)

        if f"en-{stem}-color/" not in readme:
            errors.append(
                f"{path}: README.md has no row for this scenario "
                f"(expected a link containing en-{stem}-color/)."
            )
        if not is_campaign and title not in titles:
            errors.append(
                f'{path}: "{title}" is not listed in '
                f".github/scripts/scenario-authors.json. "
                f"Add it to the author's \"scenarios\" list."
            )

    for error in errors:
        print(error)
    if errors:
        print("---")
        print("Some scenarios are not registered, see the output above.")
        sys.exit(1)
    print("All scenarios are registered.")


if __name__ == "__main__":
    main()
