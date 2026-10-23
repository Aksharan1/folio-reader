# Changelog

## Unreleased

### Added
- A natural read-aloud voice: Kokoro, run on your computer. It downloads once (about 175 MB, checked against published checksums) the first time you press Read aloud, or from Settings › Reading, with eight English voices and a Preview button. Speech starts in about two seconds and flows without gaps. Books in other languages use the system voices.

### Changed
- Page turns are a soft glide instead of a 3D swing, with no dropped frames.
- The welcome plays in about half the time and no longer stutters as it opens.
- Manga: the two pages of a spread meet at the fold, a pair shares one height, small scans scale up to fill the window, and narrow windows show one page at a time.
- Quick page turns are no longer lost: presses during a turn queue up, and catch up without animation.

### Fixed
- Text flashed at the bottom of the page on every page turn.
- Some converted books (Kindle, calibre) showed their text off-centre.

## 1.3.0

### Added
- A welcome on first launch: Folio's book opens, you pick the page theme you like and watch the app change to it, then add books, a folder or a free classic. It shows once, and Escape skips it.

### Changed
- New readers start in Sepia.
- The library's empty state and drop overlay mention comics.

## 1.2.2

### Changed
- A new sepia app icon: a parchment tile with a brown open book and a red ribbon.
- The screenshots show real public-domain comics, Little Nemo in Slumberland (1905) and the Hokusai Manga (1817).

## 1.2.1

### Changed
- One download per computer, with names that don't change between versions: Folio-Setup-Windows.exe, Folio-macOS.dmg, Folio-Linux.deb and Folio-Linux.AppImage.
- The Windows installer is one click: it installs Folio for you without questions, adds desktop and Start menu shortcuts, and opens it.
- One Mac download works on both Apple silicon and Intel, and its window shows where to drag Folio.
- Each release page starts with which file to download and what to do with it.

## 1.2.0

### Added
- Comics and manga: CBZ, CBR and CBT files open one picture per page, fitted to the window. Pages pair up in the two-page view like a printed book, with the cover and double-page spreads on their own.
- Right-to-left reading for manga, read from ComicInfo.xml when the file says so. Press D (or use Aa) to switch; ← then turns to the next page.
- Fit a comic page to the width to scroll down tall pages and webtoons.
- Comic contents show thumbnails of every page.
- Scanned PDFs, and PDF comics and manga, open as page pictures instead of failing.
- macOS (Apple silicon and Intel) and Linux (AppImage and .deb) builds.

## 1.1.0

### Added
- Read aloud (R) with the voices installed in Windows. It follows along, turning pages and moving through chapters.
- Look up a selected word: a definition from Wiktionary, or a Wikipedia summary for names and places.
- Footnotes open in a popup. Links inside books jump to their target, and web links open in the browser.
- Two pages side by side on wide windows.
- Add a whole folder of books (Ctrl+Shift+O, Settings → Library & Data, or drag a folder onto the window).
- Export highlights and notes as Markdown.
- Import Kindle highlights and notes from `My Clippings.txt`.
- Back up the whole library to a .zip and restore it.
- A portable build that keeps its library next to the .exe.
- The window's title bar takes the theme's colours, with Folio's own top bar in its place.
- An About row in Settings, with links to the project and to report a problem.

### Changed
- The brightness slider applies to the whole app, not just the page.
- Reader menus and panels follow the page theme.
- Each theme has its own accent colour, and Sepia is warmer.
- Folio is now a desktop app only; the browser version has been removed.

### Fixed
- Scripts inside a book can no longer run.
- An occasional error when importing several books at once.

## 1.0.0

- The first desktop release: a Windows app (installer) that reads EPUB, Kindle (MOBI, AZW, AZW3), PDF, FB2, DOCX, HTML, Markdown and text files.
