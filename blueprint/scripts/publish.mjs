// Publish the built app into ../map/ — the repo root folder Vercel serves
// statically at /map. Run via `npm run release` (build + this), then
// commit and push; the existing push-to-deploy pipeline does the rest.
import { rmSync, cpSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const target = join(here, '..', '..', 'map')

if (!existsSync(dist)) {
  console.error('dist/ missing — run npm run build first')
  process.exit(1)
}
rmSync(target, { recursive: true, force: true })
cpSync(dist, target, { recursive: true })
console.log('published dist → ../map (commit + push to deploy)')
