import { NavLink, Route, Routes } from 'react-router-dom';
import { Book } from './pages/Book';
import { Home } from './pages/Home';
import { Leaderboard } from './pages/Leaderboard';
import { Live } from './pages/Live';
import { Profile } from './pages/Profile';

const NAV = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/book', label: 'Book', icon: '＋' },
  { to: '/live', label: 'Live', icon: '◉' },
  { to: '/leaderboard', label: 'Ranks', icon: '≡' },
  { to: '/profile', label: 'Me', icon: '◎' },
];

export function App() {
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
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/book" element={<Book />} />
          <Route path="/live" element={<Live />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
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
