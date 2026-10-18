# Contributing

Thanks for helping. Blueprint Sketch is a small project and every kind of contribution counts: bug reports, new templates, translations, furniture models and code.

## Run it

```bash
git clone https://github.com/yotmanreyes/blueprint-sketch.git
cd blueprint-sketch
npm install
npm test
cd src && python3 -m http.server 8000   # the editor is static; open http://localhost:8000
```

Sharing plans needs the deployed API, so it only works on the published site.

## Ground rules

- **No build step.** The editor is plain scripts: no bundler, no framework. Libraries load from a CDN.
- **Code in English** (names, comments, commits). The interface text is in Spanish for now; adding English is a welcome contribution.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`…), one coherent change per commit. Commit messages feed the changelog, so write them for non-technical readers.
- **Comment sparingly:** only a non-obvious invariant, not what the code already says.
- Run `npm test` before opening a pull request. New behaviour needs a test where it can be tested without a browser.

## Good first contributions

- A new **template** in `src/templates.js` (see the existing ones; `test/templates.test.mjs` checks overlaps and validity).
- A new **piece of furniture** in `src/catalog.js` and its drawing in the editor, with its standard sizes.
- **Translations** of the interface.
- Anything labelled [`good first issue`](https://github.com/yotmanreyes/blueprint-sketch/labels/good%20first%20issue).

## Security

Never put an API key or token in a commit, an issue or a plan. To report a vulnerability, open a private security advisory on GitHub instead of a public issue.
