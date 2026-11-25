// Downloads the Kubo binary for a target platform into kubo-bin/<os>-<arch>/kubo/,
// using electron-builder's names (os: linux | win | mac, arch: x64 | arm64).
// The `kubo` package verifies each download against its published SHA-512.
const { join } = require('node:path')
const { existsSync } = require('node:fs')
const { download } = require('kubo/src/download')
const { version } = require('kubo/package.json')

const GO_OS = { linux: 'linux', win: 'windows', mac: 'darwin' }
const GO_ARCH = { x64: 'amd64', arm64: 'arm64' }
const HOST_OS = { linux: 'linux', win32: 'win', darwin: 'mac' }[process.platform]

const [os = HOST_OS, arch = process.arch] = process.argv.slice(2)
if (!GO_OS[os] || !GO_ARCH[arch]) {
  console.error(`Usage: fetch-kubo.cjs [linux|win|mac] [x64|arm64]`)
  process.exit(1)
}

const installPath = join(__dirname, '..', 'kubo-bin', `${os}-${arch}`)
const binary = join(installPath, 'kubo', os === 'win' ? 'ipfs.exe' : 'ipfs')
if (existsSync(binary)) {
  console.log(`Kubo for ${os}-${arch} already at ${binary}`)
} else {
  download({ version: `v${version}`, platform: GO_OS[os], arch: GO_ARCH[arch], installPath })
    .then((path) => console.log(`Kubo for ${os}-${arch}: ${path}`))
    .catch((err) => {
      console.error(err.message)
      process.exit(1)
    })
}
