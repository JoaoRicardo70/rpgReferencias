// ==========================================
// 💥 DANO DA ARMA ESPIRITUAL / FANTASMA NOBRE — a EA é uma ARMA EQUIPÁVEL: só quando equipada (e com acesso) o dano dela
// entra no golpe. Lógica pura, sem imports de engine.
//   ficha.armaEspiritual.danoBase            texto, ex. "250d8" (só o DADO vale; o resto do texto é ignorado)
//   ficha.armaEspiritual.danoAtributos       [{ atributo, multiplica, fator? }]
//   ficha.armaEspiritual.danoBaseVerdadeira / danoAtributosVerdadeira   (opcionais) dano próprio da Forma Verdadeira
//   ficha.armaEspiritual.danoBaseFantasma   / danoAtributosFantasma     (opcionais) dano próprio do Fantasma Nobre
// Sem dano próprio no estado superior, vale o registrado na Base. O estado em vigor vem de estadoEfetivoDaArma.
// Cada atributo: sem "multiplica" ele SOMA ao dano (igual aos Status da arma comum); com "multiplica" os dados da EA são
// multiplicados pelo valor do atributo (vezes o "fator", se houver).
// Regra de múltiplas armas: a EA equipada é uma fonte de dano À PARTE; se uma arma do inventário também estiver equipada,
// as duas rolam e somam (a arma comum continua seguindo a regra de uma só por vez do Arsenal).
// ==========================================
import { estadoEfetivoDaArma } from './armaEspiritualEfeitos.js';

export const ID_ARMA_ESPIRITUAL = 'arma_espiritual';

const SUFIXO_ESTADO = { verdadeira: 'Verdadeira', fantasma: 'Fantasma' };

// "250d8" -> { qtd: 250, faces: 8, ignorouResto: false }. "250d8 + 10" -> idem com ignorouResto true. Sem dado -> null.
export function parseDadoDano(texto) {
    if (typeof texto !== 'string') return null;
    const m = texto.match(/(\d+)\s*d\s*(\d+)/i);
    if (!m) return null;
    const qtd = parseInt(m[1], 10);
    const faces = parseInt(m[2], 10);
    if (!(qtd > 0) || !(faces > 0)) return null;
    const resto = (texto.slice(0, m.index) + texto.slice(m.index + m[0].length)).trim();
    return { qtd, faces, ignorouResto: resto !== '' };
}

export function normalizarAtributosDano(lista) {
    if (!Array.isArray(lista)) return [];
    const vistos = new Set();
    const saida = [];
    lista.forEach(a => {
        if (!a || typeof a.atributo !== 'string' || !a.atributo || vistos.has(a.atributo)) return;
        vistos.add(a.atributo);
        const fator = parseFloat(a.fator);
        saida.push({ atributo: a.atributo, multiplica: !!a.multiplica, ...(Number.isFinite(fator) && fator > 0 && fator !== 1 ? { fator } : {}) });
    });
    return saida;
}

// Dano que vale AGORA: { estado, qtd, faces, atributos, ignorouResto } ou null (sem acesso, desequipada ou sem dado válido).
export function danoDaArmaEspiritual(ficha) {
    const estado = estadoEfetivoDaArma(ficha);
    if (!estado) return null;
    const arma = ficha.armaEspiritual;
    const sufixo = SUFIXO_ESTADO[estado] || '';
    const proprio = sufixo ? parseDadoDano(arma['danoBase' + sufixo]) : null;
    const dado = proprio || parseDadoDano(arma.danoBase);
    if (!dado) return null;
    const atrProprios = sufixo ? normalizarAtributosDano(arma['danoAtributos' + sufixo]) : [];
    const atributos = atrProprios.length > 0 ? atrProprios : normalizarAtributosDano(arma.danoAtributos);
    return { estado, qtd: dado.qtd, faces: dado.faces, atributos, ignorouResto: dado.ignorouResto };
}

// Item de arma VIRTUAL derivado da EA equipada (null se desequipada/sem acesso). Fica no formato dos itens de arma do inventário.
export function armaVirtualDaArmaEspiritual(ficha) {
    const estado = estadoEfetivoDaArma(ficha);
    if (!estado) return null;
    const dano = danoDaArmaEspiritual(ficha);
    // Sem dado válido ela não é uma arma de dano: não entra na narração, no Acerto nem em estados (ficha só com texto/cântico).
    if (!dano) return null;
    const arma = ficha.armaEspiritual;
    return {
        id: ID_ARMA_ESPIRITUAL,
        tipo: 'arma',
        nome: (typeof arma.nome === 'string' && arma.nome.trim()) || 'Arma Espiritual',
        dadosQtd: dano.qtd,
        dadosFaces: dano.faces,
        alcance: arma.alcance || '',
        equipado: true,
        armaTipo: arma.armaTipo || '',
        virtual: true,
        danoAtributos: dano.atributos
    };
}
