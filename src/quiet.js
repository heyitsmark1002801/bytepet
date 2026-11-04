// Notification rules: quiet hours and a daily limit. Pure, so it's easy to test.
function inQuietHours(hour, start = 23, end = 8) {
  start = Number(start); end = Number(end);
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

// Returns { ok, reason } for whether a notification may be shown now.
function allowNotification({ hour, sentToday, start, end, max }) {
  if (inQuietHours(hour, start, end)) return { ok: false, reason: 'quiet hours' };
  if (sentToday >= (max ?? 8)) return { ok: false, reason: 'daily limit' };
  return { ok: true };
}

module.exports = { inQuietHours, allowNotification };
