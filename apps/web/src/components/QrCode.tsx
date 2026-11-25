import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    void QRCode.toDataURL(value, { width: size * 2, margin: 1, color: { dark: '#1c1917', light: '#ffffff' } }).then(
      setSrc,
    )
  }, [value, size])
  return src ? (
    <img src={src} alt="QR code" width={size} height={size} className="rounded-xl" />
  ) : (
    <div style={{ width: size, height: size }} />
  )
}
