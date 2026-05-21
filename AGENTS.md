# Repository Guidelines

## Project Structure & Module Organization

Quicknote is a Tauri desktop app with a React/Vite frontend and a Rust backend. Frontend code lives in `src/`: shared UI components are in `src/components`, React hooks in `src/hooks`, Zustand stores in `src/store`, reusable helpers in `src/lib`, and TypeScript types in `src/types`. Frontend tests sit beside the code as `*.test.ts` or `*.test.tsx`.

Rust application code lives in `src-tauri/src`, with modules for commands, database access, shortcuts, tray behavior, and window handling. Tauri configuration is in `src-tauri/tauri.conf.json`, capabilities are in `src-tauri/capabilities`, and desktop icons are in `src-tauri/icons`. Build output such as `dist/` should not be edited by hand.

## Build, Test, and Development Commands

- `npm install`: install frontend and Tauri CLI dependencies.
- `npm run dev`: run the Vite frontend only.
- `npm run tauri dev`: run the full desktop app in development.
- `npm run build`: type-check TypeScript and build the frontend bundle.
- `npm test`: run Vitest once.
- `npm run test:watch`: run Vitest in watch mode.
- `cargo test --manifest-path src-tauri/Cargo.toml`: run Rust tests.
- `npm run check`: run the main frontend build, frontend tests, and Rust tests.

## Coding Style & Naming Conventions

Use TypeScript, React function components, and hooks. Name components in `PascalCase` (`OverlayEditor.tsx`), hooks with a `use` prefix (`useAutosaveNote.ts`), stores as focused modules (`noteStore.ts`), and shared types by domain (`note.ts`). Keep frontend logic close to its owning component, hook, or store before adding new abstractions.

Follow the existing Rust module style: small modules in `src-tauri/src`, snake_case file names, and explicit error handling. Run `npm run build` before submitting TypeScript changes; use `cargo fmt --manifest-path src-tauri/Cargo.toml` for Rust formatting when Rust files change.

# Styling UI

We have very limited real estate. This desktop app will not occupy entire area of laptop. Probably only 1/5th So be space consicous save space wherever possible

Use on mouseDown everywhere

## Testing Guidelines

Frontend tests use Vitest with Testing Library and colocated test files. Add or update tests for store behavior, hooks, and user-visible state changes. Prefer names that describe behavior, such as `useAutosaveNote.test.tsx` or `theme.test.ts`.

For backend changes, add Rust unit tests near the module they cover when practical, and always run `cargo test --manifest-path src-tauri/Cargo.toml`.

## Commit & Pull Request Guidelines

The current history uses short phase labels and one conventional-style message (`feat: ...`). Prefer concise imperative commit messages, and use a conventional prefix when useful, for example `feat: add pinned note filter` or `fix: handle empty note save`.

Pull requests should include a brief summary, test results (`npm run check` when possible), linked issues if any, and screenshots or screen recordings for visible UI changes. Note platform-specific behavior for tray, shortcuts, or packaging changes.

## Security & Configuration Tips

Do not commit local database files, secrets, or generated build artifacts. Keep Tauri permissions scoped in `src-tauri/capabilities/default.json`, and review capability changes carefully because they affect desktop app privileges.
