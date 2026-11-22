export function shortDateTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
}

export function dateOnly(value) {
  if (!value) return '-';
  return String(value).slice(0, 10);
}

export function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}
