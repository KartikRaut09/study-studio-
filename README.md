# GATE DA Study Studio — Duolingo Edition 🦉🔥

An interactive, gamified GATE DA 2027 preparation studio and intelligent study tracker featuring a four-month timetable, Duolingo-inspired gamification, smart schedule rescheduling, spaced repetition, PYQ tracking, confidence metrics, and focus tools.

**Four-Month Master Plan:** 6 October 2026 – 5 February 2027 · 123 days · 789 study sessions · 29 modules · 150 official syllabus items.

---

## ✨ Features Overview

### 🎨 Duolingo-Inspired Gamification
- **Playful Design & Tactile 3D Buttons:** Built with Duolingo's signature color palette (Feather Green `#58CC02`, Macaw Blue `#1CB0F6`, Fox Orange `#FF9600`, Cardinal Red `#FF4B4B`, Bee Yellow `#FFC800`), bold typography, rounded cards, and 3D pushable buttons.
- **🔥 Study Streak & Interactive Streak Calendar:**
  - Displays your active streak in the top gamification strip with glowing flame animations.
  - Interactive popover modal displaying weekly bubbles (`M T W T F S S`), active streak count, and Streak Freeze protection status.
- **💎 XP & Level Progression System:**
  - Earn XP for every learning action:
    - Session completed: **+10 XP**
    - Actual study hours logged: **+5 XP / hour**
    - Lesson stage checked: **+15 XP**
    - Complete 4-stage topic mastery: **+50 XP**
    - Spaced repetition review: **+25 XP**
  - Progress through 6 ranks:
    - Level 1: 🌱 Novice (0–200 XP)
    - Level 2: 📘 Learner (201–500 XP)
    - Level 3: ⚡ Practitioner (501–1,000 XP)
    - Level 4: 🎓 Scholar (1,001–1,800 XP)
    - Level 5: 🔥 Master (1,801–3,000 XP)
    - Level 6: 👑 GATE Ready (3,001+ XP)
  - Interactive XP modal with level roadmap, celebration sound chimes (Web Audio API), and toast feedback.
- **⏳ Exam Countdown & Dynamic Pace Indicator:**
  - Real-time countdown to GATE 2027 (6 February 2027).
  - Dynamic pace detector comparing elapsed preparation days against completed topics: `Ahead of schedule 🚀`, `On track`, or `Behind schedule ⚠️`.
- **⏱️ Integrated Pomodoro Focus Timer:**
  - 25-minute Focus, 5-minute Short Break, and 15-minute Long Break modes.
  - Start, Pause, and Reset controls with live countdown in the top bar.
  - Built-in sound bell chime upon session completion.
- **🌙 Duolingo Dark Slate Mode:**
  - Instant toggle between crisp Duolingo Daylight and sleek Duolingo Dark Slate (`#131F24`).
  - Saved automatically to browser preferences.

---

### 🔁 Smart Reschedule System
Never fall behind when life gets in the way. Instead of letting missed tasks pile up or breaking your entire schedule:
1. **🏖️ Mark Day Off / Auto-Shift:**
   - Mark any date as a rest or missed day directly from the Today view.
   - Uncompleted tasks on that date shift forward to the next day, and subsequent sessions in that module cascade forward smoothly.
   - Preserves your study streak with built-in Streak Freeze.
2. **📅 Per-Task Rescheduling:**
   - Move any individual task to any future date using the calendar button on task cards.
   - Rescheduled tasks show an indicator tag: `↗ Rescheduled from [Original Date]`.
3. **↺ Undo & Reset:**
   - Easily undo the last schedule shift from the top action bar.
   - Reset back to the original 4-month plan at any time.
   - **Immutable Core:** All schedule modifications are computed as runtime overrides on top of `plan.json` without mutating base data.

---

### 🧠 Study Intelligence & Active Learning
1. **😊 Confidence Meter per Topic:**
   - Rate your confidence across 4 levels: 😟 Low → 😐 Medium → 😊 High → 💪 Mastered.
   - One-click cycling button on each syllabus item.
   - Filter by confidence in the Syllabus view to instantly surface weak spots.
2. **🎯 PYQ Score Tracker:**
   - Log questions attempted and correct for each topic.
   - Automatically calculates accuracy percentage; highlights topics with <60% accuracy as needing additional practice.
3. **💡 Formulas & Key Points Cheat Sheet:**
   - Collapsible personal formula notes on each topic card for quick revision.
4. **❓ Centralized Doubt Vault:**
   - Tag conceptual questions as unresolved doubts.
   - Dedicated "Doubts" tab in the navigation to track, review, and mark doubts as resolved (+15 XP).
5. **🧠 Spaced Repetition Review Vault:**
   - Automatically queues review reminders using the proven **1-3-7-21 day** spacing intervals based on when lessons were first learned.
   - Dedicated "Reviews" tab with "Needs Work 🔄" and "Mastered ✓" (+25 XP) retention controls.
6. **📊 Analytics & Activity Heatmap:**
   - Subject-wise progress bars and monthly planned vs. actual study hours.
   - GitHub/Duolingo-style 4-month activity heatmap grid showing study intensity.
   - **Export Progress (CSV):** Download your entire syllabus checklist, confidence, PYQs, and study notes in a clean spreadsheet.
7. **📋 Weekly Performance Review:**
   - Sunday review modal summarizing study hours, topics mastered, and pace.

---

## 🧭 Views in the App

| View | Icon | Purpose |
| --- | --- | --- |
| **Today** | 📅 | Daily dated timetable, session checklists, actual hours, notes, Mark Day Off, and per-task rescheduling |
| **Syllabus** | 📖 | Search and subject filters, 4-stage topic checklists (Lesson, Practice, PYQs, Revision), confidence meter, PYQ scoring, formula notes |
| **Modules** | 🗺️ | 29 preparation modules with dynamic adjusted end dates, lesson counts, and mastery progress |
| **Progress** | 📊 | Visual subject completion charts, monthly planned vs. actual hours, 4-month activity heatmap, and CSV export |
| **Reviews** | 🧠 | Spaced Repetition Vault with 1-3-7-21 day review queue |
| **Doubts** | ❓ | Centralized Doubt Vault to track and resolve tricky questions |

---

## 🚀 Quick Start: Local App (Zero Dependencies)

The local version uses standard library Python and prebuilt browser assets. **No Node.js, npm, or cloud hosting required.**

```sh
git clone https://github.com/KartikRaut09/study-studio-.git
cd study-studio-
python local-app/server.py --open
```

Open **`http://127.0.0.1:8768`** in your browser.

* On **Windows**, you can also simply double-click `local-app/Open Study Studio.cmd` to launch immediately!
* Your progress, custom dates, and notes are stored safely in `local-app/study-progress.sqlite3` on your computer.

### Backup Your Data
Create a safe backup of your progress anytime with:
```sh
python local-app/backup.py
```
Backups are saved to `local-app/progress-backups/`.

---

## 💻 Web App & Development Setup

For development or hosting with Next.js / React 19 / Cloudflare Workers:

Requires Node.js **22.13 or newer**, npm, and Git.

```sh
# Install dependencies
npm run install:ci

# Apply local database migrations
node scripts/migrate-local.mjs

# Start dev server
npm run dev
```

### Useful Development Commands

```sh
npm run typecheck        # Verify TypeScript types
npm run lint             # ESLint checks
npm run build:local      # Rebuild the local standalone app bundle (esbuild)
npm run test:local       # Run Python persistence & validation tests
npm run build            # Build the production Worker bundle
```

---

## 📚 Syllabus Data

Based on the official IIT Madras GATE 2027 syllabus:
- [Official GATE 2027 DA Syllabus](https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/DA_GATE2027_Syllabus.pdf)
- [Official GATE 2027 General Aptitude Syllabus](https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/GA_GATE2027_Syllabus.pdf)

---

## 📄 License

MIT. Free for personal study and academic preparation.
