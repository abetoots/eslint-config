import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginImportX from "eslint-plugin-import-x";
import type { TSESLint } from "@typescript-eslint/utils";

//plugins define new eslint rules, and configs set whether or not (and how) the rules should be applied.
const conf: TSESLint.FlatConfig.ConfigArray = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintPluginImportX.flatConfigs.recommended,
  eslintPluginImportX.flatConfigs.typescript,
  {
    // These import rules duplicate what the TypeScript compiler already reports
    // (unresolved modules, missing or wrong named/default/namespace exports)
    // and they re-resolve and re-parse every import with their own resolver,
    // which in a typed project is a large share of lint time and memory.
    // typescript-eslint recommends turning them off when `tsc` runs anyway:
    // https://typescript-eslint.io/troubleshooting/typed-linting/performance/#eslint-plugin-import
    // `no-duplicates` and `no-named-as-default` stay on: tsc does not report them.
    name: "satoshibits/import-x-rules-typescript-covers",
    rules: {
      "import-x/named": "off",
      "import-x/namespace": "off",
      "import-x/default": "off",
      "import-x/no-named-as-default-member": "off",
      "import-x/no-unresolved": "off",
    },
  },
  //Turns off all rules that are unnecessary or might conflict with Prettier.
  //Note that this config only turns rules off,
  //so it only makes sense using it together with some other config.
  eslintConfigPrettier
);

export default conf;
