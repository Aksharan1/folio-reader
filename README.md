<div align="center">

# Folio

**A fast, private e-book reader for Windows.**

EPUB, Kindle, PDF, FB2, Word, Markdown and text. No account, no cloud, no tracking.

[![CI](https://github.com/Aksharan1/folio-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/Aksharan1/folio-reader/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Aksharan1/folio-reader?label=download)](https://github.com/Aksharan1/folio-reader/releases/latest)
[![MIT licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)
![Windows 10 and 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4)

![A book open in Folio's two-page view](docs/screenshots/reader.png)

</div>

## Download

Get the latest version from the **[Releases page](https://github.com/Aksharan1/folio-reader/releases/latest)**:

- **`Folio-Setup-<version>.exe`** installs Folio, adds it to the Start menu and lets you open EPUB, Kindle and FB2 files with a double-click.
- **`Folio-Portable-<version>.exe`** runs without installing. It keeps its library in a `Folio Data` folder next to the .exe, so it can live on a USB stick.

The builds aren't code-signed yet, so Windows SmartScreen may warn the first time you run one: choose **More info → Run anyway**.

## Features

**Reading**
- Pages break between lines, so no line is ever cut in half or shown twice.
- Two pages side by side on wide windows, like an open book.
- Five themes (Paper, Sepia, Dusk, Midnight, Black) with a brightness control, 11 fonts, and adjustable text size, line spacing, margins and alignment.
- **Read aloud** with the voices built into Windows. It follows along, turning pages and moving through chapters.
- **Look up** any word for a definition from Wiktionary, or a Wikipedia summary for names and places.
- Footnotes open in a popup next to the text. Links inside a book work, and web links open in your browser.
- Full-text search in the book, a contents panel, a progress scrubber, and an estimate of the time left.

**Notes**
- Highlights in five colours, notes on any passage, and bookmarks, collected per book and across your library.
- Export highlights and notes as Markdown, for one book or all of them.
- Bring over your Kindle highlights by importing `My Clippings.txt`.

**Library**
- Add books one at a time, a whole folder, or by dragging them onto the window.
- Grid and list views, filters, sorting, favourites, an author index, and a Reading Now page.
- Back up the whole library (books, progress, highlights and bookmarks) to a single file and restore it on another PC.

**Private**
- Everything stays on your computer. There's no account, telemetry or sync server.
- Folio only goes online when you look up a word.
- A book can't run scripts or load anything from the internet.

<table>
  <tr>
    <td><img src="docs/screenshots/library.png" alt="The library"></td>
    <td><img src="docs/screenshots/look-up.png" alt="Looking up a word"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/appearance.png" alt="Appearance settings on a sepia page"></td>
    <td><img src="docs/screenshots/search.png" alt="Searching inside a book"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/annotations.png" alt="Highlights and notes across the library"></td>
    <td><img src="docs/screenshots/reading-now.png" alt="Reading Now"></td>
  </tr>
</table>

## Supported formats

Folio's reader works with EPUB. Other formats are converted to EPUB on your computer when you add them, so search, highlights, bookmarks and progress work the same for every book. The original file isn't kept.

| Format | Notes |
| --- | --- |
| EPUB | Opened as-is. |
| MOBI, AZW, AZW3, PRC | Kindle books, both the old MOBI and the newer KF8 (AZW3) format, with images, styles and the table of contents. DRM-protected books and KFX files can't be opened. Parsed with [foliate-js](https://github.com/johnfactotum/foliate-js). |
| PDF | The text is extracted and reflowed into paragraphs, so it adapts to your font and theme settings. Headers, footers and page numbers are removed, and the PDF's outline becomes the contents. Images, tables and complex layouts (maths, multi-column figures) don't come through, and scanned PDFs without a text layer can't be read. Uses [pdf.js](https://mozilla.github.io/pdf.js/). |
| FB2, FBZ, FB2.ZIP | FictionBook, including cover, images, poems, epigraphs and footnotes. |
| DOCX | Word documents: headings (which become chapters), bold, italic, lists, tables, links and images. |
| HTML, HTM, XHTML | Split into chapters at `<h1>`/`<h2>` headings. Embedded (`data:`) images are kept, and scripts and external files are dropped. |
| MD, Markdown | Headings, emphasis, lists, quotes, code and links. |
| TXT | Paragraphs are rejoined, and chapter headings such as "Chapter IV" or "Part Two" become the contents. |

## Keyboard shortcuts

| Reading | | Library | |
| --- | --- | --- | --- |
| `→` `Space` `PgDn` | Next page | `Ctrl O` | Add books |
| `←` `PgUp` | Previous page | `Ctrl Shift O` | Add a folder |
| `Home` / `End` | Beginning / end of book | `/` or `Ctrl F` | Search library |
| `T` | Contents | `Esc` | Clear search |
| `F` or `Ctrl F` | Search in book | `F11` | Full screen |
| `A` | Annotations | `Alt` | Show the menu bar |
| `S` | Appearance | | |
| `R` | Read aloud | | |
| `B` | Toggle bookmark | | |
| `H` | Highlight selected text | | |
| `I` | Book details | | |
| `+` / `-` | Text size | | |
| `Esc` | Close panel, stop reading aloud | | |

## Where your data lives

The installed app keeps its library in `%APPDATA%\Folio`. The portable app keeps it in `Folio Data` next to the .exe. To move to another computer, use **Settings → Library & Data → Back up library**, then **Restore a backup** on the new one.

## Building from source

You need [Node.js](https://nodejs.org/) 22.13 or newer and Windows 10 or 11.

```bash
git clone https://github.com/Aksharan1/folio-reader.git
cd folio-reader
npm install
npm start            # run the app from source
npm test             # end-to-end test: opens the app and drives it for a couple of minutes
npm run dist         # build dist/Folio-Setup-<version>.exe and dist/Folio-Portable-<version>.exe
```

If `npm start` reports that Electron failed to install, run `node node_modules/electron/install.js` once.

Other scripts:

```bash
npm run screenshots  # rebuild docs/screenshots (looks up one word on Wiktionary)
npm run vendor       # refresh vendor/ from node_modules after updating epub.js, JSZip, pdf.js or foliate-js
npm run icon         # redraw build/icon.png from the favicon in index.html
```

Set `SHOTS=some/folder` when running `npm test` to save a screenshot of every step.

## How it works

Folio is plain HTML, CSS and JavaScript with no framework and no build step, inside a small [Electron](https://www.electronjs.org/) shell.

Each spine section of the EPUB is rendered by [epub.js](https://github.com/futurepress/epub.js) to HTML, and loaded into a sandboxed `<iframe>` with the theme injected as CSS. Once the section's layout is final, the iframe measures every line box and cuts pages between lines. Turning a page scrolls to the next cut. A strip under the last full line is masked, so a partly visible line is never shown. In the two-page view, a second iframe shows the page after the first.

Progress is measured in characters across the whole book. Highlights are stored as the text you selected, and drawn again by finding that text each time a section renders. Books are stored in IndexedDB inside the app's profile.

Each page frame carries a Content-Security-Policy that only lets Folio's own script run, so scripts inside a book are blocked.

```
index.html            entry point and Content-Security-Policy
app.css               design tokens, themes, layout and components
js/
  dom.js              tiny DOM helper, icon set, generated covers, formatters
  convert.js          converts MOBI/AZW3, PDF, FB2, DOCX, HTML, Markdown and text to EPUB
  reader.js           rendering engine: pagination, two-page view, links, search, highlights
  library.js          IndexedDB storage, preferences, backup and restore
  clippings.js        imports Kindle highlights from My Clippings.txt
  speech.js           read aloud
  lookup.js           Wiktionary and Wikipedia look-ups
  app.js              UI: library views, reader chrome, panels, keyboard
electron/
  main.js             desktop shell: window, menu, app:// protocol, file opening, save dialogs
  preload.js          the small bridge between the shell and the page
vendor/               epub.js, JSZip, pdf.js and foliate-js's MOBI parser (pre-built)
samples/              a public-domain sample book
build/icon.png        app icon
scripts/              screenshot, icon and vendor helpers
tests/                end-to-end test and the launcher it uses
```

## Contributing

Bug reports, ideas and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Folio aims to stay small, so please open an issue to talk about a feature before building it.

## Credits

- [epub.js](https://github.com/futurepress/epub.js) (BSD-2-Clause) and [JSZip](https://stuk.github.io/jszip/) (MIT) do the EPUB parsing.
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) reads PDFs, and [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT) reads Kindle books.
- Definitions come from [Wiktionary](https://www.wiktionary.org/), and summaries from [Wikipedia](https://www.wikipedia.org/) (CC BY-SA).
- The sample book, *Frankenstein* by Mary Wollstonecraft Shelley, comes from [Project Gutenberg](https://www.gutenberg.org/ebooks/84).
- The other titles in the screenshots are tiny demo files built by `scripts/screenshots.mjs` from public-domain opening lines.

## Licence

[MIT](LICENSE)
