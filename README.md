# @satoshibits/eslint-config

The lint configuration for satoshibits projects, in two forms: an ESLint flat config and the
same rule set for [oxlint](https://oxc.rs/docs/guide/usage/linter.html).

## ESLint

```js
// eslint.config.mjs
import config from "@satoshibits/eslint-config";

export default [...config];
```

`import { fast } from "@satoshibits/eslint-config"` is the same preset without type
information, for an edit loop or a commit hook.

## oxlint

`@satoshibits/eslint-config/oxlint` is an oxlint configuration file with the rules the
ESLint preset enforces, for oxlint's type-aware mode. Install `oxlint` and `oxlint-tsgolint`
(optional peers of this package), then extend it by path:

```json
{
  "extends": ["./node_modules/@satoshibits/eslint-config/oxlint.json"],
  "rules": {
    "no-restricted-imports": ["error", { "paths": ["some-barrel"] }]
  }
}
```

```sh
oxlint
```

What a consumer inherits (checked on oxlint 1.87): the rules, the three plugins
(`typescript`, `import`, `unicorn`), `options.typeAware: true` (no `--type-aware` flag is
needed), every rule category switched off (so only the listed rules run), and one override
for TypeScript files that switches off the 17 core rules the compiler already enforces and
adds `no-var`, `prefer-const`, `prefer-rest-params` and `prefer-spread`. A
consumer's own `rules` win over the preset's.

Things to know:

- **Write a rule under oxlint's own name.** oxlint reads several other spellings as the
  same rule: `@typescript-eslint/no-floating-promises: off`, or the bare
  `no-floating-promises: off`, switches `typescript/no-floating-promises` off, and
  `typescript/no-unused-vars: off` switches the core `no-unused-vars` off. `oxlint --rules`
  prints the names.
- **Three ESLint rules have no counterpart and are dropped**: `no-octal` (a TypeScript
  error), and for React projects `react/jsx-uses-vars` and `react/prop-types`.
- **Two rules are warnings**, as in the ESLint preset: `import/no-duplicates` and
  `import/no-named-as-default`. A warning does not fail `oxlint`.
- **Unused disable directives** are not reported by default. Add
  `--report-unused-disable-directives-severity=error` to fail on one; the plain
  `--report-unused-disable-directives` only warns.
- **React, accessibility and Storybook rules are not in the preset.** Add them in the
  consuming project, in an override for its React files.

`pnpm test` checks the file's shape. It does not run oxlint; the rule set was validated in a
consuming repository against seeded violations, one per type-aware rule.
