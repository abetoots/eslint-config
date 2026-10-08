// node --test: oxlint.json, in two parts.
//
// The shape and the content: properties a reader would assume, and a digest that makes
// every change to the file a deliberate one.
//
// oxlint itself, run on test-oxlint/ (a tiny project with seeded violations) through a
// consumer configuration that extends the file: every rule name exists, `extends` carries
// what the README says it carries, and the README's statements about changing a rule
// hold. That is on the oxlint version installed here, the floor of the peer range; a later
// oxlint is checked when this devDependency is bumped. It is not one seeded violation per
// rule: that was done in a consuming repository, for the type-aware rules.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const config = read("./oxlint.json");
const pkg = read("./package.json");
const severity = (entry) => (Array.isArray(entry) ? entry[0] : entry);
const baseName = (key) => key.slice(key.lastIndexOf("/") + 1);
const sources = [config, ...config.overrides];

/** JSON with object keys sorted, so the digest is of the content and not of its order. */
const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );

// the compiler reports these itself (typescript-eslint's "eslint-recommended" list)
const TYPESCRIPT_COVERS = [
  "constructor-super",
  "getter-return",
  "no-class-assign",
  "no-const-assign",
  "no-dupe-class-members",
  "no-dupe-keys",
  "no-func-assign",
  "no-import-assign",
  "no-new-native-nonconstructor",
  "no-obj-calls",
  "no-redeclare",
  "no-setter-return",
  "no-this-before-super",
  "no-undef",
  "no-unreachable",
  "no-unsafe-negation",
  "no-with",
];

test("the content is what was validated: any change to oxlint.json is a deliberate one", () => {
  // Changing a rule, an option or a glob changes this digest. Re-validate the file with
  // oxlint in a consuming project (the README says how it was done), then update it:
  // run `pnpm test` and copy the actual value from the failure.
  assert.equal(
    createHash("sha256").update(canonical(config)).digest("hex"),
    "e600e0db64266a2e3a60c2d36ec60475c17a4b0026804c92fe6e68a1d6fefc9d",
  );
  assert.equal(Object.keys(config.rules).length, 125);
});

test("only the listed rules run, with type information", () => {
  // oxlint enables its `correctness` category unless told otherwise, and a category's
  // rules appear in no `rules` object
  assert.deepEqual(config.categories, { correctness: "off" });
  assert.deepEqual(config.options, { typeAware: true });
  assert.deepEqual([...config.plugins].sort(), ["import", "typescript"]);
  // the language's own globals and nothing else: a consumer adds node or browser
  assert.deepEqual(config.env, { builtin: true });
  // nothing a consumer could not see by reading `rules`: no extends, settings or ignores
  assert.deepEqual(Object.keys(config).sort(), [
    "categories",
    "env",
    "options",
    "overrides",
    "plugins",
    "rules",
  ]);
});

test("every root rule is on, and is an error unless it is one of the two warnings", () => {
  const bySeverity = (level) =>
    Object.entries(config.rules)
      .filter(([, entry]) => severity(entry) === level)
      .map(([key]) => key)
      .sort();
  assert.deepEqual(bySeverity("warn"), ["import/no-duplicates", "import/no-named-as-default"]);
  assert.equal(bySeverity("error").length, 123);
  // "off" at the root would be a rule listed and not enforced
  assert.deepEqual(bySeverity("off"), []);
  for (const source of sources)
    for (const [key, entry] of Object.entries(source.rules))
      assert.ok(
        ["error", "warn", "off"].includes(severity(entry)),
        `${key}: ${JSON.stringify(entry)}`,
      );
});

test("each rule has one spelling: a loaded plugin's prefix, and no second key for the same name", () => {
  for (const source of sources) {
    const names = new Map();
    for (const key of Object.keys(source.rules)) {
      const scope = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "";
      // ESLint's spellings (@typescript-eslint/…, import-x/…) name no plugin loaded here
      assert.ok(scope === "" || config.plugins.includes(scope), `${key}: unknown prefix`);
      // oxlint reads `typescript/no-unused-vars` as the core rule and a bare
      // `no-floating-promises` as the typed one. A core rule and a typed rule that really
      // share a name (require-await) would both be valid keys; the preset has no such
      // pair, so one base name per object is the invariant.
      assert.equal(
        names.get(baseName(key)),
        undefined,
        `${key} and ${names.get(baseName(key))} are two keys for one rule name`,
      );
      names.set(baseName(key), key);
    }
  }
  // the override may repeat a root rule's name only under the very same key
  const rootKeyByName = new Map(Object.keys(config.rules).map((key) => [baseName(key), key]));
  for (const key of Object.keys(config.overrides[0].rules)) {
    const rootKey = rootKeyByName.get(baseName(key));
    assert.ok(rootKey === undefined || rootKey === key, `${key} respells the root's ${rootKey}`);
  }
});

test("the typed rules that matter most are errors", () => {
  for (const name of [
    "no-floating-promises",
    "no-misused-promises",
    "no-unsafe-assignment",
    "no-unsafe-argument",
    "await-thenable",
  ]) {
    assert.equal(severity(config.rules[`typescript/${name}`]), "error", name);
  }
});

test("the two rules with options keep them, and nothing project-specific is in the preset", () => {
  assert.deepEqual(config.rules["no-unused-vars"], [
    "error",
    {
      argsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      ignoreRestSiblings: true,
      varsIgnorePattern: "^_",
    },
  ]);
  assert.deepEqual(config.rules["typescript/consistent-type-imports"], [
    "error",
    { fixStyle: "separate-type-imports" },
  ]);
  // each project bans its own imports
  assert.equal(config.rules["no-restricted-imports"], undefined);
});

test("the one override is for TypeScript files: it drops what the compiler reports and adds four rules", () => {
  assert.equal(config.overrides.length, 1);
  const [override] = config.overrides;
  assert.deepEqual(Object.keys(override).sort(), ["files", "rules"]);
  assert.deepEqual(override.files, ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"]);
  const keysAt = (level) =>
    Object.entries(override.rules)
      .filter(([, entry]) => severity(entry) === level)
      .map(([key]) => key)
      .sort();
  assert.deepEqual(keysAt("off"), TYPESCRIPT_COVERS);
  // each is on at the root, so JavaScript files keep it
  for (const key of TYPESCRIPT_COVERS)
    assert.equal(severity(config.rules[key]), "error", `${key} is on at the root`);
  assert.deepEqual(keysAt("error"), ["no-var", "prefer-const", "prefer-rest-params", "prefer-spread"]);
  assert.deepEqual(keysAt("warn"), []);
});

test("no rule key is written twice in the file itself", () => {
  // JSON.parse keeps the last of two equal keys, so the parsed object, and with it the
  // digest and every test above, cannot see a duplicate rule. What oxlint does with one is
  // not measured; the file must not have one. (Rule keys only: a repeated key elsewhere
  // in the file is not looked for.)
  const text = readFileSync(new URL("./oxlint.json", import.meta.url), "utf8");
  const blocks = text.split(/"rules":\s*\{/).slice(1);
  assert.equal(blocks.length, sources.length, "one rules block per source");
  for (const block of blocks) {
    // a rule key sits at the block's own depth. Whole strings are matched first, so a
    // brace or bracket inside one (a regex in a rule's options) is not read as structure;
    // a string is a key when a colon follows it
    const seen = new Set();
    let depth = 0;
    for (const match of block.matchAll(/("(?:[^"\\]|\\.)*")(\s*:)?|[{}\[\]]/g)) {
      const token = match[0];
      if (match[1] !== undefined) {
        if (match[2] === undefined || depth !== 0) continue;
        // compared as JSON reads them, so an escaped spelling of a key is the same key
        const key = JSON.parse(match[1]);
        assert.ok(!seen.has(key), `"${key}" is written twice in one rules block`);
        seen.add(key);
      } else if (token === "{" || token === "[") depth += 1;
      else if (depth === 0) break; // the end of this rules block
      else depth -= 1;
    }
    assert.ok(seen.size > 0);
  }
});

test("the package ships the file, resolves it under both names, and keeps its manifest straight", () => {
  assert.deepEqual(pkg.files, ["./dist/**/*", "./oxlint.json"]);
  assert.deepEqual(pkg.exports, {
    ".": {
      types: "./dist/index.d.mts",
      import: "./dist/index.mjs",
      default: "./dist/index.mjs",
    },
    "./oxlint": "./oxlint.json",
    "./oxlint.json": "./oxlint.json",
  });
  assert.equal(pkg.type, "module");
  assert.equal(pkg.private, false);
  // the package resolving itself: no install needed, and a wrong target fails here
  const require = createRequire(import.meta.url);
  for (const specifier of ["@satoshibits/eslint-config/oxlint", "@satoshibits/eslint-config/oxlint.json"])
    assert.equal(require.resolve(specifier), fileURLToPath(new URL("./oxlint.json", import.meta.url)));
  // oxlint is an optional peer (an ESLint-only project need not install it); the ESLint
  // packages stay required peers, as they were; nothing is a hard dependency
  assert.deepEqual(pkg.peerDependencies, {
    "@eslint/js": "^9.13.0",
    eslint: ">= 9.13.0",
    "eslint-config-prettier": ">= 9.1.0",
    "eslint-import-resolver-typescript": ">= 3.6.3",
    "eslint-plugin-import-x": ">= 4.3.1",
    typescript: ">= 5.6.2",
    "typescript-eslint": ">= 8.15.0",
    oxlint: ">= 1.87.0",
    "oxlint-tsgolint": ">= 7.0.2003",
  });
  assert.deepEqual(pkg.peerDependenciesMeta, {
    oxlint: { optional: true },
    "oxlint-tsgolint": { optional: true },
  });
  assert.equal(pkg.dependencies, undefined);
  assert.equal(read("./jsr.json").version, pkg.version);
  // a publish runs these tests first, and nothing else runs them (there is no CI here)
  assert.equal(pkg.scripts.test, "node --test oxlint.test.mjs");
  assert.equal(pkg.scripts.prepublishOnly, "npm test && npm run build");
  // the npm page must not promise more than the README does
  assert.doesNotMatch(pkg.description, /same rule set/);
});

// ── oxlint itself ──────────────────────────────────────────────────────────────────────

const PROJECT = fileURLToPath(new URL("./test-oxlint/", import.meta.url));
const OXLINT = fileURLToPath(new URL("./node_modules/.bin/oxlint", import.meta.url));

/** Run oxlint on the fixture project under a consumer configuration; findings as "severity code file". */
function lint(consumer) {
  const file = `${PROJECT}.oxlintrc.test-${process.pid}.json`;
  writeFileSync(file, JSON.stringify(consumer));
  try {
    const run = spawnSync(OXLINT, ["-c", file, "--format", "json", "src"], {
      cwd: PROJECT,
      encoding: "utf8",
    });
    if (run.error) throw run.error;
    const start = run.stdout.indexOf("{");
    assert.notEqual(start, -1, `oxlint printed no report: ${run.stdout}${run.stderr}`);
    const report = JSON.parse(run.stdout.slice(start));
    // "nothing reported" must never be read off a run that linted nothing
    assert.equal(report.number_of_files, 3);
    return report.diagnostics
      .map((d) => `${d.severity} ${d.code} ${String(d.filename).replace(/^.*src\//, "")}`)
      .sort();
  } finally {
    rmSync(file, { force: true });
  }
}
const PRESET = { extends: ["../oxlint.json"] };
const inFile = (findings, name) => [...new Set(findings.filter((f) => f.endsWith(` ${name}`)))];
// what the fixture's TypeScript file reports under the preset, and nothing else
const PROBE = [
  "error eslint(no-var) probe.ts",
  "error typescript(no-floating-promises) probe.ts",
  "warning import(no-duplicates) probe.ts",
];

test("oxlint: every rule in the file is a rule of oxlint's, under the name its table gives it", () => {
  const run = spawnSync(OXLINT, ["--rules", "--format", "json"], { encoding: "utf8" });
  if (run.error) throw run.error;
  const table = new Set(
    JSON.parse(run.stdout).map((rule) =>
      rule.scope === "eslint" ? rule.value : `${rule.scope.replaceAll("_", "-")}/${rule.value}`,
    ),
  );
  assert.ok(table.size > 500, "the table was read");
  // a name outside the table is a typo, or one of the other spellings oxlint accepts for
  // an existing rule (see the README), which would be a second key for it
  const unknown = sources.flatMap((source) => Object.keys(source.rules)).filter((key) => !table.has(key));
  assert.deepEqual(unknown, []);
});

test("oxlint: a consumer with only the extends line gets the rules, type information and nothing extra", () => {
  const findings = lint(PRESET);
  // a typed rule with no --type-aware flag, a rule from the TypeScript override, a warning
  assert.deepEqual(inFile(findings, "probe.ts"), PROBE);
  assert.deepEqual(inFile(findings, "a.ts"), []);
  // only the listed rules run: every finding is a rule of the preset, so no rule category
  // was switched on behind it
  const presetCodes = new Set(
    sources.flatMap((source) =>
      Object.keys(source.rules).map((key) =>
        key.includes("/") ? `${key.split("/")[0]}(${key.split("/")[1]})` : `eslint(${key})`,
      ),
    ),
  );
  for (const finding of findings)
    assert.ok(presetCodes.has(finding.split(" ")[1]), `${finding} is not a rule of the preset`);
});

test("oxlint: the README's example, which repeats categories and options, lints the same", () => {
  assert.deepEqual(
    lint({
      ...PRESET,
      categories: { correctness: "off" },
      options: { typeAware: true },
      rules: { "no-restricted-imports": ["error", { paths: ["some-barrel"] }] },
    }),
    lint(PRESET),
  );
});

test("oxlint: a consumer changes a root rule in its rules, and an override rule only with an override", () => {
  const without = (code) => PROBE.filter((finding) => !finding.includes(code));
  // a rule the preset sets at its root
  assert.deepEqual(
    inFile(lint({ ...PRESET, rules: { "typescript/no-floating-promises": "off" } }), "probe.ts"),
    without("no-floating-promises"),
  );
  // a rule of the preset's TypeScript override: the consumer's root rules do not reach it
  assert.deepEqual(inFile(lint({ ...PRESET, rules: { "no-var": "off" } }), "probe.ts"), PROBE);
  // an override of the consumer's own does
  assert.deepEqual(
    inFile(
      lint({ ...PRESET, overrides: [{ files: ["**/*.ts"], rules: { "no-var": "off" } }] }),
      "probe.ts",
    ),
    without("no-var"),
  );
});

test("oxlint: a JavaScript file needs an environment, and gets one from the consumer", () => {
  const undef = (findings) => inFile(findings, "script.js").filter((f) => f.includes("no-undef"));
  assert.deepEqual(undef(lint(PRESET)), ["error eslint(no-undef) script.js"]);
  assert.deepEqual(undef(lint({ ...PRESET, env: { builtin: true, node: true } })), []);
});
