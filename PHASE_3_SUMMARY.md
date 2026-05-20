# Phase 3: Timeline & Day View ✅

## Summary
Phase 3 implements chronological entry viewing with two levels of detail: a **Timeline** showing all logged days in reverse chronological order with quick stats (calories, sleep, workout count), and a **Day View** showing a full-day breakdown with stats strip at top (sleep/quality, calories vs TDEE, mood/stress, workout count) and expandable entries with granular data (nutrition, workouts, reflection, social, etc). Full prev/next day navigation and "Today" quick jump.

## Database Dependencies
Uses entries and daily_aggregates tables from Phase 1-2:
- **entries**: Raw data, narrative, extracted JSON with 20 dimensions
- **daily_aggregates**: Pre-computed daily summaries (calories, sleep, mood, workouts)

## Implemented Features

### 1. Day Actions Server (`app/day-actions.ts`)
Core data-fetching functions:
- **getEntriesForDate()**: Fetch all entries for a date, ordered chronologically by created_at
- **getDailyAggregate()**: Fetch pre-computed daily aggregate for date
- **getUserTDEE()**: Calculate TDEE from user profile (BMR × activity level)
  - Uses onboarding-calculated metrics for accurate calorie targets

All functions include proper error handling and user authentication via email.

### 2. Day Stats Strip Component (`components/day-stats-strip.tsx`)
Dashboard-style header showing key daily metrics:
- **Sleep**: Hours + quality (1-10) with progress bar vs 8-hour target
- **Calories**: Total vs TDEE with balance indicator (+200 kcal, -300 kcal, etc)
- **Mood**: Average score (1-10) with stress level note, color-coded (green 4+, amber 3+, red)
- **Workouts**: Count + total duration in minutes

Uses:
- `Progress` component for visual bars
- Color coding (blue/orange/green) for quick status
- Icons for instant visual recognition

### 3. Entry Card Component (`components/entry-card.tsx`)
Individual entry display with expand/collapse:
- **Header**: Time of day, first 2 lines of narrative, expand toggle
- **Summary Tags**: Quick badges showing key data (weight, sleep, calories, workouts, symptoms, emotions)
- **Expanded Details**:
  - Summary paragraph
  - Nutrition table (food, portion, calories, protein)
  - Workouts list (exercise, sets × reps @ weight)
  - Reflection section (rating, high, low, lesson)
  - Social interactions (person, mode, quality)

Uses icon numbering (1, 2, 3...) for timeline position and ChevronUp/Down for expand state.

### 4. Day View Page (`app/day/[date]/page.tsx`)
Full-day detailed view with:
- **Header**: Date display (e.g., "Friday, May 17, 2024"), entry count, "Today" badge if applicable
- **Navigation**: Previous/Next day buttons, "Today" quick jump
- **Stats Strip**: Calls DayStatsStrip component with aggregate data
- **Timeline Feed**: All entries for day in chronological order (oldest → newest)
- **Empty State**: "No entries for this day" with link to /add

Features:
- Client-side date handling (YYYY-MM-DD format)
- Real-time route updates when navigation changes
- Parallel data loading (entries + aggregate + TDEE)
- Date parsing with fallback to today
- Responsive layout for mobile/desktop

### 5. Timeline Page (`app/timeline/page.tsx`)
Overview of logged days across time periods:
- **Range Selector**: Tabs for Last 7 Days, Last 30 Days, Last 90 Days
- **Reverse Chronological List**: Most recent day first
- **Day Cards**: Shows:
  - Date (formatted: "Fri, May 17")
  - "Today" badge if applicable
  - Entry count
  - Aggregate data (calories, sleep, workouts) inline
  - Hover effect with accent border
  - Clickable to jump to /day/[date]

Features:
- Parallel data loading from entries + daily_aggregates
- Date range calculated server-side before query
- Aggregated stats from daily_aggregates table for performance
- Empty state with "Start logging" CTA
- Client-side storage of user email via localStorage

### 6. Updated Navigation
Added `/timeline` route with Clock icon to main navigation menu between Dashboard and Chat. Now links to primary entry viewing interface.

## Full Feature Flow

### Day View Journey
1. User clicks "Timeline" in nav or date card from timeline
2. Day view loads entries for selected date + aggregate + TDEE
3. **Stats Strip** displays key metrics in 4-column grid
4. **Timeline** shows chronological entries (oldest first in feed, newest at bottom)
5. User clicks entry to expand and see full details
6. **Prev/Next buttons** navigate to adjacent days
7. **Today button** provides quick return to current date

### Timeline Journey
1. User clicks "Timeline" in nav
2. Defaults to "Last 30 Days" range
3. Card for each logged day shows summary stats
4. User clicks card to jump to full day view
5. Can switch range (7/30/90 days) via tabs

## Data Structure

### Daily Aggregate Row
```
{
  log_date: "2024-05-17",
  calories: 2350,
  sleep_hours: 7.5,
  sleep_quality: 7,
  mood_score: 7,
  stress_level: 5,
  workouts_count: 1,
  workout_duration_min: 45
}
```

### Entry (minimal extract for display)
```
{
  id: "abc123",
  created_at: "2024-05-17T14:30:00Z",
  narrative_text: "Walked 5km in the morning, light lunch...",
  extracted_json: {
    nutrition: [...],
    workouts: [...],
    reflection: {...},
    ...
  }
}
```

## Performance Optimizations

1. **Pre-computed Aggregates**: Daily_aggregates table provides O(1) stats lookup instead of SUM queries
2. **Parallel Loading**: All data fetches (entries + aggregate + TDEE) run in Promise.all()
3. **Timeline Index**: Entries indexed on created_at for fast chronological queries
4. **Date Filtering**: Efficient BETWEEN queries using date boundaries
5. **Lazy Expansion**: Entry details only rendered when expanded

## Design Patterns

1. **Stats Strip**: Dashboard-style 4-column grid, consistent with Phase 1 profile metrics
2. **Card Expansion**: Expand/collapse on click, preserves scroll position
3. **Breadcrumb Navigation**: Prev/Next + Today button provides clear navigation
4. **Color Coding**: Green/amber/red for quick status assessment
5. **Empty State**: Clear CTA to add first entry
6. **Timeline List**: Reverse chronological, clickable cards with hover effects

## File Structure
```
app/
  day/
    [date]/
      page.tsx              # Day view with stats strip + entries
  timeline/
    page.tsx                # Timeline overview (7/30/90 days)
  day-actions.ts            # Server actions for day data
components/
  day-stats-strip.tsx       # Stats header component
  entry-card.tsx            # Individual entry with expand
  navigation.tsx            # Updated with Timeline route
lib/
  types.ts                  # Updated Entry type with summary
```

## Key Design Decisions

1. **Two-Level Navigation**: Timeline for overview + Day for details
   - Quick scanning on timeline, granular detail on day view
   - Prev/next navigation for diary-like experience

2. **Pre-computed Aggregates**: Avoid expensive daily recalculation
   - Populated by Phase 2's entry save flow
   - O(1) stats lookup on day view load

3. **Expandable Entries**: Keep timeline compact by default
   - Summary tags for quick glance
   - Full details on expansion
   - Reduces cognitive overload

4. **Client-Side Route Updates**: Use Next.js router.push for smooth navigation
   - Prevents full page reload
   - Maintains scroll position
   - Better UX than form-based date selection

5. **TDEE Calculation**: Lazy-loaded per user
   - Reuses health metrics from Phase 1 onboarding
   - Personalizes calorie targets based on activity level
   - Enables accurate surplus/deficit tracking

## Testing Notes
- Day view renders correctly for dates with entries and without
- Timeline displays in reverse chronological order
- Prev/Next navigation updates URL and reloads data
- "Today" button jumps to current date
- Stats strip shows correct totals (calories sum, mood average)
- Entry expansion toggles smoothly
- Date parsing handles edge cases (leap year, month boundaries)
- TypeScript passes full type check
- All async operations have proper error handling

## Integration with Previous Phases

**Phase 1 (Onboarding)**: Uses user_profile metrics (height, weight, activity level) for TDEE calculation

**Phase 2 (Entry Pipeline)**: Consumes entries table and daily_aggregates (updated by entry save), uses extraction schema for display

**Phases 4-13**: Timeline and day view become foundation for dashboard filters, audit inbox navigation, and AI question context

## Metrics
- 1 day actions server file (3 functions) ✅
- 1 day stats strip component ✅
- 1 entry card component (with expand) ✅
- 1 day view page with full navigation ✅
- 1 timeline page with range selector ✅
- Navigation updated with Timeline route ✅
- Types updated with Entry.summary field ✅
- ~850 lines of code ✅
- Zero TypeScript errors ✅

## Next Phase (Phase 4)
Implement **Profile Dashboard**:
1. Editable sections matching onboarding
2. BMR/TDEE/BMI calculation display
3. Body metrics log form + line chart
4. Completeness bar highlighting empty fields

Phase 4 builds a dedicated settings/profile area where users can review and update their baseline health data that powers all calculations throughout the app.

**Phase 3 Complete! Timeline and day views fully functional.**
