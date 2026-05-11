export function mergeById<T extends { id: string }>(seededItems: T[], localItems: T[] = []) {
  const localIds = new Set(localItems.map((item) => item.id));
  return [...localItems, ...seededItems.filter((item) => !localIds.has(item.id))];
}
