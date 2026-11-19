import { BrowserRouter, NavLink, Route, Routes } from 'react-router';
import { SettingsProvider } from './lib/settings.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { ReaderPage } from './pages/ReaderPage.tsx';
import { FinishPage } from './pages/FinishPage.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { StudyPage } from './pages/StudyPage.tsx';
import { FlashcardsPage } from './pages/FlashcardsPage.tsx';

export function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <div className="min-h-dvh">
          <Header />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/read/:id" element={<ReaderPage />} />
            <Route path="/read/:id/finish" element={<FinishPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/study" element={<StudyPage />} />
            <Route path="/study/flashcards" element={<FlashcardsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </BrowserRouter>
    </SettingsProvider>
  );
}

function Header() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-[var(--hover)] text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`;
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]/90 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5" aria-label="Main">
        <NavLink to="/" className="mr-2 font-[family-name:var(--font-reading)] text-xl font-semibold tracking-tight">
          Glossa
        </NavLink>
        <NavLink to="/" end className={link}>
          Read
        </NavLink>
        <NavLink to="/library" className={link}>
          Library
        </NavLink>
        <NavLink to="/study" className={link}>
          Review
        </NavLink>
      </nav>
    </header>
  );
}

function NotFound() {
  return <main className="mx-auto max-w-2xl px-4 py-16 text-center text-[var(--muted)]">Page not found.</main>;
}
