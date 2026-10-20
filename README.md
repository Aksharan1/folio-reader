# Folio

**A fast, private e-book reader for Windows.**
No accounts, no uploads. Your books, progress and highlights stay on your device.

![Folio library](docs/screenshots/library.png)

## Features

- **Reads most e-book formats**: EPUB, Kindle (MOBI, AZW, AZW3), PDF, FB2, Word (DOCX), HTML, Markdown and plain text. See [Supported formats](#supported-formats).
- **Library**: grid and list layouts, filters (reading, unread, finished), sorting, instant search, favourites, and a browsable author index. Books without cover art get a generated cover. Add books one at a time or a whole folder (subfolders included).
- **Distraction-free reader**: paginated pages that break between lines, so no line appears twice. Two pages side by side when the window is wide, like an open book (can be switched off). A page-turn animation, click or keyboard navigation, and a progress scrubber.
- **Appearance**: five themes (Paper, Sepia, Dusk, Midnight, Black), brightness, 11 fonts, text size, line spacing, margins and alignment, with a live preview.
- **Highlights & notes**: select text to highlight it in one of five colours, attach notes, and copy passages. Everything is collected per book and across your library, and can be exported as Markdown.
- **Kindle highlights**: import your Kindle's `My Clippings.txt` to bring its highlights and notes over to the same books in Folio.
- **Bookmarks**: one keypress saves the page you're on.
- **Full-text search**: finds every match in the book with context, and takes you to the exact occurrence.
- **Reading Now**: pick up where you left off, with time spent and an estimate of the time left.
- **Works offline**: your library is stored on your computer. Nothing is uploaded.

<table>
  <tr>
    <td><img src="docs/screenshots/reader.png" alt="Reader"></td>
    <td><img src="docs/screenshots/appearance.png" alt="Appearance settings"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/search.png" alt="Search in book"></td>
    <td><img src="docs/screenshots/reading-now.png" alt="Reading Now"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/annotations.png" alt="Annotations"></td>
    <td><img src="docs/screenshots/settings.png" alt="Settings"></td>
  </tr>
</table>

## Install

Folio is a Windows desktop app built with [Electron](https://www.electronjs.org/). Build the installer from source with Node.js 18+:

```bash
git clone https://github.com/Aksharan1/folio-reader.git
cd folio-reader
npm install
npm start            # run the app from source
npm run dist         # build the installer: dist/Folio-Setup-<version>.exe
```

The installer adds Folio to the Start menu, and registers it for EPUB, Kindle and FB2 files, so double-clicking a book (or **Open with → Folio**) opens it straight into the reader. **Ctrl O** adds books, **Ctrl Shift O** adds a folder, **F11** toggles full screen, and **Alt** shows the menu bar. Window size and position are remembered between launches. Your library is stored in `%APPDATA%\Folio`.

`npm run dist` also builds `dist/Folio-Portable-<version>.exe`, which runs without installing and keeps its library in a `Folio Data` folder next to the .exe, so you can carry it on a USB stick. It starts a little slower than the installed app because it unpacks itself on each launch.

The installer isn't code-signed, so Windows SmartScreen may warn the first time you run it: choose **More info → Run anyway**.

Add books with **Add Books**, or drag them onto the window.

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
| `→` `Space` `PgDn` | Next page | `/` or `Ctrl F` | Search library |
| `←` `PgUp` | Previous page | `Esc` | Clear search |
| `Home` / `End` | Beginning / end of book | | |
| `T` | Contents | | |
| `F` or `Ctrl F` | Search in book | | |
| `A` | Annotations | | |
| `S` | Appearance | | |
| `B` | Toggle bookmark | | |
| `H` | Highlight selected text | | |
| `I` | Book details | | |
| `+` / `-` | Text size | | |
| `Esc` | Close panel | | |

## Project structure

```
index.html            entry point
app.css               design tokens, layout and components
js/
  dom.js              tiny DOM helper, icon set, generated covers, formatters
  convert.js          converts MOBI/AZW3, PDF, FB2, DOCX, HTML, Markdown and text to EPUB
  reader.js           rendering engine: themes, pagination, search, annotations
  library.js          IndexedDB storage, preferences, library queries
  clippings.js        imports Kindle highlights from My Clippings.txt
  app.js              UI: library views, reader chrome, panels, keyboard
electron/
  main.js             desktop shell: window, menu, app:// protocol, .epub file opening
  preload.js          bridge exposing file-open events to the app
build/icon.png        app icon (npm run icon regenerates it from the favicon)
vendor/               epub.js, JSZip, pdf.js and foliate-js's MOBI parser (pre-built)
samples/              a public-domain sample book
scripts/screenshots.mjs  regenerates the README screenshots
tests/smoke.mjs       end-to-end test that drives the app
tests/launch.mjs      starts the app with a throwaway profile for tests and screenshots
```

### How the reader works

Each spine section of the EPUB is rendered by [epub.js](https://github.com/futurepress/epub.js) to HTML and loaded into a sandboxed `<iframe>`, with the theme injected as CSS. Once the section's layout is final, the iframe measures every line box and cuts pages between lines. Turning a page scrolls to the next cut. A strip under the last full line is masked, so a partially visible line is never shown. Progress is measured in characters across the whole book. Highlights are re-applied by matching their text each time a section renders.

## Development

```bash
npm install            # Electron, Puppeteer, and the sources for vendor/
npm test               # end-to-end smoke test (opens the app window while it runs)
npm run screenshots    # rebuild docs/screenshots
npm run vendor         # refresh vendor/ from node_modules
```

Set `SHOTS=some/folder` when running `npm test` to save a screenshot of every step.

## Credits

- [epub.js](https://github.com/futurepress/epub.js) (BSD-2-Clause) and [JSZip](https://stuk.github.io/jszip/) (MIT) do the EPUB parsing.
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) reads PDFs, and [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT) reads Kindle books.
- The sample book, *Frankenstein* by Mary Wollstonecraft Shelley, comes from [Project Gutenberg](https://www.gutenberg.org/ebooks/84).
- The other titles in the README screenshots are tiny demo files built by `scripts/screenshots.mjs` from public-domain opening lines.

## License

[MIT](LICENSE)
