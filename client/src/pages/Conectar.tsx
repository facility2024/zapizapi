import { useEffect, useState, useRef } from "react";
import { RefreshCw, Wifi, WifiOff, Loader2 } from "lucide-react";
import api from "../api";

interface QrResponse {
  qrCode: string;
  base64: string;
}

export default function Conectar() {
  const [status, setStatus] = useState<"connected" | "disconnected" | "connecting">("disconnected");
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    verificarStatus();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function verificarStatus() {
    try {
      const { data } = await api.get("/wapi/status");
      setStatus(data.status);
      if (data.status === "connected") {
        setQr(null);
        setPolling(false);
        setError(null);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    } catch {
      setStatus("disconnected");
    } finally {
      setLoading(false);
    }
  }

  async function buscarQrCode() {
    setPolling(true);
    setQr(null);
    setError(null);
    try {
      const { data } = await api.get<QrResponse>("/wapi/qrcode");
      setQr(data.base64 || data.qrCode);

      // Polling até conectar
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(async () => {
        try {
          const { data: st } = await api.get("/wapi/status");
          if (st.status === "connected") {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
            setPolling(false);
            verificarStatus();
          }
        } catch {
          // Continua polling
        }
      }, 3000);

      // Timeout de 2 minutos
      setTimeout(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setPolling(false);
      }, 120000);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setError(e.response?.data?.error || e.message || "Erro ao gerar QR Code");
      setPolling(false);
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
        <h1 className="text-2xl font-bold">Conectar WhatsApp</h1>
        <p className="text-gray-500 text-sm mt-1">Pareie seu número via QR Code</p>
      </div>

      {/* Status */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        status === "connected"
          ? "bg-green-400/10 border-green-400/30 text-green-400"
          : "bg-red-400/10 border-red-400/30 text-red-400"
      }`}>
        {status === "connected" ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
        <span className="font-medium">
          {status === "connected" ? "Conectado" : "Desconectado"}
        </span>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-400/10 border border-red-400/30 text-red-400 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* QR Code */}
      <div className="bg-bg-card border border-gray-800 rounded-xl p-8 flex flex-col items-center gap-6">
        {qr ? (
          <>
            <img
              src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
              alt="QR Code"
              className="w-72 h-72 rounded-xl border border-gray-700 shadow-glow"
            />
            <p className="text-sm text-gray-400">Escaneie com o WhatsApp</p>
          </>
        ) : (
          <div className="w-72 h-72 rounded-xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center gap-3 text-gray-500">
            <RefreshCw className="w-8 h-8" />
            <p className="text-sm">Clique para gerar o QR Code</p>
          </div>
        )}

        <button
          onClick={buscarQrCode}
          disabled={polling || status === "connected"}
          className="px-6 py-3 bg-accent hover:bg-accent-light disabled:opacity-50 rounded-xl font-medium transition-all shadow-glow-sm hover:shadow-glow"
        >
          {polling ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Aguardando pareamento...
            </span>
          ) : qr ? (
            "Gerar novo QR Code"
          ) : status === "connected" ? (
            "WhatsApp já conectado"
          ) : (
            "Conectar"
          )}
        </button>
      </div>
    </div>
  );
}
