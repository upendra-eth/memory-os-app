/**
 * Admin allow-list. Admins bypass AI rate limits and can raise other users'
 * limits. veerupendrasingh@gmail.com is an admin by default; extend or override
 * via the ADMIN_EMAILS env var (comma-separated). Server-only — do not import
 * into client components (keeps the list out of the browser bundle).
 */
const DEFAULT_ADMINS = ['veerupendrasingh@gmail.com']

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS
  ? process.env.ADMIN_EMAILS.split(',')
  : DEFAULT_ADMINS
)
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase())
}
