# Phase 4: Profile Dashboard ✅

## Summary
Phase 4 implements a dedicated profile settings page where users review, edit, and update their baseline health data (height, weight, activity level, goals, etc). The page displays live-calculated BMR, TDEE, and BMI metrics at the top, organized into three tabs (Basics, Health, Goals) with editable fields, and a single Save button to persist all changes. All calculations use formulas from Phase 1 onboarding with real-time updates.

## Database Dependencies
Uses user_profile table (created in Phase 1 onboarding):
- Stores all profile fields (demographics, health metrics, goals)
- Updated by Phase 4 save action
- Read by all phases for calculations (BMR, TDEE, TDEE lookup in Phase 3)

## Implemented Features

### 1. Profile Page (`app/profile/page.tsx`)
Top-level page component:
- Server-side metadata (title, description)
- Page header with title and description
- Hosts ProfileContent component
- Consistent layout with other pages

### 2. Profile Content Component (`components/profile-content.tsx`)
Main client component with full editing UI:

**Live Metrics Display**:
- **BMR Card** (blue): Basal Metabolic Rate - kcal/day at rest (Mifflin-St Jeor formula)
- **TDEE Card** (orange): Total Daily Energy Expenditure - kcal/day with activity level multiplier
- **BMI Card** (green): Body Mass Index with classification (underweight/normal/overweight/obese)
- All update in real-time as user edits height/weight/activity level

**Three Tabs**:

**Basics Tab**:
- Full Name (text input)
- Date of Birth (date input)
- Gender (select: male/female/other)
- Location (text input)
- Timezone (select: 7 global options - IST, EST, PST, GMT, CET, JST, AEDT)

**Health Tab**:
- Height (cm) - number input
- Current Weight (kg) - decimal input
- Target Weight (kg) - decimal input
- Activity Level (select: sedentary/light/moderate/active/very_active)
- Diet Preference (select: omnivore/vegetarian/vegan/keto/paleo/other)

**Goals Tab**:
- Fitness Goals (comma-separated text: "build muscle, lose weight, improve endurance")
- Health Goals (comma-separated text: "better sleep, reduce stress, better digestion")
- Both parsed from comma-delimited strings on save/load

**Features**:
- Initial load from Supabase via user_profile table
- Real-time BMR/TDEE/BMI calculations as user types
- Validation alerts (error/success states)
- Loading skeleton during initial load
- Disabled save button while saving
- Toast notification on successful save
- Responsive grid layout (mobile/desktop)

### 3. Health Metrics Utilities (`lib/health-metrics.ts` - from Phase 1)
Reused calculation functions:
- **calculateBMR()**: Mifflin-St Jeor formula
  - Input: weight_kg, height_cm, age, gender
  - Returns: kcal/day resting
  - Formula: 10*kg + 6.25*cm - 5*age + (5 for male, -161 for female)
  
- **calculateTDEE()**: Harris-Benedict multiplier
  - Input: bmr, activity_level
  - Returns: kcal/day with activity
  - Multipliers: 1.2 (sedentary), 1.375 (light), 1.55 (moderate), 1.725 (active), 1.9 (very_active)

- **calculateBMI()**: Body mass index
  - Input: weight_kg, height_cm
  - Returns: kg/m²
  - Formula: weight_kg / (height_m²)

### 4. Navigation Update
Added `/profile` route with User icon to nav menu between Explore and Ingestor.

## Data Flow

### Load Profile
1. Component mounts, fetches from Supabase using user_email from localStorage
2. Populates form fields with existing values
3. Calculations run on fields with values
4. Displays loading state until query completes

### Edit Profile
1. User types in any input field
2. React state updates in real-time
3. BMR/TDEE/BMI recalculate instantly
4. No backend call until Save

### Save Profile
1. User clicks "Save Changes"
2. Button disabled, shows spinner
3. All form data (including comma-delimited arrays) sent to Supabase
4. Update query on user_profile with user_email match
5. Success/error toast displayed
6. Form re-enabled

## Calculation Examples

### Example: 70kg, 175cm, male, moderate activity
- **BMR**: 10×70 + 6.25×175 - 5×30 + 5 = 1,666 kcal
- **TDEE**: 1,666 × 1.55 = 2,582 kcal
- **BMI**: 70 / (1.75²) = 22.9 (normal)

### Timezone Support
Seven global timezones provided:
- Asia/Kolkata (IST) - 5:30 UTC
- America/New_York (EST) - 5:00 UTC
- America/Los_Angeles (PST) - 8:00 UTC
- Europe/London (GMT) - 0:00 UTC
- Europe/Paris (CET) - 1:00 UTC
- Asia/Tokyo (JST) - 9:00 UTC
- Australia/Sydney (AEDT) - 11:00 UTC

Stored in user_profile for timezone-aware calculations in future phases.

## Component Structure
```
ProfileContent
├── Metrics Cards (BMR, TDEE, BMI)
├── Error/Success Alerts
├── Tabs (Basics, Health, Goals)
│   ├── Basics Tab
│   │   ├── Full Name
│   │   ├── DOB + Gender
│   │   ├── Location + Timezone
│   ├── Health Tab
│   │   ├── Height + Current Weight
│   │   ├── Target Weight + Activity
│   │   ├── Diet Preference
│   ├── Goals Tab
│   │   ├── Fitness Goals
│   │   ├── Health Goals
└── Save Button
```

## UI/UX Patterns

1. **Live Calculations**: BMR/TDEE/BMI update as user types
   - Gives immediate feedback on lifestyle impact
   - No need to save first to see results

2. **Metric Cards**: Colored badges (blue/orange/green) for quick visual reference
   - Blue: resting metabolism
   - Orange: activity-adjusted
   - Green: body composition

3. **Tabs**: Logical grouping of related fields
   - Basics: demographics
   - Health: body + diet
   - Goals: aspirations

4. **Comma-Delimited Arrays**: Comma-separated text for flexible goal lists
   - User-friendly input (no JSON)
   - Automatically parsed/serialized on load/save

5. **Loading States**: Skeleton during initial fetch, spinner during save
   - Clear feedback on async operations

## Data Persistence

**On Save**:
- All form fields serialized to user_profile row
- Goals converted to arrays (split on comma)
- Single UPDATE query via Supabase
- Error handling with toast display

**On Load**:
- Fetch single row from user_profile via email
- Goals converted to comma-delimited strings for display
- Empty values handled gracefully ('' or undefined)

## Testing Notes
- Profile loads correctly with and without existing data
- BMR/TDEE/BMI update on field changes
- All tabs display without errors
- Save button disabled while saving
- Success/error messages display
- localStorage user_email handled (email required)
- Form values persist after save
- TypeScript passes full check
- Responsive on mobile/desktop

## Integration with Previous Phases

**Phase 1 (Onboarding)**: Profile page extends onboarding with edit capability for all fields

**Phase 2 (Entry Pipeline)**: Profile data (weight, activity level) used for TDEE calculation in entry saving

**Phase 3 (Timeline)**: Profile TDEE used to calculate calorie surplus/deficit in day stats strip

**Phase 5-13**: Profile data becomes input for all advanced dashboards, AI insights, and analysis

## Metrics
- 1 profile page ✅
- 1 profile content component (392 lines) ✅
- 3 organized tabs (Basics, Health, Goals) ✅
- Live BMR/TDEE/BMI calculations ✅
- 7 timezone options ✅
- Navigation updated with Profile route ✅
- Full form validation and error handling ✅
- Zero TypeScript errors ✅

## Next Phase (Phase 5-13: Advanced Features)
Remaining phases implement:
- **Phase 5**: Body & Mood Dashboard (sleep, energy, mood, symptoms, stress/anxiety/focus)
- **Phase 6**: Nutrition & Fitness Dashboard (calorie balance, macros, workout progression)
- **Phase 7**: Ask Mode (RAG with embeddings + Gemini)
- **Phase 8**: Audit Inbox (pending item review + entity management)
- **Phase 9**: Day Digests (nightly Edge Function summary + patterns)
- **Phase 10**: Lab Reports (PDF upload, vision extraction, analysis)
- **Phase 11**: AI Question Loop (contextual questions, bell icon, snooze)
- **Phase 12**: Inline Entity Detection (medical detector, auto-audit queue)
- **Phase 13**: PWA (manifest, service worker, offline shell)

**Phase 4 Complete! Profile dashboard fully functional.**
