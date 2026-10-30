import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Activity, Cat, Dog } from 'lucide-react';

export function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo completar la solicitud. Inténtalo de nuevo.';
}

export function formatDate(value?: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es', options ?? { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function SpeciesIcon({ species, size = 17 }: { species: string; size?: number }) {
  const lower = species.toLowerCase();
  return lower.includes('gato') || lower.includes('felin') ?
    <Cat size={size} strokeWidth={1.8} /> : <Dog size={size} strokeWidth={1.8} />;
}

export function Button({ children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`btn ${className}`} {...props}>{children}</button>;
}

export function PageHeading({ eyebrow, title, subtitle, children }: { eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{children}</div>;
}

export function QueryError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="error-state"><div className="empty-icon"><Activity size={19} /></div><strong>No pudimos cargar la información</strong><p>{message}</p><Button type="button" className="btn-secondary" onClick={retry}>Volver a intentar</Button></div>;
}

export function LoadingRows() {
  return <div className="loading-state" aria-label="Cargando"><div style={{ display: 'grid', gap: 12, maxWidth: 480, margin: '0 auto' }}>{[0, 1, 2].map((item) => <div key={item} className="skeleton" style={{ height: 44 }} />)}</div></div>;
}

export function EmptyState({ icon, title, copy, action }: { icon: ReactNode; title: string; copy: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{copy}</p>{action}</div>;
}

export function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="detail-item"><span>{label}</span><span>{value}</span></div>;
}
