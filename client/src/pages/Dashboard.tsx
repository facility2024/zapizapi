import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { Send, AlertTriangle, CheckCircle, Wifi, WifiOff, Loader2 } from "lucide-react";
import api from "../api";

interface SystemStatus {
  enviadosHoje: number;
  naFila: number;
  comErro: number;
  totalCampanhas: number;
  conectado: boolean;
  filaProcessando: boolean;
  filaPausado: boolean;
  tamanhoFila: number;
}

interface CampaignUpdate {
  campanhaId: string;
  contatoId: string;
  status: string;
  erro?: string;
  timestamp: string;
}

export default function Dashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [updates, setUpdates] = useState<CampaignUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarStatus();

    const socket = io("/", { path: "/socket.io" });
    socket.on("campaign-update", (data: CampaignUpdate) => {
      setUpdates((prev) => [data, ...prev].slice(0, 50));
      carregarStatus();
    });

    const interval = setInterval(carregarStatus, 10000);
    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, []);

  async function carregarStatus() {
    try {
      const { data } = await api.get("/campaigns/system/status");
      setStatus(data);
    } catch {
      // Silencia erro de conexão
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Visão geral dos seus envios</p>
      </div>

      {/* Cards de status */}
      <div className="grid grid-cols-4 gap-4">
        <Card
          titulo="Enviados Hoje"
          valor={status?.enviadosHoje ?? 0}
          icon={<Send className="w-5 h-5" />}
          cor="text-green-400"
          bg="bg-green-400/10"
        />
        <Card
          titulo="Na Fila"
          valor={status?.naFila ?? 0}
          icon={<Loader2 className="w-5 h-5" />}
          cor="text-accent-light"
          bg="bg-accent/10"
        />
        <Card
          titulo="Com Erro"
          valor={status?.comErro ?? 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          cor="text-red-400"
          bg="bg-red-400/10"
        />
        <Card
          titulo="Conexão"
          valor={status?.conectado ? "Online" : "Offline"}
          icon={status?.conectado ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          cor={status?.conectado ? "text-green-400" : "text-red-400"}
          bg={status?.conectado ? "bg-green-400/10" : "bg-red-400/10"}
        />
      </div>

      {/* Status da fila */}
      {status?.filaProcessando && (
        <div className="bg-bg-card border border-accent/20 rounded-xl p-4 shadow-glow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-accent animate-spin" />
              <span className="text-sm">
                Fila processando — {status.tamanhoFila} contatos restantes
                {status.filaPausado && <span className="text-yellow-400 ml-2">(Pausado)</span>}
              </span>
            </div>
          </div>
          {/* Barra de progresso */}
          <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-light transition-all duration-500"
              style={{
                width: `${status.totalCampanhas > 0 ? ((status.enviadosHoje / (status.enviadosHoje + status.tamanhoFila)) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Últimas atualizações */}
      {updates.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Atividade em Tempo Real</h2>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {updates.map((u, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-800/50 last:border-0">
                <div className="flex items-center gap-2">
                  <StatusDot status={u.status} />
                  <span className="text-gray-400">{u.contatoId.slice(0, 8)}...</span>
                </div>
                <span className={u.status === "enviado" ? "text-green-400" : u.status === "erro" ? "text-red-400" : "text-accent-light"}>
                  {u.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ titulo, valor, icon, cor, bg }: { titulo: string; valor: string | number; icon: React.ReactNode; cor: string; bg: string }) {
  return (
    <div className="bg-bg-card border border-gray-800 rounded-xl p-4 shadow-glow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{titulo}</span>
        <div className={`${bg} ${cor} p-2 rounded-lg`}>{icon}</div>
      </div>
      <p className={`text-2xl font-bold ${cor}`}>{valor}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const cor = status === "enviado" ? "bg-green-400" : status === "erro" ? "bg-red-400" : status === "enviando" ? "bg-accent animate-pulse" : "bg-gray-500";
  return <span className={`w-2 h-2 rounded-full ${cor}`} />;
}
