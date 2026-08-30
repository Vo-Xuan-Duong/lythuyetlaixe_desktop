import type { PropsWithChildren } from "react";
import { navigationItems, type AppSection } from "../app/navigation";

interface AppShellProps extends PropsWithChildren {
  activeSection: AppSection;
  onNavigate: (section: AppSection) => void;
}

export function AppShell({ activeSection, onNavigate, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">LX</div>
          <div>
            <strong>Lý Thuyết Lái Xe</strong>
            <span>600 câu • Việt Nam</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeSection === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" />
          Offline-first
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div>
            <span className="topbar-kicker">Desktop foundation</span>
            <strong>Tauri 2 · React · SQLite</strong>
          </div>
          <div className="dataset-pill">
            <span>Dataset</span>
            <strong>Demo</strong>
          </div>
        </header>

        <main className="content">{children}</main>

        <nav className="mobile-nav" aria-label="Điều hướng mobile">
          {navigationItems.slice(0, 5).map((item) => (
            <button
              key={item.id}
              className={activeSection === item.id ? "active" : ""}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <span aria-hidden="true">{item.icon}</span>
              <small>{item.shortLabel}</small>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
