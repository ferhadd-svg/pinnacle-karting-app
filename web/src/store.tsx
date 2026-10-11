import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface Profile {
  name: string;
  email: string;
  phone: string;
  birthYear: string;
}

export interface Booking {
  id: string;
  sessionTypeId: string;
  trackId: string;
  date: string;
  hour: number;
  drivers: number;
  total: number;
  createdAt: number;
  cancelled?: boolean;
}

interface State {
  profile: Profile | null;
  bookings: Booking[];
  credits: number;
}

const KEY = 'pinnacle-karting:v1';
const empty: State = { profile: null, bookings: [], credits: 0 };

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

interface Store extends State {
  saveProfile: (p: Profile) => void;
  signOut: () => void;
  addBooking: (b: Omit<Booking, 'id' | 'createdAt'>) => Booking;
  cancelBooking: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase();

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable: keep in memory only */
    }
  }, [state]);

  const store = useMemo<Store>(
    () => ({
      ...state,
      saveProfile: (profile) => setState((s) => ({ ...s, profile })),
      signOut: () => setState(empty),
      addBooking: (b) => {
        const booking: Booking = { ...b, id: uid(), createdAt: Date.now() };
        // 1 loyalty credit per RM10 spent
        setState((s) => ({
          ...s,
          bookings: [booking, ...s.bookings],
          credits: s.credits + Math.floor(b.total / 10),
        }));
        return booking;
      },
      cancelBooking: (id) =>
        setState((s) => ({
          ...s,
          bookings: s.bookings.map((b) => (b.id === id ? { ...b, cancelled: true } : b)),
        })),
    }),
    [state],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

