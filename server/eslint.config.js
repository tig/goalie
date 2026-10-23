import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**", "web/dist/**"]),
  {
    extends: [tseslint.configs.recommended],
  },
  {
    files: ["web/src/**/*.tsx"],
    extends: [reactHooks.configs.flat.recommended],
  },
]);
