import { startAgent } from './agent'
import { loadConfig } from './config'
import { KuboError } from './kubo'

try {
  const agent = await startAgent(loadConfig(), {
    logger: true,
    onPairingCode: (code) => {
      console.log(`\n  Pairing code: ${code}\n  Enter it in the web app to connect it to this agent.\n`)
    },
  })
  console.log(`  ${agent.created ? 'Created new identity' : 'Identity'}: ${agent.identity.did}`)
  console.log(`  IPNS name: ${agent.identity.ipnsName}`)
  console.log(`  Manifest:  ${agent.publisher.current.cid}`)
} catch (err) {
  if (!(err instanceof KuboError)) throw err
  console.error(err.message)
  process.exit(1)
}
