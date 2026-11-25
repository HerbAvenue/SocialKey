import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateSecretKey, identityFromSecretKey } from '@socialkey/core'
import type { FastifyInstance } from 'fastify'
import { beforeEach, describe, expect, it } from 'vitest'
import { Auth } from '../src/auth'
import { loadConfig } from '../src/config'
import { Publisher } from '../src/publisher'
import { buildServer } from '../src/server'
import { FakeKubo } from './fake-kubo'

describe('agent HTTP API', () => {
  let app: FastifyInstance
  let code: string

  beforeEach(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'socialkey-'))
    await writeFile(join(dir, 'index.html'), '<h1>web</h1>')
    const config = { ...loadConfig({}), dataDir: dir, webRoot: dir }
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
    app = await buildServer({ config, publisher, auth })
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
  })

  it('likes, pins and deletes through the API', async () => {
    const headers = { authorization: `Bearer ${await pair()}` }
    const { cid } = (await app.inject({ method: 'POST', url: '/posts', headers, payload: { text: 'hi' } })).json()
    expect((await app.inject({ method: 'POST', url: '/likes', headers, payload: { cid } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'PUT', url: '/pinned', headers, payload: { cid } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'DELETE', url: `/posts/${cid}`, headers })).statusCode).toBe(200)
    expect((await app.inject({ method: 'DELETE', url: `/posts/${cid}`, headers })).statusCode).toBe(404)
  })
})
