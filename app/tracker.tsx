'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import {
  CalendarDays, BookOpen, Layers3, ChartNoAxesCombined, Check, ChevronLeft, ChevronRight,
  Clock3, Search, ExternalLink, RefreshCw, CheckCheck, Flame, Zap, Moon, Sun, Play, Pause,
  RotateCcw, AlertTriangle, ArrowRight, Download, Brain, HelpCircle, Shield, Award, Sparkles,
  Filter, X
} from 'lucide-react';
import plan from './plan.json';
import { computeEffectiveSchedule, ScheduleOverride, EffectiveTask } from './schedule-engine';

export type Entry = {
  lesson?: boolean;
  practice?: boolean;
  pyqs?: boolean;
  revision?: boolean;
  done?: boolean;
  hours?: number | null;
  notes?: string;
  confidence?: 'low' | 'medium' | 'high' | 'mastered';
  pyqAttempted?: number;
  pyqCorrect?: number;
  keyPoints?: string;
  doubtText?: string;
  doubtResolved?: boolean;
  lastStudied?: string;
};

export type Progress = Record<string, Entry>;
export type View = 'Today' | 'Syllabus' | 'Modules' | 'Progress' | 'Reviews' | 'Doubts';

const stages = ['lesson', 'practice', 'pyqs', 'revision'] as const;
const stageLabels = ['Lesson', 'Practice', 'PYQs', 'Revision'];
const subjects = [...new Set(plan.modules.map(m => m.subject))];
const dates = [...new Set(plan.tasks.map(t => t.date))];
const colors = ['#58cc02', '#1cb0f6', '#ce82ff', '#ff9600', '#ff4b4b', '#20c997', '#00b4d8', '#ffc800'];

const actualToday = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return '2026-10-06';
  }
};

const clampDate = (d: string) => (d < dates[0] ? dates[0] : d > dates.at(-1)! ? dates.at(-1)! : d);
const pretty = (d: string, long = false) => {
  try {
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: long ? 'long' : 'short', ...(long ? { weekday: 'long' as const } : {}), timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
  } catch {
    return d;
  }
};

const time = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

const complete = (p: Entry = {}) => stages.every(s => p[s]);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const hrs = (n: number) => Number(n.toFixed(2));
const subjectColor = (s: string) => colors[subjects.indexOf(s) % colors.length] || '#58cc02';

// Audio chime using Web Audio API
function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch {}
}

// XP & Levels
function calculateXP(progress: Progress): number {
  let xp = 0;
  for (const [id, val] of Object.entries(progress)) {
    if (id.startsWith('__')) continue;
    if (val.done) xp += 10;
    if (val.hours) xp += Math.round(val.hours * 5);
    if (val.lesson) xp += 15;
    if (val.practice) xp += 10;
    if (val.pyqs) xp += 15;
    if (val.revision) xp += 10;
    if (complete(val)) xp += 50; // Bonus for full completion
  }
  return xp;
}

const LEVEL_THRESHOLDS = [
  { level: 1, name: 'Novice', min: 0, max: 200, badge: '🌱' },
  { level: 2, name: 'Learner', min: 201, max: 500, badge: '📘' },
  { level: 3, name: 'Practitioner', min: 501, max: 1000, badge: '⚡' },
  { level: 4, name: 'Scholar', min: 1001, max: 1800, badge: '🎓' },
  { level: 5, name: 'Master', min: 1801, max: 3000, badge: '🔥' },
  { level: 6, name: 'GATE Ready', min: 3001, max: 99999, badge: '👑' },
];

function getLevelInfo(xp: number) {
  for (const lvl of LEVEL_THRESHOLDS) {
    if (xp <= lvl.max) {
      const prevMin = lvl.min;
      const range = lvl.max - prevMin;
      const current = xp - prevMin;
      const progressPct = range > 0 ? Math.min(100, Math.round((current / range) * 100)) : 100;
      return { ...lvl, progressPct, nextXp: lvl.max - xp };
    }
  }
  return { ...LEVEL_THRESHOLDS.at(-1)!, progressPct: 100, nextXp: 0 };
}

// Confidence emoji helper
const CONFIDENCE_LEVELS = [
  { id: 'low', emoji: '😟', label: 'Low', color: 'var(--red-400)' },
  { id: 'medium', emoji: '😐', label: 'Medium', color: 'var(--orange-400)' },
  { id: 'high', emoji: '😊', label: 'High', color: 'var(--green-400)' },
  { id: 'mastered', emoji: '💪', label: 'Mastered', color: 'var(--blue-400)' },
] as const;

function Meter({ value }: { value: number }) {
  return (
    <div className="meter" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function LogEditor({
  value,
  save,
  saving,
  task = false,
}: {
  value: Entry;
  save: (v: Entry) => Promise<boolean>;
  saving: boolean;
  task?: boolean;
}) {
  const dirty = useRef(false);
  const [hours, setHours] = useState(value.hours == null ? '' : String(value.hours));
  const [notes, setNotes] = useState(value.notes || '');
  const [keyPoints, setKeyPoints] = useState(value.keyPoints || '');
  const [pyqAttempted, setPyqAttempted] = useState(value.pyqAttempted == null ? '' : String(value.pyqAttempted));
  const [pyqCorrect, setPyqCorrect] = useState(value.pyqCorrect == null ? '' : String(value.pyqCorrect));
  const [doubtText, setDoubtText] = useState(value.doubtText || '');
  const [doubtResolved, setDoubtResolved] = useState(!!value.doubtResolved);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (dirty.current) return;
    setHours(value.hours == null ? '' : String(value.hours));
    setNotes(value.notes || '');
    setKeyPoints(value.keyPoints || '');
    setPyqAttempted(value.pyqAttempted == null ? '' : String(value.pyqAttempted));
    setPyqCorrect(value.pyqCorrect == null ? '' : String(value.pyqCorrect));
    setDoubtText(value.doubtText || '');
    setDoubtResolved(!!value.doubtResolved);
  }, [value]);

  return (
    <form
      className="log-editor"
      onSubmit={async e => {
        e.preventDefault();
        setMessage('');
        const n = hours === '' ? null : Number(hours);
        if (task && n !== null && (!Number.isFinite(n) || n < 0 || n > 24)) {
          setMessage('Enter 0–24 hours.');
          return;
        }
        const att = pyqAttempted === '' ? undefined : parseInt(pyqAttempted, 10);
        const cor = pyqCorrect === '' ? undefined : parseInt(pyqCorrect, 10);

        const ok = await save({
          ...value,
          notes,
          ...(task ? { hours: n } : {
            keyPoints,
            pyqAttempted: isNaN(att as number) ? undefined : att,
            pyqCorrect: isNaN(cor as number) ? undefined : cor,
            doubtText,
            doubtResolved,
          }),
        });
        if (ok) {
          dirty.current = false;
          setMessage('Saved ✓');
        } else {
          setMessage('Not saved — retry.');
        }
      }}
    >
      {task ? (
        <div className="log-grid">
          <label>
            Actual study hours
            <input
              type="number"
              min="0"
              max="24"
              step="0.05"
              value={hours}
              onChange={e => { dirty.current = true; setHours(e.target.value); setMessage(''); }}
              placeholder="e.g. 1.5"
            />
            <small>Ticking task does not add hours.</small>
          </label>
          <label>
            Session Notes / Score
            <textarea
              maxLength={2000}
              rows={2}
              value={notes}
              onChange={e => { dirty.current = true; setNotes(e.target.value); setMessage(''); }}
              placeholder="What did you learn or find difficult today?"
            />
          </label>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label>
              Key Formulas & Concepts (Flashcard Cheat Sheet)
              <textarea
                maxLength={2000}
                rows={2}
                value={keyPoints}
                onChange={e => { dirty.current = true; setKeyPoints(e.target.value); setMessage(''); }}
                placeholder="Important formulas, definitions, key rules..."
              />
            </label>
            <label>
              Unresolved Doubt / Question
              <textarea
                maxLength={2000}
                rows={2}
                value={doubtText}
                onChange={e => { dirty.current = true; setDoubtText(e.target.value); setMessage(''); }}
                placeholder="Got a doubt? Write it here to track in Doubt Vault..."
              />
              {doubtText && (
                <label style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    checked={doubtResolved}
                    onChange={e => { dirty.current = true; setDoubtResolved(e.target.checked); }}
                  />
                  <span style={{ fontSize: '12px' }}>Mark Doubt as Resolved</span>
                </label>
              )}
            </label>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label style={{ width: '140px' }}>
              PYQ Attempted
              <input
                type="number"
                min="0"
                value={pyqAttempted}
                onChange={e => { dirty.current = true; setPyqAttempted(e.target.value); setMessage(''); }}
                placeholder="e.g. 25"
              />
            </label>
            <label style={{ width: '140px' }}>
              PYQ Correct
              <input
                type="number"
                min="0"
                value={pyqCorrect}
                onChange={e => { dirty.current = true; setPyqCorrect(e.target.value); setMessage(''); }}
                placeholder="e.g. 21"
              />
            </label>
            {pyqAttempted && pyqCorrect && (
              <span className="badge badge-green" style={{ alignSelf: 'flex-end', marginBottom: '8px' }}>
                Accuracy: {pct(Number(pyqCorrect), Number(pyqAttempted))}%
              </span>
            )}
          </div>
        </div>
      )}
      <div className="log-foot">
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span className="save-message">{message}</span>
      </div>
    </form>
  );
}

export default function Tracker({ localMode = false }: { localMode?: boolean }) {
  const [view, setView] = useState<View>('Today');
  const [selected, setSelected] = useState('2026-10-06');
  const [today, setToday] = useState('2026-10-06');
  const [progress, setProgress] = useState<Progress>({});
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Filters & search
  const [subject, setSubject] = useState('All subjects');
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [filter, setFilter] = useState('All topics');
  const [confidenceFilter, setConfidenceFilter] = useState('All');
  const [pastDue, setPastDue] = useState(false);

  // Modals
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showXpModal, setShowXpModal] = useState(false);
  const [showCountdownModal, setShowCountdownModal] = useState(false);
  const [showPomoModal, setShowPomoModal] = useState(false);
  const [showSkipDayModal, setShowSkipDayModal] = useState<string | null>(null);
  const [rescheduleTaskModal, setRescheduleTaskModal] = useState<EffectiveTask | null>(null);
  const [targetMoveDate, setTargetMoveDate] = useState('');
  const [showWeeklySummary, setShowWeeklySummary] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Dark mode
  const [isDark, setIsDark] = useState(false);

  // Pomodoro timer state
  const [pomoMinutes, setPomoMinutes] = useState(25);
  const [pomoSeconds, setPomoSeconds] = useState(0);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoMode, setPomoMode] = useState<'focus' | 'shortBreak' | 'longBreak'>('focus');
  const pomoTimerRef = useRef<NodeJS.Timeout | null>(null);

  const savingIds = useRef(new Set<string>());
  const stateRef = useRef(progress);
  stateRef.current = progress;

  // Initialize theme from storage
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDark(true);
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  };

  // Pomodoro tick
  useEffect(() => {
    if (pomoRunning) {
      pomoTimerRef.current = setInterval(() => {
        setPomoSeconds(sec => {
          if (sec > 0) return sec - 1;
          setPomoMinutes(min => {
            if (min > 0) return min - 1;
            // Timer finished
            setPomoRunning(false);
            playChime();
            showToast('🎉 Pomodoro session finished! Great job!');
            return 0;
          });
          return 59;
        });
      }, 1000);
    } else if (pomoTimerRef.current) {
      clearInterval(pomoTimerRef.current);
    }
    return () => {
      if (pomoTimerRef.current) clearInterval(pomoTimerRef.current);
    };
  }, [pomoRunning]);

  function resetPomo(mode: 'focus' | 'shortBreak' | 'longBreak') {
    setPomoRunning(false);
    setPomoMode(mode);
    if (mode === 'focus') { setPomoMinutes(25); setPomoSeconds(0); }
    else if (mode === 'shortBreak') { setPomoMinutes(5); setPomoSeconds(0); }
    else { setPomoMinutes(15); setPomoSeconds(0); }
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  }

  // Load progress and overrides
  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const r = await fetch('/api/progress', { cache: 'no-store' });
      const b = (await r.json()) as { progress: Progress; error?: string };
      if (!r.ok) throw new Error(b.error);
      
      const loadedProgress = b.progress || {};
      setProgress(loadedProgress);

      // Load overrides from __schedule_overrides__ if stored
      if (loadedProgress['__schedule_overrides__']) {
        const raw = loadedProgress['__schedule_overrides__'] as unknown as { list: ScheduleOverride[] };
        if (Array.isArray(raw.list)) setOverrides(raw.list);
      } else {
        // Fallback to localStorage
        const localOv = localStorage.getItem('schedule_overrides');
        if (localOv) {
          try { setOverrides(JSON.parse(localOv)); } catch {}
        }
      }
    } catch (e) {
      // Offline fallback: try reading from localStorage
      const cached = localStorage.getItem('study_progress');
      if (cached) {
        try { setProgress(JSON.parse(cached)); } catch {}
      }
      setLoadError(e instanceof Error ? e.message : 'Could not load your progress.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const d = actualToday();
    setToday(d);
    setSelected(clampDate(d));
    void load();
  }, []);

  // Save progress entry
  async function save(id: string, value: Entry) {
    if (savingIds.current.has(id) || loading) return false;
    savingIds.current.add(id);
    const before = stateRef.current[id] || {};
    setBusy(b => ({ ...b, [id]: true }));
    setError('');
    const updated = { ...stateRef.current, [id]: value };
    setProgress(updated);
    localStorage.setItem('study_progress', JSON.stringify(updated));

    try {
      const r = await fetch('/api/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, value }),
      });
      const b = (await r.json()) as { progress: Progress; error?: string };
      if (!r.ok) throw new Error(b.error);
      return true;
    } catch (e) {
      setProgress(p => ({ ...p, [id]: before }));
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      return false;
    } finally {
      savingIds.current.delete(id);
      setBusy(b => ({ ...b, [id]: false }));
    }
  }

  // Save schedule override
  async function saveOverrides(newOverrides: ScheduleOverride[]) {
    setOverrides(newOverrides);
    localStorage.setItem('schedule_overrides', JSON.stringify(newOverrides));
    // Persist to DB under meta key
    await save('__schedule_overrides__', { notes: JSON.stringify(newOverrides) } as unknown as Entry);
  }

  // Compute effective schedule
  const completedTaskIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, val] of Object.entries(progress)) {
      if (val.done) set.add(id);
    }
    return set;
  }, [progress]);

  const effectiveSchedule = useMemo(() => {
    return computeEffectiveSchedule(plan.tasks, plan.modules, overrides, completedTaskIds);
  }, [overrides, completedTaskIds]);

  // Overall stats
  const locked = loading || !!loadError;
  const learned = plan.topics.filter(t => progress[t.id]?.lesson).length;
  const finished = plan.topics.filter(t => complete(progress[t.id])).length;
  const totalHours = hrs(plan.tasks.reduce((s, t) => s + (progress[t.id]?.hours || 0), 0));
  const totalXP = useMemo(() => calculateXP(progress), [progress]);
  const levelInfo = useMemo(() => getLevelInfo(totalXP), [totalXP]);

  // Streak calculation
  const streakDays = useMemo(() => {
    const studyDates = new Set<string>();
    for (const t of plan.tasks) {
      if (progress[t.id]?.done || (progress[t.id]?.hours && progress[t.id]!.hours! > 0)) {
        studyDates.add(t.date);
      }
    }
    // Calculate consecutive days ending at today or yesterday
    let streak = 0;
    let checkDate = today;
    if (!studyDates.has(checkDate)) {
      // Check yesterday
      const y = new Date(checkDate + 'T12:00:00Z');
      y.setUTCDate(y.getUTCDate() - 1);
      const yesterday = y.toISOString().slice(0, 10);
      if (studyDates.has(yesterday)) {
        checkDate = yesterday;
      }
    }
    while (studyDates.has(checkDate)) {
      streak++;
      const d = new Date(checkDate + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      checkDate = d.toISOString().slice(0, 10);
    }
    return { current: streak, studyDates: Array.from(studyDates) };
  }, [progress, today]);

  // Countdown to GATE 2027 (Feb 6, 2027)
  const examCountdown = useMemo(() => {
    const examDate = new Date('2027-02-06T09:00:00Z');
    const now = new Date(today + 'T12:00:00Z');
    const diffDays = Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Expected pace: percentage of days elapsed vs percentage of topics finished
    const startDate = new Date('2026-10-06T00:00:00Z');
    const totalDays = Math.ceil((examDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const expectedPct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
    const actualPct = pct(finished, plan.topics.length);

    let pace = 'On track';
    if (actualPct > expectedPct + 5) pace = 'Ahead of schedule 🚀';
    else if (actualPct < expectedPct - 5) pace = 'Behind schedule ⚠️';

    return { daysLeft: Math.max(0, diffDays), pace, expectedPct, actualPct };
  }, [today, finished]);

  // Spaced Repetition Due Reviews
  const reviewsDue = useMemo(() => {
    const due: { topic: typeof plan.topics[0]; interval: number; dueDate: string }[] = [];
    const todayTs = new Date(today + 'T12:00:00Z').getTime();

    for (const t of plan.topics) {
      const p = progress[t.id];
      if (p?.lesson && p?.lastStudied) {
        const lastTs = new Date(p.lastStudied + 'T12:00:00Z').getTime();
        const diffDays = Math.floor((todayTs - lastTs) / (1000 * 60 * 60 * 24));
        // Check 1, 3, 7, 21 day intervals
        const intervals = [1, 3, 7, 21];
        for (const intv of intervals) {
          if (diffDays >= intv && diffDays < intv + 2) {
            due.push({ topic: t, interval: intv, dueDate: p.lastStudied });
            break;
          }
        }
      }
    }
    return due;
  }, [progress, today]);

  // Unresolved doubts list
  const doubtsList = useMemo(() => {
    return plan.topics
      .filter(t => progress[t.id]?.doubtText && !progress[t.id]?.doubtResolved)
      .map(t => ({ topic: t, doubt: progress[t.id]?.doubtText || '' }));
  }, [progress]);

  // Current day tasks from effective schedule
  const dayTasks = effectiveSchedule.tasksByDate[selected] || [];
  const dayDone = dayTasks.filter(t => progress[t.id]?.done).length;
  const dayHours = hrs(dayTasks.reduce((s, t) => s + (progress[t.id]?.hours || 0), 0));
  const overdue = effectiveSchedule.tasks.filter(t => t.date < today && !progress[t.id]?.done);
  const shownTasks = pastDue ? overdue : dayTasks;

  // Filtered topics
  const filteredTopics = useMemo(() => {
    return plan.topics.filter(t => {
      const p = progress[t.id] || {};
      const matchSubject = subject === 'All subjects' || t.subject === subject;
      const matchModule = !moduleFilter || t.moduleId === moduleFilter;
      const matchQuery = !query || `${t.name} ${t.subject}`.toLowerCase().includes(query.toLowerCase());
      const matchFilter =
        filter === 'All topics' ||
        (filter === 'Completed' && complete(p)) ||
        (filter === 'To complete' && !complete(p)) ||
        (filter === 'Low Confidence' && p.confidence === 'low');
      const matchConfidence = confidenceFilter === 'All' || p.confidence === confidenceFilter.toLowerCase();
      return matchSubject && matchModule && matchQuery && matchFilter && matchConfidence;
    });
  }, [subject, moduleFilter, query, filter, confidenceFilter, progress]);

  // Reschedule actions
  function handleSkipDay(dateToSkip: string) {
    const newOverride: ScheduleOverride = {
      id: `skip-${Date.now()}`,
      action: 'skip_day',
      date: dateToSkip,
      shiftDays: 1,
      createdAt: new Date().toISOString(),
      reason: 'Marked day off',
    };
    void saveOverrides([...overrides, newOverride]);
    setShowSkipDayModal(null);
    showToast(`Skipped ${pretty(dateToSkip)}. Tasks shifted to next day!`);
  }

  function handleMoveSingleTask() {
    if (!rescheduleTaskModal || !targetMoveDate) return;
    const newOverride: ScheduleOverride = {
      id: `move-${Date.now()}`,
      action: 'move_task',
      taskId: rescheduleTaskModal.id,
      fromDate: rescheduleTaskModal.date,
      toDate: targetMoveDate,
      createdAt: new Date().toISOString(),
      reason: 'Moved manually',
    };
    void saveOverrides([...overrides, newOverride]);
    setRescheduleTaskModal(null);
    setTargetMoveDate('');
    showToast(`Task rescheduled to ${pretty(targetMoveDate)}!`);
  }

  function handleUndoOverride() {
    if (overrides.length === 0) return;
    const next = overrides.slice(0, -1);
    void saveOverrides(next);
    showToast('Reverted last schedule change!');
  }

  function handleResetOverrides() {
    void saveOverrides([]);
    showToast('Reset schedule to original 4-month plan!');
  }

  // Cycle topic confidence
  async function cycleConfidence(topicId: string) {
    const current = progress[topicId]?.confidence || 'low';
    const order: Array<'low' | 'medium' | 'high' | 'mastered'> = ['low', 'medium', 'high', 'mastered'];
    const next = order[(order.indexOf(current) + 1) % order.length];
    await save(topicId, { ...(progress[topicId] || {}), confidence: next });
    showToast(`Confidence updated to ${next.toUpperCase()}`);
  }

  function openModule(id: string) {
    setModuleFilter(id);
    setSubject('All subjects');
    setQuery('');
    setFilter('All topics');
    setView('Syllabus');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Export report as CSV
  function exportCSV() {
    const rows = [
      ['ID', 'Topic', 'Subject', 'Module', 'Lesson', 'Practice', 'PYQs', 'Revision', 'Complete', 'Confidence', 'PYQ Attempted', 'PYQ Correct', 'Notes'],
    ];
    for (const t of plan.topics) {
      const p = progress[t.id] || {};
      rows.push([
        t.id,
        `"${t.name.replace(/"/g, '""')}"`,
        t.subject,
        t.moduleId,
        p.lesson ? 'Yes' : 'No',
        p.practice ? 'Yes' : 'No',
        p.pyqs ? 'Yes' : 'No',
        p.revision ? 'Yes' : 'No',
        complete(p) ? 'Yes' : 'No',
        p.confidence || 'Unrated',
        p.pyqAttempted != null ? String(p.pyqAttempted) : '',
        p.pyqCorrect != null ? String(p.pyqCorrect) : '',
        `"${(p.notes || '').replace(/"/g, '""')}"`,
      ]);
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.join(',')).join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `GATE_DA_Study_Report_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const navItems: { label: View; icon: React.ComponentType<{ size: number }> }[] = [
    { label: 'Today', icon: CalendarDays },
    { label: 'Syllabus', icon: BookOpen },
    { label: 'Modules', icon: Layers3 },
    { label: 'Progress', icon: ChartNoAxesCombined },
    { label: 'Reviews', icon: Brain },
    { label: 'Doubts', icon: HelpCircle },
  ];

  return (
    <div className="app">
      {/* Toast Notification */}
      {toastMessage && <div className="toast">{toastMessage}</div>}

      {/* ===== DUOLINGO SIDEBAR ===== */}
      <aside className="sidebar">
        <div className="brand" onClick={() => setView('Today')}>
          <div className="brand-mark">
            <CheckCheck size={28} />
          </div>
          <div className="brand-text">
            <h2>Study Studio</h2>
            <small>GATE DA 2027</small>
          </div>
        </div>

        <nav aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={view === label ? 'active' : ''}
              aria-current={view === label ? 'page' : undefined}
              onClick={() => {
                setView(label);
                window.scrollTo({ top: 0 });
              }}
            >
              <Icon size={22} />
              {label}
            </button>
          ))}
        </nav>

        {/* Sidebar XP Progress Card */}
        <div className="sidebar-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <small>{levelInfo.badge} {levelInfo.name}</small>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--yellow-500)' }}>Level {levelInfo.level}</span>
          </div>
          <strong style={{ margin: '4px 0' }}>{totalXP} XP</strong>
          <div className="progress-bar progress-bar-sm" style={{ background: 'var(--border)' }}>
            <div className="progress-bar-fill" style={{ width: `${levelInfo.progressPct}%` }} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
            {levelInfo.nextXp > 0 ? `${levelInfo.nextXp} XP to next level` : 'Max level achieved!'}
          </span>
        </div>

        {/* Syllabus Completion Card */}
        <div className="sidebar-card">
          <small>Syllabus Completion</small>
          <strong>{locked ? '—' : pct(finished, plan.topics.length)}%</strong>
          <Meter value={pct(finished, plan.topics.length)} />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>
            {locked ? 'Loading' : `${finished} of ${plan.topics.length} topics complete`}
          </span>
        </div>

        <div className="sidebar-foot">
          4-MONTH INTENSIVE PLAN<br />
          6 Oct 2026 – 5 Feb 2027<br />
          {localMode ? (
            <span style={{ color: 'var(--green-500)' }}>✓ Saved locally on computer</span>
          ) : (
            <a href="/signout-with-chatgpt?return_to=/" target="_top">Sign out</a>
          )}
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main>
        {/* Top Duolingo Gamification Strip */}
        <div className="top-bar">
          <div className="top-stats">
            {/* Streak Pill */}
            <button className="stat-pill streak" onClick={() => setShowStreakModal(true)} title="View Streak Calendar">
              <span className="streak-icon">🔥</span>
              <span>{streakDays.current} DAY STREAK</span>
            </button>

            {/* XP Pill */}
            <button className="stat-pill xp" onClick={() => setShowXpModal(true)} title="View Level Progress">
              <span>💎</span>
              <span>{totalXP} XP</span>
            </button>

            {/* Countdown Pill */}
            <button className="stat-pill countdown" onClick={() => setShowCountdownModal(true)} title="Exam Countdown">
              <span>⏳</span>
              <span>{examCountdown.daysLeft} DAYS TO GATE</span>
            </button>

            {/* Pomodoro Timer Pill */}
            <button className="stat-pill timer" onClick={() => setShowPomoModal(true)} title="Focus Timer">
              <span>⏱️</span>
              <span>
                {pomoRunning
                  ? `${String(pomoMinutes).padStart(2, '0')}:${String(pomoSeconds).padStart(2, '0')}`
                  : 'FOCUS TIMER'}
              </span>
            </button>
          </div>

          <div className="top-actions">
            {overrides.length > 0 && (
              <button className="btn btn-outline btn-sm" onClick={handleUndoOverride} title="Undo last schedule change">
                <RotateCcw size={15} /> Undo Shift
              </button>
            )}
            <button className="icon-btn" onClick={toggleDarkMode} title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="icon-btn" onClick={() => setShowWeeklySummary(true)} title="Weekly Review Summary">
              <Award size={20} />
            </button>
          </div>
        </div>

        {/* Page Header */}
        <header className="page-header">
          <div>
            <div className="eyebrow">GATE DA 2027 / {view.toUpperCase()}</div>
            <h1>
              {view === 'Today' ? 'One session at a time.' :
               view === 'Syllabus' ? 'Master every single topic.' :
               view === 'Modules' ? 'Your four-month roadmap.' :
               view === 'Progress' ? 'Watch your learning compound.' :
               view === 'Reviews' ? 'Spaced Repetition Vault.' :
               'Doubts & Unresolved Questions.'}
            </h1>
            <p>
              {view === 'Today' ? pretty(selected, true) :
               view === 'Syllabus' ? 'Track 150 topics across 4 learning stages, confidence, PYQs, and cheat sheets.' :
               view === 'Modules' ? '29 modules, with machine learning in parallel from November.' :
               view === 'Progress' ? 'Visual analytics, actual study hours, and weak-area diagnosis.' :
               view === 'Reviews' ? 'Strengthen your memory with proven 1-3-7-21 day spaced intervals.' :
               'Never lose a doubt. Tackle each query before exam day.'}
            </p>
          </div>
          <span className="sync-state" role="status">
            {loading ? 'Loading progress…' :
             loadError ? 'Progress unavailable' :
             error ? 'Save failed — retry' :
             Object.values(busy).some(Boolean) ? 'Saving…' :
             <><Check size={16} /> {localMode ? 'Saved on this computer' : 'Saved to Cloud'}</>}
          </span>
        </header>

        {/* Load / Save Errors */}
        {loadError && (
          <div className="alert" role="alert">
            <AlertTriangle size={20} />
            <span>{loadError}</span>
            <button className="btn btn-outline btn-sm" onClick={() => void load()}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        )}

        {/* ==================== TODAY VIEW ==================== */}
        {view === 'Today' && (
          <>
            {/* Top Stats Banner */}
            <section className="stats">
              <article>
                <small>Sessions Done Today</small>
                <strong>
                  {locked ? '—' : dayDone} <span>/ {dayTasks.length}</span>
                </strong>
                <Meter value={pct(dayDone, dayTasks.length)} />
              </article>
              <article>
                <small>Actual Hours Logged</small>
                <strong>
                  {locked ? '—' : dayHours}{' '}
                  <span>/ {hrs(dayTasks.reduce((s, t) => s + t.hours, 0))}h planned</span>
                </strong>
                <Meter value={pct(dayHours, dayTasks.reduce((s, t) => s + t.hours, 0))} />
              </article>
              <article>
                <small>Topics Fully Mastered</small>
                <strong>
                  {locked ? '—' : finished} <span>/ {plan.topics.length}</span>
                </strong>
                <small style={{ marginTop: '4px', display: 'block' }}>All 4 stages completed</small>
              </article>
              <article>
                <small>Study Pace</small>
                <strong style={{ fontSize: '20px', color: 'var(--green-600)' }}>
                  {examCountdown.pace}
                </strong>
                <small style={{ marginTop: '4px', display: 'block' }}>{examCountdown.daysLeft} days to exam</small>
              </article>
            </section>

            {/* Today Toolbar */}
            <div className="day-toolbar">
              <div className="date-controls">
                <button
                  className="date-btn"
                  aria-label="Previous day"
                  disabled={selected === dates[0]}
                  onClick={() => {
                    setSelected(dates[dates.indexOf(selected) - 1]);
                    setPastDue(false);
                  }}
                >
                  <ChevronLeft size={20} />
                </button>
                <input
                  className="date-input"
                  aria-label="Study date"
                  type="date"
                  value={selected}
                  min={dates[0]}
                  max={dates.at(-1)}
                  onChange={e => {
                    if (dates.includes(e.target.value)) {
                      setSelected(e.target.value);
                      setPastDue(false);
                    }
                  }}
                />
                <button
                  className="date-btn"
                  aria-label="Next day"
                  disabled={selected === dates.at(-1)}
                  onClick={() => {
                    setSelected(dates[dates.indexOf(selected) + 1]);
                    setPastDue(false);
                  }}
                >
                  <ChevronRight size={20} />
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setSelected(clampDate(today));
                    setPastDue(false);
                  }}
                >
                  Today
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Mark Day Off Button */}
                <button
                  className="chip chip-orange"
                  onClick={() => setShowSkipDayModal(selected)}
                  title="Shift uncompleted tasks from this day forward"
                >
                  🏖️ Mark Day Off / Skip
                </button>

                <button
                  className={pastDue ? 'chip selected' : 'chip'}
                  onClick={() => setPastDue(!pastDue)}
                >
                  {pastDue ? 'Show Selected Day' : `Past Due (${locked ? '—' : overdue.length})`}
                </button>
              </div>
            </div>

            {/* Schedule Section */}
            <div className="section-head">
              <h2>{pastDue ? 'Unfinished Past Sessions' : `Daily Schedule — ${pretty(selected, true)}`}</h2>
              <span>{selected >= '2027-01-01' ? 'Revision & Mocks Phase' : 'First-Pass Learning Phase'}</span>
            </div>

            <section className="schedule">
              {shownTasks.length === 0 ? (
                <div className="empty card">
                  <CheckCheck size={40} style={{ color: 'var(--green-500)', margin: '0 auto 12px' }} />
                  <h3>No tasks scheduled for this day!</h3>
                  <p>Enjoy your break or get ahead by reviewing topics from the Syllabus.</p>
                </div>
              ) : (
                shownTasks.map(t => {
                  const p = progress[t.id] || {};
                  return (
                    <article className={`session ${p.done ? 'session-done' : ''}`} key={t.id}>
                      <div className="session-row">
                        <input
                          type="checkbox"
                          className="duo-check"
                          checked={!!p.done}
                          disabled={locked || busy[t.id]}
                          onChange={e => {
                            const nextDone = e.target.checked;
                            void save(t.id, { ...p, done: nextDone });
                            if (nextDone) {
                              playChime();
                              showToast('Session completed! +10 XP 🔥');
                            }
                          }}
                          aria-label={`Complete ${t.activity}`}
                        />
                        <div className="session-time">
                          {time(t.start)}
                          <small>{time(t.end)}</small>
                          {pastDue && <small style={{ color: 'var(--orange-500)' }}>{pretty(t.date)}</small>}
                        </div>
                        <div className="session-main">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span className="session-tag" style={{ color: subjectColor(t.subject) }}>
                              {t.subject}
                            </span>
                            {t.isRescheduled && (
                              <span className="session-rescheduled-tag">
                                ↗ Rescheduled from {pretty(t.originalDate)}
                              </span>
                            )}
                          </div>
                          <h3>{t.activity}</h3>
                          <p>{t.target}</p>
                        </div>
                        <div className="session-actions">
                          <span className="planned">
                            <Clock3 size={14} /> {t.hours}h
                          </span>
                          {/* Reschedule Button */}
                          <button
                            className="icon-btn"
                            style={{ width: '36px', height: '36px' }}
                            title="Reschedule this task"
                            onClick={() => {
                              setRescheduleTaskModal(t);
                              setTargetMoveDate(t.date);
                            }}
                          >
                            <CalendarDays size={16} />
                          </button>
                        </div>
                      </div>

                      <details className="task-details">
                        <summary>
                          {p.hours != null ? `${p.hours}h logged · ` : ''}
                          {p.notes ? 'Edit notes & actual time' : 'Log actual time & session notes'}
                        </summary>
                        <LogEditor
                          value={p}
                          task
                          saving={locked || busy[t.id]}
                          save={v => save(t.id, v)}
                        />
                      </details>
                    </article>
                  );
                })
              )}
            </section>

            <p className="hint">
              Target schedule breaks: 12–12:15 pm, lunch 1:45–2:45 pm, 4:15–4:45 pm and dinner 6:15–7:30 pm. Use the Pomodoro timer to stay locked in!
            </p>
          </>
        )}

        {/* ==================== SYLLABUS VIEW ==================== */}
        {view === 'Syllabus' && (
          <>
            <div className="syllabus-summary">
              <div className="syllabus-stat">
                <strong>{locked ? '—' : learned}</strong>
                <span>Lessons Learned</span>
              </div>
              <div className="syllabus-stat">
                <strong>{locked ? '—' : finished}</strong>
                <span>Mastered (4 Stages)</span>
              </div>
              <div className="syllabus-stat">
                <strong>150</strong>
                <span>Official Topics</span>
              </div>
            </div>

            <div className="filters">
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="Search syllabus"
                  placeholder="Find any topic or subject…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </label>
              <select className="duo-select" value={subject} onChange={e => { setSubject(e.target.value); setModuleFilter(''); }}>
                <option>All subjects</option>
                {subjects.map(s => <option key={s}>{s}</option>)}
              </select>
              <select className="duo-select" value={filter} onChange={e => setFilter(e.target.value)}>
                <option>All topics</option>
                <option>To complete</option>
                <option>Completed</option>
                <option>Low Confidence</option>
              </select>
              <select className="duo-select" value={confidenceFilter} onChange={e => setConfidenceFilter(e.target.value)}>
                <option>All Confidences</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
                <option>Mastered</option>
              </select>
            </div>

            {moduleFilter && (
              <div className="badge badge-blue" style={{ marginBottom: '16px', padding: '8px 16px', gap: '12px' }}>
                Showing module: {plan.modules.find(m => m.id === moduleFilter)?.name}
                <button className="btn btn-ghost btn-sm" onClick={() => setModuleFilter('')}>Clear Filter</button>
              </div>
            )}

            {filteredTopics.length === 0 ? (
              <div className="empty card">
                <h3>No matching topics found</h3>
                <p>Try clearing your search query or filter settings.</p>
              </div>
            ) : (
              plan.modules
                .filter(m => filteredTopics.some(t => t.moduleId === m.id))
                .map(m => {
                  const modTopics = filteredTopics.filter(t => t.moduleId === m.id);
                  const doneCount = plan.topics.filter(t => t.moduleId === m.id && complete(progress[t.id])).length;
                  const totalCount = plan.topics.filter(t => t.moduleId === m.id).length;

                  return (
                    <details className="topic-group" key={m.id} open={!!moduleFilter || !!query || subject !== 'All subjects'}>
                      <summary>
                        <div className="topic-group-meta">
                          <span className="module-code">{m.id}</span>
                          <div>
                            <strong>{m.name}</strong>
                            <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>
                              {m.subject} · Target {pretty(m.end)}
                            </small>
                          </div>
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 800 }}>
                          {doneCount}/{totalCount} Complete
                        </span>
                      </summary>

                      <div className="topic-list">
                        {modTopics.map(t => {
                          const p = progress[t.id] || {};
                          const conf = CONFIDENCE_LEVELS.find(c => c.id === (p.confidence || 'low'))!;

                          return (
                            <div className="topic" key={t.id}>
                              <div className="topic-top">
                                <div>
                                  <h3>{t.name}</h3>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                                    {/* Confidence Button */}
                                    <button
                                      className="confidence-btn"
                                      onClick={() => void cycleConfidence(t.id)}
                                      title="Click to cycle confidence rating"
                                    >
                                      <span>{conf.emoji}</span>
                                      <span style={{ fontSize: '12px', fontWeight: 800, marginLeft: '4px', color: conf.color }}>
                                        {conf.label}
                                      </span>
                                    </button>

                                    {/* PYQ Accuracy Chip */}
                                    {p.pyqAttempted != null && p.pyqAttempted > 0 && (
                                      <span
                                        className={`badge ${pct(p.pyqCorrect || 0, p.pyqAttempted) >= 60 ? 'badge-green' : 'badge-red'}`}
                                      >
                                        PYQ: {pct(p.pyqCorrect || 0, p.pyqAttempted)}%
                                      </span>
                                    )}

                                    {/* Doubt tag if any */}
                                    {p.doubtText && !p.doubtResolved && (
                                      <span className="badge badge-purple">
                                        ❓ Doubt Open
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {complete(p) && (
                                  <span className="badge badge-green" style={{ fontSize: '13px' }}>
                                    <Check size={14} /> Mastered
                                  </span>
                                )}
                              </div>

                              {/* 4 Stages Checkboxes */}
                              <div className="stages">
                                {stages.map((s, idx) => (
                                  <label className={p[s] ? 'stage checked' : 'stage'} key={s}>
                                    <input
                                      type="checkbox"
                                      checked={!!p[s]}
                                      disabled={locked || busy[t.id]}
                                      onChange={e => {
                                        const nextVal = e.target.checked;
                                        void save(t.id, {
                                          ...p,
                                          [s]: nextVal,
                                          ...(s === 'lesson' && nextVal ? { lastStudied: today } : {}),
                                        });
                                        if (nextVal) {
                                          playChime();
                                          showToast(`${stageLabels[idx]} checked! +10 XP`);
                                        }
                                      }}
                                    />
                                    {stageLabels[idx]}
                                  </label>
                                ))}
                              </div>

                              <details className="task-details">
                                <summary>
                                  {p.keyPoints || p.doubtText || p.pyqAttempted != null ? 'Edit formulas, doubts & PYQs' : '+ Add formulas, doubts & PYQ score'}
                                </summary>
                                <LogEditor
                                  value={p}
                                  saving={locked || busy[t.id]}
                                  save={v => save(t.id, v)}
                                />
                              </details>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })
            )}

            <div className="source-note" style={{ marginTop: '24px' }}>
              <p>
                Based on the official 2027 GATE DA and GA syllabi. 4-stage mastery tracks lessons, practice, PYQs, and revision.
              </p>
              <div style={{ marginTop: '8px' }}>
                <a href="https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/DA_GATE2027_Syllabus.pdf" target="_blank" rel="noreferrer">
                  Official DA Syllabus <ExternalLink size={13} />
                </a>
                <a href="https://gate2027.iitm.ac.in/static/doc/GATE2027_Syllabus/GA_GATE2027_Syllabus.pdf" target="_blank" rel="noreferrer">
                  Official GA Syllabus <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </>
        )}

        {/* ==================== MODULES ROADMAP VIEW ==================== */}
        {view === 'Modules' && (
          <>
            <div className="phase-strip">
              <div>
                <span>01</span>
                <div>
                  <small>OCT – EARLY NOV</small>
                  <strong>Math Foundations (Linear Algebra, Calculus, Prob)</strong>
                </div>
              </div>
              <div>
                <span>02</span>
                <div>
                  <small>NOV – DEC</small>
                  <strong>Core DA & ML (DSA, DBMS, AI, Machine Learning)</strong>
                </div>
              </div>
              <div>
                <span>03</span>
                <div>
                  <small>JAN – 5 FEB</small>
                  <strong>Full Revision & All-India Mock Tests</strong>
                </div>
              </div>
            </div>

            <div className="module-grid">
              {effectiveSchedule.modules.map(m => {
                const modTasks = plan.topics.filter(t => t.moduleId === m.id);
                const doneCount = modTasks.filter(t => complete(progress[t.id])).length;
                const lessonCount = modTasks.filter(t => progress[t.id]?.lesson).length;

                return (
                  <button
                    className="module-card"
                    key={m.id}
                    onClick={() => openModule(m.id)}
                    style={{ borderTopColor: subjectColor(m.subject) }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span className="module-code">{m.id}</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                          {pretty(m.start)} – {pretty(m.effectiveEnd)}
                        </span>
                      </div>
                      <small style={{ fontWeight: 800, color: subjectColor(m.subject), textTransform: 'uppercase' }}>
                        {m.subject}
                      </small>
                      <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '6px 0 14px' }}>{m.name}</h3>
                    </div>

                    <div>
                      <Meter value={pct(doneCount, modTasks.length)} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '10px', fontWeight: 700 }}>
                        <span>{lessonCount}/{modTasks.length} lessons learned</span>
                        <strong style={{ color: 'var(--green-600)' }}>{pct(doneCount, modTasks.length)}% Mastered</strong>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ==================== PROGRESS & ANALYTICS VIEW ==================== */}
        {view === 'Progress' && (
          <>
            <section className="stats">
              <article>
                <small>Overall Completion</small>
                <strong>{locked ? '—' : pct(finished, plan.topics.length)}%</strong>
                <Meter value={pct(finished, plan.topics.length)} />
              </article>
              <article>
                <small>Lessons Covered</small>
                <strong>{locked ? '—' : pct(learned, plan.topics.length)}%</strong>
                <small>{learned} of {plan.topics.length} topics</small>
              </article>
              <article>
                <small>Total Study Time</small>
                <strong>{locked ? '—' : totalHours}h</strong>
                <small>{plan.tasks.filter(t => progress[t.id]?.done).length} sessions completed</small>
              </article>
              <article>
                <small>Total XP Earned</small>
                <strong style={{ color: 'var(--yellow-500)' }}>{totalXP} XP</strong>
                <small>{levelInfo.badge} Level {levelInfo.level} {levelInfo.name}</small>
              </article>
            </section>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
              <button className="btn btn-outline btn-sm" onClick={exportCSV}>
                <Download size={16} /> Export Progress (CSV)
              </button>
            </div>

            <div className="progress-grid">
              {/* Subject Breakdown Panel */}
              <section className="panel">
                <h2>Subject-Wise Completion</h2>
                {subjects.map(s => {
                  const sTopics = plan.topics.filter(t => t.subject === s);
                  const sDone = sTopics.filter(t => complete(progress[t.id])).length;
                  const sPct = pct(sDone, sTopics.length);

                  return (
                    <div style={{ marginBottom: '18px' }} key={s}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>
                        <span>{s}</span>
                        <span>{sDone}/{sTopics.length} ({sPct}%)</span>
                      </div>
                      <div className="progress-bar progress-bar-sm" style={{ background: 'var(--border)' }}>
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${sPct}%`,
                            background: subjectColor(s),
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* Monthly Planned vs Actual Hours */}
              <section className="panel">
                <h2>Study Hours by Month</h2>
                {['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].map(month => {
                  const actual = hrs(plan.tasks.filter(t => t.date.startsWith(month)).reduce((s, t) => s + (progress[t.id]?.hours || 0), 0));
                  const planned = hrs(plan.tasks.filter(t => t.date.startsWith(month)).reduce((s, t) => s + t.hours, 0));
                  const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(month + '-15'));

                  return (
                    <div style={{ marginBottom: '18px' }} key={month}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>
                        <strong>{monthName}</strong>
                        <span>{actual}h logged / {planned}h planned</span>
                      </div>
                      <div className="progress-bar progress-bar-sm" style={{ background: 'var(--border)' }}>
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${Math.min(100, pct(actual, planned))}%`,
                            background: 'var(--blue-400)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>

            {/* GitHub / Duolingo Style Activity Heatmap */}
            <section className="panel" style={{ marginTop: '24px' }}>
              <h2>Activity Heatmap (Oct 2026 – Feb 2027)</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Daily study intensity based on hours logged and sessions completed.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(14px, 1fr))',
                  gap: '4px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {dates.map(d => {
                  const dTasks = plan.tasks.filter(t => t.date === d);
                  const dDone = dTasks.filter(t => progress[t.id]?.done).length;
                  const dHrs = dTasks.reduce((s, t) => s + (progress[t.id]?.hours || 0), 0);
                  let level = 0;
                  if (dDone > 0 || dHrs > 0) {
                    if (dHrs >= 4 || dDone >= 4) level = 4;
                    else if (dHrs >= 2.5 || dDone >= 3) level = 3;
                    else if (dHrs >= 1 || dDone >= 2) level = 2;
                    else level = 1;
                  }

                  return (
                    <div
                      key={d}
                      className={`heatmap-cell heatmap-level-${level}`}
                      title={`${pretty(d)}: ${dHrs}h logged, ${dDone} sessions done`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => {
                        setSelected(d);
                        setView('Today');
                      }}
                    />
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* ==================== SPACED REPETITION / REVIEWS VIEW ==================== */}
        {view === 'Reviews' && (
          <div className="card">
            <h2>🧠 Spaced Repetition Review Vault</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '8px 0 20px' }}>
              Topics reviewed using the scientific 1-3-7-21 day spacing are retained 4x longer than massed cramming.
            </p>

            {reviewsDue.length === 0 ? (
              <div className="empty">
                <CheckCheck size={40} style={{ color: 'var(--green-500)', margin: '0 auto 12px' }} />
                <h3>All caught up on spaced reviews!</h3>
                <p>When you check "Lesson" on topics, spaced review reminders will automatically queue here.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {reviewsDue.map(({ topic: t, interval, dueDate }) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px 20px',
                      background: 'var(--bg)',
                      borderRadius: 'var(--radius-lg)',
                      border: '2px solid var(--border)',
                    }}
                  >
                    <div>
                      <span className="badge badge-purple" style={{ marginBottom: '4px' }}>
                        Day {interval} Review Due
                      </span>
                      <h4 style={{ fontSize: '17px', fontWeight: 800 }}>{t.name}</h4>
                      <small style={{ color: 'var(--text-secondary)' }}>
                        {t.subject} · Last studied: {pretty(dueDate)}
                      </small>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          void save(t.id, { ...(progress[t.id] || {}), lastStudied: today });
                          showToast('Review marked! Interval reset for extra practice.');
                        }}
                      >
                        Needs Work 🔄
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          void save(t.id, { ...(progress[t.id] || {}), lastStudied: today, revision: true });
                          playChime();
                          showToast('Great job! Retention verified +25 XP');
                        }}
                      >
                        Mastered ✓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== DOUBT VAULT VIEW ==================== */}
        {view === 'Doubts' && (
          <div className="card">
            <h2>❓ Unresolved Doubts & Questions</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '8px 0 20px' }}>
              Track all your conceptual doubts and tricky questions across the 150 topics in one centralized place.
            </p>

            {doubtsList.length === 0 ? (
              <div className="empty">
                <CheckCheck size={40} style={{ color: 'var(--green-500)', margin: '0 auto 12px' }} />
                <h3>No unresolved doubts!</h3>
                <p>Add doubts on any topic in the Syllabus view to track them here until clarified.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {doubtsList.map(({ topic: t, doubt }) => (
                  <div
                    key={t.id}
                    style={{
                      padding: '18px 22px',
                      background: 'var(--bg)',
                      borderRadius: 'var(--radius-lg)',
                      border: '2px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '16px',
                    }}
                  >
                    <div>
                      <span className="badge badge-purple" style={{ marginBottom: '6px' }}>{t.subject}</span>
                      <h4 style={{ fontSize: '16px', fontWeight: 800 }}>{t.name}</h4>
                      <p style={{ marginTop: '8px', fontSize: '15px', color: 'var(--text)', fontStyle: 'italic' }}>
                        "{doubt}"
                      </p>
                    </div>

                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        void save(t.id, { ...(progress[t.id] || {}), doubtResolved: true });
                        playChime();
                        showToast('Doubt resolved! +15 XP');
                      }}
                    >
                      Resolve ✓
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ==================== MODALS ==================== */}

      {/* 1. DUOLINGO STREAK CALENDAR MODAL */}
      {showStreakModal && (
        <div className="modal-backdrop" onClick={() => setShowStreakModal(false)}>
          <div className="streak-calendar-box modal" onClick={e => e.stopPropagation()}>
            <div className="streak-hero">
              <span className="streak-hero-flame">🔥</span>
              <h2>{streakDays.current} Day Streak!</h2>
              <p>Keep your momentum going! Complete at least 1 session every day.</p>
            </div>

            {/* Weekly bubbles */}
            <div className="week-bubbles">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((dayChar, i) => {
                const isActive = i < (streakDays.current % 7 || 7);
                return (
                  <div className="week-bubble" key={i}>
                    <div className={`bubble-circle ${isActive ? 'active' : ''}`}>
                      {isActive ? '✓' : dayChar}
                    </div>
                    <small>{dayChar}</small>
                  </div>
                );
              })}
            </div>

            <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: 'var(--radius-md)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '28px' }}>🛡️</span>
              <div>
                <strong style={{ fontSize: '14px', display: 'block' }}>Streak Freeze Protected</strong>
                <small style={{ color: 'var(--text-secondary)' }}>Using "Mark Day Off" will keep your streak intact.</small>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowStreakModal(false)}>
                CONTINUE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. DUOLINGO XP & LEVEL MODAL */}
      {showXpModal && (
        <div className="modal-backdrop" onClick={() => setShowXpModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '54px' }}>{levelInfo.badge}</span>
              <h2>Level {levelInfo.level}: {levelInfo.name}</h2>
              <p>{totalXP} Total Experience Points</p>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, marginBottom: '6px' }}>
                <span>Level Progress</span>
                <span>{levelInfo.progressPct}%</span>
              </div>
              <div className="progress-bar progress-bar-lg">
                <div className="progress-bar-fill" style={{ width: `${levelInfo.progressPct}%` }} />
              </div>
              <small style={{ display: 'block', marginTop: '6px', color: 'var(--text-secondary)' }}>
                {levelInfo.nextXp > 0 ? `${levelInfo.nextXp} XP needed to reach next rank.` : 'Max rank reached! Ready for GATE!'}
              </small>
            </div>

            <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: 'var(--radius-lg)', marginBottom: '20px' }}>
              <strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px' }}>XP Earnings Guide:</strong>
              <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: '18px', lineHeight: '1.8' }}>
                <li>Complete a study session: <strong>+10 XP</strong></li>
                <li>Log actual hours: <strong>+5 XP / hour</strong></li>
                <li>Check lesson stage: <strong>+15 XP</strong></li>
                <li>Complete all 4 stages of a topic: <strong>+50 XP</strong></li>
                <li>Spaced repetition review: <strong>+25 XP</strong></li>
              </ul>
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowXpModal(false)}>
                AWESOME!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. EXAM COUNTDOWN MODAL */}
      {showCountdownModal && (
        <div className="modal-backdrop" onClick={() => setShowCountdownModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '54px' }}>🎯</span>
              <h2>{examCountdown.daysLeft} Days to GATE 2027</h2>
              <p>Exam Date: 6 February 2027</p>
            </div>

            <div style={{ background: 'var(--bg)', padding: '18px', borderRadius: 'var(--radius-lg)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span>Pace Status:</span>
                <strong style={{ color: 'var(--green-600)' }}>{examCountdown.pace}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span>Expected Topic Progress:</span>
                <strong>{examCountdown.expectedPct}%</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Your Actual Progress:</span>
                <strong>{examCountdown.actualPct}%</strong>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowCountdownModal(false)}>
                GOT IT!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. POMODORO FOCUS TIMER MODAL */}
      {showPomoModal && (
        <div className="modal-backdrop" onClick={() => setShowPomoModal(false)}>
          <div className="modal pomo-card" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              <button
                className={`tab-btn ${pomoMode === 'focus' ? 'active' : ''}`}
                onClick={() => resetPomo('focus')}
              >
                Focus (25m)
              </button>
              <button
                className={`tab-btn ${pomoMode === 'shortBreak' ? 'active' : ''}`}
                onClick={() => resetPomo('shortBreak')}
              >
                Short (5m)
              </button>
              <button
                className={`tab-btn ${pomoMode === 'longBreak' ? 'active' : ''}`}
                onClick={() => resetPomo('longBreak')}
              >
                Long (15m)
              </button>
            </div>

            <div className="pomo-time">
              {String(pomoMinutes).padStart(2, '0')}:{String(pomoSeconds).padStart(2, '0')}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '20px' }}>
              <button
                className={`btn ${pomoRunning ? 'btn-danger' : 'btn-primary'}`}
                style={{ minWidth: '130px' }}
                onClick={() => setPomoRunning(!pomoRunning)}
              >
                {pomoRunning ? <><Pause size={18} /> PAUSE</> : <><Play size={18} /> START</>}
              </button>
              <button className="btn btn-outline" onClick={() => resetPomo(pomoMode)}>
                <RotateCcw size={18} /> RESET
              </button>
            </div>

            <small style={{ color: 'var(--text-secondary)' }}>
              Bell chime will ring when the timer completes.
            </small>

            <div style={{ marginTop: '20px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPomoModal(false)}>
                Minimize to Top Bar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. SKIP DAY CONFIRMATION MODAL */}
      {showSkipDayModal && (
        <div className="modal-backdrop" onClick={() => setShowSkipDayModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>🏖️ Mark Day Off?</h2>
            <p>
              Missed studying on <strong>{pretty(showSkipDayModal)}</strong>?
              Uncompleted tasks from this day and following sessions in the same module will automatically shift forward by 1 day.
            </p>
            <p style={{ fontSize: '13px', color: 'var(--green-600)', fontWeight: 700 }}>
              ✓ Your study streak is protected by Streak Freeze!
            </p>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowSkipDayModal(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => handleSkipDay(showSkipDayModal)}>
                Confirm & Shift Forward
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. INDIVIDUAL TASK RESCHEDULE MODAL */}
      {rescheduleTaskModal && (
        <div className="modal-backdrop" onClick={() => setRescheduleTaskModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>📅 Reschedule Task</h2>
            <p>
              Move <strong>"{rescheduleTaskModal.activity}"</strong> to a different study date.
            </p>
            <div style={{ margin: '20px 0' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontWeight: 800, fontSize: '14px' }}>
                New Target Date:
                <input
                  type="date"
                  className="duo-input"
                  value={targetMoveDate}
                  min={dates[0]}
                  max={dates.at(-1)}
                  onChange={e => setTargetMoveDate(e.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setRescheduleTaskModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!targetMoveDate || targetMoveDate === rescheduleTaskModal.date}
                onClick={handleMoveSingleTask}
              >
                Save New Date
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. WEEKLY REVIEW SUMMARY MODAL */}
      {showWeeklySummary && (
        <div className="modal-backdrop" onClick={() => setShowWeeklySummary(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
              <span style={{ fontSize: '50px' }}>📊</span>
              <h2>Weekly Performance Summary</h2>
              <p>Your preparation recap</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>HOURS LOGGED</small>
                <strong style={{ fontSize: '24px', display: 'block', marginTop: '4px' }}>{totalHours}h</strong>
              </div>
              <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>TOPICS MASTERED</small>
                <strong style={{ fontSize: '24px', display: 'block', marginTop: '4px' }}>{finished}</strong>
              </div>
              <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>ACTIVE STREAK</small>
                <strong style={{ fontSize: '24px', display: 'block', marginTop: '4px', color: 'var(--orange-500)' }}>
                  {streakDays.current}d 🔥
                </strong>
              </div>
              <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
                <small style={{ color: 'var(--text-secondary)', fontWeight: 800 }}>PACE</small>
                <strong style={{ fontSize: '18px', display: 'block', marginTop: '4px', color: 'var(--green-600)' }}>
                  {examCountdown.pace}
                </strong>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowWeeklySummary(false)}>
                KEEP IT UP!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
