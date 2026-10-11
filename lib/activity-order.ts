type OrderedActivity = { id: string; day: number; sortOrder?: number };

/** Time is a reminder only. Missing positions retain the input order. */
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
