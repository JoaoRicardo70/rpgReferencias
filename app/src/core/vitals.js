// ==========================================
// REGENERAÇÃO AUTOMÁTICA POR TURNO — réplica pura de aplicarRegeneracaoTurno em
// components/status/StatusFormContext.jsx, para reuso fora da Ficha (ex.: quando o
// turno de alguém volta no Mapa, ver MapaFormContext.jsx).
// ==========================================
import { getMaximo, getRawBase } from './attributes.js';
import { getPrestigioReal } from './prestige.js';

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
const VITAIS_REGENERAVEIS = ['vida', 'mana', 'aura', 'chakra', 'corpo', 'pv', 'pm'];

function getBasePFor(ficha, k) {
    if (k === 'status') {
        let m = 0;
        STATUS_FISICOS.forEach(s => { m += (getRawBase(ficha, s) || 0); });
        return Math.floor((m / 8) / 1000);
    }
    return getPrestigioReal(k, getRawBase(ficha, k) || 0) || 0;
}

function getVitalMax(key, ficha) {
    if (key === 'pv') {
        const bC = getBasePFor(ficha, 'corpo');
        const bV = getBasePFor(ficha, 'vida');
        const bCh = getBasePFor(ficha, 'chakra');
        const m = parseFloat(ficha.multiplicadorVida) || 1;
        return Math.floor(((bC + bV + bCh) / 3) * m);
    }
    if (key === 'pm') {
        const bM = getBasePFor(ficha, 'mana');
        const bS = getBasePFor(ficha, 'status');
        const bA = getBasePFor(ficha, 'aura');
        const m = parseFloat(ficha.multiplicadorMorte) || 1;
        return Math.floor(((bM + bS + bA) / 3) * m);
    }
    const v = getMaximo(ficha, key);
    return (v !== undefined && v !== null && !Number.isNaN(v)) ? v : 1;
}

function calcVitalScale(rawMx, key) {
    if (!rawMx || rawMx <= 0) return { p: 0, mxDisplay: 0 };
    const limit = (key === 'vida' || key === 'pv' || key === 'pm') ? 8 : 9;
    const strMx = Math.floor(rawMx).toString();
    const p = Math.max(0, strMx.length - limit);
    const mxDisplay = p > 0 ? Math.floor(rawMx / Math.pow(10, p)) : Math.floor(rawMx);
    return { p, mxDisplay };
}

// Aplica ficha[key].regeneracao a cada vital (vida/mana/aura/chakra/corpo/pv/pm), até o
// máximo, mutando o rascunho Immer recebido — mesma regra que o botão "Regenerar" da
// página de Status, só que chamado automaticamente pelo próprio turno de cada jogador no Mapa.
export function aplicarRegeneracaoDeTurno(ficha) {
    if (!ficha) return;
    VITAIS_REGENERAVEIS.forEach((key) => {
        // Cada vital é isolado no seu próprio try/catch — um erro calculando o máximo de UM
        // vital (ex.: dado malformado de uma ficha antiga) não pode abortar a regeneração dos
        // outros vitais nem quebrar o avanço de turno no Mapa.
        try {
            if (!ficha[key]) return;
            const rawMx = getVitalMax(key, ficha);
            const { mxDisplay } = calcVitalScale(rawMx, key);
            const regen = parseFloat(ficha[key].regeneracao) || 0;
            if (regen > 0 && (ficha[key].atual || 0) < mxDisplay) {
                ficha[key].atual = Math.min(mxDisplay, (ficha[key].atual || 0) + regen);
            }
        } catch (e) { /* pula só este vital */ }
    });
}
