import type { ReactNode } from 'react';
import { statusLabel, type ResultStatus } from '../api';

export function StatusBadge({ status }: { status: ResultStatus }) {
  return <span className={`badge badge-${status}`}>{status === 'live' && <span className="pulse" />}{statusLabel[status]}</span>;
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="card error-card" role="alert">
      <strong>Something went wrong</strong>
      <p className="muted">{error}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Loading() {
  return <p className="muted">Loading…</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted empty">{children}</p>;
}

/** Explains what the result status means, so provisional results are never mistaken for final ones. */
export function ResultStatusNote({ status }: { status: ResultStatus }) {
  const text: Partial<Record<ResultStatus, string>> = {
    live: 'Live timing — positions and laps update as karts cross the line. Results are not official.',
    provisional: 'Provisional — the session has ended and results are being checked. They may still change.',
    final: 'Final — official results. These count towards personal bests, leaderboards and records.',
  };
  return text[status] ? <p className={`status-note status-note-${status}`}>{text[status]}</p> : null;
}
