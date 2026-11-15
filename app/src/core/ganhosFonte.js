// ==========================================
// 🏆 GANHOS PERMANENTES POR FONTE — lógica PURA. `ficha.ganhosPermanentes.poderCalculado` continua sendo o TOTAL aditivo que core/poder.js usa
// (nada aqui muda o cálculo de Poder). Este módulo só guarda o RASTRO de onde veio cada parte:
//   ficha.ganhosPermanentes.porFonte  = { adaptacao, zenkai, gatilhos }  soma ADITIVA em fração (mesma unidade de poderCalculado), cada uma >= 0
//   ficha.ganhosPermanentes.historico = últimos HISTORICO_MAX registros { ts, fonte, pct (em %), decisao, cena?, rodada?, nota? }
// Fichas antigas sem porFonte continuam válidas: a diferença poderCalculado − Σ porFonte aparece como "Outros/anteriores".
// O fatorPoder (multiplicativo) NÃO é rastreado por fonte: é tudo de gatilhos (Adaptação e Zenkai só somam).
// ==========================================
export const FONTES_GANHO = Object.freeze(['adaptacao', 'zenkai', 'gatilhos']);
export const ROTULO_FONTE = Object.freeze({ adaptacao: 'Adaptação', zenkai: 'Zenkai', gatilhos: 'Gatilhos', manual: 'Manual', outros: 'Outros/anteriores' });
export const HISTORICO_MAX = 50;
export const LIMITE_GANHO_TOTAL = 1e9;
export const DECISOES_HISTORICO = Object.freeze(['liberado', 'recusado', 'removido']);
// Caminhos do Firebase (formato 'a/b') que o rastro toca (porFonte granular por fonte; histórico inteiro).
export const CAMINHOS_PORFONTE = Object.freeze(FONTES_GANHO.map(f => `ganhosPermanentes/porFonte/${f}`));
export const CAMINHO_HISTORICO = 'ganhosPermanentes/historico';
export const CAMINHOS_RASTRO = Object.freeze([...CAMINHOS_PORFONTE, CAMINHO_HISTORICO]);

const numero = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const arred9 = (v) => Math.round(v * 1e9) / 1e9;

function garantirGanhos(ficha) {
    if (!ficha.ganhosPermanentes || typeof ficha.ganhosPermanentes !== 'object') ficha.ganhosPermanentes = {};
    return ficha.ganhosPermanentes;
}

// Valor de uma fonte (>= 0; ausente/inválido = 0).
export function lerPorFonte(ficha, fonte) {
    const pf = ficha && ficha.ganhosPermanentes && ficha.ganhosPermanentes.porFonte;
    return Math.min(LIMITE_GANHO_TOTAL, Math.max(0, numero(pf && pf[fonte])));
}

// Soma `delta` (fração, pode ser negativo) à fonte, nunca abaixo de 0 nem acima do limite. Devolve o novo valor. Fonte desconhecida = nada.
export function somarPorFonte(ficha, fonte, delta) {
    if (!ficha || !FONTES_GANHO.includes(fonte)) return 0;
    const d = numero(delta);
    const g = garantirGanhos(ficha);
    if (!g.porFonte || typeof g.porFonte !== 'object') g.porFonte = {};
    const novo = arred9(Math.min(LIMITE_GANHO_TOTAL, Math.max(0, lerPorFonte(ficha, fonte) + d)));
    g.porFonte[fonte] = novo;
    return novo;
}

// Lista saneada do histórico (só registros válidos, no máximo HISTORICO_MAX, do mais antigo ao mais novo).
export function lerHistorico(ficha) {
    const h = ficha && ficha.ganhosPermanentes && ficha.ganhosPermanentes.historico;
    return (Array.isArray(h) ? h : [])
        .filter(r => r && typeof r === 'object' && Number.isFinite(Number(r.pct)) && [...FONTES_GANHO, 'manual'].includes(r.fonte) && DECISOES_HISTORICO.includes(r.decisao))
        .slice(-HISTORICO_MAX);
}

// Acrescenta um registro { fonte, pct (em %), decisao, cena?, rodada?, nota?, ts? } e corta em HISTORICO_MAX. Devolve o registro ou null.
export function registrarHistorico(ficha, reg) {
    if (!ficha || !reg) return null;
    const fonte = [...FONTES_GANHO, 'manual'].includes(reg.fonte) ? reg.fonte : null;
    const pct = Number(reg.pct);
    if (!fonte || !Number.isFinite(pct) || !DECISOES_HISTORICO.includes(reg.decisao)) return null;
    const r = { ts: Number.isFinite(Number(reg.ts)) ? Number(reg.ts) : Date.now(), fonte, pct: arred9(pct), decisao: reg.decisao };
    if (reg.cena !== undefined && reg.cena !== null && reg.cena !== '') r.cena = String(reg.cena).slice(0, 60);
    if (Number.isFinite(Number(reg.rodada)) && Number(reg.rodada) > 0) r.rodada = Math.floor(Number(reg.rodada));
    if (reg.nota) r.nota = String(reg.nota).slice(0, 120);
    const g = garantirGanhos(ficha);
    g.historico = [...lerHistorico(ficha), r].slice(-HISTORICO_MAX);
    return r;
}

// Detalhamento para a UI: { total, fontes: { adaptacao, zenkai, gatilhos }, outros, fator }. `outros` = o que sobra de poderCalculado sem fonte (fichas antigas,
// ajuste manual); nunca negativo (se Σ porFonte passar do total, por correção manual do total, `outros` = 0).
export function detalharGanhos(ficha) {
    const g = (ficha && ficha.ganhosPermanentes) || {};
    const total = Math.max(0, numero(g.poderCalculado));
    const fontes = Object.fromEntries(FONTES_GANHO.map(f => [f, lerPorFonte(ficha, f)]));
    const soma = FONTES_GANHO.reduce((s, f) => s + fontes[f], 0);
    const fator = Number(g.fatorPoder);
    return { total, fontes, excede: soma > total + 1e-9, outros: arred9(Math.max(0, total - soma)), fator: Number.isFinite(fator) && fator > 0 ? fator : 1 };
}

// Correção do Mestre: tira o ganho rastreado de UMA fonte do total (nunca abaixo de 0), zera a fonte e registra 'removido' no histórico.
// Devolve { removido (fração), caminhos } ou null se a fonte não tinha nada.
export function removerGanhoDeFonte(ficha, fonte, { cena, ts } = {}) {
    if (!ficha || !FONTES_GANHO.includes(fonte)) return null;
    const v = lerPorFonte(ficha, fonte);
    if (!(v > 0)) return null;
    const g = garantirGanhos(ficha);
    g.poderCalculado = arred9(Math.max(0, numero(g.poderCalculado) - v));
    g.porFonte[fonte] = 0;
    registrarHistorico(ficha, { fonte, pct: v * 100, decisao: 'removido', cena, ts });
    return { removido: v, caminhos: ['ganhosPermanentes/poderCalculado', `ganhosPermanentes/porFonte/${fonte}`, CAMINHO_HISTORICO] };
}
