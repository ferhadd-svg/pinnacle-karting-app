import { NavLink, Route, Routes } from 'react-router-dom';
import { isStaff, useAuth } from './auth';
import { Admin } from './pages/Admin';
import { Book } from './pages/Book';
import { Home } from './pages/Home';
import { Leaderboard } from './pages/Leaderboard';
import { Profile } from './pages/Profile';
import { Results } from './pages/Results';
import { SessionResult } from './pages/SessionResult';

const NAV = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/results', label: 'Results', icon: '◉' },
  { to: '/leaderboard', label: 'Ranks', icon: '≡' },
  { to: '/book', label: 'Book', icon: '＋' },
  { to: '/profile', label: 'Me', icon: '◎' },
];

export function App() {
  const { me } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="./favicon.svg" alt="" width={28} height={28} />
          Pinnacle Karting
        </NavLink>
        <nav className="topnav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              {n.label}
            </NavLink>
          ))}
          {isStaff(me) && <NavLink to="/admin">Operator</NavLink>}
        </nav>
        {isStaff(me) && (
          <NavLink to="/admin" className="btn btn-small mobile-only">
            Operator
          </NavLink>
        )}
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/results" element={<Results />} />
          <Route path="/results/:id" element={<SessionResult />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/book" element={<Book />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <nav className="tabbar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}>
            <span className="tab-icon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
