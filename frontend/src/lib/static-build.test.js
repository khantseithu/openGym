// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = p => readFileSync(join(root, p), 'utf8')
const KEY = 'gym_state_v1'

describe('static build (VITE_STATIC=1)', () => {
  let fetchSpy
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    vi.stubEnv('VITE_STATIC', '1')
    fetchSpy = vi.fn(() => Promise.reject(new Error('no network in this test')))
    vi.stubGlobal('fetch', fetchSpy)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('never reaches for a server', async () => {
    const { api, apiBlob, apiUpload, beacon } = await import('./api.js')
    await expect(api('/api/me')).rejects.toMatchObject({ code: 'no-server', status: 0 })
    await expect(apiBlob('/api/media/x')).rejects.toMatchObject({ code: 'no-server' })
    await expect(apiUpload('/api/media/x', new Blob(['x']), 'image/png')).rejects.toMatchObject({ code: 'no-server' })
    expect(beacon('/api/activity', {})).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('offers no web push', async () => {
    const { pushSupported } = await import('./push.js')
    expect(pushSupported()).toBe(false)
  })

  it('boots straight into the app, empty, with no example data and no request', async () => {
    const { useStore } = await import('../store/useStore.js')
    await useStore.getState().boot()
    const st = useStore.getState()
    expect(st.ready).toBe(true)
    expect(st.isGuest()).toBe(true)
    expect(st.S.workouts || []).toEqual([])
    expect(localStorage.getItem('gym_demo_seeded_v1')).toBe(null)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps a stored history across a boot', async () => {
    const workout = { id: 'w1', date: '2026-10-01', exercises: [] }
    localStorage.setItem(KEY, JSON.stringify({ workouts: [workout] }))
    const { useStore } = await import('../store/useStore.js')
    await useStore.getState().boot()
    expect(useStore.getState().S.workouts.map(w => w.id)).toEqual(['w1'])
    expect(JSON.parse(localStorage.getItem(KEY)).workouts.map(w => w.id)).toEqual(['w1'])
  })

  it('does not fall over on a corrupted store, and stays in the app', async () => {
    localStorage.setItem(KEY, '{not json')
    const { useStore } = await import('../store/useStore.js')
    await useStore.getState().boot()
    expect(useStore.getState().ready).toBe(true)
    expect(useStore.getState().isGuest()).toBe(true)
    expect(localStorage.getItem(KEY + '_unreadable')).toBe('{not json')
  })
})

describe('vercel.json', () => {
  const cfg = JSON.parse(read('vercel.json'))
  const dockerCsp = read('web/Dockerfile').match(/^ENV CONTENT_SECURITY_POLICY="([^"]*)"$/m)[1]

  it('sends the same Content-Security-Policy as the web image, the inline script hash included', () => {
    expect(cfg.routes[0].headers['Content-Security-Policy']).toBe(dockerCsp)
  })
  it('deploys no functions, and answers a stray /api path 404 rather than with the app', () => {
    expect(cfg.functions).toBeUndefined()
    const api = cfg.routes.find(r => r.status === 404 && new RegExp('^' + r.src + '$').test('/api/me'))
    expect(api).toBeTruthy()
  })
  it('keeps the licensed media to its own origin', () => {
    const media = cfg.routes.find(r => r.src.startsWith('/exercise-media'))
    expect(media.headers['Cross-Origin-Resource-Policy']).toBe('same-origin')
  })
})
