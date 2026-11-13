type OrderedActivity = { id: string; day: number; sortOrder?: number };

/** Reads preserve persisted/manual positions, never sort by time. */
export function sortActivities<T extends OrderedActivity>(items: T[]): T[] {
  return items.map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.day - b.item.day || (a.item.sortOrder ?? a.index) - (b.item.sortOrder ?? b.index) || a.index - b.index)
    .map(({ item }) => item);
}

/** Persist the submitted order, never derive it from reminder times. */
export function numberActivities<T extends OrderedActivity>(items: T[]): T[] {
  return [...items].sort((a, b) => a.day - b.day).map((item, sortOrder) => ({ ...item, sortOrder }));
}

export function moveActivity<T extends OrderedActivity>(items: T[], id: string, day: number, beforeId?: string): T[] {
  const activity = items.find(item => item.id === id);
  if (!activity || beforeId === id) return items;
  const remaining = items.filter(item => item.id !== id);
  let index = beforeId ? remaining.findIndex(item => item.id === beforeId && item.day === day) : -1;
  if (index < 0) {
    index = remaining.findIndex(item => item.day > day);
    if (index < 0) index = remaining.length;
  }
  remaining.splice(index, 0, { ...activity, day });
  return numberActivities(remaining);
}

/** Only an explicit create/time/day edit positions the affected item by its time. */
export function insertActivityByTime<T extends OrderedActivity & { time: string }>(items: T[], activity: T): T[] {
  const ordered = sortActivities(items);
  const previous = ordered.find(item => item.id === activity.id);
  // Editing title/place alone must preserve an intentional manual position.
  if (previous && previous.day === activity.day && previous.time === activity.time) {
    return ordered.map(item => item.id === activity.id ? activity : item);
  }
  const seconds = (value: string) => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
    return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0) : undefined;
  };
  const time = seconds(activity.time);
  if (activity.time && time === undefined) throw new Error("Inserisci un orario valido (HH:mm).");
  const remaining = ordered.filter(item => item.id !== activity.id);
  const day = remaining.map((item, index) => ({ item, index, time: seconds(item.time) })).filter(row => row.item.day === activity.day);
  let index = day.length ? day[day.length - 1].index + 1 : remaining.findIndex(item => item.day > activity.day);
  if (index < 0) index = remaining.length;
  if (time !== undefined) {
    const timed = day.filter(row => row.time !== undefined);
    const equal = timed.filter(row => row.time === time);
    const later = timed.filter(row => row.time! > time).sort((a, b) => a.time! - b.time!)[0];
    if (equal.length) index = equal[equal.length - 1].index + 1;
    else if (later) index = later.index;
    else if (timed.length) index = timed[timed.length - 1].index + 1;
    else if (day.length) index = day[0].index;
  }
  remaining.splice(index, 0, activity);
  return numberActivities(remaining);
}
