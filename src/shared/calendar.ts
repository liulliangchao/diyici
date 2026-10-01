export function calendarMonthDates(value: string): Array<string | null> {
  const [year, month] = value.slice(0, 7).split('-').map(Number);
  const startWeekday = new Date(year, month - 1, 1, 12).getDay();
  const dayCount = new Date(year, month, 0, 12).getDate();
  const cellCount = Math.ceil((startWeekday + dayCount) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - startWeekday + 1;
    return day < 1 || day > dayCount ? null : `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
  });
}

export function shiftCalendarMonth(value: string, offset: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const target = new Date(year, month - 1 + offset, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(day, lastDay));
  return `${target.getFullYear()}-${`${target.getMonth() + 1}`.padStart(2, '0')}-${`${target.getDate()}`.padStart(2, '0')}`;
}

export function calendarMonthTitle(value: string): string {
  const [year, month] = value.slice(0, 7).split('-').map(Number);
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(new Date(year, month - 1, 1, 12));
}
