# Memory OS

A personal life-logging PWA. You brain-dump your day to ChatGPT, paste the result into the app, and
Gemini normalizes it into 20 structured dimensions — then Memory OS turns that into dashboards,
training history, per-exercise progress, and AI insights.

> **The core idea:** talk once → paste once → get a queryable, visual record of your life.

```
You ──"log: ..."──▶ ChatGPT ──RAW/NARRATIVE/EXTRACTED──▶ Memory OS /add
                                                            │
                                          Gemini normalizes the EXTRACTED block
                                                            │
                              entries + daily_aggregates (Supabase + pgvector)
                                                            │
                     Dashboard · Training · Progress · Insights · Ask
```

---

## 1. Set up your extraction assistant (do this first)

The app expects pasted text in a specific 3-section format. A **custom instruction** in an LLM produces
it. Pick whichever you prefer — both work the same way:

| | **ChatGPT** | **Google AI Studio** |
|---|---|---|
| Best for | Familiar UI, great voice input on mobile | **Free premium model (Gemini 2.5 Pro)**, huge instruction limit |
| Instruction size | 1,500 chars (Custom Instructions) or ~8k (a GPT/Project) | Very large — the full **Rich** instruction fits easily |
| Use the | Compact version (or Rich in a Project/GPT) | **Rich** version |

➡️ **Full copy-paste prompts + step-by-step setup: [chatgpt-custom-instruction.md](chatgpt-custom-instruction.md).** In short:

**Option A — ChatGPT:** Customize ChatGPT (or create a GPT/Project) → paste the instruction → save.

**Option B — Google AI Studio** (free, more powerful):
1. Open [aistudio.google.com](https://aistudio.google.com) → sign in with Google → **Create Prompt** (Chat).
2. Pick model **Gemini 2.5 Pro**; open **System instructions** and paste the **Rich** instruction.
3. (Optional) set Temperature ~0.3 for consistency, then **Save** the prompt to reuse it.

Either way: replace `83` in the workout formula with your bodyweight (kg). Then any message starting with
`log:` returns a `RAW / NARRATIVE / EXTRACTED` block.

> Both are just **stage 1** (extraction + analysis). The app still uses its own Gemini step to normalize
> that into the schema before saving — so your choice here only affects extraction quality.

## 2. Daily flow

1. **Talk:** `log: woke 7:30, gym chest+back, incline press 12.5x15 / 17.5x9 / 20x5, 300g chicken + curd, stress 6, slept 6h`
2. **Copy** the assistant's full reply.
3. **Add Entry** in the app → pick the day it's for (Today / Yesterday / any date) → paste → **Save**.
4. **Review** it in Dashboard, Training, Progress, and Insights.

> Missed half a day? Later, pick the **same date** and paste the rest — entries stack and daily totals add up automatically.

---

## Features

| Page | What it shows |
|------|---------------|
| **Dashboard** | Today snapshot (calories vs TDEE, protein, sleep, mood, training, energy balance) + Week/Month/Quarter trend charts. |
| **Training** | Every day's full detail — each exercise's sets (`weight × reps`, RPE, assist) and the day's diet + totals. |
| **Progress** | Pick an exercise → date-wise weight history, best lift, estimated 1RM, and a progression chart. |
| **Insights** | **Habits & streaks** (consistency heatmap), **Patterns** (auto-correlations across sleep/mood/calories/etc.), **Mind** (stress/anxiety/focus, emotions, self-talk), and an **AI weekly/monthly review**. |
| **Ask** | Ask questions about your data (RAG over your entries). |
| **Audit** | Review items the normalizer flagged as guessed / ambiguous. |
| **Labs** | Upload lab reports; Gemini extracts and analyzes markers. |
| **Profile** | Onboarding wizard + ongoing progressive profile prompts. |

---

## Local development

Package manager: **pnpm**.

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # production build
pnpm start    # run the production build
pnpm lint     # ESLint
```

Type errors don't fail the build (`next.config.mjs` sets `ignoreBuildErrors`). Run `pnpm exec tsc --noEmit` to type-check.

### Environment (`.env.local`)

```bash
NEXT_PUBLIC_GEMINI_API_KEY=...      # Google Gemini key (used server-side too)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...       # server-only
```

### Database (Supabase)

Enable the `vector` and `uuid-ossp` extensions, then paste the SQL files from
[`supabase/sql/`](supabase/sql/) into the Supabase SQL editor **in this order** (all idempotent):

1. `base-schema.sql` — the 10 core tables.
2. `all-migrations.sql` — extra columns, the `entries.embedding` index, and the `match_entries` RPC.
3. `auth-rls-migration.sql` — auth linkage + strict row-level security. **Run after deploying the app.**
4. `data-backfill.sql` — optional one-time link of a pre-auth profile (edit `legacy_email`).
5. `cron.sql` — optional `pg_cron` schedules for the Edge Functions.

### Test the AI pipeline

```bash
export $(grep NEXT_PUBLIC_GEMINI_API_KEY .env.local | xargs)
npx tsx scripts/test-flow.ts example-text/22may.txt
```

Runs the real normalizer + sanitizer against a sample paste and prints a gap analysis.

---

## Tech

Next.js 15 (App Router) · React · Tailwind v4 · shadcn/ui · Supabase (Postgres + pgvector + Auth/RLS)
· Google Gemini (`gemini-2.5-flash-lite` for normalization, `text-embedding-004` for embeddings) · recharts.

For architecture and conventions, see [CLAUDE.md](CLAUDE.md).
