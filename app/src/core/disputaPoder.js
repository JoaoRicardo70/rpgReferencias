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
import { getFatorPoderDoGolpe } from './classesMecanicas.js';
import { fatorPoderPorCusto } from './custoPoder.js';

// Teto do bônus do mais forte (evita Infinity contra um Poder 0, ex.: Fadiga 100%).
export const FATOR_DISPUTA_MAXIMO = 1e6;

// Poder Atual de um personagem, SEM o arredondamento do Scouter (mesma unidade do número exibido):
// um personagem novo com Poder exibido "0" ainda tem um Poder real pra comparar.
//
// `golpe` (opcional, core/classesMecanicas.js > golpeEquipado): quando é o PODER DO ATACANTE num golpe
// específico, as Classes que causam dano "como se o Poder fosse Nx maior" (Caster em Conjuração,
// Assassin ocultado, Moon Cancer no que representa) multiplicam o Poder só nesta disputa.
export function getPoderParaDisputa(ficha, divisorPoderMesa, golpe) {
    if (!ficha) return null;
    try {
        const { poderExato, poderBase } = calcularPoderAtual(ficha, divisorPoderMesa);
        let v = poderExato;
        if (golpe) v *= getFatorPoderDoGolpe(ficha, golpe).fator;
        // 🔋 O Custo do golpe (energia gasta ou "conjurado como Poder") soma na base do Poder só neste golpe.
        if (golpe && golpe.custoBruto > 0) v *= fatorPoderPorCusto(poderBase, golpe.custoBruto);
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

// ==========================================
// 🎯 ACERTO — a diferença de Poder também pesa em acertar. Entra POR ÚLTIMO, depois de todos os outros bônus
// (atributo, Prof, arma, Forma, Classe...), como a Disputa no dano: soma ao Acerto total de quem ataca antes de
// comparar com a defesa do alvo. A escala é logarítmica (cada 10x de Poder vale +10) e limitada, então só a
// razão importa: os números absolutos podem crescer à vontade sem inflar o acerto, e empilhar multiplicadores
// de Poder não quebra nada.
// ==========================================
export const BONUS_ACERTO_PODER_MAXIMO = 15;

// Bônus (positivo ou negativo, inteiro) que a disputa soma ao Acerto de quem ataca. Sem disputa ativa = 0.
export function bonusAcertoPorDisputa(disputa) {
    if (!disputa || !disputa.ativa) return 0;
    const a = disputa.poderAtacante;
    const d = disputa.poderDefensor;
    if (a === d) return 0;
    if (a > d && !(d > 0)) return BONUS_ACERTO_PODER_MAXIMO; // alvo sem Poder
    if (a < d && !(a > 0)) return -BONUS_ACERTO_PODER_MAXIMO; // atacante sem Poder
    // Diferença de logs (e não log da razão): a / d estoura para Infinity/0 com Poderes gigantes.
    const bruto = Math.round(10 * (Math.log10(a) - Math.log10(d)));
    if (!Number.isFinite(bruto)) return 0;
    return Math.max(-BONUS_ACERTO_PODER_MAXIMO, Math.min(BONUS_ACERTO_PODER_MAXIMO, bruto)) || 0;
}

// Resolve o acerto contra UM alvo: o Acerto total (já com todos os bônus) + o bônus de Poder contra a defesa.
// Devolve o item do feed ({ nome, defesa, acertou, poderAcerto?, ...extras }). `poderAcerto` é só QUALITATIVO
// ('favor' | 'contra'): o feed não entrega o Poder de ninguém (mesma regra de descreverDisputa).
export function resolverAcertoNoAlvo({ nome, defesa, acertoTotal, poderAtacante, poderAlvo, naturalD20 = null, acertoAutomatico = false, extras = {} }) {
    const bonus = bonusAcertoPorDisputa(calcularDisputaPoder(poderAtacante, poderAlvo));
    // 🎲 20 natural sempre acerta e 1 natural sempre falha, seja qual for a defesa e o Poder.
    const acertou = acertoAutomatico ? true : naturalD20 === 20 ? true : naturalD20 === 1 ? false : (Number(acertoTotal) || 0) + bonus >= defesa;
    const item = { nome, defesa, acertou, ...extras };
    if (naturalD20 === 20 || naturalD20 === 1) item.natural = naturalD20;
    if (acertoAutomatico) item.automatico = true; // 🎯 efeito ACERTO_AUTOMATICO: acertou sem comparar com a defesa
    if (bonus > 0) item.poderAcerto = 'favor';
    else if (bonus < 0) item.poderAcerto = 'contra';
    return item;
}

// Marca curta pro feed ao lado do resultado do alvo.
export function marcaPoderAcerto(item) {
    if (!item || !item.poderAcerto) return '';
    return item.poderAcerto === 'favor' ? ' ⚖️ Poder a favor' : ' ⚖️ Poder contra';
}

// Marca do 20/1 natural (a rolagem já é pública no feed, então não precisa de Percepção).
export function marcaNaturalAcerto(item) {
    if (item && item.automatico) return ' 🎯 acerto automático';
    if (!item || !item.natural) return '';
    return item.natural === 20 ? ' 🎲 20 natural!' : ' 🎲 1 natural!';
}

// Categoria QUALITATIVA do quanto o golpe rendeu (vai no feed no lugar do fator, que entregaria o
// Poder do alvo): 'nula' | 'reduzida' | 'normal' | 'alta' — ou null se não houve disputa.
export function classificarEfetividade(disputa) {
    if (!disputa || !disputa.ativa) return null;
    if (disputa.fator <= 0) return 'nula';
    if (disputa.fator < 0.95) return 'reduzida';
    if (disputa.fator > 1.05) return 'alta';
    return 'normal';
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
