// ==========================================
// 🔢 CONTADORES — lógica pura. Um contador manual da ficha (ex.: "Arco de Conversão" 0–5, "Poeira acumulada", stacks próprios):
//   ficha.contadores = [{ id, nome, valor, min, max, poderId? }]
// Com `poderId` apontando para um Poder com Estágios, o valor comanda o estágio dele: estágio = valor + 1 (valor 0 = estágio 1).
// Só muda quando a pessoa mexe (sem gatilhos automáticos).
// ==========================================
import { temEstagios, limitarEstagio } from './estagios.js';
import { capturarMaximosAtuais, rescalarVitaisProporcional } from './vitals.js';

export const LIMITE_CONTADORES = 12;
export const LIMITE_VALOR_CONTADOR = 9999;
const LIMITE_NOME = 40;

const inteiro = (v, padrao) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? n : padrao;
};
const preso = (n) => Math.max(-LIMITE_VALOR_CONTADOR, Math.min(LIMITE_VALOR_CONTADOR, n));

// Contador limpo: min <= max, valor dentro de [min, max]. Sem nome vira "Contador".
export function normalizarContador(c) {
    if (!c || typeof c !== 'object') return null;
    let min = preso(inteiro(c.min, 0));
    let max = preso(inteiro(c.max, 10));
    if (max < min) [min, max] = [max, min];
    const valor = Math.max(min, Math.min(max, preso(inteiro(c.valor, min))));
    const saida = { id: String(c.id ?? ''), nome: String(c.nome ?? '').trim().slice(0, LIMITE_NOME) || 'Contador', valor, min, max };
    if (c.poderId !== undefined && c.poderId !== null && c.poderId !== '') saida.poderId = c.poderId;
    return saida;
}

export const listaDeContadores = (ficha) => (ficha && Array.isArray(ficha.contadores) ? ficha.contadores.filter(c => c && typeof c === 'object') : []);

// Estágio que um valor do contador representa (valor 0 = estágio 1).
export const estagioDoValor = (valor) => Math.max(1, inteiro(valor, 0) + 1);

// Põe o Poder no estágio `n` (limitado ao que ele tem), sem drenar Vida/Energia. Use dentro de updateFicha.
// Devolve true se mudou algo.
export function definirEstagio(ficha, poderId, n) {
    if (!ficha) return false;
    const p = (ficha.poderes || []).find(po => po && String(po.id) === String(poderId));
    if (!p || !temEstagios(p)) return false;
    const alvo = limitarEstagio(p, n);
    if (p.estagioAtual === alvo) return false;
    const oldM = capturarMaximosAtuais(ficha);
    p.estagioAtual = alvo;
    rescalarVitaisProporcional(ficha, oldM);
    return true;
}

// Se o contador está ligado a um Poder com Estágios, aplica o estágio do valor atual. Use dentro de updateFicha.
export function sincronizarEstagioDoContador(ficha, contador) {
    if (!contador || contador.poderId === undefined) return false;
    return definirEstagio(ficha, contador.poderId, estagioDoValor(contador.valor));
}

// Todas as mutações abaixo trabalham no RASCUNHO (dentro de updateFicha) e devolvem true se mudaram algo.
export function adicionarContador(ficha, { id, nome = 'Contador', min = 0, max = 5, poderId } = {}) {
    if (!ficha) return false;
    if (!Array.isArray(ficha.contadores)) ficha.contadores = [];
    if (ficha.contadores.length >= LIMITE_CONTADORES) return false;
    const novo = normalizarContador({ id: id ?? `ct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, nome, valor: min, min, max, poderId });
    ficha.contadores.push(novo);
    sincronizarEstagioDoContador(ficha, novo);
    return true;
}

export function removerContador(ficha, id) {
    if (!ficha || !Array.isArray(ficha.contadores)) return false;
    const antes = ficha.contadores.length;
    ficha.contadores = ficha.contadores.filter(c => !c || String(c.id) !== String(id));
    return ficha.contadores.length !== antes;
}

// Muda campos (nome, min, max, valor, poderId) e re-normaliza; mexer no valor/limites/poder reaplica o estágio.
export function atualizarContador(ficha, id, patch) {
    if (!ficha || !Array.isArray(ficha.contadores)) return false;
    const i = ficha.contadores.findIndex(c => c && String(c.id) === String(id));
    if (i < 0) return false;
    const mescla = { ...ficha.contadores[i], ...patch };
    if (patch && 'poderId' in patch && (patch.poderId === '' || patch.poderId == null)) delete mescla.poderId;
    const novo = normalizarContador(mescla);
    ficha.contadores[i] = novo;
    sincronizarEstagioDoContador(ficha, novo);
    return true;
}

// +1 / −1 (ou qualquer delta), parando nos limites.
export function mudarContador(ficha, id, delta) {
    const c = listaDeContadores(ficha).find(x => String(x.id) === String(id));
    if (!c) return false;
    const novoValor = Math.max(c.min, Math.min(c.max, inteiro(c.valor, c.min) + inteiro(delta, 0)));
    if (novoValor === c.valor) return false;
    return atualizarContador(ficha, id, { valor: novoValor });
}
