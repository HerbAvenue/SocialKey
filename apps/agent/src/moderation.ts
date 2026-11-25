import { readFile, rename, writeFile } from 'node:fs/promises'

export interface ModerationLists {
  muted: string[]
  blocked: string[]
}

/**
 * Who you've muted or blocked. Kept only on your computer, never published:
 * the people on these lists can't see that they're on them.
 */
export class Moderation {
  private constructor(
    private readonly file: string,
    private lists: ModerationLists,
  ) {}

  static async load(file: string): Promise<Moderation> {
    try {
      const raw = JSON.parse(await readFile(file, 'utf8')) as Partial<ModerationLists>
      return new Moderation(file, { muted: raw.muted ?? [], blocked: raw.blocked ?? [] })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      return new Moderation(file, { muted: [], blocked: [] })
    }
  }

  get current(): ModerationLists {
    return { muted: [...this.lists.muted], blocked: [...this.lists.blocked] }
  }

  async set(list: keyof ModerationLists, did: string, on: boolean): Promise<ModerationLists> {
    const without = this.lists[list].filter((d) => d !== did)
    this.lists = { ...this.lists, [list]: on ? [did, ...without] : without }
    await writeFile(`${this.file}.tmp`, JSON.stringify(this.lists, null, 2), { mode: 0o600 })
    await rename(`${this.file}.tmp`, this.file)
    return this.current
  }
}
