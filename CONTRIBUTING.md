# Contributing to Reword

Thanks for your interest in making communication kinder. Here's how to get started.

## [ ] Prerequisites

- Node.js 18+
- A Chromium browser (Chrome, Edge, Brave, Arc)
- A [Gemini API key](https://aistudio.google.com/apikey) (free)

## [ ] Setup

```bash
git clone https://github.com/IvanWeiZ/reword.git
cd reword
npm install
npm run build
```

Load the extension: `chrome://extensions/` > Developer mode > Load unpacked > select `dist/`.

## [ ] Development workflow

```bash
# Terminal 1: rebuild on save
npm run dev

# Terminal 2: tests in watch mode
npm run test:watch
```

After changes, refresh the extension at `chrome://extensions/`.

## [ ] Before submitting a PR

```bash
npm test          # All tests pass
npm run lint      # No lint errors
npm run build     # Build succeeds
```

## [ ] Commit messages

Use [conventional commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `test:` adding or updating tests
- `refactor:` code change that neither fixes nor adds
- `docs:` documentation only

## [ ] Code style

- TypeScript strict mode
- ESM modules (`import`/`export`)
- camelCase for functions/variables, PascalCase for types/classes
- CSS classes prefixed with `reword-`
- Run `npm run format` to auto-format

## [ ] Adding a new platform

1. Create adapter in `src/adapters/` implementing `PlatformAdapter`
2. Register hostname in `src/content/index.ts`
3. Add host permission + content script match in `manifest.json`
4. Add DOM fixture in `tests/mocks/mock-dom-fixtures/`
5. Write adapter tests

See existing adapters (`gmail.ts`, `linkedin.ts`) for examples.

## [ ] Tests

Tests use [Vitest](https://vitest.dev/) with jsdom. Place tests in `tests/` mirroring the `src/` structure. Use existing mocks in `tests/mocks/`.

## [ ] Questions?

Open an issue or start a discussion. We're happy to help.
