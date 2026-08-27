import { useState, useRef, useEffect } from "react";
import { Upload, Send, X, FileSpreadsheet, Loader2, Eye, Type, Check } from "lucide-react";
import api from "../api";

interface Contato {
  id: string;
  numero: string;
  nome?: string;
  empresa?: string;
  cidade?: string;
  extras?: string;
}

interface UploadResult {
  contatos: Contato[];
  headers: string[];
  validos: number;
  invalidos: number;
  erros: string[];
}

type TipoDisparo = "texto" | "imagem_texto" | "audio";
type ModoContato = "planilha" | "manual";

type NumeroExtracao = { numero: string; nome?: string; valido: boolean };

/** Extrai números de um texto (um por linha ou bloco com espaço/vírgula/tab/+), tolerando formatação. */
function extrairNumeros(texto: string): NumeroExtracao[] {
  const PHONE_RE = /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/g;
  const out: NumeroExtracao[] = [];
  const linhas = texto.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  for (const linha of linhas) {
    const barra = linha.indexOf("|");
    let numPart = linha;
    let nome: string | undefined;
    if (barra !== -1) {
      numPart = linha.slice(0, barra).trim();
      nome = linha.slice(barra + 1).trim() || undefined;
    }
    const matches = numPart.match(PHONE_RE);
    if (!matches) continue;
    matches.forEach((m) => {
      let num = m.replace(/\D/g, "");
      if (!num.startsWith("55")) num = "55" + num;
      out.push({
        numero: num,
        nome: matches.length === 1 ? nome : undefined,
        valido: num.length >= 12 && num.length <= 13,
      });
    });
  }
  return out;
}

export default function NovaCampanha() {
  const [nome, setNome] = useState("");
  const [tipoDisparo, setTipoDisparo] = useState<TipoDisparo>("texto");
  const [textoMensagem, setTextoMensagem] = useState("");
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [imagemPreview, setImagemPreview] = useState<string | null>(null);
  const [fallback, setFallback] = useState("");
  const [delayMin, setDelayMin] = useState(20);
  const [delayMax, setDelayMax] = useState(40);
  const [delayImgTxt, setDelayImgTxt] = useState(4);

  const [modoContato, setModoContato] = useState<ModoContato>("planilha");
  const [numerosManual, setNumerosManual] = useState("");
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);
  const [mensagemErro, setMensagemErro] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);

  const variaveisDetectadas = modoContato === "planilha" ? (uploadResult?.headers || []) : [];

  // Contagens da entrada manual
  const contatosExtraidos = extrairNumeros(numerosManual);
  const numerosValidos = contatosExtraidos.filter((c) => c.valido).length;
  const numerosInvalidos = contatosExtraidos.length - numerosValidos;

  // Upload de planilha
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMensagemErro("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await api.post<UploadResult>("/upload", formData);
      setUploadResult(data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setMensagemErro(error.response?.data?.error || "Erro ao processar planilha");
    } finally {
      setUploading(false);
    }
  }

  // Processar números manuais
  async function processarNumerosManuais(): Promise<Contato[]> {
    if (!numerosManual.trim()) return [];
    try {
      const { data } = await api.post<UploadResult>("/upload/manual", { numeros: numerosManual });
      if (data.erros?.length > 0 && data.validos === 0) {
        setMensagemErro(data.erros[0]);
        return [];
      }
      setUploadResult(data);
      return data.contatos;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setMensagemErro(error.response?.data?.error || "Erro ao processar números");
      return [];
    }
  }

  // Inserir variável no texto
  function inserirVariavel(variavel: string) {
    const textarea = textoRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const texto = textoMensagem;
    const novoTexto = texto.slice(0, start) + `{{${variavel}}}` + texto.slice(end);
    setTextoMensagem(novoTexto);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variavel.length + 4, start + variavel.length + 4);
    }, 0);
  }

  // Preview de spintax
  async function gerarPreview() {
    const contatoExemplo = uploadResult?.contatos[0] || { id: "1", numero: "5511999999999", nome: "João" };
    try {
      const { data } = await api.post("/campaigns/fake/preview", {
        textoMensagem,
        contato: contatoExemplo,
        fallback,
      });
      setPreview(data.exemplos || []);
    } catch {
      setPreview([]);
    }
  }

  // Highlight de variáveis no textarea
  useEffect(() => {
    const textarea = textoRef.current;
    if (!textarea) return;
    textarea.style.backgroundImage = "none";
  }, [textoMensagem]);

  // Upload de mídia para o servidor
  async function uploadMedia(file: File): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const { data } = await api.post<{ url: string }>("/upload/media", formData);
      return data.url;
    } catch {
      return null;
    }
  }

  // Enviar campanha
  async function handleEnviar() {
    if (!nome || !textoMensagem) {
      setMensagemErro("Preencha nome e mensagem");
      return;
    }

    let contatosParaEnviar: Contato[] = [];

    if (modoContato === "manual") {
      if (contatosExtraidos.length === 0) {
        setMensagemErro("Adicione pelo menos um número");
        return;
      }
      contatosParaEnviar = await processarNumerosManuais();
      if (contatosParaEnviar.length === 0) return;
    } else {
      if (!uploadResult?.contatos.length) {
        setMensagemErro("Faça upload de uma planilha ou use a entrada manual");
        return;
      }
      contatosParaEnviar = uploadResult.contatos;
    }

    setEnviando(true);
    setMensagemErro("");

    try {
      let imagemUrl: string | undefined;
      let audioUrl: string | undefined;

      // Upload de mídia para o servidor
      if (tipoDisparo === "imagem_texto" && imagemFile) {
        const url = await uploadMedia(imagemFile);
        if (url) imagemUrl = url;
        else { setMensagemErro("Erro ao fazer upload da imagem"); setEnviando(false); return; }
      }
      if (tipoDisparo === "audio" && audioFile) {
        const url = await uploadMedia(audioFile);
        if (url) audioUrl = url;
        else { setMensagemErro("Erro ao fazer upload do áudio"); setEnviando(false); return; }
      }

      // Cria a campanha
      const { data: campanha } = await api.post<{ id: string }>("/campaigns", {
        nome,
        tipoDisparo,
        textoMensagem,
        imagemUrl,
        audioUrl,
        variavelFallback: fallback || undefined,
        contatoIds: contatosParaEnviar.map((c) => c.id),
        delayEntreMsgMin: delayMin,
        delayEntreMsgMax: delayMax,
        delayImagemTexto: delayImgTxt,
      });

      // Auto-inicia a campanha
      await api.post(`/campaigns/${campanha.id}/start`);

      setNome("");
      setTextoMensagem("");
      setNumerosManual("");
      setUploadResult(null);
      setMensagemErro("");
      alert("Campanha criada e iniciada!");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setMensagemErro(error.response?.data?.error || error.message || "Erro ao criar campanha");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Nova Campanha</h1>
        <p className="text-gray-500 text-sm mt-1">Configure e envie suas mensagens</p>
      </div>

      {mensagemErro && (
        <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-3 rounded-xl text-sm">
          {mensagemErro}
        </div>
      )}

      {/* Lista de contatos */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">1. Lista de Contatos</h2>

        {/* Toggle Planilha / Manual */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setModoContato("planilha")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
              modoContato === "planilha"
                ? "bg-accent/20 text-accent-light border border-accent/30"
                : "bg-bg-primary border border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Planilha
          </button>
          <button
            onClick={() => setModoContato("manual")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
              modoContato === "manual"
                ? "bg-accent/20 text-accent-light border border-accent/30"
                : "bg-bg-primary border border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            <Type className="w-4 h-4" />
            Manual
          </button>
        </div>

        {/* Modo Planilha */}
        {modoContato === "planilha" && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleUpload}
              className="hidden"
            />

            {uploadResult ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-bg-primary rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="w-5 h-5 text-green-400" />
                    <div>
                      <p className="text-sm font-medium">{uploadResult.contatos.length} contatos importados</p>
                      <p className="text-xs text-gray-500">
                        <span className="text-green-400">{uploadResult.validos} válidos</span>
                        {" · "}
                        <span className="text-red-400">{uploadResult.invalidos} inválidos</span>
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setUploadResult(null)} className="text-gray-500 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tabela preview */}
                <div className="overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-2 px-3 text-gray-500">Número</th>
                        <th className="text-left py-2 px-3 text-gray-500">Nome</th>
                        {variaveisDetectadas.filter((h) => !["numero", "nome", "telefone", "whatsapp"].includes(h.toLowerCase())).map((h) => (
                          <th key={h} className="text-left py-2 px-3 text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.contatos.slice(0, 10).map((c) => (
                        <tr key={c.id} className="border-b border-gray-800/50">
                          <td className="py-2 px-3 text-accent-light font-mono">{c.numero}</td>
                          <td className="py-2 px-3">{c.nome || "-"}</td>
                          {variaveisDetectadas.filter((h) => !["numero", "nome", "telefone", "whatsapp"].includes(h.toLowerCase())).map((h) => (
                            <td key={h} className="py-2 px-3 text-gray-400">
                              {c.extras ? JSON.parse(c.extras)[h.toLowerCase()] || "-" : "-"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-gray-700 rounded-xl p-8 flex flex-col items-center gap-3 hover:border-accent/50 transition-colors"
              >
                {uploading ? (
                  <Loader2 className="w-8 h-8 text-accent animate-spin" />
                ) : (
                  <Upload className="w-8 h-8 text-gray-500" />
                )}
                <span className="text-sm text-gray-400">
                  {uploading ? "Processando..." : "Clique ou arraste um arquivo .xlsx ou .csv"}
                </span>
              </button>
            )}
          </>
        )}

        {/* Modo Manual */}
        {modoContato === "manual" && (
          <div className="space-y-3">
            <div className="relative">
              <textarea
                value={numerosManual}
                onChange={(e) => setNumerosManual(e.target.value)}
                placeholder={"5511999999999|João\n11988887777|Maria\n(21) 97777-6666|Pedro\n55 31 96666-5555"}
                rows={8}
                className="w-full bg-bg-primary border border-gray-700 rounded-lg px-4 py-3 text-sm focus:border-accent focus:outline-none resize-none font-mono"
              />
               <div className="absolute bottom-3 right-3 text-xs text-gray-600">
                 {contatosExtraidos.length} contatos
               </div>
            </div>

            {/* Validação por linha */}
            {contatosExtraidos.length > 0 && (
              <div className="space-y-1 max-h-44 overflow-y-auto text-xs font-mono bg-bg-primary rounded-lg p-3 border border-gray-800">
                {contatosExtraidos.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {c.valido ? (
                      <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span className={c.valido ? "text-green-400" : "text-red-400"}>
                      {c.numero}
                      {c.nome ? ` (${c.nome})` : ""}
                    </span>
                    {!c.valido && (
                      <span className="text-red-400/70">
                        {c.numero.length === 14
                          ? "(provável dígito faltando após o 55)"
                          : `(${c.numero.length} dígitos — inválido)`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Contadores */}
            <div className="flex items-center gap-4 text-xs">
              <span className="text-green-400">{numerosValidos} válidos</span>
              {numerosInvalidos > 0 && (
                <span className="text-red-400">{numerosInvalidos} inválidos</span>
              )}
            </div>

            {/* Erros de validação */}
            {uploadResult && uploadResult.erros.length > 0 && (
              <div className="space-y-1">
                {uploadResult.erros.slice(0, 5).map((erro, i) => (
                  <p key={i} className="text-xs text-red-400">{erro}</p>
                ))}
              </div>
            )}

            {/* Preview dos contatos */}
            {uploadResult && uploadResult.contatos.length > 0 && (
              <div className="overflow-x-auto max-h-32 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-1 px-2 text-gray-500">Número</th>
                      <th className="text-left py-1 px-2 text-gray-500">Nome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResult.contatos.slice(0, 5).map((c) => (
                      <tr key={c.id} className="border-b border-gray-800/50">
                        <td className="py-1 px-2 text-accent-light font-mono">{c.numero}</td>
                        <td className="py-1 px-2">{c.nome || <span className="text-gray-600">-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-500">
              Formato: <span className="font-mono text-gray-400">numero|nome</span> — um contato por linha. Nome é opcional para usar {"{{nome}}"}
            </p>
          </div>
        )}
      </div>

      {/* Composição do disparo */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">2. Mensagem</h2>

        {/* Nome da campanha */}
        <input
          type="text"
          placeholder="Nome da campanha"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full bg-bg-primary border border-gray-700 rounded-lg px-4 py-3 text-sm mb-4 focus:border-accent focus:outline-none"
        />

        {/* Tipo de disparo */}
        <div className="flex gap-3 mb-4">
          {([
            { value: "texto", label: "Texto" },
            { value: "imagem_texto", label: "Imagem + Texto" },
            { value: "audio", label: "Áudio (Nota de voz)" },
          ] as const).map((op) => (
            <button
              key={op.value}
              onClick={() => setTipoDisparo(op.value)}
              className={`px-4 py-2 rounded-lg text-sm transition-all ${
                tipoDisparo === op.value
                  ? "bg-accent/20 text-accent-light border border-accent/30"
                  : "bg-bg-primary border border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>

        {/* Upload de imagem */}
        {tipoDisparo === "imagem_texto" && (
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-2">Imagem</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setImagemFile(file);
                  setImagemPreview(URL.createObjectURL(file));
                }
              }}
              className="hidden"
              id="img-upload"
            />
            {imagemPreview ? (
              <div className="relative inline-block">
                <img src={imagemPreview} alt="Preview" className="w-32 h-32 object-cover rounded-lg border border-gray-700" />
                <button
                  onClick={() => { setImagemFile(null); setImagemPreview(null); }}
                  className="absolute -top-2 -right-2 bg-red-500 rounded-full p-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <label htmlFor="img-upload" className="block border-2 border-dashed border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-accent/50">
                <Upload className="w-6 h-6 text-gray-500 mx-auto mb-2" />
                <span className="text-xs text-gray-500">Clique para selecionar imagem</span>
              </label>
            )}
          </div>
        )}

        {/* Upload de áudio */}
        {tipoDisparo === "audio" && (
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-2">Áudio</label>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setAudioFile(file);
              }}
              className="hidden"
              id="audio-upload"
            />
            {audioFile ? (
              <div className="flex items-center gap-3 p-3 bg-bg-primary rounded-lg">
                <span className="text-sm">{audioFile.name}</span>
                <button onClick={() => setAudioFile(null)} className="text-gray-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label htmlFor="audio-upload" className="block border-2 border-dashed border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-accent/50">
                <Upload className="w-6 h-6 text-gray-500 mx-auto mb-2" />
                <span className="text-xs text-gray-500">Selecione um áudio (mp3, wav, m4a)</span>
              </label>
            )}
          </div>
        )}

        {/* Variáveis disponíveis */}
        {variaveisDetectadas.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-2">Variáveis da planilha</label>
            <div className="flex flex-wrap gap-2">
              {variaveisDetectadas.map((v) => (
                <button
                  key={v}
                  onClick={() => inserirVariavel(v)}
                  className="px-2.5 py-1 bg-bg-primary border border-gray-700 rounded text-xs text-accent-light hover:border-accent/50 transition-colors"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Campo de texto */}
        <div className="relative">
          <textarea
            ref={textoRef}
            value={textoMensagem}
            onChange={(e) => setTextoMensagem(e.target.value)}
            placeholder={`{Olá|Oi|E aí} {{nome}}, tudo bem?\n\nMensagem de exemplo usando variáveis da planilha.`}
            rows={6}
            className="w-full bg-bg-primary border border-gray-700 rounded-lg px-4 py-3 text-sm focus:border-accent focus:outline-none resize-none font-mono"
          />
          <div className="absolute bottom-3 right-3 text-xs text-gray-600">
            {textoMensagem.length} caracteres
          </div>
        </div>

        {/* Fallback */}
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1">Fallback (quando variável estiver vazia)</label>
          <input
            type="text"
            placeholder="ex: tudo bem?"
            value={fallback}
            onChange={(e) => setFallback(e.target.value)}
            className="w-full bg-bg-primary border border-gray-700 rounded-lg px-4 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        {/* Preview spintax */}
        {textoMensagem.includes("{") && (
          <button
            onClick={gerarPreview}
            className="mt-3 flex items-center gap-2 text-xs text-accent-light hover:text-accent transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Ver como vai ficar
          </button>
        )}
        {preview.length > 0 && (
          <div className="mt-3 space-y-2">
            {preview.map((p, i) => (
              <div key={i} className="p-3 bg-bg-primary rounded-lg text-sm border border-accent/10">
                <span className="text-xs text-gray-500">Exemplo {i + 1}:</span>
                <p className="mt-1 whitespace-pre-wrap">{p}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configurações de delay */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">3. Configurações de Envio</h2>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Delay mínimo (seg)</label>
            <input
              type="number"
              value={delayMin}
              onChange={(e) => setDelayMin(Number(e.target.value))}
              className="w-full bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Delay máximo (seg)</label>
            <input
              type="number"
              value={delayMax}
              onChange={(e) => setDelayMax(Number(e.target.value))}
              className="w-full bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Delay img→texto (seg)</label>
            <input
              type="number"
              value={delayImgTxt}
              onChange={(e) => setDelayImgTxt(Number(e.target.value))}
              className="w-full bg-bg-primary border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Botão enviar */}
      <button
        onClick={handleEnviar}
        disabled={enviando || !nome || !textoMensagem || (modoContato === "planilha" ? !uploadResult?.contatos.length : contatosExtraidos.length === 0)}
        className="w-full py-4 bg-accent hover:bg-accent-light disabled:opacity-40 rounded-xl font-semibold transition-all shadow-glow-sm hover:shadow-glow flex items-center justify-center gap-3"
      >
        {enviando ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Criando campanha...
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            Criar Campanha
          </>
        )}
      </button>
    </div>
  );
}
