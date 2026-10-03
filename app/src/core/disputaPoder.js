// ==========================================
// ⚖️ DISPUTA DE PODER — o combate é sempre uma disputa de nível de Poder Calculado.
// Pedido do usuário: os Multiplicadores de Dano deixaram de multiplicar o dano (só entram no
// Poder Calculado, core/poder.js) e o dano passa a ser ajustado pela diferença de Poder ATUAL
// (com Supressão, Fadiga, Formas, PODER (Direto)… tudo que mexe no Scouter) entre quem golpeia
// e quem recebe.
//
// A diferença é medida em % em cima do MAIS FRACO:  d = (forte - fraco) / fraco.
//   • O mais forte causa (1 + d)x de dano no mais fraco.
//   • O mais fraco causa (1 - d)x no mais forte — com 2x de Poder (d = 100%) já não causa nada.
// Ex.: 1100 contra 1000 (d = 10%): o forte causa 1,1x e recebe 0,9x; o fraco causa 0,9x e
// recebe 1,1x. Poder igual = 1x pros dois.
// ==========================================
import { calcularPoderAtual } from './poder.js';

// Teto do bônus do mais forte (evita Infinity contra um Poder 0, ex.: Fadiga 100%).
export const FATOR_DISPUTA_MAXIMO = 1e6;

// Poder Atual de um personagem, SEM o arredondamento do Scouter (mesma unidade do número exibido):
// um personagem novo com Poder exibido "0" ainda tem um Poder real pra comparar.
export function getPoderParaDisputa(ficha, divisorPoderMesa) {
    if (!ficha) return null;
    try {
        const v = calcularPoderAtual(ficha, divisorPoderMesa).poderExato;
        return Number.isFinite(v) ? Math.max(0, v) : null;
    } catch (e) {
        return null;
    }
}

// Entidades do Mapa (dummies) não têm ficha: o Mestre informa o Poder no campo poderCalculado.
// Vazio = sem Poder definido (o golpe não entra em disputa).
export function getPoderDummie(dummie) {
    if (!dummie) return null;
    const bruto = dummie.poderCalculado;
    if (bruto === undefined || bruto === null || bruto === '') return null;
    const v = Number(bruto);
    return Number.isFinite(v) && v >= 0 ? v : null;
}

// Poder de qualquer alvo/atacante do app: ficha de jogador/NPC ou dummy do Mapa.
export function getPoderDeEntidade(entidade, divisorPoderMesa) {
    if (!entidade) return null;
    if (entidade.isDummie) return getPoderDummie(entidade.ficha || entidade);
    return getPoderParaDisputa(entidade.ficha || entidade, divisorPoderMesa);
}

const SEM_DISPUTA = { ativa: false, fator: 1, diferenca: 0, atacanteMaisForte: false, poderAtacante: null, poderDefensor: null };

export function calcularDisputaPoder(poderAtacante, poderDefensor) {
    const valido = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0;
    if (!valido(poderAtacante) || !valido(poderDefensor)) return { ...SEM_DISPUTA };
    const a = Number(poderAtacante);
    const d = Number(poderDefensor);
    const base = { ativa: true, poderAtacante: a, poderDefensor: d };
    if (a === d) return { ...base, fator: 1, diferenca: 0, atacanteMaisForte: false };
    if (a > d) {
        const diferenca = d > 0 ? (a - d) / d : Infinity;
        return { ...base, fator: Math.min(FATOR_DISPUTA_MAXIMO, 1 + diferenca), diferenca, atacanteMaisForte: true };
    }
    const diferenca = a > 0 ? (d - a) / a : Infinity;
    return { ...base, fator: Math.max(0, 1 - diferenca), diferenca, atacanteMaisForte: false };
}

// Aplica a disputa a um valor de dano (sempre inteiro, nunca negativo).
export function aplicarDisputaAoDano(dano, disputa) {
    const v = Math.max(0, Number(dano) || 0);
    if (!disputa || !disputa.ativa) return Math.floor(v);
    // + 1e-7: 100 x 1,15 dá 114,99999… em ponto flutuante e o floor perderia 1 de dano.
    const r = Math.floor(v * disputa.fator + 1e-7);
    return Number.isFinite(r) ? r : Number.MAX_SAFE_INTEGER;
}

export function formatarFatorDisputa(fator) {
    if (!Number.isFinite(fator)) return '∞';
    if (fator >= 1000) return Math.round(fator).toLocaleString('pt-BR');
    return (Math.round(fator * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function formatarPoderDisputa(poder) {
    if (poder === null || poder === undefined || !Number.isFinite(Number(poder))) return '?';
    const v = Number(poder);
    if (v >= 1e15) return v.toExponential(2).replace('+', '').toUpperCase();
    return Math.round(v).toLocaleString('pt-BR');
}

// Frase curta pro feed (visível pra TODA a mesa): "⚖️ Disputa de Poder: atacante mais forte".
// De propósito NÃO traz números: cada jogador sabe o próprio Poder, então uma % ou um fator entregaria
// o Poder exato do outro lado — que só o Mestre (e o dono) vê (os jogadores têm só estimativas,
// core/percepcaoPoder.js). Os números exatos ficam na prévia do Mestre.
export function descreverDisputa(disputa) {
    if (!disputa || !disputa.ativa) return '';
    if (disputa.fator <= 0) return '⚖️ Disputa de Poder: o golpe não surtiu efeito (alvo muito mais forte)';
    if (disputa.fator === 1) return '⚖️ Disputa de Poder: Poder equilibrado';
    return `⚖️ Disputa de Poder: ${disputa.atacanteMaisForte ? 'atacante' : 'alvo'} mais forte`;
}
