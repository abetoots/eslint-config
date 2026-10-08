// node --test: the shape and the content of oxlint.json.
//
// It does not run oxlint, which is not a dependency here. So it cannot show that a rule
// name exists, that the file parses, that `extends` carries what the README says, or that
// any rule fires: those were checked in a consuming repository on oxlint 1.87, against one
// seeded violation per type-aware rule. What it can do is make every change to the file
// deliberate (the digest below) and hold the properties a reader would assume.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

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

test("the package ships the file, resolves it under both names, and keeps its peers straight", () => {
  assert.ok(pkg.files.some((entry) => entry.replace(/^\.\//, "") === "oxlint.json"));
  // the package resolving itself: no install needed, and a wrong target fails here
  const require = createRequire(import.meta.url);
  for (const specifier of ["@satoshibits/eslint-config/oxlint", "@satoshibits/eslint-config/oxlint.json"])
    assert.equal(require.resolve(specifier), new URL("./oxlint.json", import.meta.url).pathname);
  assert.equal(pkg.exports["."].import, "./dist/index.mjs", "the ESLint export is untouched");
  // oxlint is optional (an ESLint-only project need not install it); the ESLint packages
  // stay required, as they were
  assert.equal(pkg.peerDependencies.oxlint, ">= 1.87.0");
  assert.equal(pkg.peerDependencies["oxlint-tsgolint"], ">= 7.0.2003");
  assert.deepEqual(pkg.peerDependenciesMeta, {
    oxlint: { optional: true },
    "oxlint-tsgolint": { optional: true },
  });
  for (const peer of ["eslint", "@eslint/js", "typescript-eslint", "eslint-plugin-import-x"])
    assert.ok(pkg.peerDependencies[peer], `${peer} is still a peer`);
  assert.equal(read("./jsr.json").version, pkg.version);
  assert.match(pkg.scripts.prepublishOnly, /npm test/);
});
