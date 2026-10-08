# @satoshibits/eslint-config

The lint configuration for satoshibits projects, in two forms: an ESLint flat config, and a
rule set for [oxlint](https://oxc.rs/docs/guide/usage/linter.html) derived from it.

## ESLint

```js
// eslint.config.mjs
import config from "@satoshibits/eslint-config";

export default [...config];
```

`import { fast } from "@satoshibits/eslint-config"` is the same preset without type
information, for an edit loop or a commit hook.

## oxlint

`@satoshibits/eslint-config/oxlint` is an oxlint configuration file for oxlint's type-aware
mode. It is the rule set Websand's two apps share: the ESLint preset's rules translated to
oxlint, with two choices the ESLint preset does not make:

- `no-unused-vars` ignores names that start with `_` and rest siblings;
- `typescript/consistent-type-imports` is on, with separate `import type` statements.

Install `oxlint` and `oxlint-tsgolint` (optional peers of this package), then extend the
file by path and repeat the two settings that make it mean what it says:

```json
{
  "extends": ["./node_modules/@satoshibits/eslint-config/oxlint.json"],
  "categories": { "correctness": "off" },
  "options": { "typeAware": true },
  "rules": {
    "no-restricted-imports": ["error", { "paths": ["some-barrel"] }]
  }
}
```

```sh
oxlint
```

### What a consumer gets

Measured on oxlint 1.87 with a consumer that has only the `extends` line: the rules, the
`typescript` and `import` plugins, `options.typeAware: true` (no `--type-aware` flag is
needed), `categories.correctness: "off"` (so only the listed rules run), and one override
for TypeScript files that switches off the 17 core rules the compiler already enforces and
adds `no-var`, `prefer-const`, `prefer-rest-params` and `prefer-spread`.

oxlint documents `extends` as carrying `rules`, `plugins` and `overrides`. That `categories`
and `options` came through as well is what 1.87 does, not what it promises. Repeat both in
your own file, as above. Today that changes nothing. If a later oxlint stops carrying them,
a consumer without `categories.correctness: "off"` would get oxlint's whole `correctness`
category on top of the preset, and one without `options.typeAware` would lose the 31 rules
that need type information, with no error to say so.

### Changing a rule

- A rule in your own `rules` replaces the preset's, for the rules the preset sets at its
  root (measured: `"typescript/no-floating-promises": "off"` silences it).
- The 21 rules of the TypeScript override are different: your root `rules` do not reach
  them (measured: a root `"no-var": "off"` leaves `no-var` firing in a `.ts` file). Change
  one with an override of your own, for the files you mean. The preset's override covers
  `**/*.ts`, `**/*.tsx`, `**/*.mts` and `**/*.cts`; to switch a rule off for all of them:
  `{ "files": ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"], "rules": { "no-var": "off" } }`.
- **Write a rule under oxlint's own name.** oxlint reads several other spellings as the
  same rule: `@typescript-eslint/no-floating-promises: off`, or the bare
  `no-floating-promises: off`, switches `typescript/no-floating-promises` off, and
  `typescript/no-unused-vars: off` switches the core `no-unused-vars` off. `oxlint --rules`
  prints the names.

### Things to know

- **JavaScript files need an environment.** The preset turns `no-undef` on and enables only
  the language's own globals, as the ESLint preset does. TypeScript files are exempt (the
  compiler checks names). For `.js` files add `"env": { "builtin": true, "node": true }`,
  or `"browser": true`, or `console` and `process` are reported.
- **Two ESLint rules have no counterpart in oxlint and are dropped**: `no-octal` and
  `no-dupe-args`. Both are compile errors in TypeScript; JavaScript files lose them.
- **Two rules are warnings**, as in the ESLint preset: `import/no-duplicates` and
  `import/no-named-as-default`. A warning does not fail `oxlint`.
- **Unused disable directives** are not reported by default. Add
  `--report-unused-disable-directives-severity=error` to fail on one; the plain
  `--report-unused-disable-directives` only warns.
- **No React, accessibility or Storybook rules.** Add them in the consuming project, in an
  override for its React files.
- **The ESLint packages are still required peers of this package.** A project that only
  wants the oxlint file will have them installed, or be warned about them, by its package
  manager. Nothing loads them.
- **`extends` takes a file path, not a package name** (measured: oxlint 1.87 looks for
  `@satoshibits/eslint-config/oxlint.json` as a relative file and fails). Under pnpm the
  path exists only in the package that declares the dependency; in a monorepo, extend it
  from that package's own configuration.
- **The oxlint export is in the npm package only**, not in the JSR one.

## Tests

`pnpm test` does two things, and runs before every publish (it needs Node 20.19 or later,
which is oxlint's own floor).

- It pins the file: its shape, its exact content by digest, and the package manifest.
- It runs oxlint (a devDependency, at the floor of the peer range) on `test-oxlint/`, a
  tiny project with seeded violations, through a consumer configuration that extends the
  file. That checks that every rule name is in oxlint's table; that a consumer with only
  the `extends` line gets a typed rule and runs exactly the preset's rules (a violation of
  a rule from the `correctness` category is seeded, and reported only when a consumer
  switches the category on); each statement under "Changing a rule"; that `extends` does
  not take a package name; and what is said about JavaScript files.

It does not seed a violation for every rule. That was done in a consuming repository, one
per type-aware rule. The peer ranges are open-ended; a later oxlint is checked here when
the devDependency is bumped.
