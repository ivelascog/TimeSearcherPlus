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
      /*babel({
        exclude: "node_modules/**",
        babelHelpers: "bundled",
      }),*/
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
    external: ["d3", "@popperjs", "date-fns"],
    output: {
      extend: true,
      banner: copyright,
      file: "dist/TimeSearcher.js",
      format: "umd",
      indent: false,
      name: "TimeSearcher",
      sourcemap: true,
      globals: {
        d3: "d3",
        "date-fns": "dateFns"
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
    external: ["d3", "@popperjs", "date-fns"],
    output: {
      extend: true,
      banner: copyright,
      file: meta.module,
      format: "esm",
      indent: false,
      // sourcemap: true,
      name: "TimeSearcher",
      globals: {
        d3: "d3",
        "date-fns": "dateFns"
        
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
    external: ["d3", "@popperjs", "date-fns"],
    output: {
      extend: true,
      file: "dist/TimeSearcher.min.js",
      format: "umd",
      indent: false,
      name: "TimeSearcher",
      globals: {
        d3: "d3",
        "date-fns": "dateFns"
      },
    },
  },
];
