// ==========================================
// 🧬 ADAPTAÇÃO (por diferença de Poder) — lógica PURA. Substitui o antigo "mUnico Crescente" (linear, igual para qualquer oponente).
//
// REGRA
//  1. No INÍCIO DO TURNO do portador, com a Adaptação ligada (ficha.combate.adaptacaoLigada), mede-se a diferença de Poder Calculado
//     entre o OPONENTE e o portador:  d = (PoderOponente − PoderPortador) / PoderPortador × 100  (em %).
//     OPONENTE = o mais forte entre os OUTROS combatentes da ordem de iniciativa da cena (ver core/adaptacaoTurno.js).
//     Se d > 0 (oponente mais forte) o ganho do turno é calculado pela diferença (item 2). Se d <= 0 (portador IGUAL/MAIS FORTE que o oponente
//     mais forte), ele MANTÉM O GANHO DO TURNO ANTERIOR (repete o último g, de novo composto) até o oponente voltar a ultrapassá-lo; aí a
//     conta pela diferença volta. Se nunca houve ganho (o oponente já começou mais fraco), o ganho é 0 até o oponente passar o portador.
//     Dados inválidos: nada é registrado.
//  2. Ganho do turno  g = fração/100 × d  (fração padrão 50, editável 0–100). Ex.: oponente 10% mais forte -> g = 5%.
//  3. Durante o combate o ganho é COMPOSTO sobre o Poder Calculado: fator F = Π(1 + g_i/100).
//     Turno 1 +5% -> ×1,05; turno 2 +25% -> ×1,05 × 1,25. A diferença de cada turno é medida com o Poder ATUAL do portador (já com o F
//     acumulado), então ela encolhe sozinha conforme ele se adapta. O F entra em core/poder.js > calcularPoderAtual (e na réplica de
//     Ficha Def/Marcados.jsx) — por isso vale SÓ durante o combate.
//  4. No FIM do combate/cena (evento fimDeLuta: encerrar combate, trocar de cena ativa, descansar) o ganho vira PERMANENTE:
//     P = (soma dos g_i em %) ÷ (nº de turnos registrados) — a MÉDIA das porcentagens ganhas (os valores brutos são ignorados).
//     Ex. do usuário: (5% + 25%) / 2 = 15%. Esse P% é somado em ficha.ganhosPermanentes.poderCalculado como P/100 (modo 'somar', o mesmo do
//     gatilho ganhoPermanente em percentual, com p limitado a [-99,99; 1e6]). Depois F volta a 1 e os acumuladores zeram, então uma
//     segunda conversão (ex.: descansar + trocar de cena) não ganha nada. Sem turnos registrados ou P <= 0: não ganha nada.
//     O botão "Zerar" do painel só ZERA, sem converter.
//  5. O turno só conta na média se houve um oponente válido (com Poder definido); sem oponente nada é registrado.
//     Dummies (entidades do Mapa) não adaptam.
//
// Campos em ficha.combate: adaptacaoLigada (bool), adaptacaoFracao (padrão 50), adaptacaoFator (padrão 1), adaptacaoSoma (soma dos g em %),
// adaptacaoTurnos (contagem), adaptacaoUltimo ({ gain, diferenca, poderOponente, poderPortador, oponenteNome, repetido }; `gain` também é a base do ganho repetido no turno seguinte).
// Os campos legados municoAuto/municoTurnos/municoPorTurno das fichas antigas são IGNORADOS.
//
// ⚠️ Este módulo NÃO importa core/poder.js (poder.js importa fatorAdaptacao daqui). A medição do Poder fica em core/adaptacaoTurno.js.
// ==========================================

export const ADAPTACAO_FRACAO_PADRAO = 50;
export const ADAPTACAO_FRACAO_MIN = 0;
export const ADAPTACAO_FRACAO_MAX = 100;
export const LIMITE_ADAPTACAO_TURNOS = 9999;
// Mesmos limites do gatilho ganhoPermanente em percentual (core/gatilhos.js; um teste garante que não divergem).
export const LIMITE_ADAPTACAO_GANHO_PERC = 1e6;
export const LIMITE_ADAPTACAO_GANHO_PERC_MIN = -99.99;
export const LIMITE_ADAPTACAO_TOTAL_PERMANENTE = 1e9;
export const FATOR_ADAPTACAO_MAX = 1e12;

// Caminhos do Firebase (formato 'a/b') tocados por registrar / converter / zerar.
export const CAMINHOS_ADAPTACAO = ['combate/adaptacaoFator', 'combate/adaptacaoSoma', 'combate/adaptacaoTurnos', 'combate/adaptacaoUltimo'];
export const CAMINHO_GANHO_PERMANENTE_PODER = 'ganhosPermanentes/poderCalculado';

const numero = (v, padrao = 0) => { const n = Number(v); return Number.isFinite(n) ? n : padrao; };
const arred9 = (v) => Math.round(v * 1e9) / 1e9;

export function limitarFracaoAdaptacao(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return ADAPTACAO_FRACAO_PADRAO;
    return Math.min(ADAPTACAO_FRACAO_MAX, Math.max(ADAPTACAO_FRACAO_MIN, n));
}

// Fração configurada da ficha (0–100; ausente/inválida -> 50).
export function getFracaoAdaptacao(ficha) {
    const bruta = ficha && ficha.combate ? ficha.combate.adaptacaoFracao : undefined;
    if (bruta === undefined || bruta === null || bruta === '') return ADAPTACAO_FRACAO_PADRAO;
    return limitarFracaoAdaptacao(bruta);
}

// Fator de COMBATE F (>= 1, ausente/inválido -> 1). É o que multiplica o Poder Calculado; única cópia da regra.
export function fatorAdaptacao(ficha) {
    const n = Number(ficha && ficha.combate && ficha.combate.adaptacaoFator);
    if (!Number.isFinite(n) || n <= 1) return 1;
    return Math.min(FATOR_ADAPTACAO_MAX, n);
}

export function getTurnosAdaptacao(ficha) {
    return Math.max(0, Math.floor(numero(ficha && ficha.combate && ficha.combate.adaptacaoTurnos)));
}

export function getSomaAdaptacao(ficha) {
    return Math.max(0, numero(ficha && ficha.combate && ficha.combate.adaptacaoSoma));
}

// Média das porcentagens ganhas (P) que ficaria PERMANENTE agora; 0 sem turnos.
export function mediaAdaptacao(ficha) {
    const t = getTurnosAdaptacao(ficha);
    if (t <= 0) return 0;
    const p = getSomaAdaptacao(ficha) / t;
    return Number.isFinite(p) ? p : 0;
}

// Ganho do turno. Devolve { diferenca, ganho } (ambos em %). diferenca <= 0 ou dados inválidos -> ganho 0.
export function calcularGanhoAdaptacao(poderPortador, poderOponente, fracao = ADAPTACAO_FRACAO_PADRAO) {
    const a = Number(poderPortador);
    const o = poderOponente === null || poderOponente === undefined || poderOponente === '' ? NaN : Number(poderOponente);
    if (!Number.isFinite(a) || !Number.isFinite(o) || a <= 0 || o < 0) return { diferenca: 0, ganho: 0 };
    const d = (o - a) / a * 100;
    if (!Number.isFinite(d) || d <= 0) return { diferenca: Number.isFinite(d) ? d : 0, ganho: 0 };
    const g = Math.min(LIMITE_ADAPTACAO_GANHO_PERC, limitarFracaoAdaptacao(fracao) / 100 * d);
    return { diferenca: d, ganho: Number.isFinite(g) ? g : 0 };
}

// Escolhe o oponente: o de MAIOR Poder entre candidatos { nome, poder }. Poder null/NaN/negativo = ignorado (sem Poder definido). Empate: o primeiro.
export function escolherOponente(candidatos) {
    let melhor = null;
    (Array.isArray(candidatos) ? candidatos : []).forEach((c) => {
        if (!c) return;
        const p = c.poder === null || c.poder === undefined || c.poder === '' ? NaN : Number(c.poder);
        if (!Number.isFinite(p) || p < 0) return;
        if (!melhor || p > melhor.poder) melhor = { nome: String(c.nome || ''), poder: p };
    });
    return melhor;
}

const fmtPerc = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const fmtFator = (n) => (Number(n) || 1).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

// Registra o turno no RASCUNHO. `medida` = { poderPortador, poderOponente, nomeOponente }. Devolve { gain, texto } ou null (nada registrado:
// Adaptação desligada, sem oponente válido, Poder do portador desconhecido ou teto de turnos). Nunca lança.
export function registrarTurnoAdaptacao(ficha, medida) {
    const c = ficha && ficha.combate;
    if (!c || c.adaptacaoLigada !== true || !medida) return null;
    const po = medida.poderOponente === null || medida.poderOponente === undefined || medida.poderOponente === '' ? NaN : Number(medida.poderOponente);
    const pp = medida.poderPortador === null || medida.poderPortador === undefined || medida.poderPortador === '' ? NaN : Number(medida.poderPortador);
    if (!Number.isFinite(po) || po < 0 || !Number.isFinite(pp) || pp <= 0) return null;
    const turnos = getTurnosAdaptacao(ficha);
    if (turnos >= LIMITE_ADAPTACAO_TURNOS) return null;
    const { diferenca, ganho } = calcularGanhoAdaptacao(pp, po, getFracaoAdaptacao(ficha));
    // Portador igual/mais forte (diferença <= 0): repete o ganho do turno anterior (0 se nunca houve ganho).
    const repete = !(diferenca > 0);
    const anterior = numero(c.adaptacaoUltimo && c.adaptacaoUltimo.gain);
    const g = arred9(repete ? Math.min(LIMITE_ADAPTACAO_GANHO_PERC, Math.max(0, anterior)) : ganho);
    const fatorAnterior = fatorAdaptacao(ficha);
    const fator = arred9(Math.min(FATOR_ADAPTACAO_MAX, fatorAnterior * (1 + g / 100)));
    c.adaptacaoFator = fator;
    c.adaptacaoSoma = arred9(getSomaAdaptacao(ficha) + g);
    c.adaptacaoTurnos = turnos + 1;
    const nome = String(medida.nomeOponente || '');
    c.adaptacaoUltimo = { gain: g, diferenca: arred9(diferenca), poderOponente: po, poderPortador: pp, oponenteNome: nome, repetido: repete && g > 0 };
    const texto = repete && g > 0
        ? `Adaptação: mantém +${fmtPerc(g)}% neste turno (você supera${nome ? ` ${nome}` : ' o oponente'}; repete o ganho anterior) — Poder ×${fmtFator(fator)}`
        : g > 0
        ? `Adaptação: +${fmtPerc(g)}% neste turno (oponente${nome ? ` ${nome}` : ''} +${fmtPerc(diferenca)}% mais forte) — Poder ×${fmtFator(fator)}`
        : `Adaptação: sem ganho neste turno (você já iguala ou supera${nome ? ` ${nome}` : ' o oponente'}) — Poder ×${fmtFator(fator)}`;
    return { gain: g, texto };
}

// Zera F e os acumuladores (NÃO converte). Devolve true se havia algo a zerar.
export function zerarAdaptacao(ficha) {
    const c = ficha && ficha.combate;
    if (!c) return false;
    const tinha = c.adaptacaoFator !== undefined || c.adaptacaoSoma !== undefined || c.adaptacaoTurnos !== undefined || c.adaptacaoUltimo !== undefined;
    if (!tinha) return false;
    const jaZerado = (c.adaptacaoFator === 1 || c.adaptacaoFator === undefined) && !c.adaptacaoSoma && !c.adaptacaoTurnos && c.adaptacaoUltimo === undefined;
    c.adaptacaoFator = 1;
    c.adaptacaoSoma = 0;
    c.adaptacaoTurnos = 0;
    delete c.adaptacaoUltimo;
    return !jaZerado;
}

// Fim do combate/cena: converte a MÉDIA das porcentagens em ganho permanente (soma P/100 em ficha.ganhosPermanentes.poderCalculado) e zera.
// Devolve { percentual, total } se ganhou algo, senão null (os acumuladores zeram do mesmo jeito). Idempotente: a segunda chamada devolve null.
export function converterAdaptacaoEmPermanente(ficha) {
    const c = ficha && ficha.combate;
    if (!c) return null;
    const turnos = getTurnosAdaptacao(ficha);
    const media = mediaAdaptacao(ficha);
    zerarAdaptacao(ficha);
    if (turnos <= 0 || !(media > 0)) return null;
    const p = Math.max(LIMITE_ADAPTACAO_GANHO_PERC_MIN, Math.min(LIMITE_ADAPTACAO_GANHO_PERC, media));
    if (!(p > 0)) return null;
    if (!ficha.ganhosPermanentes || typeof ficha.ganhosPermanentes !== 'object') ficha.ganhosPermanentes = {};
    const atual = Number(ficha.ganhosPermanentes.poderCalculado);
    const base = Number.isFinite(atual) && atual > 0 ? atual : 0;
    const total = arred9(Math.max(0, Math.min(LIMITE_ADAPTACAO_TOTAL_PERMANENTE, base + p / 100)));
    ficha.ganhosPermanentes.poderCalculado = total;
    return { percentual: p, total };
}

export function textoConversaoAdaptacao(r) {
    if (!r) return '';
    return `Adaptação: +${fmtPerc(r.percentual)}% de Poder permanente (média dos turnos); total ${fmtPerc(r.total * 100)}%`;
}
