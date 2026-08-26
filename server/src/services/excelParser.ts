/**
 * excelParser.ts
 * Parse de planilhas Excel/CSV para contatos
 */

import * as XLSX from "xlsx";

interface ContatoImportado {
  numero: string;
  nome?: string;
  empresa?: string;
  cidade?: string;
  extras: Record<string, string>;
}

interface ParseResult {
  contatos: ContatoImportado[];
  headers: string[];
  validos: number;
  invalidos: number;
  erros: string[];
}

// Mapeamento de possíveis nomes de coluna para campos padronizados
const NUMERO_ALIASES = ["numero", "telefone", "whatsapp", "phone", "celular", "número", "num"];
const NOME_ALIASES = ["nome", "name", "contato"];
const EMPRESA_ALIASES = ["empresa", "company", "organizacao", "organização"];
const CIDADE_ALIASES = ["cidade", "city", "municipio", "município"];

function normalizarNumero(raw: string): string {
  // Remove tudo que não é dígito
  let num = raw.replace(/\D/g, "");

  // Se não começa com 55, adiciona
  if (!num.startsWith("55")) {
    num = "55" + num;
  }

  // Validação básica: DDD (2 dígitos) + número (8-9 dígitos)
  if (num.length < 12 || num.length > 13) return "";
  if (num.length === 12) {
    // Fixo: 55 + DDD (2) + 8 dígitos
    num = num;
  } else if (num.length === 13) {
    // Celular: 55 + DDD (2) + 9 dígitos
    num = num;
  } else {
    return "";
  }

  return num;
}

function mapearColuna(header: string): string | null {
  const h = header.toLowerCase().trim();

  if (NUMERO_ALIASES.includes(h)) return "numero";
  if (NOME_ALIASES.includes(h)) return "nome";
  if (EMPRESA_ALIASES.includes(h)) return "empresa";
  if (CIDADE_ALIASES.includes(h)) return "cidade";

  return null; // coluna extra
}

/**
 * Parseia arquivo Excel/CSV e retorna contatos normalizados
 */
export function parsePlanilha(buffer: Buffer, filename: string): ParseResult {
  // Detecta se é CSV com separador ;
  const ext = filename.toLowerCase().split(".").pop();
  const isCSV = ext === "csv" || ext === "txt";
  const parseOptions: Record<string, unknown> = {};
  if (isCSV) {
    const content = buffer.toString("utf-8");
    if (content.includes(";") && !content.includes("\t")) {
      parseOptions.FS = ";";
    }
  }

  const workbook = XLSX.read(buffer, { type: "buffer", ...parseOptions });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { contatos: [], headers: [], validos: 0, invalidos: 0, erros: ["Planilha vazia"] };
  }

  const sheet = workbook.Sheets[sheetName];
  const dados = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

  if (dados.length === 0) {
    return { contatos: [], headers: [], validos: 0, invalidos: 0, erros: ["Nenhum dado encontrado na planilha"] };
  }

  const rawHeaders = Object.keys(dados[0]);
  const headers = rawHeaders.map((h) => h.toLowerCase().trim());

  // Detecta coluna de número
  const numeroColIdx = rawHeaders.findIndex((h) => NUMERO_ALIASES.includes(h.toLowerCase().trim()));
  if (numeroColIdx === -1) {
    return {
      contatos: [],
      headers: rawHeaders,
      validos: 0,
      invalidos: 0,
      erros: ["Coluna de número/telefone não encontrada. Use: numero, telefone, whatsapp, phone"],
    };
  }

  const contatos: ContatoImportado[] = [];
  const erros: string[] = [];
  let validos = 0;
  let invalidos = 0;

  for (let i = 0; i < dados.length; i++) {
    const row = dados[i];
    const rawNum = String(row[rawHeaders[numeroColIdx]] || "").trim();

    if (!rawNum) {
      invalidos++;
      erros.push(`Linha ${i + 2}: número vazio`);
      continue;
    }

    const num = normalizarNumero(rawNum);
    if (!num) {
      invalidos++;
      erros.push(`Linha ${i + 2}: número inválido "${rawNum}"`);
      continue;
    }

    const contato: ContatoImportado = { numero: num, extras: {} };

    // Mapeia colunas conhecidas
    for (let j = 0; j < rawHeaders.length; j++) {
      if (j === numeroColIdx) continue;
      const campo = mapearColuna(rawHeaders[j]);
      const valor = String(row[rawHeaders[j]] || "").trim();

      if (campo === "nome") contato.nome = valor;
      else if (campo === "empresa") contato.empresa = valor;
      else if (campo === "cidade") contato.cidade = valor;
      else if (campo === null) {
        // Coluna extra
        contato.extras[rawHeaders[j].toLowerCase().trim()] = valor;
      }
    }

    contatos.push(contato);
    validos++;
  }

  return { contatos, headers: rawHeaders, validos, invalidos, erros };
}
