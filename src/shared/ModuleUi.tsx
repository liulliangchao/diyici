import type { ReactNode } from 'react';

export function SectionPanel({
  title,
  detail,
  action,
  children,
  className = '',
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`module-panel ${className}`}>
      <header className="module-panel-header">
        <div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`form-field ${className}`}><span>{label}</span>{children}</label>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><span aria-hidden="true" className="empty-state-mark">＋</span><strong>{title}</strong><p>{detail}</p></div>;
}

export function localDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function newRecordBase() {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}

export function formatDate(date: string): string {
  if (!date) return '未设置日期';
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${date}T00:00:00`));
}
