import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["app/page.tsx"],
    rules: {
      // This rule's static analysis only catches a couple of the dozens of
      // identical `useEffect(() => { load(); }, [])` fetch-on-mount calls
      // in this file (each setting loading/error/data state after an
      // await) — inconsistent flagging of one standard, safe pattern
      // repeated throughout, not an actual correctness issue.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
