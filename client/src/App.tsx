import { useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import {
  MessageSquare,
  Link2,
  Send,
  History,
  LayoutDashboard,
  Menu,
  X,
  Clock,
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Conectar from "./pages/Conectar";
import NovaCampanha from "./pages/NovaCampanha";
import Historico from "./pages/Historico";
import Agendamentos from "./pages/Agendamentos";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/conectar", label: "Conectar", icon: Link2 },
  { to: "/nova-campanha", label: "Nova Campanha", icon: Send },
  { to: "/agendamentos", label: "Agendamentos", icon: Clock },
  { to: "/historico", label: "Histórico", icon: History },
];

type NavItemProps = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
};

function NavItem({ to, label, icon: Icon, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
          isActive
            ? "bg-accent/15 text-accent-light shadow-glow-sm"
            : "text-gray-400 hover:bg-bg-card hover:text-white"
        }`
      }
    >
      <Icon className="w-4 h-4" />
      {label}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-accent-light" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Zapizapi</h1>
          <p className="text-xs text-gray-500">Meus Envios</p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavItem key={to} to={to} label={label} icon={Icon} onClick={onNavigate} />
        ))}
      </div>
    </>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg-primary flex">
      {/* Sidebar (desktop) */}
      <nav className="w-64 bg-bg-secondary border-r border-gray-800 flex-col p-4 hidden md:flex">
        <SidebarContent />
      </nav>

      {/* Topbar (mobile) */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-bg-secondary border-b border-gray-800 h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-accent-light" />
          </div>
          <span className="text-white font-bold">Zapizapi</span>
        </div>
        <button onClick={() => setMenuOpen(true)} className="text-gray-300 p-1" aria-label="Abrir menu">
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Drawer (mobile) */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          <nav className="absolute left-0 top-0 bottom-0 w-64 bg-bg-secondary border-r border-gray-800 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-6 px-2">
              <span className="text-white font-semibold">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="text-gray-400 p-1" aria-label="Fechar menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </nav>
        </div>
      )}

      {/* Conteúdo principal */}
      <main className="flex-1 p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/conectar" element={<Conectar />} />
          <Route path="/nova-campanha" element={<NovaCampanha />} />
          <Route path="/agendamentos" element={<Agendamentos />} />
          <Route path="/historico" element={<Historico />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
