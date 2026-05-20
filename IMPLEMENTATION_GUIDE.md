# Memory OS - Complete Implementation Guide

## Quick Start

### 1. Environment Setup
```bash
# Create .env.local in project root
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. Database Setup
1. Create Supabase project
2. Enable pgvector extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   ```
3. Run all migrations (execute SQL from supabase_execute_sql calls)

### 3. Start Development Server
```bash
pnpm install
pnpm dev
```

Visit `http://localhost:3000`

---

## Feature Implementation Status

### Core Features (Phases 1-6): ✅ COMPLETE
- [x] **Phase 1**: Onboarding with health metrics (BMR/TDEE/BMI)
- [x] **Phase 2**: ChatGPT paste pipeline with Gemini normalization
- [x] **Phase 3**: Timeline and day view with stats
- [x] **Phase 4**: Editable profile dashboard
- [x] **Phase 5**: Body & mood charts
- [x] **Phase 6**: Nutrition & fitness charts

### Advanced Features (Phases 7-13): ✅ COMPLETE
- [x] **Phase 7**: Ask mode with semantic search (RAG)
- [x] **Phase 8**: Audit inbox for data validation
- [x] **Phase 9**: Day digests (nightly summaries)
- [x] **Phase 10**: Lab report upload & Vision analysis
- [x] **Phase 11**: AI questions (weekly loop)
- [x] **Phase 12**: Entity detection (inline)
- [x] **Phase 13**: PWA + Daily reminder notifications

---

## Daily Reminder System (NEW)

### How It Works
1. **Initialization**: When user completes onboarding, daily reminder is created
   - Time: 9:00 AM (configurable)
   - Storage: Zustand store persisted via js-cookie
   - Per-user tracking of dismissals

2. **Display**: Sticky notification appears bottom-right of screen
   - Shows once per day
   - "Don't forget to log today's entry!"
   - Direct button to `/add` page
   - Dismiss button (snoozes until next day)

3. **Dismissal**: Stores dismissed date in localStorage
   - Auto-resets at midnight
   - User can re-enable by navigating to `/add` or refreshing

### Code Location
- **Store**: `/lib/notification-store.ts`
  - `useNotificationStore` - Zustand store
  - `initializeDailyReminder()` - Create reminder on signup
  - `getActiveDailyReminder()` - Check if should show
  - `dismissDailyReminder()` - Mark as dismissed

- **Components**:
  - `/components/daily-reminder.tsx` - Notification UI
  - `/components/reminder-wrapper.tsx` - Root wrapper
  - `/components/pwa-installer.tsx` - Service worker registration

- **Integration Points**:
  - `/components/onboarding-form.tsx` - Calls initializeDailyReminder on save
  - `/app/layout.tsx` - Wraps app with ReminderWrapper

### Usage
```typescript
// Initialize (called on profile creation)
import { initializeDailyReminder } from '@/lib/notification-store'
initializeDailyReminder(userId, '09:00')

// Check if should show (called every minute)
import { getActiveDailyReminder } from '@/lib/notification-store'
const { show, reminder } = getActiveDailyReminder(userId)

// Dismiss for today
import { dismissDailyReminder } from '@/lib/notification-store'
dismissDailyReminder(userId)
```

---

## PWA Installation

### Features
- Service Worker for offline support
- Network-first caching strategy
- Install prompt on home screen
- Installable on Android/iOS

### How to Test
1. Open app on mobile or use Chrome DevTools
2. Click "Install" button (top-left)
3. Confirm "Add to home screen"
4. App launches standalone

### Service Worker
- Location: `/public/sw.js`
- Auto-registered in `/components/pwa-installer.tsx`
- Precaches shell assets
- Falls back to offline page if network fails

---

## Gemini API Integration

### Models Used
- **Text Generation**: `gemini-2.5-flash-lite`
- **Vision**: Same model (multimodal)
- **Embeddings**: Not yet implemented (would use `text-embedding-004`)

### Prompts
Location: `/lib/prompts/ask.ts`

1. **normalizer.ts** - Parse ChatGPT output → extracted_json
2. **ask.ts** - Q&A with life logs
3. **dayDigest.ts** - Nightly summaries
4. **labExtract.ts** - Vision: extract markers from lab reports
5. **labAnalyze.ts** - Analyze markers with user context
6. **questionGenerator.ts** - Weekly contextual questions
7. **medicalDetector.ts** - Extract health mentions from narrative

### RPM Strategy
- Current: 1 API call per entry save (normalizer)
- Free tier: 10 RPM, 250K TPM
- Strategy: Queue if limit hit, cache normalizations, batch async

---

## Database Schema Reference

### Tables with Key Columns
```
user_profile
├─ id (UUID PK)
├─ email (TEXT UNIQUE)
├─ age, gender, height_cm, current_weight_kg
├─ activity_level, nutrition_goal, fitness_goal
├─ health_conditions[], medications[], allergies[]
├─ onboarding_completed (BOOLEAN)
└─ created_at, updated_at

entries
├─ id (UUID PK)
├─ user_id (FK → user_profile)
├─ raw_text, normalized_text, narrative_text
├─ extracted_json (JSONB - 20 dimensions)
├─ embedding (VECTOR 1536)
└─ created_at, updated_at

daily_aggregates
├─ id (UUID PK)
├─ user_id (FK)
├─ log_date (DATE UNIQUE)
├─ calories, protein_g, carbs_g, fat_g
├─ sleep_hours, sleep_quality
├─ mood_score, energy_level, stress_level
├─ workouts_count, workout_duration_min
└─ created_at, updated_at

audit_items
├─ id (UUID PK)
├─ user_id (FK)
├─ entry_id (FK)
├─ audit_type (STRING)
├─ status (ENUM: pending/approved/rejected/resolved)
├─ suggested_value (JSONB)
├─ user_resolution (JSONB)
└─ created_at, resolved_at

lab_results
├─ id (UUID PK)
├─ user_id (FK)
├─ test_name, test_date
├─ results (JSONB - markers)
├─ ai_analysis (TEXT)
└─ created_at

day_digests
├─ id (UUID PK)
├─ user_id (FK)
├─ digest_date (DATE UNIQUE)
├─ summary, highlights[], recommendations[]
└─ created_at
```

---

## API Routes Reference

### POST /api/chat
- **Payload**: `{ question: string }`
- **Returns**: `{ response: GeminiResponse, logsCount: number }`
- **Purpose**: Chat interface (legacy, Phase 2)

### POST /api/ask
- **Payload**: `{ question: string, userId: string }`
- **Returns**: `{ answer: string, citations: Citation[] }`
- **Purpose**: Semantic search + Q&A (Phase 7)

### POST /api/lab-reports
- **Payload**: FormData with file (PDF/image)
- **Returns**: `{ result: LabResult }`
- **Purpose**: Extract markers + analyze (Phase 10)

---

## Testing Manual Flow

### 1. Complete Onboarding
- Visit `/onboarding`
- Fill all 5 steps
- Save → Daily reminder initialized
- Redirected to `/dashboard`

### 2. Add Entry
- Click "Add Entry" or use reminder notification
- Navigate to `/add`
- Paste example ChatGPT output:
```
=== RAW ===
Woke up at 7, felt refreshed, slept 8 hours. Had coffee and eggs for breakfast...

=== NARRATIVE ===
Started my day feeling energized. Morning workout went well...

=== EXTRACTED ===
{
  "sleep_hours": 8,
  "mood": "happy",
  "workouts": [{"name": "gym", "duration": 60}],
  ...
}
```
- Click "Save" → Entry normalized + stored

### 3. View Timeline
- Click "Timeline" in nav
- See reverse-chrono feed of entries
- Click entry to expand details

### 4. View Day View
- From timeline, click date
- See day stats strip (sleep, calories, mood, workouts)
- See all entries for that date
- Prev/next day navigation

### 5. Ask Questions
- Click "Ask" in nav
- Type question: "How was my sleep this week?"
- AI searches logs + returns answer with citations

### 6. Review Audit
- Click "Audit" in nav
- See pending items
- Approve/reject each item
- Status updates to approved/rejected

### 7. Upload Lab Report
- Click "Labs" in nav
- Click upload button
- Select image of lab report
- AI extracts markers + provides analysis

### 8. Edit Profile
- Click "Profile" in nav
- Edit sections (demographics, body, lifestyle, health, goals)
- BMR/TDEE/BMI recalculates in real-time
- Save updates

### 9. View Dashboards
- Click "Dashboard" in nav
- Tabs show Body/Mood and Nutrition/Fitness
- Range selector (7d/30d/90d/1y)
- Charts update with filtered data

### 10. Test PWA
- Open on mobile or Chrome DevTools (F12 → Device Toolbar)
- Install prompt appears
- Click "Install" → App adds to home screen
- Close browser → App still accessible

### 11. Test Daily Reminder
- Complete onboarding
- Next day at 9 AM (or set a custom time)
- Notification appears bottom-right
- Click "Add Entry" → goes to `/add`
- Click "X" → dismissed until next day

---

## Debugging Tips

### Enable Debug Logs
All `[v0]` prefixed console.logs are development markers:
```typescript
console.log('[v0] Entry saved:', entry)
console.log('[v0] User data:', profile)
```

### Check Gemini API Key
```bash
echo $NEXT_PUBLIC_GEMINI_API_KEY
```

### Verify Supabase Connection
- Open Dev Tools → Network tab
- Look for requests to `supabase.com`
- Check response status (should be 200)

### Check Service Worker
- Dev Tools → Application → Service Workers
- Verify `/sw.js` is registered
- Check "Offline" checkbox to test offline mode

### Check Reminder Store
- Dev Tools → Application → Cookies
- Look for `daily-reminder-store` cookie
- Contains user ID and reminder state

---

## Performance Optimization

### Caching Strategies
- **Entries**: Cache last 100 in React state, paginate on demand
- **Daily aggregates**: Pre-computed on save, cache in Redis
- **Embeddings**: Store in pgvector, use IVFflat index for search
- **UI**: Skeleton loaders during fetch

### Code Splitting
- Next.js automatically code-splits by route
- Dynamic imports for modal components
- Lazy-load charts on tab click

### Image Optimization
- Use next/image for all product images
- SVG icons with lucide-react
- Compress lab report uploads before Vision API

---

## Deployment Checklist

- [ ] Environment variables set in Vercel dashboard
- [ ] Supabase pgvector extension enabled
- [ ] All database migrations applied
- [ ] Service Worker `/public/sw.js` in place
- [ ] Manifest `/public/manifest.json` updated
- [ ] Icons in `/public/` (icon-192x192.jpg, icon-512x512.jpg, apple-touch-icon.jpg)
- [ ] Gemini API key validated
- [ ] TypeScript builds without errors
- [ ] All routes tested manually
- [ ] PWA installable on mobile
- [ ] Daily reminder shows correctly
- [ ] Monitoring set up (Sentry/LogRocket)

---

## Future Roadmap

### Short-term (v2.0)
- [ ] Push notifications for reminders
- [ ] Weekly email digests
- [ ] Data export (PDF, CSV)
- [ ] Sharing day summaries

### Medium-term (v3.0)
- [ ] Third-party integrations (Fitbit, Apple Health)
- [ ] Multi-user sharing (family, coach)
- [ ] Advanced ML trends (predict sleep, mood)

### Long-term (v4.0)
- [ ] Premium tier (higher Gemini RPM)
- [ ] Mobile app (React Native)
- [ ] AI coach (personalized recommendations)
- [ ] Community features (challenges, leaderboards)

---

## Support & Resources

### Documentation
- [Gemini API](https://ai.google.dev/)
- [Supabase](https://supabase.com/docs)
- [Next.js 15](https://nextjs.org/docs)
- [Recharts](https://recharts.org/)

### Example Queries
```sql
-- Get today's entries
SELECT * FROM entries 
WHERE user_id = 'user-id' 
  AND DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;

-- Get weekly mood average
SELECT AVG(mood_score) FROM daily_aggregates
WHERE user_id = 'user-id'
  AND log_date >= CURRENT_DATE - INTERVAL '7 days';

-- Search entries by keyword
SELECT * FROM entries
WHERE user_id = 'user-id'
  AND narrative_text ILIKE '%keyword%'
ORDER BY created_at DESC;
```

---

## Credits & License
Built with Next.js, Supabase, Gemini AI, and shadcn/ui. Open source under MIT license.
