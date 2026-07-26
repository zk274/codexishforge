function itemKey(item) {
  if (item?.type === "userMessage") return "userMessage";
  if (item?.id != null) return `${item.type || "item"}:${item.id}`;
  return null;
}

function copyItem(item) {
  return item && typeof item === "object" ? { ...item } : item;
}

export function mergeTurnSnapshot(existing, incoming) {
  if (!existing) {
    return {
      ...incoming,
      items: (incoming?.items || []).map(copyItem),
    };
  }

  const incomingItems = incoming?.items || [];
  const incomingByKey = new Map();
  for (const item of incomingItems) {
    const key = itemKey(item);
    if (key != null) incomingByKey.set(key, item);
  }

  const consumed = new Set();
  const items = (existing.items || []).map((item) => {
    const key = itemKey(item);
    const replacement = key == null ? null : incomingByKey.get(key);
    if (!replacement) return copyItem(item);
    consumed.add(key);
    return { ...item, ...replacement };
  });

  for (const item of incomingItems) {
    const key = itemKey(item);
    if (key == null || !consumed.has(key)) {
      items.push(copyItem(item));
      if (key != null) consumed.add(key);
    }
  }

  return { ...existing, ...incoming, items };
}
