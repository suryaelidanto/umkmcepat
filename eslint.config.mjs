import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = [
  {
    ignores: [
      ".browser/**",
      ".claude/**",
      ".data/**",
      ".output/**",
      ".nitro/**",
      ".tanstack/**",
      ".pi/**",
      ".agents/**",
      "graphify-out/**",
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "build/**",
      "storybook-static/**",
      "src/routeTree.gen.ts",
      "*.config.*",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
            "type",
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      curly: ["error", "all"],
      // Not enforced under the previous next/typescript preset; keep parity so
      // the migration does not introduce churn in unrelated pre-existing files.
      "no-useless-escape": "off",
      "require-yield": "off",
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
    },
  },
];

export default eslintConfig;
