import { useMemo, useState, type FormEvent } from 'react';
import { useDataFile } from '../../app/DataContext';
import { MEAL_TYPES, type MealEntry, type MealType } from '../../domain/model';
import { EmptyState, Field, formatDate, localDateValue, newRecordBase, SectionPanel } from '../../shared/ModuleUi';
import { MonthCalendar } from '../../shared/MonthCalendar';
import { shiftCalendarMonth } from '../../shared/calendar';

const mealLabels: Record<MealType, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

export default function DietPage() {
  const { data, updateData } = useDataFile();
  const [date, setDate] = useState(localDateValue());
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');
  const allMeals = data?.meals ?? [];
  const mealsByDate = useMemo(() => {
    const grouped = new Map<string, MealEntry[]>();
    for (const meal of allMeals) grouped.set(meal.date, [...(grouped.get(meal.date) ?? []), meal]);
    return grouped;
  }, [allMeals]);
  const meals = useMemo(() => (mealsByDate.get(date) ?? []).slice().sort((a, b) => MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType) || a.createdAt.localeCompare(b.createdAt)), [mealsByDate, date]);
  const monthMeals = allMeals.filter((meal) => meal.date.slice(0, 7) === date.slice(0, 7));
  const loggedDays = new Set(monthMeals.map((meal) => meal.date)).size;
  const mealCounts = MEAL_TYPES.map((type) => ({ type, count: meals.filter((meal) => meal.mealType === type).length }));

  function addMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !content.trim()) return;
    const meal: MealEntry = { ...newRecordBase(), date, mealType, content: content.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}) };
    updateData((current) => ({ ...current, meals: [...current.meals, meal] }));
    setContent(''); setNotes('');
  }

  function updateMeal(id: string, patch: Partial<MealEntry>) {
    updateData((current) => ({ ...current, meals: current.meals.map((meal) => meal.id === id ? { ...meal, ...patch, updatedAt: new Date().toISOString() } : meal) }));
  }

  function deleteMeal(meal: MealEntry) {
    if (!window.confirm(`删除这条${mealLabels[meal.mealType]}记录？`)) return;
    updateData((current) => ({ ...current, meals: current.meals.filter((row) => row.id !== meal.id) }));
  }

  function labelForDate(day: string): string {
    const rows = mealsByDate.get(day) ?? [];
    const types = MEAL_TYPES.filter((type) => rows.some((meal) => meal.mealType === type)).map((type) => mealLabels[type]);
    return `${day} · ${rows.length ? `${rows.length} 条饮食记录：${types.join('、')}` : '未记录饮食'}`;
  }

  return (
    <div className="module-page diet-page">
      <section className="diet-hero"><div><p className="eyebrow">DAILY FOOD NOTES</p><h2>认真吃饭，也认真照顾自己</h2><p>不用计算热量，按日期记下每一餐和身体感受。</p></div><div className="diet-hero-stats"><div><strong>{loggedDays}</strong><span>本月有记录的日子</span></div><div><strong>{monthMeals.length}</strong><span>本月餐食记录</span></div><span className="diet-hero-mark" aria-hidden="true">◒</span></div></section>

      <SectionPanel title="饮食日历" detail="日历会标出每一天记录了哪些餐次。" className="diet-calendar-panel">
        <MonthCalendar
          labelForDate={labelForDate}
          monthDate={date}
          onSelectDate={setDate}
          onShiftMonth={(offset) => setDate((current) => shiftCalendarMonth(current, offset))}
          renderDay={(day) => {
            const rows = mealsByDate.get(day) ?? [];
            if (!rows.length) return <span aria-hidden="true" className="calendar-rest">—</span>;
            const types = MEAL_TYPES.filter((type) => rows.some((meal) => meal.mealType === type));
            return <span className="diet-calendar-activity"><span className="diet-calendar-count">{rows.length} 餐</span><span className="diet-meal-markers">{types.map((type) => <i aria-label={mealLabels[type]} className={`meal-marker meal-marker-${type}`} key={type} title={mealLabels[type]} />)}</span></span>;
          }}
          selectedDate={date}
          variant="diet"
        />
        <div className="calendar-legend diet-legend"><span><i className="meal-marker meal-marker-breakfast" />早餐</span><span><i className="meal-marker meal-marker-lunch" />午餐</span><span><i className="meal-marker meal-marker-dinner" />晚餐</span><span><i className="meal-marker meal-marker-snack" />加餐</span></div>
      </SectionPanel>

      <div className="diet-journal-layout">
        <SectionPanel title={`${formatDate(date)} · 餐桌记录`} detail={`${meals.length} 餐`} action={<button className="text-button" onClick={() => setDate(localDateValue())} type="button">回到今天</button>} className="diet-day-panel">
          <div className="meal-summary-grid">{mealCounts.map(({ type, count }) => <div className={`meal-summary meal-${type}`} key={type}><span>{mealLabels[type]}</span><strong>{count}</strong></div>)}</div>
          {meals.length === 0 ? <EmptyState title="这一天还没有饮食记录" detail="在右侧写下吃了什么，也可以补记过去的餐食。" /> : <div className="meal-timeline">{meals.map((meal) => <MealRow item={meal} key={meal.id} onDelete={deleteMeal} onUpdate={updateMeal} />)}</div>}
        </SectionPanel>

        <SectionPanel title="记下这一餐" detail="只记食物和感受，不计算热量。" className="diet-create-panel">
          <form className="meal-create-form" onSubmit={addMeal}>
            <Field label="日期"><input aria-label="餐食记录日期" onChange={(event) => setDate(event.target.value)} type="date" value={date} /></Field>
            <Field label="餐次"><select aria-label="餐次" onChange={(event) => setMealType(event.target.value as MealType)} value={mealType}>{MEAL_TYPES.map((type) => <option key={type} value={type}>{mealLabels[type]}</option>)}</select></Field>
            <Field className="meal-content-field" label="吃了什么"><textarea aria-label="饮食内容" onChange={(event) => setContent(event.target.value)} placeholder="例如：鸡蛋、燕麦和一杯牛奶" required value={content} /></Field>
            <Field label="备注 / 感受"><textarea aria-label="饮食备注" onChange={(event) => setNotes(event.target.value)} placeholder="例如：吃完很舒服" value={notes} /></Field>
            <button className="button button-primary" type="submit">保存饮食记录</button>
          </form>
        </SectionPanel>
      </div>
    </div>
  );
}

function MealRow({ item, onUpdate, onDelete }: {
  item: MealEntry;
  onUpdate(id: string, patch: Partial<MealEntry>): void;
  onDelete(item: MealEntry): void;
}) {
  return (
    <article className={`meal-row meal-row-${item.mealType}`}>
      <div className={`meal-time-mark meal-mark-${item.mealType}`}><span /></div>
      <div className="meal-row-body"><div className="record-title-line"><span className={`meal-type-pill meal-${item.mealType}`}>{mealLabels[item.mealType]}</span><strong>{item.content}</strong></div>{item.notes && <p>{item.notes}</p>}
        <details className="record-edit" key={item.updatedAt}><summary>编辑记录</summary><form className="record-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onUpdate(item.id, { date: String(form.get('date')), mealType: String(form.get('mealType')) as MealType, content: String(form.get('content')).trim(), notes: String(form.get('notes')).trim() || undefined }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Field label="日期"><input defaultValue={item.date} name="date" type="date" /></Field><Field label="餐次"><select defaultValue={item.mealType} name="mealType">{MEAL_TYPES.map((type) => <option key={type} value={type}>{mealLabels[type]}</option>)}</select></Field><Field label="饮食内容"><input aria-label={`编辑饮食内容：${item.content}`} defaultValue={item.content} name="content" required /></Field><Field label="备注"><input defaultValue={item.notes ?? ''} name="notes" /></Field><button className="button button-primary" type="submit">保存修改</button></form></details>
      </div>
      <button aria-label={`删除饮食记录：${item.content}`} className="icon-button danger-button" onClick={() => onDelete(item)} type="button">×</button>
    </article>
  );
}
