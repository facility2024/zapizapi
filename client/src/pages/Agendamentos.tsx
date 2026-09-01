import { useEffect, useState } from "react";
import { Clock, Calendar, Repeat, X, Pencil, Trash2, Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import api from "../api";

interface Agendamento {
  id: string;
  mensagem: string;
  destinatarios: string[];
  data_hora_envio: string;
  data_hora_envio_brt_label: string;
  status: string;
  recorrencia: string;
  tentativas: number;
  criado_em: string;
  campanhaId?: string;
}

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  pendente: { label: "Pendente", cor: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  enviado: { label: "Enviado", cor: "text-green-400 bg-green-400/10 border-green-400/20" },
  falhou: { label: "Falhou", cor: "text-red-400 bg-red-400/10 border-red-400/20" },
  cancelado: { label: "Cancelado", cor: "text-gray-400 bg-gray-500/10 border-gray-600/20" },
  agendada: { label: "Agendada", cor: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
};

export default function Agendamentos() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [campanhasAgendadas, setCampanhasAgendadas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ mensagem: "", destinatarios: "", data: "", hora: "", recorrencia: "nenhuma" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState("");
  const [editHora, setEditHora] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 10000);
    return () => clearInterval(id);
  }, []);

  async function carregar() {
    try {
      const [a, c] = await Promise.all([
        api.get("/agendamentos"),
        api.get("/campaigns"),
      ]);
      setAgendamentos(a.data);
      setCampanhasAgendadas(c.data.filter((x: any) => x.status === "agendada"));
    } catch {}
    setLoading(false);
  }

  function toBRTISO(data: string, hora: string): string {
    // data: YYYY-MM-DD, hora: HH:mm -> ex: 2026-09-05T14:30:00-03:00
    return `${data}T${hora}:00-03:00`;
  }

  async function criar() {
    setErro("");
    if (!form.mensagem || !form.destinatarios || !form.data || !form.hora) {
      setErro("Preencha mensagem, destinatários, data e hora");
      return;
    }
    const destList = form.destinatarios.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean);
    try {
      await api.post("/agendamentos", {
        mensagem: form.mensagem,
        destinatarios: destList,
        data_hora_envio: toBRTISO(form.data, form.hora),
        recorrencia: form.recorrencia,
      });
      setForm({ mensagem: "", destinatarios: "", data: "", hora: "", recorrencia: "nenhuma" });
      setShowForm(false);
      carregar();
    } catch (e: any) {
      setErro(e.response?.data?.error || "Erro ao agendar");
    }
  }

  async function cancelar(id: string) {
    await api.post(`/agendamentos/${id}/cancelar`);
    carregar();
  }

  async function excluir(id: string) {
    await api.delete(`/agendamentos/${id}`);
    carregar();
  }

  async function salvarEdicao() {
    if (!editId || !editData || !editHora) return;
    try {
      await api.put(`/agendamentos/${editId}`, { data_hora_envio: toBRTISO(editData, editHora) });
      setEditId(null);
      carregar();
    } catch (e: any) {
      setErro(e.response?.data?.error || "Erro ao editar");
    }
  }

  async function cancelarCampanha(id: string) {
    await api.post(`/campaigns/${id}/cancel`);
    carregar();
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Clock className="w-6 h-6 text-accent" /> Agendamentos</h1>
          <p className="text-sm text-gray-500 mt-1">Todos os horários em <span className="text-accent-light">Horário de Brasília</span> (America/Sao_Paulo, UTC-3)</p>
          <p className="text-xs text-gray-600 mt-1">Armazenado em UTC · exibido convertido para BRT · janela permitida 08:00–22:00 BRT · verificação a cada 30s</p>
        </div>
        <button onClick={()=>setShowForm(v=>!v)} className="px-4 py-2 bg-accent hover:bg-accent-light rounded-lg text-sm font-medium">
          {showForm ? "Fechar" : "Novo agendamento"}
        </button>
      </div>

      {erro && <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-3 rounded-xl text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{erro}</div>}

      {showForm && (
        <div className="bg-bg-card border border-gray-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Novo agendamento genérico</h3>
          <textarea value={form.mensagem} onChange={e=>setForm({...form, mensagem:e.target.value})} placeholder="Texto ou referência a template" rows={3} className="w-full bg-bg-primary border border-gray-700 rounded-lg px-4 py-3 text-sm focus:border-accent focus:outline-none" />
          <textarea value={form.destinatarios} onChange={e=>setForm({...form, destinatarios:e.target.value})} placeholder="Destinatários — um por linha ou separados por vírgula (ex: 5511999999999)" rows={2} className="w-full bg-bg-primary border border-gray-700 rounded-lg px-4 py-3 text-sm font-mono focus:border-accent focus:outline-none" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data (calendário) <span className="text-accent-light">— Horário de Brasília</span></label>
              <input type="date" value={form.data} onChange={e=>setForm({...form, data:e.target.value})} className="w-full bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hora (24h HH:mm) <span className="text-accent-light">— Horário de Brasília</span></label>
              <input type="time" value={form.hora} onChange={e=>setForm({...form, hora:e.target.value})} className="w-full bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Recorrência</label>
              <select value={form.recorrencia} onChange={e=>setForm({...form, recorrencia:e.target.value})} className="w-full bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none">
                <option value="nenhuma">Nenhuma</option>
                <option value="diaria">Diária</option>
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-500">Não é permitido agendar no passado. Horários entre 22h–08h BRT serão adiados automaticamente para 08:00 BRT.</p>
          <button onClick={criar} className="px-6 py-2 bg-accent hover:bg-accent-light rounded-lg text-sm font-semibold">Agendar</button>
        </div>
      )}

      {/* Campanhas agendadas */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2"><Calendar className="w-4 h-4" /> Campanhas agendadas ({campanhasAgendadas.length})</h2>
        {campanhasAgendadas.length === 0 ? <p className="text-sm text-gray-500">Nenhuma campanha agendada.</p> : (
          <div className="space-y-2">
            {campanhasAgendadas.map((c:any)=>(
              <div key={c.id} className="flex items-center justify-between p-3 bg-bg-primary rounded-lg border border-gray-800">
                <div>
                  <p className="text-sm font-medium">{c.nome}</p>
                  <p className="text-xs text-gray-500">{c.agendarParaLabel || new Date(c.agendarPara).toLocaleString("pt-BR")} · {c.totalContatos} contatos</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>cancelarCampanha(c.id)} className="p-2 bg-red-400/10 text-red-400 rounded-lg hover:bg-red-400/20"><X className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lista agendamentos genéricos */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Agendamentos genéricos ({agendamentos.length})</h2>
        {agendamentos.length === 0 ? <p className="text-sm text-gray-500">Nenhum agendamento.</p> : (
          <div className="space-y-3">
            {agendamentos.map(a=>{
              const st = STATUS_LABEL[a.status] || STATUS_LABEL.pendente;
              return (
                <div key={a.id} className="p-4 bg-bg-primary rounded-lg border border-gray-800 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm whitespace-pre-wrap break-words">{a.mensagem}</p>
                      <p className="text-xs text-gray-500 mt-1 font-mono">Para: {a.destinatarios.join(", ")}</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                        <Clock className="w-3 h-3" /> {a.data_hora_envio_brt_label}
                        <span className="text-gray-600">· {a.recorrencia !== "nenhuma" && <span className="inline-flex items-center gap-1"><Repeat className="w-3 h-3" />{a.recorrencia}</span>}</span>
                      </p>
                      {a.tentativas > 0 && <p className="text-xs text-yellow-400">Tentativas: {a.tentativas}</p>}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border shrink-0 ${st.cor}`}>{st.label}</span>
                  </div>
                  {a.status === "pendente" && (
                    <div className="flex items-center gap-2">
                      {editId === a.id ? (
                        <>
                          <input type="date" value={editData} onChange={e=>setEditData(e.target.value)} className="bg-bg-card border border-gray-700 rounded px-2 py-1 text-xs" />
                          <input type="time" value={editHora} onChange={e=>setEditHora(e.target.value)} className="bg-bg-card border border-gray-700 rounded px-2 py-1 text-xs" />
                          <button onClick={salvarEdicao} className="p-1.5 bg-green-400/10 text-green-400 rounded"><CheckCircle className="w-4 h-4" /></button>
                          <button onClick={()=>setEditId(null)} className="p-1.5 bg-gray-700 text-gray-300 rounded"><X className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={()=>{ setEditId(a.id); setEditData(a.data_hora_envio.slice(0,10)); setEditHora(a.data_hora_envio.slice(11,16)); }} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-bg-card border border-gray-700 rounded-lg hover:border-accent/50"><Pencil className="w-3 h-3" /> Editar</button>
                          <button onClick={()=>cancelar(a.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-yellow-400/10 text-yellow-400 rounded-lg hover:bg-yellow-400/20 border border-yellow-400/20"><X className="w-3 h-3" /> Cancelar</button>
                          <button onClick={()=>excluir(a.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-400/10 text-red-400 rounded-lg hover:bg-red-400/20"><Trash2 className="w-3 h-3" /> Excluir</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
