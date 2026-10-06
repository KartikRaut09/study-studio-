export type ScheduleAction = 'skip_day' | 'move_task' | 'reset';

export interface ScheduleOverride {
  id: string;
  action: ScheduleAction;
  date?: string;          // For skip_day
  shiftDays?: number;     // Number of days to shift (default 1)
  moduleIds?: string[];   // Specific modules to shift, or all if empty
  taskId?: string;        // For move_task
  fromDate?: string;      // For move_task
  toDate?: string;        // For move_task
  createdAt: string;
  reason?: string;
}

export interface TaskItem {
  id: string;
  date: string;
  start: string;
  end: string;
  hours: number;
  activity: string;
  target: string;
  subject: string;
  moduleId: string;
}

export interface EffectiveTask extends TaskItem {
  originalDate: string;
  isRescheduled: boolean;
  rescheduleReason?: string;
}

export interface ModuleItem {
  id: string;
  name: string;
  subject: string;
  start: string;
  end: string;
}

export interface EffectiveSchedule {
  tasks: EffectiveTask[];
  tasksByDate: Record<string, EffectiveTask[]>;
  tasksById: Record<string, EffectiveTask>;
  skippedDates: string[];
  movedTaskIds: string[];
  modules: (ModuleItem & { effectiveEnd: string; isExtended: boolean })[];
}

// Add N calendar days to YYYY-MM-DD
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Compute the effective schedule from original plan and overrides
export function computeEffectiveSchedule(
  baseTasks: TaskItem[],
  baseModules: ModuleItem[],
  overrides: ScheduleOverride[],
  completedTaskIds: Set<string> = new Set()
): EffectiveSchedule {
  const effectiveMap = new Map<string, EffectiveTask>();
  const skippedDatesSet = new Set<string>();
  const movedTaskIdsSet = new Set<string>();

  // Initialize with base tasks
  for (const t of baseTasks) {
    effectiveMap.set(t.id, {
      ...t,
      originalDate: t.date,
      isRescheduled: false,
    });
  }

  // Apply overrides sequentially in chronological order
  for (const ov of overrides) {
    if (ov.action === 'reset') {
      // Reset all back to base
      skippedDatesSet.clear();
      movedTaskIdsSet.clear();
      for (const t of baseTasks) {
        effectiveMap.set(t.id, {
          ...t,
          originalDate: t.date,
          isRescheduled: false,
        });
      }
      continue;
    }

    if (ov.action === 'skip_day' && ov.date) {
      skippedDatesSet.add(ov.date);
      const shift = ov.shiftDays || 1;
      const targetModules = ov.moduleIds && ov.moduleIds.length > 0
        ? new Set(ov.moduleIds)
        : null;

      // Find affected tasks: on or after this date
      // Tasks on ov.date that are NOT completed shift forward
      // Tasks after ov.date in the same module also shift forward
      const affectedModuleIds = new Set<string>();

      for (const task of effectiveMap.values()) {
        if (task.date === ov.date && !completedTaskIds.has(task.id)) {
          if (!targetModules || targetModules.has(task.moduleId)) {
            affectedModuleIds.add(task.moduleId);
          }
        }
      }

      for (const task of effectiveMap.values()) {
        if (task.date === ov.date && !completedTaskIds.has(task.id)) {
          if (!targetModules || targetModules.has(task.moduleId)) {
            task.date = addDays(task.date, shift);
            task.isRescheduled = true;
            task.rescheduleReason = `Day off (${ov.date})`;
            movedTaskIdsSet.add(task.id);
          }
        } else if (task.date > ov.date && affectedModuleIds.has(task.moduleId)) {
          task.date = addDays(task.date, shift);
          task.isRescheduled = true;
          task.rescheduleReason = `Shifted due to day off (${ov.date})`;
          movedTaskIdsSet.add(task.id);
        }
      }
    }

    if (ov.action === 'move_task' && ov.taskId && ov.toDate) {
      const task = effectiveMap.get(ov.taskId);
      if (task) {
        task.date = ov.toDate;
        task.isRescheduled = task.date !== task.originalDate;
        task.rescheduleReason = `Moved manually from ${ov.fromDate || task.originalDate}`;
        movedTaskIdsSet.add(task.id);
      }
    }
  }

  const tasks = Array.from(effectiveMap.values());
  const tasksByDate: Record<string, EffectiveTask[]> = {};
  const tasksById: Record<string, EffectiveTask> = {};

  for (const t of tasks) {
    tasksById[t.id] = t;
    if (!tasksByDate[t.date]) tasksByDate[t.date] = [];
    tasksByDate[t.date].push(t);
  }

  // Sort tasks in each date by start time
  for (const date in tasksByDate) {
    tasksByDate[date].sort((a, b) => a.start.localeCompare(b.start));
  }

  // Compute effective module end dates
  const modules = baseModules.map(m => {
    const modTasks = tasks.filter(t => t.moduleId === m.id);
    let maxDate = m.end;
    for (const t of modTasks) {
      if (t.date > maxDate) maxDate = t.date;
    }
    return {
      ...m,
      effectiveEnd: maxDate,
      isExtended: maxDate > m.end,
    };
  });

  return {
    tasks,
    tasksByDate,
    tasksById,
    skippedDates: Array.from(skippedDatesSet),
    movedTaskIds: Array.from(movedTaskIdsSet),
    modules,
  };
}
