# Security

If you find a security problem in Folio, for example a book that can run code, read files, or reach the internet, please report it privately. Use [GitHub's private vulnerability reporting](https://github.com/Aksharan1/folio-reader/security/advisories/new) rather than opening a public issue.

Include the Folio version, and steps or a sample file that shows the problem.

## How Folio protects you

- Books are shown in sandboxed frames. Each frame's Content-Security-Policy only lets Folio's own script run, so scripts in a book are blocked.
- The app's own Content-Security-Policy keeps books from loading anything from the internet. The only network requests are the Wiktionary and Wikipedia look-ups you ask for.
- The desktop shell uses context isolation and a sandboxed renderer. It only serves files from the app's own folder, and it doesn't let the window navigate away.
