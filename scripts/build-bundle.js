const {build} = require('esbuild');
const {polyfillNode} = require('esbuild-plugin-polyfill-node');
const fs = require('fs');
const path = require('path');

const entry = path.join(__dirname, '..', 'public', 'browserify', 'index.js');
const outfile = path.join(__dirname, '..', 'public', 'js', 'blockchain.js');

// Inlines .wasm files as base64 and synchronously instantiates them.
// Lets us target es2020 / iife output without top-level await.
const wasmSyncPlugin = {
  name: 'wasm-sync',
  setup(build) {
    build.onResolve({filter: /\.wasm$/}, args => ({
      path: path.resolve(args.resolveDir, args.path),
      namespace: 'wasm-sync',
    }));

    build.onLoad({filter: /.*/, namespace: 'wasm-sync'}, args => {
      const b64 = fs.readFileSync(args.path).toString('base64');
      const contents = `
        import * as rand from "./rand.js";
        import * as validate_error from "./validate_error.js";
        const binary = Uint8Array.from(atob("${b64}"), c => c.charCodeAt(0));
        const mod = new WebAssembly.Module(binary);
        const instance = new WebAssembly.Instance(mod, {
          "./rand.js": rand,
          "./validate_error.js": validate_error,
        });
        export default instance.exports;
      `;
      return {
        contents,
        loader: 'js',
        resolveDir: path.dirname(args.path),
      };
    });
  },
};

build({
  bundle: true,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    global: 'globalThis',
  },
  entryPoints: [entry],
  format: 'iife',
  logLevel: 'info',
  outfile,
  platform: 'browser',
  plugins: [
    wasmSyncPlugin,
    polyfillNode({globals: {buffer: true, process: true}}),
  ],
  sourcemap: true,
  target: ['es2020'],
}).catch(err => {
  console.error(err);
  process.exit(1);
});
