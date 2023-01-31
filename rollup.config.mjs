import ascii from "rollup-plugin-ascii";
import node from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import meta from "./package.json" assert {type: "json"};


const copyright = `// ${meta.homepage} v${meta.version} Copyright ${(new Date).getFullYear()} ${meta.author.name}`;

export default [
  {
    input: "src/index.js",
    plugins: [
      // babel({
      //   exclude: "node_modules/**"
      // }),
      node({
        jsxnext: true,
        main: true,
        browser: true
      }),
      ascii()
    ],
    external: [
      "d3",
      "d3-array"
    ],
    output: {
      extend: true,
      banner: copyright,
      file: "dist/TimeSearcher.js",
      format: "umd",
      indent: false,
      name: "TimeSearcher",
      // sourcemap: true,
      globals: {
        d3:"d3",
        "d3-array": "d3Array"
      }
    }
  },
  {
    input: "src/index.js",
    plugins: [
      // babel({
      //   exclude: "node_modules/**"
      // }),
      node({
        jsxnext: true
      }),
      ascii(),
      commonjs()
    ],
    external: [
      "d3",
      "d3-array"
    ],
    output: {
      extend: true,
      banner: copyright,
      file: meta.module,
      format: "esm",
      indent: false,
      // sourcemap: true,
      name: "TimeSearcher",
      globals: {
        d3:"d3",
        "d3-array": "d3Array"
      }
    }
  },
  {
    input: "src/index.js",
    plugins: [
      node({
        jsxnext: true,
        main: true,
        browser: true
      }),
      ascii(),
      terser({output: {preamble: copyright}})
    ],
    external: [
        "d3",
        "d3-array"
    ],
    output: {
      extend: true,
      file: "dist/TimeSearcher.min.js",
      format: "umd",
      indent: false,
      name: "TimeSearcher",
      globals: {
        d3:"d3",
        "d3-array":"d3Array"
      }
    }
  }
];