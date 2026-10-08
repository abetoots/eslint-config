// node --test: the shape of oxlint.json. It does not run oxlint (not a dependency here);
// the rule set itself was validated in a consuming repository against seeded violations.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const config = JSON.parse(readFileSync(new URL("./oxlint.json", import.meta.url), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const severity = (entry) => (Array.isArray(entry) ? entry[0] : entry);
const everyRule = [config, ...config.overrides].flatMap((source) => Object.entries(source.rules));

test("only the listed rules run, with type information", () => {
  // oxlint enables its `correctness` category unless told otherwise, and a category's
  // rules appear in no `rules` object
  assert.deepEqual(config.categories, { correctness: "off" });
  assert.deepEqual(config.options, { typeAware: true });
  assert.deepEqual(config.plugins, ["typescript", "import", "unicorn"]);
  // nothing a consumer could not see by reading `rules`
  assert.deepEqual(Object.keys(config).sort(), ["categories", "env", "options", "overrides", "plugins", "rules"]);
});

test("every rule is written under a plugin the preset loads, never under ESLint's name", () => {
  for (const [key] of everyRule) {
    const scope = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "";
    assert.ok(
      scope === "" || config.plugins.includes(scope),
      `${key}: oxlint reads other spellings (@typescript-eslint/…, import-x/…) as a second name for a rule`,
    );
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

test("a rule is an error unless it is one of the two warnings the ESLint preset has", () => {
  const warnings = everyRule.filter(([, entry]) => severity(entry) === "warn").map(([key]) => key);
  assert.deepEqual(warnings.sort(), ["import/no-duplicates", "import/no-named-as-default"]);
  for (const [key, entry] of everyRule)
    assert.ok(["error", "warn", "off"].includes(severity(entry)), `${key}: ${JSON.stringify(entry)}`);
});

test("the one override is for TypeScript files: it drops what the compiler reports and adds four rules", () => {
  assert.equal(config.overrides.length, 1);
  const [override] = config.overrides;
  assert.deepEqual(override.files, ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"]);
  const entries = Object.entries(override.rules);
  const switchedOff = entries.filter(([, entry]) => severity(entry) === "off").map(([key]) => key);
  // the compiler reports these itself (typescript-eslint's "eslint-recommended" list);
  // each is a core rule the root switches on, so JavaScript files keep it
  assert.equal(switchedOff.length, 17);
  for (const key of switchedOff) {
    assert.ok(!key.includes("/"), `${key} is a core rule`);
    assert.equal(severity(config.rules[key]), "error", `${key} is on at the root`);
  }
  assert.deepEqual(
    entries.filter(([, entry]) => severity(entry) === "error").map(([key]) => key).sort(),
    ["no-var", "prefer-const", "prefer-rest-params", "prefer-spread"],
  );
});

test("the package exports the file and ships it", () => {
  assert.equal(pkg.exports["./oxlint"], "./oxlint.json");
  assert.ok(pkg.files.includes("./oxlint.json"));
  assert.equal(pkg.peerDependenciesMeta.oxlint.optional, true);
  assert.equal(pkg.peerDependenciesMeta["oxlint-tsgolint"].optional, true);
  const require = createRequire(new URL("./test-consumer/package.json", import.meta.url));
  let resolved;
  try {
    resolved = require.resolve("@satoshibits/eslint-config/oxlint");
  } catch (error) {
    // test-consumer installs the package with `npm install`; without that there is nothing to resolve
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    return;
  }
  assert.match(resolved, /oxlint\.json$/);
});
