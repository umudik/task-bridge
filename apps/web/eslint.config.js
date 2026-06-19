import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Banned patterns — zero tolerance.
 *
 * Banned:
 *   null (type + literal)      — use undefined
 *   ?? and ??=                  — use explicit if / ternary
 *   ?. and ?.() optional chain  — guard with explicit undefined check
 *   ?: optional property / method / class field / parameter
 *                               — use T | undefined union
 */
const BANNED = [
  // ── null ──────────────────────────────────────────────────────────────────
  {
    selector: "TSNullKeyword",
    message: "null type is banned. Use undefined.",
  },
  {
    selector: "Literal[raw='null']",
    message: "null literal is banned. Use undefined.",
  },

  // ── ?? and ??= ────────────────────────────────────────────────────────────
  {
    selector: "LogicalExpression[operator='??']",
    message: "?? is banned. Use an explicit if / ternary instead.",
  },
  {
    selector: "AssignmentExpression[operator='??=']",
    message: "??= is banned.",
  },

  // ── ?. optional chaining ─────────────────────────────────────────────────
  {
    selector: "MemberExpression[optional=true]",
    message: "?. optional chaining is banned. Guard with an explicit undefined check.",
  },
  {
    selector: "CallExpression[optional=true]",
    message: "?. optional call is banned. Guard with an explicit undefined check.",
  },

  // ── optional ?: on types / classes / params ──────────────────────────────
  {
    selector: "TSPropertySignature[optional=true]",
    message: "Optional property (?:) is banned. Use '| undefined' in the property type.",
  },
  {
    selector: "TSMethodSignature[optional=true]",
    message: "Optional method (?:) is banned. Use '(() => R) | undefined'.",
  },
  {
    selector: "PropertyDefinition[optional=true]",
    message: "Optional class field (?:) is banned. Use 'T | undefined'.",
  },
  {
    selector: "Identifier[optional=true]",
    message: "Optional parameter (?) is banned. Use 'T | undefined' in the parameter type.",
  },
];

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    ignores: ["dist/**", "*.config.*"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── Turn off rules that conflict with our banned patterns ─────────────
      // We ban ?? — don't tell us to USE ??.
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      // We ban ?. — don't tell us to USE ?..
      "@typescript-eslint/prefer-optional-chain": "off",
      // type aliases are used extensively — allow both type and interface.
      "@typescript-eslint/consistent-type-definitions": "off",

      // ── React hooks ──────────────────────────────────────────────────────
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // ── TypeScript strict extras ─────────────────────────────────────────
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",

      // ── General strictness ───────────────────────────────────────────────
      "no-empty": ["error", { allowEmptyCatch: false }],
      eqeqeq: ["error", "always"],

      // ── Banned patterns ──────────────────────────────────────────────────
      "no-restricted-syntax": ["error", ...BANNED],
    },
  },
);
