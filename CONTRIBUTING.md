# Contributing to Folio

Thanks for helping. Folio is meant to stay a small, fast reader, so the most useful contributions are fixes, polish, and support for books that don't open or look right.

## Reporting a problem

[Open an issue](https://github.com/Aksharan1/folio-reader/issues/new/choose) and include:

- your Folio version (Settings → Library & Data → About Folio) and your operating system and its version
- what you did, what you expected, and what happened instead
- for a book that won't open or looks wrong, its format and where it came from. Please don't attach books you don't have the rights to share. A public-domain book that shows the same problem is ideal.

## Suggesting a feature

Open an issue before you write code, so we can agree it fits. Features that most readers will use regularly are the best fit; anything that needs a server or an account is out of scope.

## Working on the code

You need Node.js 22.13 or newer, on Windows, macOS or Linux.

```bash
npm install
npm start      # run the app from source
npm test       # end-to-end test (opens the app window for a couple of minutes)
```

Folio is plain HTML, CSS and JavaScript with no framework or build step. The README's **How it works** section maps out the files.

Some conventions:

- Match the surrounding code: 2-space indentation, single quotes, semicolons, small functions, and comments that explain *why*.
- Don't add runtime dependencies without discussing it first. Third-party code lives pre-built in `vendor/`, copied there by `npm run vendor`.
- Nothing should reach the internet unless the user asks for it (as Look up does). Books must not be able to run scripts.
- Add or update a check in `tests/smoke.mjs` for behaviour you change, and make sure `npm test` passes.
- If your change alters how the app looks, run `npm run screenshots` and include the updated images.

## Pull requests

Keep each pull request to one change. Describe what it does and how you tested it, and include before-and-after screenshots for visual changes. CI runs `npm test` on Windows, macOS and Linux for every pull request.

By contributing, you agree that your work is released under the [MIT licence](LICENSE).
