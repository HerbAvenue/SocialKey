/**
 * Publishes a small demo network to a Kubo node: eight people with profiles,
 * posts, replies, mentions, likes, reposts and follows, plus a "main" user
 * (the identity in --main, e.g. the agent's data dir) who follows some of them.
 *
 *   KUBO_API=http://127.0.0.1:5001 tsx scripts/seed.ts --dir /tmp/seed --main ~/.socialkey
 *
 * Run it before starting the agent on --main: both write that identity's manifest.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import type { CID } from '@socialkey/core'
import { ensureKuboKey, loadOrCreateIdentity } from '../src/keystore'
import { HttpKubo } from '../src/kubo'
import { Publisher } from '../src/publisher'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i]?.replace(/^--/, '') ?? '', process.argv[i + 1] ?? '')
const seedDir = args.get('dir')
const mainDir = args.get('main')
if (!seedDir || !mainDir) {
  console.error('Usage: tsx scripts/seed.ts --dir <seed data dir> --main <main user data dir>')
  process.exit(1)
}
const kubo = new HttpKubo(process.env.KUBO_API ?? 'http://127.0.0.1:5001')

interface Persona {
  id: string
  name: string
  bio: string
  location?: string
  website?: string
  hue: number
}

const PEOPLE: Persona[] = [
  {
    id: 'main',
    name: 'Sam Rivera',
    bio: 'Trying out SocialKey. Coffee, code and long walks.',
    location: 'Lisbon',
    hue: 265,
  },
  {
    id: 'ada',
    name: 'Ada Okafor',
    bio: 'Open-source maintainer. Building tools that respect people. #rustlang #ipfs',
    location: 'Lagos',
    website: 'https://example.com/ada',
    hue: 200,
  },
  {
    id: 'ben',
    name: 'Ben Larsen',
    bio: 'Landscape photographer chasing light across Scandinavia 📷',
    location: 'Bergen',
    hue: 30,
  },
  {
    id: 'chloe',
    name: 'Chloe Martin',
    bio: 'Researching peer-to-peer networks. Opinions are content-addressed.',
    location: 'Paris',
    hue: 330,
  },
  {
    id: 'dev',
    name: 'Dev Patel',
    bio: 'Indie game dev. Currently making a cozy farming game about mushrooms 🍄',
    hue: 140,
  },
  {
    id: 'elena',
    name: 'Elena Costa',
    bio: 'Tech journalist covering privacy, the open web and the people building it.',
    location: 'Milan',
    hue: 10,
  },
  {
    id: 'farid',
    name: 'Farid Haddad',
    bio: 'Urbanist and daily cyclist. Cities are for people. 🚲',
    location: 'Montréal',
    hue: 90,
  },
  {
    id: 'grace',
    name: 'Grace Kim',
    bio: 'Sourdough evangelist. I will tell you about my starter.',
    location: 'Seoul',
    hue: 45,
  },
  {
    id: 'hiro',
    name: 'Hiro Tanaka',
    bio: 'Ambient musician. New album out soon on every platform you own.',
    location: 'Osaka',
    hue: 290,
  },
]

const FOLLOWS: Record<string, string[]> = {
  main: ['ada', 'ben', 'chloe'],
  ada: ['chloe', 'dev', 'elena', 'main'],
  ben: ['grace', 'farid', 'hiro', 'main'],
  chloe: ['ada', 'elena', 'hiro'],
  dev: ['ada', 'hiro'],
  elena: ['chloe', 'ada', 'farid'],
  farid: ['ben', 'elena'],
  grace: ['ben', 'farid'],
  hiro: ['dev', 'chloe'],
}

type Action =
  | {
      at: number
      by: string
      post: string
      text: string
      ref?: string
      replyTo?: string
      quoteOf?: string
      mention?: string[]
      images?: number
    }
  | { at: number; by: string; like: string }
  | { at: number; by: string; repost: string }

// `at` is minutes before now. Refs name posts so later actions can point at them.
const ACTIONS: Action[] = [
  {
    at: 4320,
    by: 'chloe',
    post: 'c1',
    text: 'Content addressing changes how you think about links. A CID never rots: it either resolves to exactly that content, or nothing. #ipfs',
  },
  {
    at: 4000,
    by: 'ada',
    post: 'a1',
    text: 'Shipped v2.0 of my CLI today! Thanks to the 40 contributors who made it happen. Open source is people. #opensource',
  },
  {
    at: 3900,
    by: 'dev',
    post: 'd1',
    text: 'Mushroom farming game devlog #12: spores now drift with the wind. Watching them spread is weirdly calming. #gamedev',
    images: 1,
  },
  {
    at: 3600,
    by: 'ben',
    post: 'b1',
    text: 'First light over the fjord this morning. Worth the 4am alarm. #photography',
    images: 2,
  },
  {
    at: 3500,
    by: 'grace',
    post: 'g1',
    text: 'Day 412 of my sourdough starter. Her name is Doughlores and she is thriving. #baking',
  },
  { at: 3400, by: 'ben', like: 'g1' },
  {
    at: 3000,
    by: 'elena',
    post: 'e1',
    text: 'New piece: what happens to your posts when a social network shuts down? Spoiler: usually they vanish. Unless you host them yourself. #decentralization',
  },
  { at: 2950, by: 'chloe', repost: 'e1' },
  { at: 2900, by: 'ada', post: 'a2', text: 'Great read, and exactly why I moved my profile here.', replyTo: 'e1' },
  {
    at: 2800,
    by: 'farid',
    post: 'f1',
    text: 'Protected bike lanes on my street are finally done. Counted 300 cyclists in an hour this morning! #cycling #urbanism',
    images: 1,
  },
  {
    at: 2600,
    by: 'hiro',
    post: 'h1',
    text: 'Recording rain on a tin roof for the new album. Nature is the best synth. #music',
  },
  {
    at: 2400,
    by: 'main',
    post: 'm1',
    text: 'Hello SocialKey! My first post from a profile that lives on my own laptop. Feels good. #introductions',
  },
  {
    at: 2350,
    by: 'ada',
    post: 'a3',
    text: 'Welcome @SamRivera! Glad to have you here.',
    replyTo: 'm1',
    mention: ['main'],
  },
  { at: 2340, by: 'ben', like: 'm1' },
  { at: 2330, by: 'ada', like: 'm1' },
  {
    at: 2200,
    by: 'chloe',
    post: 'c2',
    text: 'Signed posts + IPNS = you can verify everything you read came from who it says. No trust in the server required, because there is no server.',
    quoteOf: 'c1',
  },
  { at: 2000, by: 'main', like: 'b1' },
  {
    at: 1900,
    by: 'main',
    post: 'm2',
    text: "Ben's fjord photos are unreal. Following for more of those.",
    quoteOf: 'b1',
  },
  { at: 1850, by: 'ben', post: 'b2', text: 'Thank you! More coming from the Lofoten trip next week.', replyTo: 'm2' },
  { at: 1500, by: 'dev', post: 'd2', text: 'Hot take: every game should have a photo mode. #gamedev' },
  { at: 1400, by: 'hiro', like: 'd2' },
  {
    at: 1200,
    by: 'elena',
    post: 'e2',
    text: 'Interviewing @ChloeMartin next week about peer-to-peer networks. What should I ask her?',
    mention: ['chloe'],
  },
  { at: 1100, by: 'chloe', post: 'c3', text: "Looking forward to it! I'll bring diagrams.", replyTo: 'e2' },
  { at: 900, by: 'grace', post: 'g2', text: 'Made a rye loaf with Doughlores. The crumb!! #baking', images: 1 },
  { at: 800, by: 'farid', like: 'g2' },
  {
    at: 600,
    by: 'ada',
    post: 'a4',
    text: 'Reminder that you can use your own domain as your handle here. One DNS record and you are @yourname.com. #ipfs',
  },
  { at: 500, by: 'chloe', like: 'a4' },
  { at: 400, by: 'ben', repost: 'm1' },
  { at: 300, by: 'hiro', post: 'h2', text: 'Album artwork is done. Counting down to release day. #music', images: 1 },
  {
    at: 200,
    by: 'main',
    post: 'm3',
    text: 'Two days in and my feed is just people I chose to follow, in order. I forgot how nice that is.',
  },
  { at: 120, by: 'chloe', like: 'm3' },
  { at: 90, by: 'ada', post: 'a5', text: 'Same! No algorithm, no ads. Just posts.', replyTo: 'm3' },
  {
    at: 30,
    by: 'dev',
    post: 'd3',
    text: 'Playtest build is up for friends. DM me... oh wait, we do not have DMs yet. Reply here! #gamedev',
  },
]

/** A small gradient "photo" PNG, so demo posts have images without bundling any. */
function gradientPng(width: number, height: number, hue: number, seed: number): Uint8Array {
  const rgb = (h: number, s: number, l: number): [number, number, number] => {
    const k = (n: number) => (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
  }
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const t = y / height
      const hill = Math.sin(x / (width / (3 + seed)) + seed) * 0.08 + 0.62
      const [r, g, b] =
        t > hill ? rgb((hue + 40) % 360, 0.35, 0.25 + (1 - t) * 0.2) : rgb((hue + t * 60) % 360, 0.65, 0.45 + t * 0.3)
      raw.set([r, g, b], y * (width * 3 + 1) + 1 + x * 3)
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length)
    head.write(type, 4)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])))
    return Buffer.concat([head, data, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width)
  ihdr.writeUInt32BE(height, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

let clock = Date.now() - 5 * 86_400_000
const people = new Map<string, { persona: Persona; publisher: Publisher; did: string }>()
for (const persona of PEOPLE) {
  const dataDir = persona.id === 'main' ? mainDir : join(seedDir, persona.id)
  await mkdir(dataDir, { recursive: true })
  const { identity } = await loadOrCreateIdentity(dataDir)
  const keyName = persona.id === 'main' ? (process.env.SOCIALKEY_KEY_NAME ?? 'socialkey') : `seed-${persona.id}`
  await ensureKuboKey(kubo, keyName, identity)
  const publisher = new Publisher({
    kubo,
    identity,
    keyName,
    stateFile: join(dataDir, 'manifest.dagjson'),
    now: () => new Date(clock),
  })
  await publisher.init(persona.name)
  people.set(persona.id, { persona, publisher, did: identity.did })
  console.log(`${persona.name.padEnd(14)} ${identity.did}`)
}

const get = (id: string) => {
  const p = people.get(id)
  if (!p) throw new Error(`Unknown persona ${id}`)
  return p
}

for (const { persona, publisher } of people.values()) {
  const banner = await kubo.addFile(gradientPng(900, 300, persona.hue, persona.name.length % 5))
  await publisher.updateProfile({
    displayName: persona.name,
    bio: persona.bio,
    location: persona.location ?? null,
    website: persona.website ?? null,
    banner: banner.toString(),
  })
  for (const target of FOLLOWS[persona.id] ?? []) await publisher.follow(get(target).did)
}

const refs = new Map<string, CID>()
const ref = (name: string) => {
  const cid = refs.get(name)
  if (!cid) throw new Error(`Unknown post ref ${name}`)
  return cid.toString()
}
let imageSeed = 0
for (const action of ACTIONS.sort((a, b) => b.at - a.at)) {
  clock = Date.now() - action.at * 60_000
  const { publisher, persona } = get(action.by)
  if ('post' in action) {
    const media: string[] = []
    for (let i = 0; i < (action.images ?? 0); i++) {
      media.push((await kubo.addFile(gradientPng(800, 520, (persona.hue + i * 35) % 360, imageSeed++))).toString())
    }
    const { post } = await publisher.createPost({
      text: action.text,
      media,
      replyTo: action.replyTo && ref(action.replyTo),
      quoteOf: action.quoteOf && ref(action.quoteOf),
      mentions: action.mention?.map((id) => get(id).did),
    })
    refs.set(action.post, post)
  } else if ('like' in action) {
    await publisher.like(ref(action.like))
  } else {
    await publisher.createPost({ text: '', repostOf: ref(action.repost) })
  }
}

console.log(`\nSeeded ${people.size} profiles and ${refs.size} posts.`)
