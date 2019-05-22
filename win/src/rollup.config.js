import resolve from "rollup-plugin-node-resolve"
import commonjs from "rollup-plugin-commonjs"
import typescript from "rollup-plugin-typescript2"

export default {
  input: './win/src/helper.ts',
  output: {
    file: './win/helper.js',
    format: "cjs",
    sourcemapExcludeSources: true,
    strict: false,
  },
  external: ['path', 'fs', 'util', 'events', 'zlib', 'stream', 'https', 'url', 'http', 'assert', 'os', 'constants'],

  plugins: [
    resolve(),
    commonjs(),
    typescript({
      tsconfig: "./win/src/tsconfig.json",
      tsconfigOverride: {
        compilerOptions: {
          module: "es2015",
          sourceMap: false,
          declaration: false,
        },
      },
    }),
  ],
}
