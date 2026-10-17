import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDateTime, SESSION_TYPES, typeLabel, watchSession, type SessionType, type Venue } from '../api';
import { isStaff, useAuth } from '../auth';
import { AuthForm } from '../components/AuthForm';
import { Empty, ErrorNote, Loading, ResultStatusNote, StatusBadge } from '../components/ui';
import { useAsync } from '../hooks';

/** Offset of an IANA zone from UTC at an instant, as "+08:00". */
function zoneOffset(timeZone: string, at: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const mins = Math.round((Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
  const sign = mins < 0 ? '-' : '+';
  const a = Math.abs(mins);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** Local calendar date of an instant in a zone, as YYYY-MM-DD. */
const localDate = (timeZone: string, at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);

async function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

export function Admin() {
  const { me, loading, logout } = useAuth();
  const venues = useAsync(() => api.venues(), []);
  const [venueId, setVenueId] = useState('');
  const [tab, setTab] = useState<'sessions' | 'desk' | 'hardware'>('sessions');

  useEffect(() => {
    if (!venueId && venues.data?.length) setVenueId(me?.venueId ?? venues.data[0].id);
  }, [venues.data, me, venueId]);

  if (loading) return <Loading />;
  if (!me || !isStaff(me)) {
    return (
      <div className="page narrow">
        <h1>Operator console</h1>
        {me && <p className="error-text">Signed in as a driver. Operator or admin access is required.</p>}
        <AuthForm allowRegister={false} />
      </div>
    );
  }
  const venue = venues.data?.find((v) => v.id === venueId);

  return (
    <div className="page">
      <div className="title-row">
        <div>
          <p className="eyebrow">Operator console</p>
          <h1>{venue?.name ?? 'Venue'}</h1>
          <p className="muted small">
            {me.email} · {me.role}
          </p>
        </div>
        <button className="btn" onClick={logout}>
          Sign out
        </button>
      </div>
      {me.role === 'admin' && venues.data && venues.data.length > 1 && (
        <select value={venueId} onChange={(e) => setVenueId(e.target.value)} aria-label="Venue">
          {venues.data.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      )}
      <div className="chips">
        <button className={`chip ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>
          Sessions
        </button>
        <button className={`chip ${tab === 'desk' ? 'active' : ''}`} onClick={() => setTab('desk')}>
          Front desk
        </button>
        <button className={`chip ${tab === 'hardware' ? 'active' : ''}`} onClick={() => setTab('hardware')}>
          Karts & devices
        </button>
      </div>
      {venues.error && <ErrorNote error={venues.error} onRetry={venues.reload} />}
      {venue && tab === 'sessions' && <Sessions venue={venue} />}
      {venue && tab === 'desk' && <FrontDesk venueId={venue.id} />}
      {venue && tab === 'hardware' && <Hardware venueId={venue.id} />}
    </div>
  );
}

function Sessions({ venue }: { venue: Venue }) {
  const sessions = useAsync(() => api.sessions({ venueId: venue.id, limit: 30 }), [venue.id]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ trackId: venue.tracks[0]?.id ?? '', type: 'rental' as SessionType, name: '' });
  const [error, setError] = useState<string | null>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { id } = await api.createSession(form);
      setForm({ ...form, name: '' });
      await sessions.reload();
      setSelected(id);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (selected) return <SessionAdmin id={selected} venue={venue} onBack={() => { setSelected(null); void sessions.reload(); }} />;

  return (
    <>
      <form className="card form" onSubmit={create}>
        <h2>New session</h2>
        <div className="form-row">
          <label>
            Track
            <select value={form.trackId} onChange={(e) => setForm({ ...form, trackId: e.target.value })}>
              {venue.tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SessionType })}>
              {SESSION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Name
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Arrive & Drive 19:30" />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary">Create session</button>
      </form>

      <h2 className="section-title">Sessions</h2>
      {sessions.error && <ErrorNote error={sessions.error} onRetry={sessions.reload} />}
      {sessions.loading && <Loading />}
      {sessions.data && sessions.data.length === 0 && <Empty>No sessions yet.</Empty>}
      <div className="list">
        {sessions.data?.map((s) => (
          <button key={s.id} className="card card-link list-item text-left" onClick={() => setSelected(s.id)}>
            <div>
              <strong>{s.name}</strong>
              <p className="muted">
                {typeLabel[s.type]} · {s.track.name} · {formatDateTime(s.startedAt ?? s.scheduledStart, venue.timezone)} · {s.participantCount} entries
              </p>
            </div>
            <StatusBadge status={s.resultStatus} />
          </button>
        ))}
      </div>
    </>
  );
}

function SessionAdmin({ id, venue, onBack }: { id: string; venue: Venue; onBack: () => void }) {
  const board = useAsync(() => api.sessionLeaderboard(id), [id]);
  const anomalies = useAsync(() => api.anomalies(id), [id]);
  const karts = useAsync(() => api.karts(venue.id), [venue.id]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [entry, setEntry] = useState({ kartId: '', memberCode: '', driverName: '', teamName: '' });
  const member = useMemberLookup(entry.memberCode, venue.id);
  const [csv, setCsv] = useState('');
  const [fromFile, setFromFile] = useState(true);
  const [importDate, setImportDate] = useState(localDate(venue.timezone, new Date()));

  const reloadAll = () => Promise.all([board.reload(), anomalies.reload()]);
  useEffect(() => watchSession(id, () => void reloadAll()), [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Run an operator action; a string returned by `fn` replaces the generic success label. */
  const act = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const result = await fn();
      setMsg({ ok: true, text: typeof result === 'string' ? result : label });
      await reloadAll();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  if (board.error) return <ErrorNote error={board.error} onRetry={board.reload} />;
  if (!board.data) return <Loading />;
  const { session, entries, resultStatus } = board.data;
  const status = session.status;
  const usedKarts = new Set(entries.map((e) => e.karts));
  const nameOf = (pid: string) => {
    const e = entries.find((x) => x.participantId === pid);
    return e ? `#${e.karts} ${e.teamName ?? e.driver?.name ?? ''}` : pid.slice(0, 8);
  };
  const crossingAt = (hhmmss: string) => {
    const date = localDate(venue.timezone, new Date(session.startedAt ?? Date.now()));
    return `${date}T${hhmmss}${zoneOffset(venue.timezone, new Date(session.startedAt ?? Date.now()))}`;
  };

  return (
    <>
      <button className="back link-btn" onClick={onBack}>
        ← All sessions
      </button>
      <div className="title-row">
        <div>
          <h2>{session.name}</h2>
          <p className="muted">
            {typeLabel[session.type]} · {session.track.name} · started {formatDateTime(session.startedAt, venue.timezone)}
            {session.endedAt && ` · chequered ${formatDateTime(session.endedAt, venue.timezone)}`}
          </p>
        </div>
        <StatusBadge status={resultStatus} />
      </div>
      <ResultStatusNote status={resultStatus} />

      <div className="controls">
        {status === 'scheduled' && (
          <button className="btn btn-primary" disabled={!entries.length} onClick={() => act('Session started', () => api.lifecycle(id, 'start'))}>
            Start session (green flag)
          </button>
        )}
        {status === 'running' && (
          <button className="btn btn-primary" onClick={() => act('Chequered flag recorded', () => api.lifecycle(id, 'finish'))}>
            Finish (chequered flag)
          </button>
        )}
        {status === 'finished' && (
          <button
            className="btn btn-primary"
            onClick={() => confirm('Finalise results? They become official and feed leaderboards and records.') && act('Results finalised', () => api.lifecycle(id, 'finalize'))}
          >
            Finalise results
          </button>
        )}
        {status === 'final' && (
          <button
            className="btn"
            onClick={() => {
              const reason = prompt('Reason for reopening (recorded in the audit log):');
              if (reason) void act('Session reopened', () => api.reopen(id, reason));
            }}
          >
            Reopen for corrections
          </button>
        )}
        {(status === 'running' || status === 'finished') && (
          <button className="btn" onClick={() => act('Recalculated from raw events', () => api.lifecycle(id, 'recalculate'))}>
            Recalculate
          </button>
        )}
        <button className="btn" onClick={() => act('Exported', async () => download(`results-${id}.csv`, await api.exportCsv(id, 'results')))}>
          Export results CSV
        </button>
        <button className="btn" onClick={() => act('Exported', async () => download(`laps-${id}.csv`, await api.exportCsv(id, 'laps')))}>
          Export laps CSV
        </button>
        <Link className="btn" to={`/results/${id}`}>
          Public view
        </Link>
      </div>
      {msg && <p className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</p>}

      <h3 className="section-title">Entries & standings</h3>
      <div className="card table-card">
        <table className="timing">
          <thead>
            <tr>
              <th>P</th>
              <th>Kart</th>
              <th>Driver / team</th>
              <th className="num">Laps</th>
              <th className="num">Best</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.participantId}>
                <td className="pos">{e.disqualified ? 'DQ' : (e.position ?? '—')}</td>
                <td>{e.karts}</td>
                <td>
                  {e.teamName ?? e.driver?.name}
                  {e.teamName && e.driver && <span className="muted small"> ({e.driver.name})</span>}
                  {e.driver && e.driver.isMember === false && !e.teamName && (
                    <button
                      className="link-btn small"
                      style={{ marginLeft: 8 }}
                      onClick={() => {
                        const code = prompt(`Link ${e.driver!.name}'s results to an app member. Member code:`);
                        const reason = code && prompt('Reason (audit log):', 'Customer showed receipt at the desk');
                        if (code && reason)
                          void act('Linked', async () => {
                            const r = await api.linkWalkIn(e.driver!.id, code, reason);
                            return `Moved ${r.entries} session(s) and ${r.laps} laps to ${r.member.name}`;
                          });
                      }}
                    >
                      Link to member
                    </button>
                  )}
                </td>
                <td className="num">{e.lapsCompleted}</td>
                <td className={`num ${e.hasFastestLap ? 'purple' : ''}`}>{e.bestLap?.display ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {status !== 'final' && status !== 'cancelled' && (
        <form
          className="card form"
          onSubmit={(ev) => {
            ev.preventDefault();
            void act('Entry added', () =>
              api.addParticipant(id, {
                kartId: entry.kartId,
                memberCode: entry.memberCode.trim() || undefined,
                driverName: entry.memberCode.trim() ? undefined : entry.driverName || undefined,
                teamName: entry.teamName || undefined,
              }),
            ).then(() => setEntry({ kartId: '', memberCode: '', driverName: '', teamName: '' }));
          }}
        >
          <h3>Assign a driver to a kart</h3>
          <div className="form-row">
            <label>
              Kart
              <select required value={entry.kartId} onChange={(e) => setEntry({ ...entry, kartId: e.target.value })}>
                <option value="">Choose…</option>
                {karts.data
                  ?.filter((k) => k.status === 'active' && !usedKarts.has(k.number))
                  .map((k) => (
                    <option key={k.id} value={k.id} disabled={!k.transponder_code}>
                      #{k.number} {k.transponder_code ? `· ${k.transponder_code}` : '· no transponder'}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Member code (app)
              <input
                value={entry.memberCode}
                onChange={(e) => setEntry({ ...entry, memberCode: e.target.value })}
                placeholder="e.g. 5RN VD4"
                autoCapitalize="characters"
              />
              <MemberStatus lookup={member} />
            </label>
            <label>
              or walk-in name
              <input value={entry.driverName} disabled={!!entry.memberCode.trim()} onChange={(e) => setEntry({ ...entry, driverName: e.target.value })} />
            </label>
            {session.type === 'endurance' && (
              <label>
                Team name
                <input value={entry.teamName} onChange={(e) => setEntry({ ...entry, teamName: e.target.value })} />
              </label>
            )}
          </div>
          <button className="btn" disabled={!entry.kartId || (!member.data && !entry.driverName && !entry.teamName)}>
            Add entry
          </button>
        </form>
      )}

      {(status === 'scheduled' || status === 'running' || status === 'finished') && (
        <div className="card form">
          <h3>Import passings CSV</h3>
          <p className="muted small">
            One row per line crossing with columns for transponder and time (and optionally loop). Re-importing the same rows is safe — duplicates are
            ignored.
          </p>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setCsv(await f.text());
            }}
          />
          <textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'transponder,time,loop\nT107,14:30:00.000,L1'} />
          <div className="form-row">
            <label>
              Date for clock-only times
              <input type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)} />
            </label>
            {status === 'scheduled' && (
              <label className="toggle">
                <input type="checkbox" checked={fromFile} onChange={(e) => setFromFile(e.target.checked)} />
                Set session start/finish from the file
              </label>
            )}
          </div>
          <button
            className="btn"
            disabled={!csv.trim()}
            onClick={() =>
              act('Imported', async () => {
                const r = await api.importPassings({
                  trackId: session.track.id,
                  csv,
                  date: importDate,
                  sessionId: id,
                  setSessionWindowFromFile: status === 'scheduled' && fromFile,
                });
                setCsv('');
                return `Imported ${r.accepted} new events (${r.duplicates} duplicates, ${r.rowErrors.length} bad rows)`;
              })
            }
          >
            Import
          </button>
        </div>
      )}

      <h3 className="section-title">Timing review</h3>
      {anomalies.error && <ErrorNote error={anomalies.error} onRetry={anomalies.reload} />}
      {anomalies.data && (
        <div className="list">
          {anomalies.data.missingTransponders.length > 0 && (
            <div className="card warn-card">
              <strong>Karts without a transponder</strong>
              <p className="muted">{anomalies.data.missingTransponders.map((m) => `#${m.kart}`).join(', ')} — fit transponders before starting.</p>
            </div>
          )}
          {!!anomalies.data.lateEventsAfterFinalisation && (
            <div className="card warn-card">
              <strong>{anomalies.data.lateEventsAfterFinalisation} timing event(s) arrived after finalisation</strong>
              <p className="muted">They are stored but not applied. Reopen the session to include them.</p>
            </div>
          )}
          {anomalies.data.unknownLoops.length > 0 && (
            <div className="card warn-card">
              <strong>Unknown timing loops: {anomalies.data.unknownLoops.join(', ')}</strong>
              <p className="muted">Crossings on these loops are ignored. Map the loop codes to the track in setup.</p>
            </div>
          )}
          {anomalies.data.flaggedLaps.map((l) => (
            <div className="card list-item" key={`${l.participantId}-${l.lapNumber}`}>
              <div>
                <strong>
                  {nameOf(l.participantId)} · lap {l.lapNumber} · {l.lapTime}
                </strong>
                <p className="muted">{l.flags.join(', ').replace('suspect_missed', 'probable missed detection').replace('invalidated', 'invalidated by operator')}</p>
              </div>
              {status !== 'final' && l.flags.includes('suspect_missed') && (
                <button
                  className="btn"
                  onClick={() => {
                    const t = prompt('Time of the missed crossing (HH:MM:SS.mmm, venue time), e.g. from video:');
                    const reason = t && prompt('Reason:', 'Missed detection; time from video review');
                    if (t && reason) void act('Crossing added', () => api.addCorrection(id, { kind: 'add_crossing', participantId: l.participantId, at: crossingAt(t), reason }));
                  }}
                >
                  Add missed crossing
                </button>
              )}
            </div>
          ))}
          {anomalies.data.rejectedCrossings.map((r) => (
            <div className="card list-item" key={r.ref}>
              <div>
                <strong>
                  {nameOf(r.participantId)} · {r.reason.replace('_', ' ')}
                </strong>
                <p className="muted">
                  {formatDateTime(r.at, venue.timezone)} {r.gap && `· ${r.gap}s after previous crossing`} · ignored automatically
                </p>
              </div>
            </div>
          ))}
          {anomalies.data.unmatchedEvents.length > 0 && (
            <div className="card warn-card">
              <strong>Crossings from unassigned transponders</strong>
              <p className="muted">
                {[...new Set(anomalies.data.unmatchedEvents.map((e) => e.transponder))].join(', ')} — check kart assignments if a kart was missing from the
                results.
              </p>
            </div>
          )}
          {!anomalies.data.flaggedLaps.length &&
            !anomalies.data.rejectedCrossings.length &&
            !anomalies.data.unmatchedEvents.length &&
            !anomalies.data.missingTransponders.length && <Empty>No timing anomalies.</Empty>}
        </div>
      )}

      {status !== 'final' && status !== 'scheduled' && status !== 'cancelled' && <CorrectionForm sessionId={id} entries={entries.map((e) => ({ id: e.participantId, name: nameOf(e.participantId) }))} onDone={act} />}
    </>
  );
}

function CorrectionForm(props: { sessionId: string; entries: { id: string; name: string }[]; onDone: (label: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const [kind, setKind] = useState<'time_penalty' | 'lap_penalty' | 'disqualify'>('time_penalty');
  const [participantId, setParticipantId] = useState('');
  const [value, setValue] = useState('5');
  const [reason, setReason] = useState('');
  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault();
        const body: Record<string, unknown> = { kind, participantId, reason };
        if (kind === 'time_penalty') body.seconds = Number(value);
        if (kind === 'lap_penalty') body.laps = Number(value);
        void props.onDone('Penalty applied', () => api.addCorrection(props.sessionId, body)).then(() => setReason(''));
      }}
    >
      <h3>Penalties</h3>
      <div className="form-row">
        <label>
          Entry
          <select required value={participantId} onChange={(e) => setParticipantId(e.target.value)}>
            <option value="">Choose…</option>
            {props.entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="time_penalty">Time penalty (s)</option>
            <option value="lap_penalty">Lap penalty</option>
            <option value="disqualify">Disqualify</option>
          </select>
        </label>
        {kind !== 'disqualify' && (
          <label>
            {kind === 'time_penalty' ? 'Seconds' : 'Laps'}
            <input type="number" min="1" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        )}
      </div>
      <label>
        Reason (audit log)
        <input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button className="btn">Apply</button>
    </form>
  );
}

/** Look a member up by code as it's typed (6+ characters), including waiver status at this venue. */
function useMemberLookup(code: string, venueId: string) {
  const [state, setState] = useState<{ data: Awaited<ReturnType<typeof api.driverByCode>> | null; error: string | null }>({ data: null, error: null });
  useEffect(() => {
    const c = code.replace(/[^a-z0-9]/gi, '');
    if (c.length < 6) {
      setState({ data: null, error: null });
      return;
    }
    let live = true;
    api
      .driverByCode(c, venueId)
      .then((d) => live && setState({ data: d, error: null }))
      .catch((e) => live && setState({ data: null, error: (e as Error).message }));
    return () => {
      live = false;
    };
  }, [code, venueId]);
  return state;
}

function MemberStatus({ lookup }: { lookup: ReturnType<typeof useMemberLookup> }) {
  if (lookup.error) return <span className="error-text small">{lookup.error}</span>;
  if (!lookup.data) return null;
  return (
    <span className="small">
      <span className="ok-text">✓ {lookup.data.name}</span>
      {lookup.data.waiver && (lookup.data.waiver.valid ? <span className="muted"> · waiver signed</span> : <span className="error-text"> · ⚠ waiver not signed</span>)}
    </span>
  );
}

/** Counter tools for the customer app: member check, ticket scan, voucher hand-over, kiosk tickets. */
function FrontDesk({ venueId }: { venueId: string }) {
  const [memberCode, setMemberCode] = useState('');
  const member = useMemberLookup(memberCode, venueId);
  const [ticketCode, setTicketCode] = useState('');
  const [voucherCode, setVoucherCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const products = useAsync(() => api.products(venueId), [venueId]);
  const [issue, setIssue] = useState({ productId: '', quantity: 1 });
  const [issued, setIssued] = useState<string[]>([]);

  const run = async (fn: () => Promise<string>) => {
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  return (
    <>
      {msg && <p className={msg.ok ? 'ok-text' : 'error-text'}>{msg.text}</p>}
      <div className="card form">
        <h3>Check a member</h3>
        <label>
          Member code (scan the app's QR or type it)
          <input value={memberCode} onChange={(e) => setMemberCode(e.target.value.replace(/^PKMEMBER:/i, ''))} placeholder="e.g. 5RN VD4" />
        </label>
        <MemberStatus lookup={member} />
      </div>
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const t = await api.useTicket(ticketCode.replace(/^PKTICKET:/i, ''));
            setTicketCode('');
            return `✓ Ticket accepted: ${t.productName} (${t.code})`;
          });
        }}
      >
        <h3>Scan a ticket</h3>
        <label>
          Ticket code
          <input value={ticketCode} onChange={(e) => setTicketCode(e.target.value)} placeholder="e.g. 2K7Z QMFD" />
        </label>
        <button className="btn btn-primary" disabled={ticketCode.trim().length < 6}>
          Accept ticket
        </button>
      </form>
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api.fulfilVoucher(voucherCode);
            setVoucherCode('');
            return '✓ Reward handed over';
          });
        }}
      >
        <h3>Hand over a reward</h3>
        <label>
          Voucher code (Rewards tab in the app)
          <input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} placeholder="e.g. WKKW 5PVC" />
        </label>
        <button className="btn" disabled={voucherCode.trim().length < 6}>
          Mark collected
        </button>
      </form>
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await api.issueTickets(issue.productId, issue.quantity);
            setIssued(r.tickets.map((t) => t.code));
            return `Issued ${r.tickets.length} ticket(s). Print or hand the codes to the customer.`;
          });
        }}
      >
        <h3>Sell at the counter</h3>
        <p className="muted small">Issues ticket codes the customer can add to their app wallet. Take payment at the till as usual.</p>
        <div className="form-row">
          <label>
            Product
            <select required value={issue.productId} onChange={(e) => setIssue({ ...issue, productId: e.target.value })}>
              <option value="">Choose…</option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · RM {(p.priceSen / 100).toFixed(2)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input type="number" min={1} max={50} value={issue.quantity} onChange={(e) => setIssue({ ...issue, quantity: Number(e.target.value) })} />
          </label>
        </div>
        <button className="btn" disabled={!issue.productId}>
          Issue tickets
        </button>
        {issued.length > 0 && (
          <p className="ref">
            {issued.map((c) => `${c.slice(0, 4)} ${c.slice(4)}`).join('   ')}
          </p>
        )}
      </form>
    </>
  );
}

function Hardware({ venueId }: { venueId: string }) {
  const devices = useAsync(() => api.devices(venueId), [venueId]);
  const karts = useAsync(() => api.karts(venueId), [venueId]);
  const reloadDevices = devices.reload;
  useEffect(() => {
    const t = setInterval(() => void reloadDevices(), 10_000);
    return () => clearInterval(t);
  }, [reloadDevices]);
  return (
    <>
      <h2 className="section-title">Timing devices</h2>
      {devices.error && <ErrorNote error={devices.error} onRetry={devices.reload} />}
      <div className="list">
        {devices.data?.map((d) => (
          <div key={d.id} className="card list-item">
            <div>
              <strong>{d.name}</strong>
              <p className="muted">
                {d.provider} · {d.seconds_since_seen === null ? 'never connected' : `last seen ${d.seconds_since_seen}s ago`} · {d.events_5m} events in 5 min · clock
                offset {(d.clock_offset_us / 1000).toFixed(1)} ms
              </p>
            </div>
            <span className={`badge badge-${d.health === 'online' ? 'live' : d.health === 'offline' ? 'provisional' : 'not_started'}`}>{d.health}</span>
          </div>
        ))}
      </div>
      <h2 className="section-title">Karts</h2>
      {karts.data && (
        <div className="card table-card">
          <table className="timing">
            <thead>
              <tr>
                <th>Kart</th>
                <th>Class</th>
                <th>Transponder</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {karts.data.map((k) => (
                <tr key={k.id}>
                  <td>#{k.number}</td>
                  <td>{k.class_name ?? '—'}</td>
                  <td>{k.transponder_code ?? <span className="error-text">none</span>}</td>
                  <td>{k.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Karts, transponders, assignments and devices are managed through the API (see docs/api.md); setup screens are in Phase 2.</p>
    </>
  );
}
