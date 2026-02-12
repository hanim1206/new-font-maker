# CLAUDE.md

This file provides guidance for AI assistants working on the Font Maker (한글 폰트 메이커) codebase.

## Project Overview

A web-based Korean Hangul font designer built with React + TypeScript. Users visually design custom Korean fonts by editing individual stroke components of Hangul consonants (choseong/초성), vowels (jungseong/중성), and final consonants (jongseong/종성), and by adjusting layout presets for 10 different Hangul syllable composition patterns. All coordinates use a normalized 0–1 coordinate system for resolution independence.

## Tech Stack

- **Framework:** React 19.1 (functional components, hooks only)
- **Language:** TypeScript 5.8 (strict mode)
- **Build:** Vite 5.0 (with `tsc -b` type-checking before bundling)
- **State:** Zustand 5.0 + Immer 11.1 (immutable updates via `set(state => { state.x = y })`)
- **Forms:** React Hook Form 7.61
- **Styling:** CSS Modules (`.module.css` files) + global CSS
- **PWA:** vite-plugin-pwa + Workbox 7.4 (offline-first, installable)
- **Linting:** ESLint 9 (flat config) with typescript-eslint, react-hooks, react-refresh plugins
- **No test framework** is currently configured

## Commands

```bash
npm run dev       # Start Vite dev server with HMR
npm run build     # TypeScript type-check + Vite production build
npm run lint      # ESLint validation
npm run preview   # Preview production build locally
```

## Project Structure

```
src/
├── components/               # React UI components
│   ├── ControlPanel/         # Left sidebar – layout type / jamo selection
│   ├── PreviewPanel/         # Top-right – text input & live font preview
│   ├── EditorPanel/          # Bottom-right – editor dispatcher
│   │   ├── EditorPanel.tsx   # Routes between layout and jamo editors
│   │   ├── LayoutEditor.tsx  # Split/Padding slider-based editing
│   │   ├── JamoEditor.tsx    # Stroke-level jamo editing
│   │   └── SplitEditor.tsx   # Reusable split/padding slider component
│   ├── CharacterEditor/      # Stroke editing sub-components
│   │   ├── CharacterPreview.tsx  # Large SVG preview of a jamo
│   │   ├── StrokeList.tsx        # Lists strokes for selection
│   │   ├── StrokeEditor.tsx      # Keyboard-driven stroke adjustments
│   │   └── StrokeInspector.tsx   # Numeric input fields for precision
│   └── BoxEditor/            # Legacy (replaced by SplitEditor, safe to remove)
├── stores/                   # Zustand state stores
│   ├── uiStore.ts            # UI state: view mode, selections (no persistence)
│   ├── layoutStore.ts        # Layout schemas (persisted to localStorage)
│   └── jamoStore.ts          # Jamo stroke data (persisted to localStorage)
├── data/                     # Static data
│   ├── Hangul.ts             # Jamo stroke maps: CHOSEONG_MAP, JUNGSEONG_MAP, JONGSEONG_MAP
│   ├── baseJamos.json        # 67 jamo characters with default stroke data
│   ├── basePresets.json      # 10 default layout schema definitions
│   └── layoutConfigs.ts      # Layout config helpers + DEFAULT_LAYOUT_CONFIGS
├── renderers/
│   └── SvgRenderer.tsx       # Core SVG rendering engine
├── utils/
│   ├── hangulUtils.ts        # decomposeSyllable(), classifyLayout(), classifyJungseong()
│   ├── layoutCalculator.ts   # calculateBoxes() – Split/Padding → BoxConfig
│   ├── pathUtils.ts          # Bezier curve utilities
│   └── storage.ts            # LocalStorage helpers
├── types/
│   └── index.ts              # All core TypeScript interfaces and types
├── App.tsx                   # Root component (responsive layout)
├── App.css                   # Main app styles
├── main.tsx                  # Entry point
└── index.css                 # Global styles
```

## Architecture & Data Flow

The rendering pipeline for a Hangul syllable:

1. **Decompose** – `decomposeSyllable("한")` → `{ choseong: 'ㅎ', jungseong: 'ㅏ', jongseong: 'ㄴ' }`
2. **Classify** – `classifyLayout(decomposed)` → `LayoutType` (one of 10 types)
3. **Schema lookup** – `layoutStore.getLayoutSchema(type)` → `LayoutSchema` (splits + padding)
4. **Calculate boxes** – `calculateBoxes(schema)` → `Partial<Record<Part, BoxConfig>>` (0–1 coords)
5. **Stroke lookup** – `CHOSEONG_MAP['ㅎ'].strokes` → stroke array
6. **Render** – `SvgRenderer` scales strokes into calculated boxes → SVG output

### State Management

Three Zustand stores with the pattern:

```typescript
export const useStore = create<State & Actions>()(
  persist(           // optional – layoutStore and jamoStore use this
    immer((set, get) => ({
      // state fields
      key: value,
      // actions mutate drafts directly
      setKey: (val) => set((state) => { state.key = val }),
    })),
    { name: 'storage-key', partialize: (state) => ({ /* persisted subset */ }) }
  )
)
```

| Store | Persisted | Purpose |
|-------|-----------|---------|
| `uiStore` | No | View mode, selections, editing context |
| `layoutStore` | Yes (`font-maker-layout-schemas`) | Layout schemas for 10 layout types |
| `jamoStore` | Yes (`font-maker-jamo-data`) | Stroke data for all 67 jamo characters |

### Layout Types (10)

| Type | Parts | Example |
|------|-------|---------|
| `choseong-only` | CH | ㄱ, ㄴ |
| `jungseong-vertical-only` | JU | ㅏ, ㅓ |
| `jungseong-horizontal-only` | JU | ㅗ, ㅜ |
| `jungseong-mixed-only` | JU_H + JU_V | ㅘ, ㅢ |
| `choseong-jungseong-vertical` | CH + JU | 가, 너 |
| `choseong-jungseong-horizontal` | CH + JU | 고, 누 |
| `choseong-jungseong-mixed` | CH + JU_H + JU_V | 과, 의 |
| `choseong-jungseong-vertical-jongseong` | CH + JU + JO | 강, 넌 |
| `choseong-jungseong-horizontal-jongseong` | CH + JU + JO | 공, 눈 |
| `choseong-jungseong-mixed-jongseong` | CH + JU_H + JU_V + JO | 광, 권 |

Parts: `CH` = choseong, `JU` = jungseong, `JU_H` = horizontal jungseong, `JU_V` = vertical jungseong, `JO` = jongseong.

## Key Conventions

### TypeScript

- **Strict mode** is enabled: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- Target: ES2022, module: ESNext (bundler resolution)
- All types are defined in `src/types/index.ts`
- Use discriminated unions for stroke types: `RectStrokeData` (`direction: 'horizontal' | 'vertical'`) vs `PathStrokeData` (`direction: 'path'`)
- Use the type guard `isPathStroke(stroke)` when narrowing `StrokeData`

### Components

- Functional components only (no class components)
- CSS Modules for component-scoped styles
- Responsive design: desktop (>768px) vs mobile (<=768px) with conditional rendering
- Event handler prefix: `handle*`
- State setter prefix: `set*`

### Naming

- **Code identifiers** are in English
- **UI labels, comments, and documentation** are in Korean
- Store files: `*Store.ts` exporting `use*Store`
- Utility files: `*Utils.ts`
- Lookup objects: `*_MAP` (e.g., `CHOSEONG_MAP`)

### Coordinate System

- All positions and sizes use **normalized 0–1 coordinates**
- `BoxConfig`: `{ x, y, width, height }` each in range 0–1
- `StrokeData`: `{ x, y, width, height }` in 0–1 within its parent box
- This makes designs resolution-independent and scalable

### Commit Messages

Follow **Conventional Commits** as defined in `COMMIT_CONVENTION.md`:

```
<type>(<scope>): <subject in Korean>
```

- Type and scope in English, subject and body in Korean
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`
- Subject in imperative form (e.g., ~추가, ~수정, ~삭제)
- No period at end of subject
- Do NOT include AI watermarks or co-author attributions in commits

### What to Preserve

These architectural decisions are intentional and should be maintained:

- **Split + Padding layout system** (not raw x/y/width/height)
- **Normalized 0–1 coordinate space** throughout
- **Zustand + Immer** pattern for state (draft mutations in `set()`)
- **Separation of schema vs. computed boxes** (`layoutSchemas` are persisted; `layoutConfigs` are derived)
- **Keyboard-first stroke editing** with arrow keys and shift modifiers
- **Type-safe store pattern** with separate State and Actions interfaces

## Existing Documentation

- `PROJECT_OVERVIEW.md` – Comprehensive project analysis (architecture, data flow, implementation status, roadmap) written in Korean
- `COMMIT_CONVENTION.md` – Commit message guidelines

## Common Tasks

### Adding a new stroke type
1. Add the type to the `StrokeData` discriminated union in `src/types/index.ts`
2. Add a type guard function
3. Update `SvgRenderer.tsx` to handle the new stroke rendering
4. Update `CharacterEditor/` components for editing support

### Modifying layout calculation
1. Edit `src/utils/layoutCalculator.ts` (`calculateBoxes()`)
2. The layout store automatically syncs `layoutConfigs` from `layoutSchemas` via `syncConfigFromSchema()`

### Adding a new layout type
1. Add the literal to the `LayoutType` union in `src/types/index.ts`
2. Add classification logic in `src/utils/hangulUtils.ts`
3. Add default schema in `src/data/basePresets.json`
4. Add calculation logic in `src/utils/layoutCalculator.ts`

### Working with stores
- Read state: `const value = useStore((s) => s.field)`
- Mutate state: actions use Immer drafts — mutate the draft directly, don't return new objects
- Layout store persists `layoutSchemas` only; `layoutConfigs` are recomputed on hydration

## Pitfalls

- `BoxEditor/` is legacy code (superseded by `SplitEditor`). Do not extend it.
- The rule system (`Rule`, `Condition`, `Action` types) is defined in types but has no UI — the types exist for future use.
- No test framework is installed. If adding tests, Vitest is the recommended choice (already compatible with Vite).
- `.gitignore` is minimal (only `node_modules`). Be mindful not to commit `dist/`, `.env`, or IDE config files.
- Mixed jungseong (혼합중성 like ㅘ, ㅢ) use separate `horizontalStrokes` and `verticalStrokes` arrays instead of the normal `strokes` array.
