// Bundles the Electron main, preload, and renderer into dist/.
import { cp, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

const node = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  // `kubo` is only required in development; packaged builds ship the binary as a resource.
  external: ['electron', 'kubo'],
  logLevel: 'warning',
}

await mkdir('dist/renderer', { recursive: true })
await Promise.all([
  build({ ...node, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs' }),
  build({ ...node, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs' }),
  build({
    bundle: true,
    platform: 'browser',
    format: 'iife',
    entryPoints: ['src/renderer/renderer.ts'],
    outfile: 'dist/renderer/renderer.js',
    logLevel: 'warning',
  }),
  cp('src/renderer/index.html', 'dist/renderer/index.html'),
  cp('assets', 'dist/assets', { recursive: true }),
])
