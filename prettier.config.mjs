/**
 * @type {import('prettier').Config & import("prettier-plugin-ejs").PluginConfig & import("@ianvs/prettier-plugin-sort-imports").PluginConfig}
 */
const config = {
  plugins: ["prettier-plugin-ejs", "@ianvs/prettier-plugin-sort-imports"],
  importOrder: ["<THIRD_PARTY_MODULES>", "", "^~/", "^[.][.]/", "^[.]/"],
  importOrderParserPlugins: ["typescript", "decorators-legacy"],
  importOrderTypeScriptVersion: "4.4.0",
};

export default config;
