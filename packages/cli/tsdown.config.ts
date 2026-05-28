import { defineConfig } from "tsdown";
import pkg from "./package.json" with { type: "json" };

const neverBundle = [
  "@aliou/obsdx-base-ast",
  "@aliou/obsdx-base-engine",
  "@aliou/obsdx-index",
  "chokidar",
  "fast-glob",
];

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: "esm",
    dts: {
      compilerOptions: {
        composite: false,
      },
    },
    sourcemap: true,
    clean: true,
    target: "node25",
    define: {
      CLI_VERSION: JSON.stringify(pkg.version),
    },
    deps: {
      neverBundle,
    },
  },
  {
    entry: ["src/cli/main.ts"],
    format: "esm",
    dts: false,
    sourcemap: true,
    clean: false,
    target: "node25",
    define: {
      CLI_VERSION: JSON.stringify(pkg.version),
    },
    deps: {
      neverBundle,
    },
  },
  {
    entry: ["src/cli/main.ts"],
    format: "cjs",
    dts: false,
    clean: false,
    target: "node25",
    define: {
      CLI_VERSION: JSON.stringify(pkg.version),
    },
    deps: {
      alwaysBundle: [/.*/],
    },
    exe: {
      fileName: "obsdx",
      outDir: "dist",
      targets: [
        { platform: "darwin", arch: "arm64", nodeVersion: "25.7.0" },
        { platform: "linux", arch: "arm64", nodeVersion: "25.7.0" },
      ],
      seaConfig: {
        disableExperimentalSEAWarning: true,
        useCodeCache: false,
        useSnapshot: false,
        execArgvExtension: "none",
      },
    },
  },
]);
