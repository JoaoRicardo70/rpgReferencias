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

// Peso PADRÃO (em pontos percentuais de Fadiga) que a soma dos 3 fatores pode render num único
// turno, no pior caso (100% de energia gasta + 100% da vida perdida + mFormas todo saturado ao
// mesmo tempo), usado quando NENHUMA Forma está ativa. Decisão de balanceamento, não extraído de
// nenhuma fórmula pré-existente. Com uma Forma ativa, este peso é substituído pelo campo editável
// fadigaPorUso dela — ver getPesoFadigaFormasAtivas mais abaixo.
const PESO_MAX_DINAMICO_PADRAO = 15;

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
//
// 🥋 MAESTRIA NAS FORMAS: o resultado bruto acima é descontado pela Maestria média das Formas
// (categoria === 'forma' em ficha.poderes[]) atualmente ATIVAS. Maestria = 100% numa Forma ativa
// zera a contribuição dela pra este fator. O gatilho "Supressão até a Maestria = zero Fadiga" NÃO
// vive mais aqui — ele agora é geral (afeta a Fadiga inteira, não só este fator) e fica em
// getLimiarSemFadiga/getFatorPoderUsado mais abaixo.
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
    const bruto = Math.min(1, Math.max(0, soma));
    const maestriaMedia = getMaestriaMediaFormasAtivas(ficha); // 0-100
    return bruto * (1 - maestriaMedia / 100);
}

// Formas (categoria === 'forma' em ficha.poderes[], a mesma aba "🎭 Formas" do Grimório de
// Poderes) atualmente ATIVAS — NÃO as sub-transformações aninhadas de FormasEditor.jsx
// (formaAtivaId/.formas[] usado por armas do Arsenal e Seres Selados). Compartilhada por
// getMaestriaMediaFormasAtivas e getPesoFadigaFormasAtivas.
function getFormasAtivasComMaestria(ficha) {
    if (!ficha || !ficha.poderes) return [];
    return ficha.poderes.filter(p => p && p.ativa && (p.categoria || '').toLowerCase() === 'forma');
}

// Maestria (0-100%) das Formas ATIVAS no momento — editada junto com o resto da própria Forma
// (nome, descrição, efeitos) no formulário principal de Poderes, não num painel separado. Média
// simples entre todas as Formas ativas ao mesmo tempo (o caso comum é UMA só). Sem nenhuma Forma
// ativa, ou nenhuma delas com maestria definida, retorna 0.
function getMaestriaMediaFormasAtivas(ficha) {
    const formas = getFormasAtivasComMaestria(ficha);
    if (formas.length === 0) return 0;
    const maestrias = formas.map(p => {
        const m = parseFloat(p.maestria);
        return isNaN(m) ? 0 : Math.min(100, Math.max(0, m));
    });
    return maestrias.reduce((a, b) => a + b, 0) / maestrias.length;
}

// 🥋 Peso de Fadiga por uso ACIMA da Maestria — campo editável POR Forma (fadigaPorUso, em pontos
// percentuais de Fadiga, mesma unidade/escala de PESO_MAX_DINAMICO_PADRAO). Com uma ou mais Formas
// ativas, o peso padrão de 15 é substituído pela média do fadigaPorUso das Formas ativas (Formas
// sem o campo definido usam o próprio padrão de 15 como fallback) — cada Forma pode ser configurada
// pra ser mais ou menos cansativa de sustentar além do ponto que o personagem já domina.
function getPesoFadigaFormasAtivas(ficha) {
    const formas = getFormasAtivasComMaestria(ficha);
    if (formas.length === 0) return PESO_MAX_DINAMICO_PADRAO;
    const pesos = formas.map(p => {
        const w = parseFloat(p.fadigaPorUso);
        return isNaN(w) ? PESO_MAX_DINAMICO_PADRAO : Math.max(0, w);
    });
    return pesos.reduce((a, b) => a + b, 0) / pesos.length;
}

// Supressão de Poder (0-100), já clampada no mínimo permitido (limiteSupressao) — réplica do
// mesmo clamp que calcularPoderAtual (core/poder.js) já aplica, pra todo mundo aqui usar
// exatamente a mesma leitura de "quanto do Poder o personagem está usando" que o próprio Scouter
// usa pra escalar o Poder Atual. Compartilhada entre getFatorFormasAtivas (regra da Maestria) e
// getFatorPoderUsado (limiar dos 80%) abaixo.
function getSupressaoClampeada(ficha) {
    let sup = parseFloat(ficha?.supressaoPoder);
    if (isNaN(sup)) sup = 100;
    let lim = parseFloat(ficha?.limiteSupressao);
    if (isNaN(lim)) lim = 1;
    if (sup < lim) sup = lim;
    return Math.min(100, Math.max(0, sup));
}

// LIMIAR_SEM_FADIGA_PADRAO: sem nenhuma Forma ativa, usando até este tanto do Poder (inclusive), o
// personagem não acumula NENHUMA Fadiga dinâmica — só acima disso a Fadiga começa a aparecer,
// crescendo linearmente até o valor cheio em 100% de Poder liberado.
const LIMIAR_SEM_FADIGA_PADRAO = 80;

// Limiar de Fadiga EFETIVO. Sem nenhuma Forma ativa, é o padrão fixo de 80%. Com uma ou mais
// Formas ativas, o limiar passa a ser a própria Maestria média delas — dominar bem uma Forma
// (Maestria alta) dá MAIS margem de Poder livre de Fadiga do que os 80% padrão; uma Forma pouco
// dominada (Maestria baixa) RESTRINGE essa margem pra bem menos que isso. Ex.: ativar uma Forma
// com 60% de Maestria passa a exigir Supressão em 60% ou mais (ou seja, usar até 60% do Poder) pra
// não acumular Fadiga nenhuma — acima disso, volta a crescer.
function getLimiarSemFadiga(ficha) {
    const formas = getFormasAtivasComMaestria(ficha);
    if (formas.length === 0) return LIMIAR_SEM_FADIGA_PADRAO;
    return getMaestriaMediaFormasAtivas(ficha);
}

// 0 (usando o limiar efetivo do Poder ou menos — sem Fadiga nenhuma) a 1 (supressaoPoder = 100,
// Poder liberado por completo — Fadiga no valor cheio). Entre o limiar e 100%, escala linear. Uma
// Forma com Maestria 100% ativa (limiar = 100) nunca gera Fadiga por Poder, não importa a
// Supressão — Forma perfeitamente dominada.
function getFatorPoderUsado(ficha) {
    const sup = getSupressaoClampeada(ficha);
    const limiar = getLimiarSemFadiga(ficha);
    const faixa = 100 - limiar;
    if (faixa <= 0) return 0;
    if (sup <= limiar) return 0;
    return Math.min(1, Math.max(0, (sup - limiar) / faixa));
}

// Quantos pontos percentuais de Fadiga automática este personagem ganha se o turno dele virar
// AGORA, considerando o quanto de Energia (mana/aura/chakra/corpo) está gasto, o quanto de Vida já
// foi perdida, e o quanto de mFormas de transformações ativas está em uso (já descontado pela
// Maestria) — os 3 fatores pedidos, cada um pesando igualmente na severidade final. Essa
// severidade é então escalada por getFatorPoderUsado: um personagem se restringindo (Poder
// suprimido) gera bem menos Fadiga do que um lutando de igual pra igual com o Poder liberado por
// completo, que gera o valor cheio calculado acima.
export function calcularGanhoFadigaDinamico(ficha) {
    try {
        const fatorEnergia = getFatorEnergiaGasta(ficha);
        const fatorDano = getFatorVidaPerdida(ficha);
        const fatorFormas = getFatorFormasAtivas(ficha);
        const severidade = (fatorEnergia + fatorDano + fatorFormas) / 3;
        const fatorPoder = getFatorPoderUsado(ficha);
        const pesoMax = getPesoFadigaFormasAtivas(ficha);
        return Math.max(0, severidade * pesoMax * fatorPoder);
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
