# money-lint

Code that handles money accumulates a specific set of bugs that regular
linters don't catch, because they aren't syntax errors: a price stored as a
`19.99` float literal that will eventually drift under repeated addition, a
`$100 EUR` that pairs a dollar sign with a euro code because someone copied a
template and forgot to update half of it. Both compile fine and both are
wrong. money-lint scans source files for these patterns and reports each one
with the exact line and column, plus a caret pointing at the offending text.

## Usage

There's no install step for the linter itself — no dependencies to fetch.
You do need a TypeScript compiler on your `PATH` (`npm install -g
typescript`, or `npx tsc` if you'd rather not install one globally).

```sh
tsc
node dist/cli.js pricing.ts
```

Given a file `pricing.ts`:

```ts
const total = 19.99;
const label = "$100 EUR";
```

`money-lint` reports:

```
pricing.ts:1:15 - warning - 'total' looks like a money amount stored as a floating-point literal (19.99). Floating-point arithmetic can silently lose precision (0.1 + 0.2 !== 0.3) — store the amount as an integer count of the smallest unit (e.g. cents) instead. [float-literal-money]
  const total = 19.99;
                ^^^^^

pricing.ts:2:16 - error - symbol '$' does not match currency code 'EUR' (expected USD, CAD, AUD, NZD, SGD, HKD, MXN, TWD) [symbol-code-mismatch]
  const label = "$100 EUR";
                 ^^^^^^^^

2 problems (1 error, 1 warning)
```

You can also point it at a directory; it walks it recursively and lints
every `.ts`, `.tsx`, `.js`, `.jsx`, and `.json` file it finds (skipping
`node_modules`, `dist`, and dotfiles). The process exits with status 1 if
any error-severity finding was reported, so it's usable as a CI gate.

## Rules

- **float-literal-money** (warning) — a `const`/`let`/`var` whose name looks
  like a money amount (`price`, `total`, `balance`, `fee`, ...) is
  initialized with a floating-point number literal. Money should be counted
  in integer minor units (cents), not floats.
- **symbol-code-mismatch** (error) — a currency symbol and an ISO 4217 code
  appear together on an amount, but the code isn't one the symbol could
  plausibly mean (e.g. `$` with `EUR`).

## How it's built

`src/linter.ts` holds the scanner and rules and is the part you'd import if
you were embedding this in something else; `src/cli.ts` is the thin file-
walking wrapper around it. There's no `@types/node` in this repo — `src/node.d.ts`
hand-declares the handful of `fs`/`path`/`process` signatures actually used,
so the project has zero dependencies, including for types.

## Roadmap

- detect ambiguous decimal/thousands separators (`1.234,56` vs `1,234.56`)
- add a JSON output mode for editor integration
- support a configurable currency symbol map
- add inline ignore comments (`money-lint-disable-line`)
- write a test harness using node's built-in test runner
