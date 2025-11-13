# Build and Utility Scripts

This page documents all the available bash scripts for building, optimizing, and managing the Heroes 3 Mission Book project.
All the scripts are in the `tools/` directory.
It is assumed that all the scripts are run from the root directory of the repository.

## **build.sh**

The main script for generating PDF files from source files in different languages and modes.

**Dependencies:**

- [Perl](https://www.perl.org/) for running LaTeX build tools
- [po4a](https://github.com/mquinson/po4a) for translation handling - only if building the Mission Book (not Drafts) in non-English

**Usage:**
```bash
tools/build.sh [language] [-p|--printable] [-m|--mono] [-d|--drafts] [-s|--scenario SEARCH] [-h|--help]
```

**Arguments:**

- `language`: Language code (defaults to 'en' if not specified)
- Valid options: `en`, `pl`, `fr`, `cs`
- Note: Language selection is incompatible with drafts mode

**Options:**

- `-d, --drafts`: Generate draft scenarios
- `-s, --scenario <SEARCH>`: Build only scenario matching the input given (incompatible with `-d`)
- `-m, --mono`: Monochrome mode (removes colored backgrounds from maps)
- `-p, --printable`: Enable printable mode, currently not used for this project
- `-h, --help`: Show help message

Short options can be combined, e.g., `-dm` for drafts and mono.

**Examples:**

```bash
# Build the English version (default)
tools/build.sh

# Build the French version
tools/build.sh fr

# Build the Polish version in monochrome mode
tools/build.sh pl --mono

# Build draft scenarios in monochrome mode
tools/build.sh -dm

# Build Sentinels scenario - this will produce sentinels.pdf file
tools/build.sh -s sentinels

# Build the 1st scenario of the Inferno campaign (A Devilish Plan) in Czech language and monochrome mode
tools/build.sh cs -m -s devilish
```

## **pdf2image.sh**

Extracts specific pages from a PDF and converts them to high-quality PNG images.

**Dependencies:**

- [Poppler Utils](https://poppler.freedesktop.org/) (pdftoppm) for PDF to image conversion

**Usage:**
```bash
tools/pdf2image.sh (-l <language> | -d) -r <range>
```

**Mandatory Arguments (choose one):**

- `-l, --language <language>`: Specify the language of the PDF to convert
- `-d, --drafts`: Use draft scenarios PDF instead of language PDF

**Required:**

- `-r, --range <range>`: Page range to convert (e.g., `1`, `1,3,5`, `1-5`)

**Examples:**

```bash
# Convert page 8 of the English PDF to an image
tools/pdf2image.sh -l en -r 8

# Convert multiple pages (1, 3, 4, 5) from the draft scenarios PDF
tools/pdf2image.sh -d -r 1,3-5
```

The script saves images to the `screenshots` directory.
It is a good practice to attach screenshots of the generated PDFs to PRs with new scenarios.

## **compare_pages.sh**

Visually compares pages between your local PDF build and a reference version from the main branch on GitHub.

**Dependencies:**

- [cURL](https://curl.se/) for downloading reference files
- [Poppler Utils](https://poppler.freedesktop.org/) (pdftoppm) for PDF to image conversion
- [ImageMagick](https://imagemagick.org/) (montage) for creating comparison images

**Usage:**
```bash
tools/compare_pages.sh (-l <language> | -d | -s|--scenario SEARCH) -r <range> [OPTIONS]
```

**Mandatory Arguments (choose one):**

- `-l, --language <language>`: Specify the language for comparison (e.g., `pl`, `fr`, defaults to `en` if unspecified)
- `-d, --drafts`: Compare draft scenarios (mutually exclusive with `-l`)

**Required:**

- `-r, --range <range>`: Page range to compare (e.g., `1`, `1,3-5`, `1-5`)

**Optional:**

- `-s, --scenario <SEARCH>`: Compare against a single scenario.
- `-m, --mono`: Use monochrome version for baseline comparison

**Examples:**

```bash
# Compare page 11 of the English version
tools/compare_pages.sh -l en -r 11

# Compare pages 1-10 of drafts, combined into a single image
tools/compare_pages.sh -d -r 1-10 --single-page

# Compare pages 1-2 of the Wandering Dragons scenario
tools/compare_pages.sh -s wandering -r 1-2
```

It is a good practice to attach a screenshot of the comparison to the pull request, while updating scenarios.

## **optimize.sh**

Optimizes PDF files for distribution by significantly reducing file size while maintaining quality.

**Dependencies:**

- [Ghostscript](https://www.ghostscript.com/) for PDF processing

**Usage:**
```bash
tools/optimize.sh [language] [options]
```

**Arguments:**

- `language`: Language code (defaults to 'en' if not specified)

**Options:**

- `-d, --drafts`: Optimize draft scenarios PDF instead of language PDF
- `--cmyk`: Convert colors to CMYK color space for professional printing
- `-f FILE`: Use arbitrary PDF file

**Examples:**

```bash
# Optimize the English version (default)
tools/optimize.sh

# Optimize the Polish version with CMYK conversion
tools/optimize.sh pl --cmyk

# Optimize draft scenarios
tools/optimize.sh -d
```

## **find_fuzzy.sh**

Locates "fuzzy" translations in the PO files for a specific language.

**Dependencies:**

- Standard Unix utilities (grep)

**Usage:**
```bash
tools/find_fuzzy.sh <language>
```

Where `<language>` is the language code (e.g., `en`, `pl`, `fr`, `cs`).

**Example:**
```bash
$ tools/find_fuzzy.sh cs
translations/castle_two_knights_defense.tex/cs.po:129:#, fuzzy, no-wrap
translations/castle_two_knights_defense.tex/cs.po-130-msgid ""
translations/castle_two_knights_defense.tex/cs.po-131-"\\subsection*{\\MakeUppercase{Scenario length}}\n"
translations/castle_two_knights_defense.tex/cs.po-132-"\n"
--
translations/castle_two_knights_defense.tex/cs.po:140:#, fuzzy, no-wrap
translations/castle_two_knights_defense.tex/cs.po-141-msgid ""
translations/castle_two_knights_defense.tex/cs.po-142-"This Scenario plays out over 8 Rounds.\n"
translations/castle_two_knights_defense.tex/cs.po-143-"\n"
...
```

This will search through all Czech translation files and display any translations marked as "fuzzy" with their context.

## **to_monochrome.sh**

Converts color images to a selective monochrome format while preserving important details and transparency.
Useful for creating black-and-white printer friendly files.
This script is primarily used by `tools/build.sh` when the `-m` or `--mono` flag is specified.
It converts the image to selective monochrome and replaces the original file.
It probably doesn't need to be used standalone.

**Dependencies:**

- [ImageMagick](https://imagemagick.org/) for image processing

**Usage:**
```bash
tools/to_monochrome.sh <input_image>
```

Where `<input_image>` is the path to the PNG image you want to convert.

**Example:**
```bash
tools/to_monochrome.sh assets/maps/sentinels.png
```

All the files are edited in place for the time of building LaTeX files, and then restored to their original state after the build is complete.
To speed up subsequent runs, a cache of all the images is stored in the `cache/` directory.

## **clean.sh**

Cleans up the project directory by removing temporary files and restoring original files from Git.

**Usage:**
```bash
tools/clean.sh
```

The script removes all `.aux` files, temporary directories like `translated` and `svg-inkscape`, the `cache` directory, and generated PDF files.
It then uses `git restore` to bring back essential files that might have been modified or removed.

## **_find_scenario.sh**

Finds a specific file to be build by the `tools/build.sh` script with the `-s` flag using an input given.
Probably should not be used on its own.

## **release.sh** (legacy)

Automates the process of building and preparing optimized PDF files for release.
It is a legacy script and you should probably use [the workflow](https://github.com/qwrtln/Homm3BG-mission-book/actions/workflows/build-release.yaml) instead.

**Dependencies:**

- Requires `tools/build.sh` and `tools/optimize.sh`

**Usage:**
```bash
tools/release.sh <language>
```

Where `<language>` is the language code (e.g., `en`, `pl`, `cs`).

**Example:**
```bash
tools/release.sh en
```

This builds the English PDF, optimizes it, and creates a file named `Heroes3_English_Fan_Made_Mission_Book_<Version>.pdf` in a release directory.
