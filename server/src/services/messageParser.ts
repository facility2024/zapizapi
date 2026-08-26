/**
 * messageParser.ts
 * Resolve variáveis {{var}} e parseia spintax {op1|op2|op3}
 */

// Mapeamento de nomes de coluna amigáveis → chaves do contato
const ALIASES: Record<string, string> = {
  nome: "nome",
  name: "nome",
  numero: "numero",
  telefone: "numero",
  whatsapp: "numero",
  phone: "numero",
  empresa: "empresa",
  company: "empresa",
  cidade: "cidade",
  city: "cidade",
};

interface Contato {
  numero: string;
  nome?: string;
  empresa?: string;
  cidade?: string;
  extras?: string; // JSON string
  [key: string]: unknown;
}

/**
 * Detecta colunas disponíveis na planilha a partir dos headers
 */
export function detectarVariaveis(headers: string[]): string[] {
  const variaveis: string[] = [];
  const lower = headers.map((h) => h.toLowerCase().trim());

  for (const alias of Object.keys(ALIASES)) {
    if (lower.includes(alias)) {
      variaveis.push(alias);
    }
  }

  // Adiciona colunas extras que não são padrão
  for (const h of headers) {
    const hl = h.toLowerCase().trim();
    if (!Object.keys(ALIASES).includes(hl) && hl !== "numero" && hl !== "telefone" && hl !== "whatsapp") {
      variaveis.push(hl);
    }
  }

  return variaveis;
}

/**
 * Resolve variáveis {{var}} no texto usando dados do contato
 */
export function resolveVariaveis(texto: string, contato: Contato, fallback?: string): string {
  const extras = contato.extras ? JSON.parse(contato.extras) : {};

  return texto.replace(/\{\{(\w+)\}\}/g, (_, chave) => {
    const chaveLower = chave.toLowerCase();

    // Busca nos campos principais
    if (chaveLower === "numero") return contato.numero || "";
    if (chaveLower === "nome") return contato.nome || fallback || "";
    if (chaveLower === "empresa") return contato.empresa || fallback || "";
    if (chaveLower === "cidade") return contato.cidade || fallback || "";

    // Busca nos extras
    if (extras[chaveLower] !== undefined) return String(extras[chaveLower]);
    if (extras[chave] !== undefined) return String(extras[chave]);

    // Fallback geral
    return fallback || "";
  });
}

/**
 * Parseia spintax {opcao1|opcao2|opcao3} e sorteia uma opção
 */
export function parseSpintax(texto: string): string {
  return texto.replace(/\{([^{}]+\|[^{}]+)\}/g, (_, grupo: string) => {
    const opcoes = grupo.split("|").map((o: string) => o.trim());
    const idx = Math.floor(Math.random() * opcoes.length);
    return opcoes[idx];
  });
}

/**
 * Processa mensagem completa: resolve variáveis e depois spintax
 */
export function processarMensagem(texto: string, contato: Contato, fallback?: string): string {
  const comVariaveis = resolveVariaveis(texto, contato, fallback);
  return parseSpintax(comVariaveis);
}

/**
 * Valida sintaxe do spintax (chaves balanceadas)
 * Ignora {{variaveis}} que usam chaves duplas
 */
export function validarSpintax(texto: string): { valido: boolean; erro?: string } {
  let profundidade = 0;

  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === "{") {
      // Ignora {{variavel}} — duas chaves seguidas = variável, não spintax
      if (i + 1 < texto.length && texto[i + 1] === "{") {
        i++; // pula a segunda chave
        continue;
      }
      profundidade++;
      if (profundidade > 1) {
        return { valido: false, erro: `Chave de spintax aninhada não permitida na posição ${i}` };
      }
    } else if (texto[i] === "}") {
      // Ignora }} de fechamento de variável
      if (i + 1 < texto.length && texto[i + 1] === "}") {
        i++; // pula a segunda chave
        continue;
      }
      profundidade--;
      if (profundidade < 0) {
        return { valido: false, erro: `Chave de fechamento excessiva na posição ${i}` };
      }
    }
  }

  if (profundidade !== 0) {
    return { valido: false, erro: "Chaves de spintax não balanceadas" };
  }

  return { valido: true };
}

/**
 * Gera exemplos de preview da mensagem para um contato
 */
export function gerarExemplos(texto: string, contato: Contato, fallback?: string, qtd = 3): string[] {
  const exemplos: string[] = [];
  for (let i = 0; i < qtd; i++) {
    exemplos.push(processarMensagem(texto, contato, fallback));
  }
  return exemplos;
}
