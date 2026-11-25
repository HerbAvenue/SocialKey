import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { CID, didKey } from '@socialkey/core'
import Fastify, { type FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Auth } from './auth'
import type { Config } from './config'
import type { Hoster } from './hoster'
import type { Moderation } from './moderation'
import { NotFoundError, type Publisher } from './publisher'

const MAX_MEDIA_BYTES = 20 * 1024 * 1024
const PUBLIC_ROUTES = new Set(['/', '/health', '/pair'])
const WEB_PREFIX = '/app/'

const cidString = z.string().refine((s) => {
  try {
    CID.parse(s)
    return true
  } catch {
    return false
  }
}, 'Expected a CID')

const PairBody = z.object({ code: z.string() })
const PostBody = z.object({
  text: z.string(),
  media: z.array(cidString).optional(),
  replyTo: cidString.optional(),
  quoteOf: cidString.optional(),
  repostOf: cidString.optional(),
  mentions: z.array(didKey).optional(),
})
const CidBody = z.object({ cid: cidString })
const PinBody = z.object({ cid: cidString.nullable() })
const optionalField = z.string().nullable().optional()
const ProfileBody = z.object({
  displayName: z.string().optional(),
  bio: optionalField,
  avatar: cidString.nullable().optional(),
  banner: cidString.nullable().optional(),
  website: optionalField,
  location: optionalField,
  handle: optionalField,
})
const FollowBody = z.object({ did: didKey })
const MessageBody = z.object({ to: didKey, text: z.string() })
const KeysBody = z.object({ dids: z.array(didKey).max(500) })
const ModerationBody = z.object({ did: didKey, on: z.boolean() })

interface Deps {
  config: Config
  publisher: Publisher
  auth: Auth
  hoster?: Hoster
  moderation?: Moderation
  logger?: boolean
}

export async function buildServer({
  config,
  publisher,
  auth,
  hoster,
  moderation,
  logger = false,
}: Deps): Promise<FastifyInstance> {
  const app = Fastify({ logger })

  await app.register(cors, {
    // The agent's own origins are always allowed, for the web app it serves at /app/.
    origin: [...config.allowedOrigins, `http://127.0.0.1:${config.port}`, `http://localhost:${config.port}`],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })

  for (const type of ['application/octet-stream', /^image\//, /^video\//]) {
    app.addContentTypeParser(type, { parseAs: 'buffer', bodyLimit: MAX_MEDIA_BYTES }, (_req, body, done) =>
      done(null, body),
    )
  }

  app.addHook('onRequest', async (req, reply) => {
    const route = req.routeOptions.url ?? ''
    if (req.method === 'OPTIONS' || PUBLIC_ROUTES.has(route) || route.startsWith(WEB_PREFIX)) return
    if (!auth.isAuthorized(req.headers.authorization)) {
      return reply.code(401).send({ error: 'Not paired with this agent' })
    }
  })

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: 'Invalid input', issues: err.issues })
    }
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message })
    if (err instanceof RangeError) return reply.code(400).send({ error: err.message })
    reply.send(err)
  })

  if (config.webRoot) {
    await app.register(fastifyStatic, {
      root: config.webRoot,
      prefix: WEB_PREFIX,
      // Built assets have content hashes in their names; index.html must always be fresh
      // so an updated app never serves a page pointing at assets that no longer exist.
      setHeaders: (reply, path) => {
        reply.header(
          'cache-control',
          /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
        )
      },
    })
    app.get('/', (_req, reply) => reply.redirect(WEB_PREFIX))
  }

  app.get('/health', async () => ({ ok: true }))

  app.post('/pair', async (req, reply) => {
    const token = await auth.pair(PairBody.parse(req.body).code)
    if (!token) return reply.code(403).send({ error: 'Wrong pairing code' })
    return { token }
  })

  app.get('/me', async () => {
    const { manifest, cid } = publisher.current
    return {
      did: manifest.author,
      ipnsName: publisher.ipnsName,
      manifestCid: cid.toString(),
      gateway: config.kuboGateway,
      hosting: hoster?.status() ?? { enabled: false, profiles: 0 },
    }
  })

  app.put('/profile', async (req) => {
    const manifestCid = await publisher.updateProfile(ProfileBody.parse(req.body))
    return { manifestCid: manifestCid.toString() }
  })

  app.post('/posts', async (req) => {
    const { post, manifest } = await publisher.createPost(PostBody.parse(req.body))
    return { cid: post.toString(), manifestCid: manifest.toString() }
  })

  app.delete<{ Params: { cid: string } }>('/posts/:cid', async (req) => {
    const manifestCid = await publisher.deletePost(cidString.parse(req.params.cid))
    return { manifestCid: manifestCid.toString() }
  })

  app.post('/likes', async (req) => {
    const manifestCid = await publisher.like(CidBody.parse(req.body).cid)
    return { manifestCid: manifestCid.toString() }
  })

  app.delete<{ Params: { cid: string } }>('/likes/:cid', async (req) => {
    const manifestCid = await publisher.unlike(cidString.parse(req.params.cid))
    return { manifestCid: manifestCid.toString() }
  })

  app.put('/pinned', async (req) => {
    const manifestCid = await publisher.pin(PinBody.parse(req.body).cid)
    return { manifestCid: manifestCid.toString() }
  })

  app.post('/messages', async (req) => {
    const { to, text } = MessageBody.parse(req.body)
    const { message, manifest } = await publisher.sendMessage(to, text)
    return { cid: message.toString(), manifestCid: manifest.toString() }
  })

  app.post('/messages/keys', async (req) => ({ keys: publisher.conversationKeys(KeysBody.parse(req.body).dids) }))

  app.get('/moderation', async () => moderation?.current ?? { muted: [], blocked: [] })

  app.put<{ Params: { list: string } }>('/moderation/:list', async (req, reply) => {
    const list = req.params.list === 'muted' ? 'muted' : req.params.list === 'blocked' ? 'blocked' : null
    if (!list || !moderation) return reply.code(404).send({ error: 'Unknown list' })
    const { did, on } = ModerationBody.parse(req.body)
    // Blocking someone also stops following them.
    if (list === 'blocked' && on && publisher.current.manifest.follows.includes(did)) await publisher.unfollow(did)
    return moderation.set(list, did, on)
  })

  app.post('/media', async (req, reply) => {
    if (!(req.body instanceof Buffer) || req.body.length === 0) {
      return reply.code(400).send({ error: 'Send the file as the raw request body' })
    }
    return { cid: (await publisher.addMedia(req.body)).toString() }
  })

  app.post('/follows', async (req) => {
    const manifestCid = await publisher.follow(FollowBody.parse(req.body).did)
    return { manifestCid: manifestCid.toString() }
  })

  app.delete<{ Params: { did: string } }>('/follows/:did', async (req) => {
    const manifestCid = await publisher.unfollow(didKey.parse(req.params.did))
    return { manifestCid: manifestCid.toString() }
  })

  return app
}
