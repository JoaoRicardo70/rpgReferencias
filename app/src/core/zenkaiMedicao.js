// ==========================================
// 💥 ZENKAI — medições que dependem da ficha/vitais (core/zenkai.js continua PURO). Converte os gastos de Energia do jogo na fração da
// soma dos tetos de energia que a telemetria do Zenkai guarda, e mede Fadiga/Forma no início do turno.
// ==========================================
import { getTetoExibidoComFator } from './vitals.js';
import { calcularFadigaAtual } from './fadiga.js';
import { ENERGIAS_ZENKAI, registrarGastoEnergiaZenkai, registrarTurnoZenkai, zenkaiLigado, zenkaiAposRegistrar } from './zenkai.js';

const numero = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// Teto exibido de cada energia (a mesma escala de `atual`) e a soma. Energia inexistente ou sem teto = 0.
export function tetosDeEnergia(ficha) {
    const tetos = {};
    let total = 0;
    ENERGIAS_ZENKAI.forEach((k) => {
        let t = 0;
        try { if (ficha && ficha[k]) t = Math.max(0, numero(getTetoExibidoComFator(k, ficha))); } catch (e) { t = 0; }
        tetos[k] = t; total += t;
    });
    return { tetos, total };
}

// Fração da soma dos tetos de energia equivalente a um gasto. `drenos` = [{ key, valor }] (energia realmente descontada, escala exibida, como
// core/engine.js > drenos e core/custoPorTurno.js); `custosPoder` = [{ energia, bruto, perc, semDesgaste }] (core/engine.js > custosPoder): só os
// `semDesgaste` entram (golpe conjurado "como Poder" / Ressonância Natural: a energia NÃO foi descontada, então não há dreno para contar);
// cada um vale perc% do teto da PRÓPRIA energia. Os demais custosPoder já têm o dreno correspondente e não são contados de novo.
export function fracaoDeGastoDeEnergia(ficha, { drenos = [], custosPoder = [] } = {}) {
    const { tetos, total } = tetosDeEnergia(ficha);
    if (!(total > 0)) return 0;
    let soma = 0;
    (Array.isArray(drenos) ? drenos : []).forEach((d) => {
        if (!d || !ENERGIAS_ZENKAI.includes(d.key)) return;
        const v = numero(d.valor);
        if (v > 0) soma += v / total;
    });
    (Array.isArray(custosPoder) ? custosPoder : []).forEach((c) => {
        if (!c || c.semDesgaste !== true || !ENERGIAS_ZENKAI.includes(c.energia)) return;
        const perc = numero(c.perc);
        if (perc > 0) soma += (perc / 100) * (tetos[c.energia] / total);
    });
    return Number.isFinite(soma) ? soma : 0;
}

// Registra no RASCUNHO o gasto de Energia de um golpe/defesa/custo por turno. Sem Zenkai ligado/telemetria aberta não faz nada (barato).
// Devolve true se registrou.
export function registrarGastoDeEnergia(ficha, gasto) {
    try {
        if (!zenkaiLigado(ficha)) return false;
        const f = fracaoDeGastoDeEnergia(ficha, gasto);
        return f > 0 ? registrarGastoEnergiaZenkai(ficha, f) : false;
    } catch (e) { console.error('Zenkai: gasto de energia falhou', e); return false; }
}

export const temFormaAtiva = (ficha) => (Array.isArray(ficha && ficha.poderes) ? ficha.poderes : []).some(p => p && p.ativa && String(p.categoria || '').toLowerCase() === 'forma');

// Registra o turno do portador (Fadiga, Forma, razão do oponente, Vida mínima). razao: Poder do oponente ÷ Poder do portador, ou null. Nunca lança.
export function medirTurnoZenkai(ficha, { razao = null, vidaMaxBruta = 0 } = {}) {
    try {
        return registrarTurnoZenkai(ficha, { fadigaPct: calcularFadigaAtual(ficha), formaAtiva: temFormaAtiva(ficha), razao, vidaMaxBruta });
    } catch (e) { console.error('Zenkai: turno falhou', e); return false; }
}

// Telemetria nova de OUTRO jogador depois de um gasto de Energia (para salvarCamposPersonagem 'combate/zenkai'), ou null.
export const zenkaiAposGasto = (ficha, gasto) => zenkaiAposRegistrar(ficha, (c) => registrarGastoDeEnergia(c, gasto));
