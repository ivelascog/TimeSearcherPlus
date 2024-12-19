import ascii from "rollup-plugin-ascii";
import node, { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import injectProcessEnv from "rollup-plugin-inject-process-env";
import meta from "./package.json" assert { type: "json" };
import { babel } from "@rollup/plugin-babel";

const copyright = `// ${meta.homepage} v${
  meta.version
} Copyright ${new Date().getFullYear()} ${meta.author.name}`;

export default [
  {
    input: "src/index.js",
    plugins: [
      // babel({
      //   exclude: "node_modules/**",
      //   babelHelpers: "bundled",
      // }),
      node({
        jsxnext: true,
        main: true,
        browser: true,
      }),
      ascii(),
      commonjs(),
      injectProcessEnv({
        NODE_ENV: "debug",
      }),
      nodeResolve(),
    ],
    external: ["d3"],
    output: {
      extend: true,
      banner: copyright,
      file: "dist/TimeWidget.js",
      format: "umd",
      indent: false,
      name: "TimeWidget",
      sourcemap: true,
      globals: {
        d3: "d3",
      },
    },
  },
  {
    input: "src/index.js",
    plugins: [
      // babel({
      //   exclude: "node_modules/**",
      //   babelHelpers: "bundled",
      // }),
      node({
        jsxnext: true,
      }),
      ascii(),
      commonjs(),
      injectProcessEnv({
        NODE_ENV: "debug",
      }),
      nodeResolve(),
    ],
    external: ["d3"],
    output: {
      extend: true,
      banner: copyright,
      file: meta.module,
      format: "esm",
      indent: false,
      sourcemap: true,
      name: "TimeWidget",
      globals: {
        d3: "d3",
        // luxon: "luxon",
      },
    },
  },
  {
    input: "src/index.js",
    plugins: [
      // babel({
      //   exclude: "node_modules/**",
      //   babelHelpers: "bundled",
      // }),
      node({
        jsxnext: true,
        main: true,
        browser: true,
      }),
      ascii(),
      terser({ output: { preamble: copyright } }),
    ],
    external: ["d3"],
    output: {
      extend: true,
      file: "dist/TimeWidget.min.js",
      format: "umd",
      indent: false,
      name: "TimeWidget",
      globals: {
        d3: "d3",
      },
    },
  },
];
