// ==========================================
// FADIGA DE COMBATE — cálculo unificado, usado por Ficha Def/Marcados.jsx e core/poder.js (o
// Poder exibido no Mapa) pra nunca haver dois números diferentes de Fadiga pro mesmo
// personagem — mesmo motivo/padrão de getMunicoCrescenteMultiplier em core/poder.js.
//
// A Fadiga Atual (sempre clampada em 0-100%) soma duas partes:
//   1) fadigaBase = combate.fadigaTurnos x combate.fadigaPorTurno — o contador manual/stepper
//      que já existia ("Turnos Cansativos" x Taxa), inalterado.
//   2) fadigaExtra = combate.fadigaExtra — pontos acumulados AUTOMATICAMENTE a cada retorno do
//      turno de cada jogador no Mapa (ver MapaFormContext.jsx), calculados a partir de o quão
//      gasto/ferido/transformado o personagem estava NAQUELE turno específico (ver
//      calcularGanhoFadigaDinamico abaixo) — cada ganho é somado de uma vez, nunca recalculado
//      retroativamente.
// ==========================================
import { getMaximo, getBuffs } from './attributes.js';

const ENERGIAS = ['mana', 'aura', 'chakra', 'corpo'];
const EIXOS_FORMAS = ['vida', 'mana', 'aura', 'chakra', 'corpo', 'status'];

// Peso máximo (em pontos percentuais de Fadiga) que a soma dos 3 fatores pode render num único
// turno, no pior caso (100% de energia gasta + 100% da vida perdida + mFormas todo saturado ao
// mesmo tempo). Decisão de balanceamento, não extraído de nenhuma fórmula pré-existente.
const PESO_MAX_DINAMICO = 15;

// 0 (energias cheias) a 1 (todas as 4 energias — mana/aura/chakra/corpo — zeradas). Vida fica de
// fora daqui de propósito: ela tem seu próprio fator (getFatorVidaPerdida) — "energia gasta" e
// "dano recebido" são fatores distintos mesmo os dois lendo vitais.
function getFatorEnergiaGasta(ficha) {
    if (!ficha) return 0;
    let soma = 0, count = 0;
    ENERGIAS.forEach(k => {
        if (!ficha[k]) return;
        const max = getMaximo(ficha, k) || 0;
        if (max <= 0) return;
        const atualBruto = parseFloat(ficha[k].atual);
        const atual = isNaN(atualBruto) ? max : atualBruto;
        soma += Math.min(1, Math.max(0, 1 - (atual / max)));
        count++;
    });
    return count > 0 ? soma / count : 0;
}

// 0 (vida cheia) a 1 (vida zerada) — fração de Vida perdida NESTE MOMENTO. Não é um total
// cumulativo de dano recebido durante a luta (curar não "desconta" dano já sofrido de um
// contador) — é o estado atual, que é o que realmente importa pra o quão cansado/combalido o
// personagem está entrando no turno seguinte.
function getFatorVidaPerdida(ficha) {
    if (!ficha || !ficha.vida) return 0;
    const max = getMaximo(ficha, 'vida') || 0;
    if (max <= 0) return 0;
    const atualBruto = parseFloat(ficha.vida.atual);
    const atual = isNaN(atualBruto) ? max : atualBruto;
    return Math.min(1, Math.max(0, 1 - (atual / max)));
}

// 0 (nenhuma Forma ativa aumentando atributos) a 1 (mFormas efetivo somando +100% ou mais em
// qualquer combinação dos eixos vida/mana/aura/chakra/corpo/status) — réplica só da parte
// "MFORMAS" de getGlobalMultipliers em core/poder.js, isolada aqui pra não precisar importar o
// módulo inteiro (evita ciclo de import poder.js <-> fadiga.js, já que poder.js importa esta
// calcularFadigaAtual). Sustentar uma transformação ativa gera desgaste PROPORCIONAL ao quanto
// ela está de fato turbinando o personagem — uma Forma cosmética (mFormas=1) não gera desgaste
// nenhum, satisfazendo o "caso elas gerem desgaste" pedido.
function getFatorFormasAtivas(ficha) {
    if (!ficha) return 0;
    let soma = 0;
    EIXOS_FORMAS.forEach(k => {
        const anchor = k === 'status' ? 'forca' : k;
        const s = ficha[anchor] || {};
        const b = getBuffs(ficha, anchor, true, false, true) || {};
        let v = parseFloat(s.mFormas) || 1.0;
        if (b._hasBuff && b._hasBuff.mformas) v = (v === 1.0 ? 0 : v) + b.mformas;
        if (v > 1) soma += (v - 1);
    });
    return Math.min(1, Math.max(0, soma));
}

// Quantos pontos percentuais de Fadiga automática este personagem ganha se o turno dele virar
// AGORA, considerando o quanto de Energia (mana/aura/chakra/corpo) está gasto, o quanto de Vida
// já foi perdida, e o quanto de mFormas de transformações ativas está em uso — os 3 fatores
// pedidos, cada um pesando igualmente na severidade final.
export function calcularGanhoFadigaDinamico(ficha) {
    try {
        const fatorEnergia = getFatorEnergiaGasta(ficha);
        const fatorDano = getFatorVidaPerdida(ficha);
        const fatorFormas = getFatorFormasAtivas(ficha);
        const severidade = (fatorEnergia + fatorDano + fatorFormas) / 3;
        return Math.max(0, severidade * PESO_MAX_DINAMICO);
    } catch (e) { return 0; }
}

// Fadiga Atual final (0-100%): fadigaBase (contador manual x taxa) + fadigaExtra (pontos
// dinâmicos já acumulados). Réplica exata do bloco antes duplicado em Marcados.jsx e
// core/poder.js > calcularPoderAtual — agora os dois chamam esta função em vez de calcular cada
// um a sua própria cópia (mesmo motivo do getMunicoCrescenteMultiplier: nunca deixar duas fontes
// de verdade pro mesmo número divergirem).
export function calcularFadigaAtual(ficha) {
    const fadigaTaxaBruta = Number(ficha?.combate?.fadigaPorTurno);
    const fadigaTaxa = isNaN(fadigaTaxaBruta) ? 5 : fadigaTaxaBruta;
    const fadigaTurnos = Math.max(0, Number(ficha?.combate?.fadigaTurnos) || 0);
    const fadigaBase = fadigaTurnos * fadigaTaxa;
    const fadigaExtra = Math.max(0, Number(ficha?.combate?.fadigaExtra) || 0);
    return Math.min(100, Math.max(0, fadigaBase + fadigaExtra));
}
