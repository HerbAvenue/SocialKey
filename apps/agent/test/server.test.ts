import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateSecretKey, identityFromSecretKey } from '@socialkey/core'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Auth } from '../src/auth'
import { loadConfig } from '../src/config'
import { Moderation } from '../src/moderation'
import { Publisher } from '../src/publisher'
import { buildServer } from '../src/server'
import { FakeKubo } from './fake-kubo'

describe('agent HTTP API', () => {
  let app: FastifyInstance
  let code: string
  // Stands in for Kubo's gateway behind the proxy routes.
  let gateway: Server
  let gatewayUrl: string
  beforeAll(async () => {
    gateway = createServer((req, res) => {
      res.writeHead(req.url?.startsWith('/ipfs/') ? 200 : 404, {
        'content-type': 'application/vnd.ipld.raw',
        'x-accept': String(req.headers.accept),
      })
      res.end(`block for ${req.url}`)
    })
    await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve))
    gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`
  })
  afterAll(() => gateway.close())

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'socialkey-'))
    await writeFile(join(dir, 'index.html'), '<h1>web</h1>')
    const config = { ...loadConfig({}), dataDir: dir, webRoot: dir, kuboGateway: gatewayUrl }
    const publisher = new Publisher({
      kubo: new FakeKubo(),
      identity: identityFromSecretKey(generateSecretKey()),
      keyName: 'socialkey',
      stateFile: join(dir, 'manifest.dagjson'),
    })
    await publisher.init('Alice')
    const auth = await Auth.load(join(dir, 'tokens.json'), (c) => {
      code = c
    })
    const moderation = await Moderation.load(join(dir, 'moderation.json'))
    app = await buildServer({ config, publisher, auth, moderation })
  })

  async function pair(): Promise<string> {
    const res = await app.inject({ method: 'POST', url: '/pair', payload: { code } })
    return res.json().token
  }

  it('requires pairing for protected routes', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/pair', payload: { code: 'WRONG' } })).statusCode).toBe(403)
  })

  it('makes the pairing code single-use', async () => {
    const used = code
    expect(await pair()).toBeTruthy()
    const res = await app.inject({ method: 'POST', url: '/pair', payload: { code: used } })
    expect(res.statusCode).toBe(403)
  })

  it('creates a post once paired', async () => {
    const headers = { authorization: `Bearer ${await pair()}` }
    const res = await app.inject({ method: 'POST', url: '/posts', headers, payload: { text: 'hi' } })
    expect(res.statusCode).toBe(200)
    const me = (await app.inject({ method: 'GET', url: '/me', headers })).json()
    expect(me.manifestCid).toBe(res.json().manifestCid)
  })

  it('returns 400 for invalid input', async () => {
    const headers = { authorization: `Bearer ${await pair()}` }
    const res = await app.inject({ method: 'POST', url: '/follows', headers, payload: { did: 'nope' } })
    expect(res.statusCode).toBe(400)
  })

  it('uploads media as a raw body', async () => {
    const headers = { authorization: `Bearer ${await pair()}`, 'content-type': 'image/png' }
    const res = await app.inject({ method: 'POST', url: '/media', headers, payload: Buffer.from([1, 2, 3]) })
    expect(res.statusCode).toBe(200)
    expect(res.json().cid).toMatch(/^bafk/)
  })

  it('only allows configured CORS origins', async () => {
    const preflight = (origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/posts',
        headers: { origin, 'access-control-request-method': 'POST' },
      })
    expect((await preflight('http://localhost:5173')).headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    )
    expect((await preflight('https://evil.example')).headers['access-control-allow-origin']).toBeUndefined()
    expect((await preflight('http://localhost:4040')).headers['access-control-allow-origin']).toBe(
      'http://localhost:4040',
    )
  })

  it('serves the web app without pairing', async () => {
    expect((await app.inject({ method: 'GET', url: '/' })).headers.location).toBe('/app/')
    const res = await app.inject({ method: 'GET', url: '/app/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('web')
    expect(res.headers['cache-control']).toBe('no-cache')
  })

  it('likes, pins and deletes through the API', async () => {
    const headers = { authorization: `Bearer ${await pair()}` }
    const { cid } = (await app.inject({ method: 'POST', url: '/posts', headers, payload: { text: 'hi' } })).json()
    expect((await app.inject({ method: 'POST', url: '/likes', headers, payload: { cid } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'PUT', url: '/pinned', headers, payload: { cid } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'DELETE', url: `/posts/${cid}`, headers })).statusCode).toBe(200)
    expect((await app.inject({ method: 'DELETE', url: `/posts/${cid}`, headers })).statusCode).toBe(404)
  })

  it('keeps private mute and block lists, and blocking unfollows', async () => {
    const headers = { authorization: `Bearer ${await pair()}` }
    const troll = identityFromSecretKey(generateSecretKey()).did
    await app.inject({ method: 'POST', url: '/follows', headers, payload: { did: troll } })
    await app.inject({ method: 'PUT', url: '/moderation/muted', headers, payload: { did: troll, on: true } })
    const blocked = await app.inject({
      method: 'PUT',
      url: '/moderation/blocked',
      headers,
      payload: { did: troll, on: true },
    })
    expect(blocked.json()).toEqual({ muted: [troll], blocked: [troll] })
    const me = await app.inject({ method: 'GET', url: '/moderation', headers })
    expect(me.json().blocked).toEqual([troll])
    expect(
      (await app.inject({ method: 'PUT', url: '/moderation/nope', headers, payload: { did: troll, on: true } }))
        .statusCode,
    ).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/moderation' })).statusCode).toBe(401)
  })

  it('proxies public gateway reads without a token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ipfs/bafyfoo?format=raw',
      headers: { accept: 'application/vnd.ipld.raw' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('block for /ipfs/bafyfoo?format=raw')
    expect(res.headers['content-type']).toBe('application/vnd.ipld.raw')
    expect((await app.inject({ method: 'GET', url: '/ipns/k51missing' })).statusCode).toBe(404)
  })

  it('reports its own address as the gateway', async () => {
    const headers = { authorization: `Bearer ${await pair()}`, host: '192.168.1.20:4040' }
    expect((await app.inject({ method: 'GET', url: '/me', headers })).json().gateway).toBe('http://192.168.1.20:4040')
  })

  it('rate-limits wrong pairing codes per client', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await app.inject({ method: 'POST', url: '/pair', payload: { code: 'WRONGCODE1' } })).statusCode).toBe(403)
    }
    expect((await app.inject({ method: 'POST', url: '/pair', payload: { code } })).statusCode).toBe(429)
  })
})
