import { useMemo, useState, type FormEvent } from 'react';
import { useDataFile } from '../../app/DataContext';
import { syncLinkedPlanItems } from '../../domain/agenda';
import type { ExerciseEntry, Workout } from '../../domain/model';
import { EmptyState, Field, formatDate, localDateValue, newRecordBase, SectionPanel } from '../../shared/ModuleUi';
import { MonthCalendar } from '../../shared/MonthCalendar';
import { shiftCalendarMonth } from '../../shared/calendar';

const bodyParts = ['胸部', '背部', '肩部', '手臂', '核心', '臀腿', '有氧', '全身'];
type ExerciseDraft = { bodyPart: string; name: string; sets: string; reps: string; weight: string };
const emptyExercise = (): ExerciseDraft => ({ bodyPart: '', name: '', sets: '', reps: '', weight: '' });
const asOptionalNumber = (value: FormDataEntryValue | null) => String(value ?? '').trim() === '' ? undefined : Number(value);

export default function FitnessPage() {
  const { data, updateData } = useDataFile();
  const [date, setDate] = useState(localDateValue());
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<ExerciseDraft[]>([emptyExercise()]);
  const allWorkouts = data?.workouts ?? [];
  const workoutsByDate = useMemo(() => {
    const grouped = new Map<string, Workout[]>();
    for (const workout of allWorkouts) grouped.set(workout.date, [...(grouped.get(workout.date) ?? []), workout]);
    return grouped;
  }, [allWorkouts]);
  const workouts = useMemo(() => (workoutsByDate.get(date) ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [workoutsByDate, date]);
  const monthWorkouts = allWorkouts.filter((workout) => workout.date.slice(0, 7) === date.slice(0, 7));
  const monthDays = new Set(monthWorkouts.map((workout) => workout.date)).size;
  const completed = workouts.filter((workout) => workout.completed).length;

  function addWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const exercises: ExerciseEntry[] = drafts.filter((exercise) => exercise.name.trim()).map((exercise) => ({
      id: crypto.randomUUID(), bodyPart: exercise.bodyPart, name: exercise.name.trim(),
      ...(exercise.sets ? { sets: Number(exercise.sets) } : {}),
      ...(exercise.reps ? { reps: Number(exercise.reps) } : {}),
      ...(exercise.weight ? { weight: Number(exercise.weight) } : {}),
    }));
    if (!data || !name.trim() || exercises.length === 0) return;
    const workout: Workout = { ...newRecordBase(), date, name: name.trim(), exercises, completed: false };
    updateData((current) => ({ ...current, workouts: [...current.workouts, workout] }));
    setName(''); setDrafts([emptyExercise()]);
  }

  function updateWorkout(id: string, patch: Partial<Workout>) {
    updateData((current) => {
      const workouts = current.workouts.map((workout) => workout.id === id ? { ...workout, ...patch, updatedAt: new Date().toISOString() } : workout);
      const updated = workouts.find((workout) => workout.id === id)!;
      return syncLinkedPlanItems({ ...current, workouts }, { type: 'workout', id }, { title: updated.name, date: updated.date, completed: updated.completed });
    });
  }

  function deleteWorkout(workout: Workout) {
    if (!window.confirm(`删除训练“${workout.name}”及其动作记录？`)) return;
    updateData((current) => ({
      ...current,
      workouts: current.workouts.filter((row) => row.id !== workout.id),
      planItems: current.planItems.filter((row) => !(row.linkedRecord?.type === 'workout' && row.linkedRecord.id === workout.id)),
    }));
  }

  function updateExercise(workout: Workout, exerciseId: string, patch: Partial<ExerciseEntry>) {
    updateWorkout(workout.id, { exercises: workout.exercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...patch } : exercise) });
  }

  function deleteExercise(workout: Workout, exercise: ExerciseEntry) {
    if (!window.confirm(`移除动作“${exercise.name}”？`)) return;
    updateWorkout(workout.id, { exercises: workout.exercises.filter((row) => row.id !== exercise.id) });
  }

  function labelForDate(day: string): string {
    const rows = workoutsByDate.get(day) ?? [];
    const parts = [...new Set(rows.flatMap((workout) => workout.exercises.map((exercise) => exercise.bodyPart ?? '未分类')))];
    return `${day} · ${rows.length ? `${rows.length} 次训练：${parts.join('、') || '部位未记录'}` : '休息日'}`;
  }

  return (
    <div className="module-page fitness-page">
      <section className="fitness-hero"><div><p className="eyebrow">TRAINING LOG</p><h2>按自己的节奏，练出稳定状态</h2><p>训练日历会把部位、动作和次数留在每一天。</p></div><div className="fitness-hero-stats"><div><strong>{monthDays}</strong><span>本月训练日</span></div><div><strong>{monthWorkouts.length}</strong><span>次训练安排</span></div><div><strong>{monthWorkouts.filter((workout) => workout.completed).length}</strong><span>次已完成</span></div></div><span className="fitness-hero-mark" aria-hidden="true">✳</span></section>

      <div className="fitness-calendar-layout">
        <SectionPanel title="训练日历" detail="点选日期查看动作，也可翻月回顾训练节奏。" className="fitness-calendar-panel">
          <MonthCalendar
            labelForDate={labelForDate}
            monthDate={date}
            onSelectDate={setDate}
            onShiftMonth={(offset) => setDate((current) => shiftCalendarMonth(current, offset))}
            renderDay={(day) => {
              const rows = workoutsByDate.get(day) ?? [];
              if (!rows.length) return <span aria-hidden="true" className="calendar-rest">休息</span>;
              const parts = [...new Set(rows.flatMap((workout) => workout.exercises.map((exercise) => exercise.bodyPart ?? '未分类')))];
              return <span className="fitness-calendar-activity"><span className="calendar-training-count">{rows.length} 次</span><span className="calendar-part-list">{parts.slice(0, 2).map((part) => <i key={part}>{part}</i>)}{parts.length > 2 && <i>+{parts.length - 2}</i>}</span></span>;
            }}
            selectedDate={date}
            variant="fitness"
          />
          <div className="calendar-legend"><span><i className="legend-workout" />有训练</span><span><i className="legend-selected" />当前日期</span><span>训练卡片标出部位</span></div>
        </SectionPanel>

        <div className="fitness-day-column">
          <SectionPanel title={`${formatDate(date)} · 当日训练`} detail={`${workouts.length} 次安排 · ${completed} 次已完成`} action={<button className="text-button" onClick={() => setDate(localDateValue())} type="button">回到今天</button>} className="fitness-day-panel">
            {workouts.length === 0 ? <EmptyState title="这一天安排休息" detail="选一个日期，记录训练动作与次数。" /> : <div className="workout-list">{workouts.map((workout) => <WorkoutCard item={workout} key={workout.id} onDelete={deleteWorkout} onUpdate={updateWorkout} onDeleteExercise={deleteExercise} onUpdateExercise={updateExercise} />)}</div>}
          </SectionPanel>

          <SectionPanel title="安排一次训练" detail="每个动作都可以标记训练部位、组数和次数。" className="fitness-create-panel">
            <form className="workout-create-form" onSubmit={addWorkout}>
              <div className="workout-create-top"><Field label="训练名称"><input aria-label="训练名称" onChange={(event) => setName(event.target.value)} placeholder="例如：下肢力量" required value={name} /></Field><Field label="训练日期"><input aria-label="训练安排日期" onChange={(event) => setDate(event.target.value)} type="date" value={date} /></Field></div>
              <div className="exercise-draft-list">{drafts.map((exercise, index) => <div className="exercise-draft" key={index}>
                <Field label="训练部位"><select aria-label={`动作部位 ${index + 1}`} onChange={(event) => setDrafts((current) => current.map((item, row) => row === index ? { ...item, bodyPart: event.target.value } : item))} required value={exercise.bodyPart}><option value="">选择部位</option>{bodyParts.map((part) => <option key={part} value={part}>{part}</option>)}</select></Field>
                <Field label={`动作名称 ${index + 1}`}><input aria-label={`动作名称 ${index + 1}`} onChange={(event) => setDrafts((current) => current.map((item, row) => row === index ? { ...item, name: event.target.value } : item))} placeholder="动作名称" required={index === 0} value={exercise.name} /></Field>
                <Field label="组数"><input aria-label={`动作组数 ${index + 1}`} min="0" onChange={(event) => setDrafts((current) => current.map((item, row) => row === index ? { ...item, sets: event.target.value } : item))} type="number" value={exercise.sets} /></Field>
                <Field label="次数"><input aria-label={`动作次数 ${index + 1}`} min="0" onChange={(event) => setDrafts((current) => current.map((item, row) => row === index ? { ...item, reps: event.target.value } : item))} type="number" value={exercise.reps} /></Field>
                <Field label="重量（kg）"><input aria-label={`动作重量 ${index + 1}`} min="0" step="0.5" onChange={(event) => setDrafts((current) => current.map((item, row) => row === index ? { ...item, weight: event.target.value } : item))} type="number" value={exercise.weight} /></Field>
                {drafts.length > 1 && <button aria-label={`移除动作行 ${index + 1}`} className="icon-button danger-button" onClick={() => setDrafts((current) => current.filter((_, row) => row !== index))} type="button">×</button>}
              </div>)}</div>
              <div className="workout-form-actions"><button className="text-button" onClick={() => setDrafts((current) => [...current, emptyExercise()])} type="button">＋ 添加动作</button><button className="button button-primary" type="submit">保存训练安排</button></div>
            </form>
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}

function WorkoutCard({ item, onUpdate, onDelete, onUpdateExercise, onDeleteExercise }: {
  item: Workout;
  onUpdate(id: string, patch: Partial<Workout>): void;
  onDelete(item: Workout): void;
  onUpdateExercise(workout: Workout, exerciseId: string, patch: Partial<ExerciseEntry>): void;
  onDeleteExercise(workout: Workout, exercise: ExerciseEntry): void;
}) {
  const [addingExercise, setAddingExercise] = useState(false);

  function addExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const exercise: ExerciseEntry = {
      id: crypto.randomUUID(), bodyPart: String(form.get('bodyPart')), name: String(form.get('name')).trim(),
      ...(asOptionalNumber(form.get('sets')) !== undefined ? { sets: asOptionalNumber(form.get('sets')) } : {}),
      ...(asOptionalNumber(form.get('reps')) !== undefined ? { reps: asOptionalNumber(form.get('reps')) } : {}),
      ...(asOptionalNumber(form.get('weight')) !== undefined ? { weight: asOptionalNumber(form.get('weight')) } : {}),
    };
    onUpdate(item.id, { exercises: [...item.exercises, exercise] });
    setAddingExercise(false);
  }

  return (
    <article className={`workout-card${item.completed ? ' workout-completed' : ''}`}>
      <header className="workout-card-header"><div className="workout-mark" aria-hidden="true">✳</div><div className="workout-card-title"><strong>{item.name}</strong><span>{formatDate(item.date)}{item.actualDate ? ` · 完成于 ${formatDate(item.actualDate)}` : ''}</span></div><span className={`stage-pill ${item.completed ? 'task-done' : 'task-in-progress'}`}>{item.completed ? '已完成' : '计划中'}</span><button aria-label={`${item.completed ? '撤销完成' : '标记训练完成'}：${item.name}`} className={`button ${item.completed ? 'button-secondary' : 'button-primary'}`} onClick={() => onUpdate(item.id, { completed: !item.completed, actualDate: item.completed ? undefined : localDateValue() })} type="button">{item.completed ? '撤销完成' : '完成训练'}</button></header>
      {item.notes && <p className="workout-notes">{item.notes}</p>}
      <div className="exercise-list">{item.exercises.map((exercise) => <div className="exercise-row" key={exercise.id}><span className="exercise-dot" /><span className="exercise-part-tag">{exercise.bodyPart ?? '未分类'}</span><strong>{exercise.name}</strong><span className="exercise-reps">{exercise.sets ? `${exercise.sets} 组` : ''}{exercise.reps ? ` × ${exercise.reps} 次` : ''}{exercise.weight ? ` · ${exercise.weight} kg` : ''}</span><details className="record-edit" key={item.updatedAt}><summary>编辑动作</summary><form className="record-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onUpdateExercise(item, exercise.id, { bodyPart: String(form.get('bodyPart')) || undefined, name: String(form.get('name')).trim(), sets: asOptionalNumber(form.get('sets')), reps: asOptionalNumber(form.get('reps')), weight: asOptionalNumber(form.get('weight')) }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Field label="训练部位"><select aria-label={`编辑动作部位：${exercise.name}`} defaultValue={exercise.bodyPart ?? ''} name="bodyPart"><option value="">未分类</option>{bodyParts.map((part) => <option key={part} value={part}>{part}</option>)}</select></Field><Field label="动作名称"><input aria-label={`编辑动作名称：${exercise.name}`} defaultValue={exercise.name} name="name" required /></Field><Field label="组数"><input aria-label={`编辑动作组数：${exercise.name}`} defaultValue={exercise.sets ?? ''} min="0" name="sets" type="number" /></Field><Field label="次数"><input aria-label={`编辑动作次数：${exercise.name}`} defaultValue={exercise.reps ?? ''} min="0" name="reps" type="number" /></Field><Field label="重量（kg）"><input aria-label={`编辑动作重量：${exercise.name}`} defaultValue={exercise.weight ?? ''} min="0" name="weight" step="0.5" type="number" /></Field><button className="button button-primary" type="submit">保存动作</button></form></details><button aria-label={`移除动作：${exercise.name}`} className="icon-button danger-button" onClick={() => onDeleteExercise(item, exercise)} type="button">×</button></div>)}</div>
      {addingExercise ? <form className="exercise-inline-form" onSubmit={addExercise}><Field label="训练部位"><select name="bodyPart" required><option value="">选择部位</option>{bodyParts.map((part) => <option key={part} value={part}>{part}</option>)}</select></Field><Field label="动作名称"><input aria-label={`新增动作：${item.name}`} name="name" required /></Field><Field label="组数"><input min="0" name="sets" type="number" /></Field><Field label="次数"><input min="0" name="reps" type="number" /></Field><Field label="重量（kg）"><input min="0" name="weight" step="0.5" type="number" /></Field><button className="button button-primary" type="submit">添加动作</button><button className="text-button" onClick={() => setAddingExercise(false)} type="button">取消</button></form> : <button className="text-button workout-add-exercise" onClick={() => setAddingExercise(true)} type="button">＋ 添加动作</button>}
      <details className="record-edit workout-edit" key={`details-${item.updatedAt}`}><summary>编辑训练安排</summary><form className="record-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onUpdate(item.id, { name: String(form.get('name')).trim(), date: String(form.get('date')), notes: String(form.get('notes')).trim() || undefined }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Field label="训练名称"><input defaultValue={item.name} name="name" required /></Field><Field label="计划日期"><input defaultValue={item.date} name="date" type="date" /></Field><Field label="训练备注"><input defaultValue={item.notes ?? ''} name="notes" /></Field><button className="button button-primary" type="submit">保存安排</button></form></details>
      <button aria-label={`删除训练：${item.name}`} className="icon-button danger-button workout-delete" onClick={() => onDelete(item)} type="button">删除训练</button>
    </article>
  );
}
