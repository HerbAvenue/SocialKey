import { Laptop, Monitor, SquareTerminal } from 'lucide-react'
import { Card, PageHeader } from '../components/ui'

/** Shown when no download URL is configured: how to get the desktop app. */
export function GetApp() {
  return (
    <>
      <PageHeader title="Get SocialKey" back />
      <div className="space-y-4 p-4">
        <p>
          The SocialKey desktop app runs your profile on your computer. It includes everything it needs, including its
          own IPFS node.
        </p>
        <Card>
          <h2 className="flex items-center gap-2 font-bold">
            <Monitor className="size-5" /> Windows
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Run <code>SocialKey.Setup.exe</code>. No admin rights needed. If SmartScreen warns you, click More info,
            then Run anyway. Allow it through the firewall when asked so others can reach your profile.
          </p>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 font-bold">
            <Laptop className="size-5" /> macOS
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Open the <code>-arm64.dmg</code> on Apple Silicon Macs (M1 and newer), or the other <code>.dmg</code> on
            Intel Macs, and drag SocialKey to Applications. The first time, right-click it and choose Open.
          </p>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 font-bold">
            <SquareTerminal className="size-5" /> Linux
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Download <code>SocialKey.AppImage</code>, make it executable, and run it.
          </p>
        </Card>
        <p className="text-sm text-stone-500">
          Building from source: <code>pnpm install && pnpm --filter @socialkey/desktop dist</code>
        </p>
      </div>
    </>
  )
}
