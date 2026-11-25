import { useEffect, useRef } from 'react'
import { useUnreadMessages } from '../pages/Messages'
import { useUnreadCount } from '../pages/Notifications'

const ENABLED_KEY = 'socialkey.systemNotifications'

export function systemNotificationsEnabled(): boolean {
  try {
    return (
      localStorage.getItem(ENABLED_KEY) === 'on' && 'Notification' in window && Notification.permission === 'granted'
    )
  } catch {
    return false
  }
}

export async function setSystemNotifications(on: boolean): Promise<boolean> {
  if (on && 'Notification' in window && Notification.permission !== 'granted') {
    if ((await Notification.requestPermission()) !== 'granted') return false
  }
  try {
    localStorage.setItem(ENABLED_KEY, on ? 'on' : 'off')
  } catch {
    return false
  }
  return on
}

/**
 * Keeps the tab title's unread count current, and shows a system notification
 * when new activity or messages arrive while the tab is in the background.
 */
export function Alerts() {
  const activity = useUnreadCount()
  const messages = useUnreadMessages()
  const previous = useRef({ activity, messages })

  useEffect(() => {
    const total = activity + messages
    document.title = `${total ? `(${total}) ` : ''}SocialKey`
    const before = previous.current
    previous.current = { activity, messages }
    if (!document.hidden || !systemNotificationsEnabled()) return
    if (messages > before.messages)
      new Notification('SocialKey', {
        body: 'You have a new message',
        icon: './favicon.svg',
        tag: 'socialkey-messages',
      })
    else if (activity > before.activity)
      new Notification('SocialKey', {
        body: 'New activity on your posts',
        icon: './favicon.svg',
        tag: 'socialkey-activity',
      })
  }, [activity, messages])

  return null
}
