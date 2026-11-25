/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_URL?: string
  readonly VITE_GATEWAYS?: string
  readonly VITE_ROUTERS?: string
  readonly VITE_MEDIA_GATEWAYS?: string
  /** Public URL of the hosted web app, used for share links. */
  readonly VITE_PUBLIC_URL?: string
  /** Where visitors download the desktop app (e.g. a GitHub releases page). */
  readonly VITE_DOWNLOAD_URL?: string
}
