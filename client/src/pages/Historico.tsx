import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, Trash2, Loader2 } from "lucide-react";
import api from "../api";

interface Campanha {
  id: string;
  nome: string;
  tipoDisparo: string;
  status: string;
  totalContatos: number;
  enviados: number;
  erros: number;
  createdAt: string;
  agendarPara?: string;
}

const STATUS_LABELS: Record<string, { label: string; cor: string }> = {
  rascunho: { label: "Rascunho", cor: "text-gray-400 bg-gray-400/10" },
  agendada: { label: "Agendada", cor: "text-blue-400 bg-blue-400/10" },
  em_andamento: { label: "Em andamento", cor: "text-accent-light bg-accent/10" },
  pausada: { label: "Pausada", cor: "text-yellow-400 bg-yellow-400/10" },
  concluida: { label: "Concluída", cor: "text-green-400 bg-green-400/10" },
  cancelada: { label: "Cancelada", cor: "text-red-400 bg-red-400/10" },
};

export default function Historico() {
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarCampanhas();
    const interval = setInterval(carregarCampanhas, 5000);
    return () => clearInterval(interval);
  }, []);

  async function carregarCampanhas() {
    try {
      const { data } = await api.get("/campaigns");
      setCampanhas(data);
    } catch {
      // Silencia
    } finally {
      setLoading(false);
    }
  }

  async function acaoCampanha(id: string, acao: "start" | "pause" | "resume" | "cancel") {
    try {
      await api.post(`/campaigns/${id}/${acao}`);
      carregarCampanhas();
    } catch {
      // Silencia
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
        <h1 className="text-2xl font-bold">Histórico de Campanhas</h1>
        <p className="text-gray-500 text-sm mt-1">{campanhas.length} campanhas</p>
      </div>

      {campanhas.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p>Nenhuma campanha criada ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campanhas.map((c) => {
            const st = STATUS_LABELS[c.status] || STATUS_LABELS.rascunho;
            const progresso = c.totalContatos > 0 ? (c.enviados / c.totalContatos) * 100 : 0;

            return (
              <div key={c.id} className="bg-bg-card border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold">{c.nome}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${st.cor}`}>{st.label}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {c.totalContatos} contatos · {c.enviados} enviados · {c.erros} erros
                      {c.agendarPara && ` · Agendado para ${new Date(c.agendarPara).toLocaleString("pt-BR")}`}
                    </p>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2">
                    {(c.status === "rascunho" || c.status === "agendada") && (
                      <button
                        onClick={() => acaoCampanha(c.id, "start")}
                        className="p-2 bg-green-400/10 text-green-400 rounded-lg hover:bg-green-400/20 transition-colors"
                        title="Iniciar"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {c.status === "em_andamento" && (
                      <button
                        onClick={() => acaoCampanha(c.id, "pause")}
                        className="p-2 bg-yellow-400/10 text-yellow-400 rounded-lg hover:bg-yellow-400/20 transition-colors"
                        title="Pausar"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                    )}
                    {c.status === "pausada" && (
                      <button
                        onClick={() => acaoCampanha(c.id, "resume")}
                        className="p-2 bg-accent/10 text-accent-light rounded-lg hover:bg-accent/20 transition-colors"
                        title="Retomar"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    {["rascunho", "agendada", "em_andamento", "pausada"].includes(c.status) && (
                      <button
                        onClick={() => acaoCampanha(c.id, "cancel")}
                        className="p-2 bg-red-400/10 text-red-400 rounded-lg hover:bg-red-400/20 transition-colors"
                        title="Cancelar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de progresso */}
                {c.status === "em_andamento" && (
                  <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-accent-light transition-all duration-300"
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
