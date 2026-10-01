import type { ReactNode } from 'react';
import { localDateValue } from './ModuleUi';
import { calendarMonthDates, calendarMonthTitle } from './calendar';

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

export function MonthCalendar({
  monthDate, selectedDate, variant, onSelectDate, onShiftMonth, renderDay, labelForDate,
}: {
  monthDate: string;
  selectedDate: string;
  variant: 'fitness' | 'diet';
  onSelectDate(date: string): void;
  onShiftMonth(offset: number): void;
  renderDay(date: string): ReactNode;
  labelForDate(date: string): string;
}) {
  return <div aria-label={`${variant === 'fitness' ? '训练' : '饮食'}月历`} className={`month-calendar month-calendar-${variant}`}>
    <header className="month-calendar-header"><button aria-label="上个月" className="calendar-nav-button" onClick={() => onShiftMonth(-1)} type="button">‹</button><h3>{calendarMonthTitle(monthDate)}</h3><button aria-label="下个月" className="calendar-nav-button" onClick={() => onShiftMonth(1)} type="button">›</button></header>
    <div aria-hidden="true" className="calendar-weekdays">{weekdays.map((day, index) => <span className={index === 0 || index === 6 ? 'weekend' : ''} key={day}>{day}</span>)}</div>
    <div className="calendar-days" role="grid">{calendarMonthDates(monthDate).map((date, index) => date
      ? <button aria-label={labelForDate(date)} aria-pressed={selectedDate === date} className={`calendar-day${selectedDate === date ? ' is-selected' : ''}${date === localDateValue() ? ' is-today' : ''}${index % 7 === 0 || index % 7 === 6 ? ' is-weekend' : ''}`} key={date} onClick={() => onSelectDate(date)} role="gridcell" type="button"><span className="calendar-day-number">{Number(date.slice(-2))}</span>{renderDay(date)}</button>
      : <span aria-hidden="true" className="calendar-day is-empty" key={`empty-${index}`} />)}</div>
  </div>;
}
