import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
    // Base recommended rules from ESLint
    js.configs.recommended,

    // Apply to TypeScript files
    {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
            parser: tseslint.parser, // use TS parser
            parserOptions: {
                project: "./tsconfig.json", // helps ESLint understand TS project settings
            },
        },
        plugins: {
            "@typescript-eslint": tseslint.plugin,
        },
        rules: {
            ...tseslint.configs.recommended.rules, // load recommended TS rules
            "@typescript-eslint/no-unused-vars": "warn", // warn on unused vars
            "@typescript-eslint/explicit-function-return-type": "off", // don’t force return types
        },
    },
];
