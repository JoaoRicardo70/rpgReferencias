// ==========================================
// ⚔️ EFEITOS ESTRUTURADOS DA ARMA ESPIRITUAL / FANTASMA NOBRE — as Passivas e Runas dela são texto livre (só as tags MGERAL etc.
// contam pro Poder). Para a arma também BUFFAR e DEBUFFAR de verdade, cada estado (Base / Forma Verdadeira / Fantasma Nobre) tem um bloco:
//   ficha.armaEspiritual.efeitosEstados[estado] = { efeitos: [{ atributo, propriedade, valor }], aplicaEstados: [...], suporte: {...} }
// Os três estados são excludentes: só o bloco do estado EFETIVO vale (mesma regra do Poder: sem acesso ao estado marcado, cai um nível),
// e só com a arma equipada e o acesso a ela. Lógica pura, sem imports de engine (attributes.js importa daqui).
// ==========================================
import { temAcessoArmaEspiritual } from './acessoArmaEspiritual.js';

export const ESTADOS_ARMA_IDS = ['base', 'verdadeira', 'fantasma'];

// Estado que está valendo agora, ou null se a ficha não tem a arma em uso (sem acesso, ou desequipada).
export function estadoEfetivoDaArma(ficha) {
    const arma = ficha && ficha.armaEspiritual;
    if (!arma || typeof arma !== 'object' || arma.equipada === false || !temAcessoArmaEspiritual(ficha)) return null;
    let estado = ESTADOS_ARMA_IDS.includes(arma.estadoAtivo) ? arma.estadoAtivo : 'base';
    if (estado === 'fantasma' && !arma.acessoFantasma) estado = 'verdadeira';
    if (estado === 'verdadeira' && arma.acessoVerdadeira === false) estado = 'base';
    return estado;
}

export function blocoDoEstado(ficha, estado) {
    const b = ficha && ficha.armaEspiritual && ficha.armaEspiritual.efeitosEstados && ficha.armaEspiritual.efeitosEstados[estado];
    return b && typeof b === 'object' ? b : {};
}

// Bloco do estado em vigor (ou {} se a arma não está em uso).
export function blocoEfetivoDaArma(ficha) {
    const estado = estadoEfetivoDaArma(ficha);
    return estado ? blocoDoEstado(ficha, estado) : {};
}

// Buffs do estado em vigor, no formato de efeitos do app (entram em getEfeitosDeClasse).
export function efeitosDaArmaEspiritual(ficha) {
    const bloco = blocoEfetivoDaArma(ficha);
    const nome = (ficha && ficha.armaEspiritual && ficha.armaEspiritual.nome) || 'Arma Espiritual';
    return (Array.isArray(bloco.efeitos) ? bloco.efeitos : [])
        .filter(e => e && typeof e.atributo === 'string' && typeof e.propriedade === 'string' && Number.isFinite(parseFloat(e.valor)))
        .map(e => ({ atributo: e.atributo, propriedade: e.propriedade, valor: parseFloat(e.valor), nome: e.nome || nome }));
}

// Fonte para o pós-golpe: a arma aplica estados quando está em uso.
export function fonteDeEstadosDaArma(ficha) {
    const bloco = blocoEfetivoDaArma(ficha);
    if (!Array.isArray(bloco.aplicaEstados) || bloco.aplicaEstados.length === 0) return null;
    return { nome: (ficha && ficha.armaEspiritual && ficha.armaEspiritual.nome) || 'Arma Espiritual', aplicaEstados: bloco.aplicaEstados };
}
