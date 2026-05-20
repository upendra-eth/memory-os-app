# Daily Reminder Notification System

## Overview

The Memory OS now includes an intelligent daily reminder system that prompts users to log their entries each day at a scheduled time. This feature uses Zustand for state management and js-cookie for persistent storage.

---

## How It Works

### 1. Initialization
When a user completes onboarding and saves their profile:
```typescript
// components/onboarding-form.tsx
const handleSubmit = () => {
  const result = await saveUserProfile(formData)
  if (result.success) {
    localStorage.setItem('user_email', formData.email)
    initializeDailyReminder(formData.email, '09:00') // Initialize reminder at 9 AM
    onComplete?.()
  }
}
```

This creates a `DailyReminder` object:
```typescript
{
  id: 'reminder_user@example.com',
  userId: 'user@example.com',
  lastReminderDate: '2026-05-17',  // Today's date
  reminderTime: '09:00',            // 9 AM daily
  enabled: true,
  dismissedDates: []
}
```

### 2. Display Logic
Every time the app loads (or every minute), the reminder system checks:
```typescript
const result = getActiveDailyReminder(userId)

if (result.show) {
  // Show sticky notification at bottom-right
  return <DailyReminder userId={userId} />
}
```

The check is simple:
- Has the reminder been shown today? (check `lastReminderDate`)
- Has the user dismissed it? (check `dismissedDates`)
- Is it past the reminder time? (check `reminderTime`)

### 3. User Interaction
The notification appears bottom-right with two options:

**Option A: Click "Add Entry"**
- Navigates to `/add` page
- User pastes ChatGPT output
- Entry is saved and processed
- Notification automatically hides

**Option B: Click "X" to Dismiss**
- Adds today's date to `dismissedDates[]`
- Updates `lastReminderDate` to today
- Notification hides
- Tomorrow at 9 AM, reminder shows again (fresh dismissal state)

### 4. Reset Logic
At midnight (client-side):
- System recognizes date has changed
- `lastReminderDate` is old
- Tomorrow's reminder can show (unless user dismisses)
- No server call needed (all client-side)

---

## Code Architecture

### State Management: `/lib/notification-store.ts`

```typescript
export interface DailyReminder {
  id: string                    // reminder_{userId}
  userId: string                // user@example.com
  lastReminderDate: string      // YYYY-MM-DD
  reminderTime: string          // HH:MM format
  enabled: boolean              // can disable reminders
  dismissedDates: string[]      // dates when dismissed
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      // Store reminders in a Map keyed by userId
      reminders: new Map<string, DailyReminder>(),
      
      // Methods
      addReminder: (reminder) => {},
      updateReminder: (id, updates) => {},
      dismissReminder: (userId, date) => {},
      getReminderForUser: (userId) => {},
      checkShouldShowReminder: (userId) => {}
    }),
    {
      name: 'daily-reminder-store',
      storage: {
        // Persist to js-cookie instead of localStorage
        getItem: (name) => {
          const stored = Cookies.get(name)
          // Convert serialized data back to Map
        },
        setItem: (name, value) => {
          // Convert Map to array and store in cookie
        },
        removeItem: (name) => Cookies.remove(name)
      }
    }
  )
)
```

### Utility Functions

```typescript
// Initialize reminder on signup
export function initializeDailyReminder(userId: string, reminderTime: string = '09:00') {
  const store = useNotificationStore.getState()
  store.addReminder({
    id: `reminder_${userId}`,
    userId,
    lastReminderDate: new Date().toISOString().split('T')[0],
    reminderTime,
    enabled: true,
    dismissedDates: []
  })
}

// Check if should show and get details
export function getActiveDailyReminder(userId: string) {
  const store = useNotificationStore.getState()
  const shouldShow = store.checkShouldShowReminder(userId)
  const reminder = store.getReminderForUser(userId)
  
  return {
    show: shouldShow && reminder && reminder.enabled,
    reminder,
    message: "Don't forget to log today's entry!"
  }
}

// Dismiss reminder for today
export function dismissDailyReminder(userId: string) {
  const store = useNotificationStore.getState()
  const today = new Date().toISOString().split('T')[0]
  store.dismissReminder(userId, today)
}
```

### UI Components

#### `/components/daily-reminder.tsx`
```typescript
'use client'

interface DailyReminderProps {
  userId: string
}

export function DailyReminder({ userId }: DailyReminderProps) {
  const [shouldShow, setShouldShow] = useState(false)
  
  useEffect(() => {
    // Check on mount
    const check = () => {
      const result = getActiveDailyReminder(userId)
      setShouldShow(result.show)
    }
    
    check()
    
    // Recheck every minute
    const interval = setInterval(check, 60000)
    return () => clearInterval(interval)
  }, [userId])
  
  const handleDismiss = () => {
    dismissDailyReminder(userId)
    setShouldShow(false)
  }
  
  if (!shouldShow) return null
  
  return (
    <div className="fixed bottom-4 right-4 max-w-sm z-50">
      <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
        <h3 className="font-semibold text-amber-900 mb-1">Daily Log Reminder</h3>
        <p className="text-sm text-amber-800 mb-3">
          Don't forget to log today's entry!
        </p>
        <div className="flex gap-2">
          <Link href="/add">
            <Button className="bg-amber-600">Add Entry</Button>
          </Link>
          <Button variant="ghost" onClick={handleDismiss}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

#### `/components/reminder-wrapper.tsx`
```typescript
'use client'

export function ReminderWrapper({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string>('')
  
  useEffect(() => {
    // Get user ID from localStorage (set during onboarding)
    const email = localStorage.getItem('user_email')
    if (email) {
      setUserId(email)
      // Initialize if not already done
      initializeDailyReminder(email, '09:00')
    }
  }, [])
  
  return (
    <>
      {children}
      {userId && <DailyReminder userId={userId} />}
    </>
  )
}
```

#### Root Layout Integration
```typescript
// app/layout.tsx
import { ReminderWrapper } from '@/components/reminder-wrapper'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <ReminderWrapper>{children}</ReminderWrapper>
        {/* ... other layout content ... */}
      </body>
    </html>
  )
}
```

---

## Data Flow

### Initialization Flow
```
User completes onboarding
    ↓
onboarding-form.tsx calls saveUserProfile()
    ↓
Profile saved to database
    ↓
localStorage.setItem('user_email', email)
    ↓
initializeDailyReminder(email, '09:00')
    ↓
Zustand store creates DailyReminder object
    ↓
Store persisted to js-cookie
    ↓
ReminderWrapper component initializes on app load
```

### Daily Display Flow
```
App loads
    ↓
ReminderWrapper reads 'user_email' from localStorage
    ↓
Calls getActiveDailyReminder(userId)
    ↓
Zustand store checks:
  - Is enabled?
  - Is today's date new?
  - Was dismissed today?
    ↓
If yes to all checks: show = true
    ↓
DailyReminder component renders sticky notification
    ↓
Re-checks every minute (setInterval)
```

### Dismissal Flow
```
User clicks "X" button
    ↓
handleDismiss() called
    ↓
dismissDailyReminder(userId)
    ↓
Zustand store adds today's date to dismissedDates[]
    ↓
Store updates lastReminderDate to today
    ↓
Store persisted to js-cookie
    ↓
DailyReminder sets shouldShow = false
    ↓
Notification hides
    ↓
Tomorrow: date changes → checkShouldShowReminder() returns true again
```

---

## Configuration

### Change Reminder Time
```typescript
// Default is 9:00 AM
initializeDailyReminder(userId, '14:30')  // 2:30 PM
initializeDailyReminder(userId, '06:00')  // 6:00 AM
```

### Disable Reminders
```typescript
import { useNotificationStore } from '@/lib/notification-store'

const store = useNotificationStore.getState()
store.updateReminder(userId, { enabled: false })
```

### Get Current Reminder State
```typescript
import { useNotificationStore } from '@/lib/notification-store'

const store = useNotificationStore.getState()
const reminder = store.getReminderForUser(userId)
console.log(reminder)
// Output:
// {
//   id: 'reminder_user@example.com',
//   userId: 'user@example.com',
//   lastReminderDate: '2026-05-17',
//   reminderTime: '09:00',
//   enabled: true,
//   dismissedDates: ['2026-05-16', '2026-05-15']
// }
```

---

## Testing

### Manual Test Checklist

1. **Initialization Test**
   - [ ] Complete onboarding
   - [ ] Check browser cookie: `daily-reminder-store` exists
   - [ ] Verify email in localStorage: `user_email`

2. **Display Test**
   - [ ] Reload page at 9 AM (or set custom time in config)
   - [ ] Notification appears bottom-right
   - [ ] Contains "Add Entry" button and dismiss "X"

3. **Dismissal Test**
   - [ ] Click "X" button
   - [ ] Notification disappears
   - [ ] Refresh page → notification doesn't reappear (same day)
   - [ ] Next day → notification reappears

4. **Navigation Test**
   - [ ] Click "Add Entry" button
   - [ ] Navigates to `/add` page
   - [ ] Can paste entry and save

5. **Multi-Device Test**
   - [ ] Log in on mobile
   - [ ] Check reminder appears at scheduled time
   - [ ] Dismiss on mobile
   - [ ] Check other devices don't show reminder

---

## Browser DevTools Debugging

### Check Cookie
```javascript
// In browser console
document.cookie
// Look for: daily-reminder-store=...
```

### Check Zustand Store
```javascript
// In browser console
import { useNotificationStore } from '@/lib/notification-store'
const store = useNotificationStore.getState()
console.log(store.reminders)
```

### Check localStorage
```javascript
// In browser console
localStorage.getItem('user_email')
// Output: user@example.com
```

### Trigger Manual Check
```javascript
// In browser console
import { getActiveDailyReminder } from '@/lib/notification-store'
getActiveDailyReminder('user@example.com')
// Output: { show: true/false, reminder: {...}, message: "..." }
```

---

## Performance Considerations

- **Storage**: Cookie (persistent across browser sessions)
- **Size**: ~500 bytes per reminder
- **Check Frequency**: Every minute (low CPU impact)
- **Re-render**: Only triggers if state changes
- **Network**: Zero network calls (all client-side)

---

## Limitations & Future Enhancements

### Current Limitations
- Time-based (not server-aware of user's actual current time)
- Checks every minute (not exact to the minute)
- Requires page reload to reset at midnight
- No timezone handling (uses local time)

### Future Improvements
- [ ] Server-side scheduling with pg_cron
- [ ] Push notifications instead of sticky UI
- [ ] Timezone-aware scheduling
- [ ] Customizable reminder frequency (daily/weekly/etc)
- [ ] Multiple reminders per day
- [ ] Different reminders for different actions (add, ask, review)
- [ ] Analytics: track reminder dismissal rates

---

## Troubleshooting

### Reminder Not Showing
1. Check if user_email in localStorage: `localStorage.getItem('user_email')`
2. Check if cookie exists: Look for `daily-reminder-store` in DevTools → Application
3. Check browser console for errors
4. Ensure ReminderWrapper is in layout.tsx
5. Check if reminder is disabled: `enabled: true` in store

### Reminder Shows Multiple Times Per Day
1. Check dismissedDates array: should include today's date
2. Check lastReminderDate: should be today's date
3. Clear cookie and re-initialize: delete cookie, reload, complete onboarding again

### Reminder Doesn't Dismiss
1. Check if dismissDailyReminder is called
2. Check if store update persisted to cookie
3. Try clearing localStorage and restarting app

---

## Architecture Benefits

✅ **Stateless**: No database calls needed
✅ **Fast**: Checks every minute in browser
✅ **Persistent**: Survives browser refresh
✅ **Offline-First**: Works without network
✅ **Lightweight**: ~500 bytes per reminder
✅ **Type-Safe**: Full TypeScript support
✅ **Reusable**: Can add more reminder types easily

---

## Summary

The daily reminder system provides a seamless way to encourage users to maintain their logging habit. By combining Zustand for state management and js-cookie for persistence, the system is lightweight, fast, and offline-capable. The sticky notification appears once per day and can be dismissed with a single click, making it non-intrusive while still effective.

For future enhancements, consider migrating to server-side scheduling with pg_cron and push notifications for better timezone-aware scheduling and cross-device support.

---

**Implementation Complete** ✅
