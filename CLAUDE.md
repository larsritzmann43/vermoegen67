# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start Vite dev server
- `npm run build` — Type-check with tsc then build for production
- `npm run lint` — ESLint (flat config, typescript-eslint + react-hooks)
- `npm run preview` — Preview production build locally
- `node security-test.mjs` — Run security checks (deps, code patterns, inputs, build, HTML headers)

## Architecture

Single-component React app (`src/App.tsx`) — no routing, no state management, no sub-components. Everything lives in one `App()` function.

**Inputs:** 2 range sliders (pension amount 300–3000€, start age 0–50) + 1 inflation checkbox.
**Output:** Calculated monthly contribution + Recharts AreaChart showing wealth accumulation to age 67.

### Financial Logic (inside `useMemo`)

1. Optionally inflation-adjust target pension (2% p.a. compounded to age 67)
2. PV of ordinary annuity: target wealth at 67 needed to fund monthly payouts until age 100 (3% p.a. decumulation rate)
3. FV of annuity due: solve for monthly contribution from current age to 67 (7.5% p.a. accumulation rate)
4. Month-by-month simulation generates chart data points and milestone snapshots (ages 18, 25, 40, 67)

### Stack

- React 19 + TypeScript (strict mode) + Vite 7
- Tailwind CSS 3 (brand color: `#8bbd2a`)
- Recharts for charting
- German locale throughout (`de-DE`, EUR formatting, German UI text)

## Language

The app UI and all user-facing text is in German. Code comments and variable names are in English.
