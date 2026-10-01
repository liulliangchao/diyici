import { useMemo, useState, type FormEvent } from 'react';
import { useDataFile } from '../../app/DataContext';
import { GAME_STATUSES, type Game, type GameStatus, type PlaySession } from '../../domain/model';
import { EmptyState, Field, formatDate, localDateValue, newRecordBase, SectionPanel } from '../../shared/ModuleUi';

const gameLabels: Record<GameStatus, string> = { wishlist: '想玩', playing: '在玩', finished: '已通关', paused: '暂时搁置' };

export default function GamesPage() {
  const { data, updateData } = useDataFile();
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState<GameStatus>('wishlist');
  const [filter, setFilter] = useState<GameStatus | 'all'>('all');
  const games = useMemo(() => (data?.games ?? [])
    .filter((game) => filter === 'all' || game.status === filter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data?.games, filter]);

  function addGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !name.trim()) return;
    const game: Game = { ...newRecordBase(), name: name.trim(), status, ...(platform.trim() ? { platform: platform.trim() } : {}) };
    updateData((current) => ({ ...current, games: [...current.games, game] }));
    setName(''); setPlatform(''); setStatus('wishlist');
  }

  function updateGame(id: string, patch: Partial<Game>) {
    updateData((current) => ({ ...current, games: current.games.map((game) => game.id === id ? { ...game, ...patch, updatedAt: new Date().toISOString() } : game) }));
  }

  function addSession(gameId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const duration = String(form.get('duration')).trim();
    const session: PlaySession = {
      ...newRecordBase(), gameId, date: String(form.get('date')),
      ...(duration ? { durationMinutes: Number(duration) } : {}),
      ...(String(form.get('notes')).trim() ? { notes: String(form.get('notes')).trim() } : {}),
    };
    updateData((current) => ({ ...current, playSessions: [...current.playSessions, session] }));
    event.currentTarget.reset();
  }

  function updateSession(id: string, patch: Partial<PlaySession>) {
    updateData((current) => ({ ...current, playSessions: current.playSessions.map((session) => session.id === id ? { ...session, ...patch, updatedAt: new Date().toISOString() } : session) }));
  }

  function deleteSession(session: PlaySession) {
    if (!window.confirm('删除这条游玩记录？')) return;
    updateData((current) => ({ ...current, playSessions: current.playSessions.filter((row) => row.id !== session.id) }));
  }

  function deleteGame(game: Game) {
    const sessionCount = data?.playSessions.filter((session) => session.gameId === game.id).length ?? 0;
    if (!window.confirm(`删除游戏“${game.name}”及其 ${sessionCount} 条游玩记录？`)) return;
    updateData((current) => ({
      ...current,
      games: current.games.filter((row) => row.id !== game.id),
      playSessions: current.playSessions.filter((row) => row.gameId !== game.id),
    }));
  }

  const counts = GAME_STATUSES.map((value) => ({ status: value, count: data?.games.filter((game) => game.status === value).length ?? 0 }));

  return (
    <div className="module-page games-page">
      <section className="games-hero"><div><p className="eyebrow">PLAY JOURNAL</p><h2>给娱乐留一块舒服的位置</h2><p>收藏想玩的作品，记录每次游玩和通关进度。</p></div><div className="games-hero-mark" aria-hidden="true">✦</div><span>{(data?.playSessions ?? []).length} 次游玩记录</span></section>
      <div className="workflow-summary game-summary">{counts.map(({ status: value, count }) => <button className={`workflow-step${filter === value ? ' is-selected' : ''}`} key={value} onClick={() => setFilter(filter === value ? 'all' : value)} type="button"><span>{gameLabels[value]}</span><strong>{count}</strong></button>)}</div>
      <SectionPanel title="游戏清单" detail="记录想玩的游戏、当前状态和平台。" className="form-panel">
        <form className="game-create-form" onSubmit={addGame}>
          <Field label="游戏名称"><input aria-label="游戏名称" onChange={(event) => setName(event.target.value)} placeholder="例如：空洞骑士：丝之歌" required value={name} /></Field>
          <Field label="平台"><input aria-label="游戏平台" onChange={(event) => setPlatform(event.target.value)} placeholder="PC、Switch…" value={platform} /></Field>
          <Field label="游玩状态"><select aria-label="初始游玩状态" onChange={(event) => setStatus(event.target.value as GameStatus)} value={status}>{GAME_STATUSES.map((value) => <option key={value} value={value}>{gameLabels[value]}</option>)}</select></Field>
          <button className="button button-primary" type="submit">添加游戏</button>
        </form>
      </SectionPanel>
      <SectionPanel title="我的游戏" detail={`${games.length} 款游戏`} action={<Field label="筛选状态"><select aria-label="筛选游戏状态" onChange={(event) => setFilter(event.target.value as GameStatus | 'all')} value={filter}><option value="all">全部状态</option>{GAME_STATUSES.map((value) => <option key={value} value={value}>{gameLabels[value]}</option>)}</select></Field>}>
        {games.length === 0 ? <EmptyState title="还没有游戏记录" detail="添加一款游戏，之后可持续记录游玩情况。" /> : <div className="game-library">{games.map((game) => <GameCard item={game} key={game.id} sessions={(data?.playSessions ?? []).filter((session) => session.gameId === game.id).sort((a, b) => b.date.localeCompare(a.date))} onAddSession={addSession} onDelete={deleteGame} onDeleteSession={deleteSession} onUpdate={updateGame} onUpdateSession={updateSession} />)}</div>}
      </SectionPanel>
    </div>
  );
}

function GameCard({ item, sessions, onUpdate, onDelete, onAddSession, onUpdateSession, onDeleteSession }: {
  item: Game;
  sessions: PlaySession[];
  onUpdate(id: string, patch: Partial<Game>): void;
  onDelete(item: Game): void;
  onAddSession(gameId: string, event: FormEvent<HTMLFormElement>): void;
  onUpdateSession(id: string, patch: Partial<PlaySession>): void;
  onDeleteSession(session: PlaySession): void;
}) {
  const [logging, setLogging] = useState(false);
  return (
    <article className="game-card">
      <header className="game-card-header"><div className="game-cover" aria-hidden="true">◇</div><div className="game-card-title"><strong>{item.name}</strong><span>{item.platform ?? '平台未设置'} · {sessions.length} 次游玩</span></div><span className={`stage-pill game-${item.status}`}>{gameLabels[item.status]}</span><button aria-label={`删除游戏：${item.name}`} className="icon-button danger-button" onClick={() => onDelete(item)} type="button">×</button></header>
      <div className="game-card-tools"><Field label="更新游玩状态"><select aria-label={`游戏状态：${item.name}`} onChange={(event) => onUpdate(item.id, { status: event.target.value as GameStatus })} value={item.status}>{GAME_STATUSES.map((value) => <option key={value} value={value}>{gameLabels[value]}</option>)}</select></Field><button className="button button-secondary" onClick={() => setLogging((value) => !value)} type="button">{logging ? '取消记录' : '＋ 记录游玩'}</button><details className="record-edit" key={item.updatedAt}><summary>编辑游戏</summary><form className="record-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onUpdate(item.id, { name: String(form.get('name')).trim(), platform: String(form.get('platform')).trim() || undefined, status: String(form.get('status')) as GameStatus, notes: String(form.get('notes')).trim() || undefined }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Field label="游戏名称"><input aria-label={`编辑游戏名称：${item.name}`} defaultValue={item.name} name="name" required /></Field><Field label="平台"><input defaultValue={item.platform ?? ''} name="platform" /></Field><Field label="状态"><select defaultValue={item.status} name="status">{GAME_STATUSES.map((value) => <option key={value} value={value}>{gameLabels[value]}</option>)}</select></Field><Field label="备注"><input defaultValue={item.notes ?? ''} name="notes" /></Field><button className="button button-primary" type="submit">保存游戏</button></form></details></div>
      {logging && <form className="session-create-form" onSubmit={(event) => { onAddSession(item.id, event); setLogging(false); }}><Field label="游玩日期"><input aria-label={`游玩日期：${item.name}`} defaultValue={localDateValue()} name="date" type="date" /></Field><Field label="时长（分钟）"><input aria-label={`游玩时长：${item.name}`} min="0" name="duration" placeholder="可选" type="number" /></Field><Field label="游玩备注"><input aria-label={`游玩备注：${item.name}`} name="notes" placeholder="可选" /></Field><button className="button button-primary" type="submit">保存记录</button></form>}
      {sessions.length > 0 && <div className="session-list"><div className="session-list-title">最近游玩</div>{sessions.map((session) => <SessionRow item={session} key={session.id} onDelete={onDeleteSession} onUpdate={onUpdateSession} />)}</div>}
    </article>
  );
}

function SessionRow({ item, onUpdate, onDelete }: {
  item: PlaySession;
  onUpdate(id: string, patch: Partial<PlaySession>): void;
  onDelete(item: PlaySession): void;
}) {
  return <div className="session-row"><span className="session-date">{formatDate(item.date)}</span><span>{item.durationMinutes ? `${item.durationMinutes} 分钟` : '时长未记录'}</span>{item.notes && <span className="session-notes">{item.notes}</span>}<details className="record-edit" key={item.updatedAt}><summary>编辑</summary><form className="record-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const duration = String(form.get('duration')); onUpdate(item.id, { date: String(form.get('date')), durationMinutes: duration ? Number(duration) : undefined, notes: String(form.get('notes')).trim() || undefined }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Field label="日期"><input defaultValue={item.date} name="date" type="date" /></Field><Field label="时长（分钟）"><input defaultValue={item.durationMinutes ?? ''} min="0" name="duration" type="number" /></Field><Field label="备注"><input defaultValue={item.notes ?? ''} name="notes" /></Field><button className="button button-primary" type="submit">保存修改</button></form></details><button aria-label="删除游玩记录" className="icon-button danger-button" onClick={() => onDelete(item)} type="button">×</button></div>;
}
