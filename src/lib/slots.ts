export function generateSlots(start: string, end: string, slotMinutes: number, booked: string[]): string[] {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const out: string[] = [];
  for (let t = startMin; t + slotMinutes <= endMin; t += slotMinutes) {
    const h = String(Math.floor(t / 60)).padStart(2, "0");
    const m = String(t % 60).padStart(2, "0");
    const v = `${h}:${m}:00`;
    if (!booked.includes(v)) out.push(v);
  }
  return out;
}

export function dayOfWeekIso(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const js = d.getDay();
  return js === 0 ? 7 : js;
}