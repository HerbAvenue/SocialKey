// Adds the built web app (dist/) to a Kubo node and prints where it can be opened.
// Point a DNSLink record (_dnslink.example.com TXT "dnslink=/ipfs/<cid>") at the CID to serve it from your domain.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')
if (!existsSync(join(dist, 'index.html'))) {
  console.error('No build found: run `pnpm --filter @socialkey/web build` first.')
  process.exit(1)
}
const ipfs = process.env.IPFS_BIN ?? 'ipfs'
let cid
try {
  cid = execFileSync(ipfs, ['add', '-r', '-Q', '--cid-version=1', dist], { encoding: 'utf8' }).trim()
} catch (err) {
  console.error(`Couldn't run "${ipfs} add". Is Kubo installed and its daemon running? (${err.message})`)
  process.exit(1)
}
console.log(`Published SocialKey web app: ${cid}
  Local gateway:  http://${cid}.ipfs.localhost:8080/
  Public gateway: https://${cid}.ipfs.dweb.link/
  DNSLink record: _dnslink.<your domain>  TXT  "dnslink=/ipfs/${cid}"`)
