import { Routes, Route, NavLink } from "react-router-dom";
import { MessageSquare, Link2, Send, History, LayoutDashboard } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Conectar from "./pages/Conectar";
import NovaCampanha from "./pages/NovaCampanha";
import Historico from "./pages/Historico";

function App() {
  return (
    <div className="min-h-screen bg-bg-primary flex">
      {/* Sidebar */}
      <nav className="w-64 bg-bg-secondary border-r border-gray-800 flex flex-col p-4">
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
          {[
            { to: "/", icon: LayoutDashboard, label: "Dashboard" },
            { to: "/conectar", icon: Link2, label: "Conectar" },
            { to: "/nova-campanha", icon: Send, label: "Nova Campanha" },
            { to: "/historico", icon: History, label: "Histórico" },
          ].map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
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
          ))}
        </div>
      </nav>

      {/* Conteúdo principal */}
      <main className="flex-1 p-8 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/conectar" element={<Conectar />} />
          <Route path="/nova-campanha" element={<NovaCampanha />} />
          <Route path="/historico" element={<Historico />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
