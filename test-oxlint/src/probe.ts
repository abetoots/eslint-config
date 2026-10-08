// seeded violations for oxlint.test.mjs: one typed rule, one rule the preset adds for
// TypeScript files only, and one of the preset's two warnings
import { a } from "./a.js";
import { b } from "./a.js";

async function work(): Promise<number> {
  await Promise.resolve();
  return a + b;
}

export function run(): void {
  var legacy = 1;
  work();
  globalThis.console.log(legacy);
}
