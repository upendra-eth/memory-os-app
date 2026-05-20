import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import Cookies from 'js-cookie'

export interface DailyReminder {
  id: string
  userId: string
  lastReminderDate: string // ISO date YYYY-MM-DD
  reminderTime: string // HH:MM format (default 9:00)
  enabled: boolean
  dismissedDates: string[] // Dates when user dismissed reminder
}

interface NotificationStore {
  reminders: Map<string, DailyReminder>
  addReminder: (reminder: DailyReminder) => void
  updateReminder: (id: string, updates: Partial<DailyReminder>) => void
  dismissReminder: (userId: string, date: string) => void
  getReminderForUser: (userId: string) => DailyReminder | undefined
  checkShouldShowReminder: (userId: string) => boolean
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      reminders: new Map(),

      addReminder: (reminder) => {
        set((state) => {
          const newReminders = new Map(state.reminders)
          newReminders.set(reminder.userId, reminder)
          return { reminders: newReminders }
        })
      },

      updateReminder: (id, updates) => {
        set((state) => {
          const reminder = state.reminders.get(id)
          if (!reminder) return state

          const newReminders = new Map(state.reminders)
          newReminders.set(id, { ...reminder, ...updates })
          return { reminders: newReminders }
        })
      },

      dismissReminder: (userId, date) => {
        set((state) => {
          const reminder = state.reminders.get(userId)
          if (!reminder) return state

          const newReminders = new Map(state.reminders)
          newReminders.set(userId, {
            ...reminder,
            dismissedDates: [...(reminder.dismissedDates || []), date],
            lastReminderDate: date,
          })
          return { reminders: newReminders }
        })
      },

      getReminderForUser: (userId) => {
        return get().reminders.get(userId)
      },

      checkShouldShowReminder: (userId) => {
        const reminder = get().reminders.get(userId)
        if (!reminder || !reminder.enabled) return false

        const today = new Date().toISOString().split('T')[0]
        const lastDate = reminder.lastReminderDate

        // Show if we haven't reminded today
        if (lastDate !== today) {
          // Check if it's been dismissed today
          const wasDismissedToday = reminder.dismissedDates?.includes(today)
          return !wasDismissedToday
        }

        return false
      },
    }),
    {
      name: 'daily-reminder-store',
      storage: {
        getItem: (name) => {
          const stored = Cookies.get(name)
          if (!stored) return null

          try {
            const data = JSON.parse(stored)
            // Convert reminders array back to Map
            if (data.state && Array.isArray(data.state.reminders)) {
              data.state.reminders = new Map(data.state.reminders)
            }
            return data
          } catch {
            return null
          }
        },
        setItem: (name, value) => {
          const toStore = {
            ...value,
            state: {
              ...value.state,
              // Convert Map to array for serialization
              reminders:
                value.state.reminders instanceof Map
                  ? Array.from(value.state.reminders.entries())
                  : value.state.reminders,
            },
          }
          Cookies.set(name, JSON.stringify(toStore), { expires: 365 })
        },
        removeItem: (name) => {
          Cookies.remove(name)
        },
      },
    }
  )
)

/**
 * Initialize daily reminder for a user
 * Call this after user profile creation
 */
export function initializeDailyReminder(userId: string, reminderTime: string = '09:00') {
  const store = useNotificationStore.getState()
  const existingReminder = store.getReminderForUser(userId)

  if (!existingReminder) {
    store.addReminder({
      id: `reminder_${userId}`,
      userId,
      lastReminderDate: new Date().toISOString().split('T')[0],
      reminderTime,
      enabled: true,
      dismissedDates: [],
    })
  }
}

/**
 * Check if should show reminder and get reminder details
 */
export function getActiveDailyReminder(userId: string) {
  const store = useNotificationStore.getState()
  const shouldShow = store.checkShouldShowReminder(userId)
  const reminder = store.getReminderForUser(userId)

  if (shouldShow && reminder) {
    return {
      show: true,
      reminder,
      message: "Don't forget to log today's entry!",
    }
  }

  return { show: false, reminder: null, message: null }
}

/**
 * Mark reminder as dismissed for today
 */
export function dismissDailyReminder(userId: string) {
  const store = useNotificationStore.getState()
  const today = new Date().toISOString().split('T')[0]
  store.dismissReminder(userId, today)
}
