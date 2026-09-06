import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { getMaximo, getMaximoSemFormas, getRawBase, getBuffs } from '../../core/attributes.js';
import { getPrestigioReal, getRank } from '../../core/prestige.js';
import { calcularReducaoFadigaPorRegeneracao } from '../../core/fadiga.js';
import { getNumBarrasVida } from '../../core/vitals.js';
import { salvarFichaSilencioso } from '../../services/firebase-sync.js';

const safeFn = (fn, fallback) => (...args) => {
    if (typeof fn !== 'function') return fallback;
    try { const res = fn(...args); return (res !== undefined && res !== null && !Number.isNaN(res)) ? res : fallback; } catch (e) { return fallback; }
};

const safeGetMaximo = safeFn(getMaximo, 1);
const safeGetMaximoSemFormas = safeFn(getMaximoSemFormas, 1);
const safeGetRawBase = safeFn(getRawBase, 0);
const safeGetPrestigioReal = safeFn(getPrestigioReal, 0);
const safeGetRank = safeFn(getRank, { l: 'F', c: '#ffffff', a: 1 });

export const STATS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
export const ATRIBUTOS_PRINCIPAIS = [
    { key: 'forca', label: 'Força' },
    { key: 'destreza', label: 'Destreza' },
    { key: 'inteligencia', label: 'Inteligência' },
    { key: 'sabedoria', label: 'Sabedoria' },
    { key: 'energiaEsp', label: 'Energia Espiritual' },
    { key: 'carisma', label: 'Carisma' },
];

export const VITALS_RADAR = ['vida', 'mana', 'aura', 'chakra', 'corpo', 'status'];
export const VITALS_LABELS = ['VIDA', 'MANA', 'AURA', 'CHAKRA', 'CORPO', 'STATUS'];

export const CX = 100, CY = 100, R = 75;
export const ANGLES = VITALS_RADAR.map((_, i) => (Math.PI * 2 * i) / 6 - Math.PI / 2);

export function hexPoints(cx, cy, r) { return ANGLES.map((a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`).join(' '); }
export function radarPoint(cx, cy, r, idx, frac) {
    const a = ANGLES[idx]; const safeFrac = Number.isNaN(frac) ? 0 : frac;
    return [cx + r * safeFrac * Math.cos(a), cy + r * safeFrac * Math.sin(a)];
}

export function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(255,255,255,${alpha})`;
    let c = hex.substring(1).split('');
    if (c.length === 3) { c = [c[0], c[0], c[1], c[1], c[2], c[2]]; }
    c = '0x' + c.join('');
    return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + alpha + ')';
}

export function getEfetivoMFormas(ficha, k) {
    const anchor = k === 'status' ? 'forca' : k;
    let s = ficha[anchor] || {};
    let b = getBuffs(ficha, anchor, true);
    let v = parseFloat(s.mFormas) || 1.0;
    if (!b._hasBuff || !b._hasBuff.mformas) return v;
    return (v === 1.0 ? 0 : v) + b.mformas;
}

export function calcularPrestAtual(ficha, attrKey, baseP) {
    const mFormas = getEfetivoMFormas(ficha, attrKey);
    const multForma = mFormas >= 10 ? (mFormas / 10) : 1;
    return Math.floor(baseP * multForma);
}

export const getBasePFor = (ficha, k) => {
    if (k === 'status') {
        let m = 0;
        STATS.forEach(s => m += safeGetRawBase(ficha, s));
        return Math.floor((m / 8) / 1000);
    }
    return safeGetPrestigioReal(k, safeGetRawBase(ficha, k));
};

// rawMxParaEscala decide SÓ a escala de notação (p) — os chamadores que precisam ignorar Formas
// na decisão de escala (pra uma Forma temporária nunca "pular" de notação e parecer que a energia
// caiu) passam o máximo ESTÁVEL (safeGetMaximoSemFormas/getVitalMaxEstavel) aqui, mantendo rawMx
// (completo, com Formas) como numerador de mxDisplay — ver core/vitals.js > calcVitalScale, mesma
// lógica replicada aqui pra esta tela específica.
export function calcVitalScale(rawMx, key, rawMxParaEscala = rawMx) {
    if (!rawMx || rawMx <= 0) return { p: 0, mxDisplay: 0 };
    const limit = (key === 'vida' || key === 'pv' || key === 'pm') ? 8 : 9;
    const baseEscala = (rawMxParaEscala && rawMxParaEscala > 0) ? rawMxParaEscala : rawMx;
    const strMx = Math.floor(baseEscala).toString();
    const p = Math.max(0, strMx.length - limit);
    const mxDisplay = p > 0 ? Math.floor(rawMx / Math.pow(10, p)) : Math.floor(rawMx);
    return { p, mxDisplay };
}

export { safeGetMaximo, safeGetRawBase, safeGetPrestigioReal, safeGetRank };

const COLOR_CONFIGS = [
    { key: 'vida', label: 'Vida (HP)', default: '#ff4d4d' },
    { key: 'mana', label: 'Mana', default: '#00ffff' },
    { key: 'aura', label: 'Aura', default: '#ffcc00' },
    { key: 'chakra', label: 'Chakra', default: '#e6ffff' },
    { key: 'corpo', label: 'Corpo', default: '#ff66ff' },
    { key: 'pv', label: 'P. Vitais', default: '#00ff88' },
    { key: 'pm', label: 'P. Mortais', default: '#cc00ff' },
    { key: 'radarBase', label: 'Radar (Base)', default: '#00ffff' },
    { key: 'radarAtual', label: 'Radar (Atual)', default: '#ffcc00' },
];

export { COLOR_CONFIGS };

const StatusFormContext = createContext(null);

export function useStatusForm() {
    const ctx = useContext(StatusFormContext);
    if (!ctx) return null;
    return ctx;
}

export function StatusFormProvider({ children }) {
    const ficha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);

    const [targetBar, setTargetBar] = useState('vida');
    const [inputDano, setInputDano] = useState('');
    const [inputLetalidade, setInputLetalidade] = useState('0');
    const [showCores, setShowCores] = useState(false);
    const [salvandoCores, setSalvandoCores] = useState(false);
    const [tempCores, setTempCores] = useState(ficha?.cores || {});
    const inicializado = useRef(false);

    useEffect(() => {
        if (!showCores && ficha?.cores) {
            setTempCores(ficha.cores);
        }
    }, [ficha?.cores, showCores]);

    const vitalsBars = useMemo(() => [
        { key: 'vida', label: 'VIDA (HP)', color: tempCores?.vida || '#ff4d4d', borderC: tempCores?.vida || '#ff0000' },
        { key: 'mana', label: 'MANA', color: tempCores?.mana || '#00ffff' },
        { key: 'aura', label: 'AURA', color: tempCores?.aura || '#ffcc00' },
        { key: 'chakra', label: 'CHAKRA', color: tempCores?.chakra || '#e6ffff' },
        { key: 'corpo', label: 'CORPO', color: tempCores?.corpo || '#ff66ff' },
    ], [tempCores]);

    const vitaisEspeciais = useMemo(() => [
        { key: 'pv', label: 'PONTOS VITAIS (PV)', color: tempCores?.pv || '#00ff88', borderC: tempCores?.pv || '#00ff88' },
        { key: 'pm', label: 'PONTOS MORTAIS (PM)', color: tempCores?.pm || '#cc00ff', borderC: tempCores?.pm || '#cc00ff' },
    ], [tempCores]);

    const allVitals = useMemo(() => [...vitalsBars, ...vitaisEspeciais], [vitalsBars, vitaisEspeciais]);

    const handleColorChange = useCallback((key, color) => {
        setTempCores(prev => ({ ...prev, [key]: color }));
    }, []);

    const salvarCores = useCallback(() => {
        updateFicha(f => { f.cores = { ...tempCores }; });
        salvarFichaSilencioso();
        setSalvandoCores(true);
        setTimeout(() => setSalvandoCores(false), 2000);
    }, [updateFicha, tempCores]);

    const resetarCores = useCallback(() => {
        if (window.confirm('Tem certeza que deseja resetar todas as cores para o padrão do sistema?')) {
            setTempCores({});
            updateFicha(f => { f.cores = {}; });
            salvarFichaSilencioso();
        }
    }, [updateFicha]);

    const getVitalMax = useCallback((key, f) => {
        if (key === 'pv') {
            const bC = getBasePFor(f, 'corpo');
            const bV = getBasePFor(f, 'vida');
            const bCh = getBasePFor(f, 'chakra');
            const m = parseFloat(f.multiplicadorVida) || 1;
            return Math.floor(((bC + bV + bCh) / 3) * m);
        }
        if (key === 'pm') {
            const bM = getBasePFor(f, 'mana');
            const bS = getBasePFor(f, 'status');
            const bA = getBasePFor(f, 'aura');
            const m = parseFloat(f.multiplicadorMorte) || 1;
            return Math.floor(((bM + bS + bA) / 3) * m);
        }
        return safeGetMaximo(f, key);
    }, []);

    // Réplica de getVitalMax, só que com o multiplicador de Formas travado fora — decide SÓ a
    // escala de notação (calcVitalScale), nunca o numerador exibido. pv/pm nunca passam por
    // getMaximo/Formas, então ficam idênticos ao getVitalMax original.
    const getVitalMaxEstavel = useCallback((key, f) => {
        if (key === 'pv' || key === 'pm') return getVitalMax(key, f);
        return safeGetMaximoSemFormas(f, key);
    }, [getVitalMax]);

    useEffect(() => {
        if (!ficha || inicializado.current) return;
        updateFicha((f) => {
            allVitals.forEach(({ key }) => {
                const rawMx = getVitalMax(key, f);
                const { p, mxDisplay } = calcVitalScale(rawMx, key, getVitalMaxEstavel(key, f));
                if (!f[key]) f[key] = {};
                if (f[key].atual === undefined || f[key].atual === null) {
                    // 🩸 Vida ganha 1 barra cheia extra por ponto de Vitalidade — um personagem
                    // novo já começa com TODAS as barras cheias.
                    f[key].atual = key === 'vida' ? mxDisplay * getNumBarrasVida(p) : mxDisplay;
                }
            });
        });
        inicializado.current = true;
    }, [ficha, updateFicha, allVitals, getVitalMax, getVitalMaxEstavel]);

    const alterarVital = useCallback((tipo) => {
        const valor = parseInt(inputDano) || 0;
        if (valor <= 0) return;
        const letalidade = parseInt(inputLetalidade) || 0;

        updateFicha((f) => {
            const rawMx = getVitalMax(targetBar, f);
            const { p, mxDisplay } = calcVitalScale(rawMx, targetBar, getVitalMaxEstavel(targetBar, f));
            // 🩸 Vida cura até a SOMA de todas as barras (getNumBarrasVida), não só uma.
            const teto = targetBar === 'vida' ? mxDisplay * getNumBarrasVida(p) : mxDisplay;

            let danoFinal = valor;
            if (tipo === 'dano' && letalidade > 0) {
                danoFinal = valor * Math.pow(10, letalidade);
            }

            if (!f[targetBar]) f[targetBar] = {};
            if (tipo === 'dano') {
                f[targetBar].atual = Math.max(0, (f[targetBar].atual || 0) - danoFinal);
            } else {
                f[targetBar].atual = Math.min(teto, (f[targetBar].atual || 0) + danoFinal);
            }
        });
        salvarFichaSilencioso();
        setInputDano('');
    }, [inputDano, inputLetalidade, updateFicha, targetBar, getVitalMax, getVitalMaxEstavel]);

    const curarTudo = useCallback(() => {
        updateFicha((f) => {
            allVitals.forEach(({ key }) => {
                const rawMx = getVitalMax(key, f);
                const { p, mxDisplay } = calcVitalScale(rawMx, key, getVitalMaxEstavel(key, f));
                // 🩸 Vida cura até a SOMA de todas as barras (getNumBarrasVida), não só uma.
                if (f[key]) f[key].atual = key === 'vida' ? mxDisplay * getNumBarrasVida(p) : mxDisplay;
            });
        });
        salvarFichaSilencioso();
    }, [updateFicha, allVitals, getVitalMax, getVitalMaxEstavel]);

    // Regeneração + o bônus de Poderes/Passivas/Itens ativos (getBuffs(...).regeneracao), mesma
    // regra que aplicarRegeneracaoDeTurno em core/vitals.js (chamada automaticamente no Mapa) —
    // e o mesmo desconto de Fadiga acumulada proporcional ao quanto foi curado neste clique.
    const aplicarRegeneracaoTurno = useCallback(() => {
        updateFicha((f) => {
            const fracoesCuradas = [];
            allVitals.forEach(({ key }) => {
                const rawMx = getVitalMax(key, f);
                const { p, mxDisplay } = calcVitalScale(rawMx, key, getVitalMaxEstavel(key, f));
                // 🩸 Vida regenera até a SOMA de todas as barras (getNumBarrasVida), não só uma.
                const teto = key === 'vida' ? mxDisplay * getNumBarrasVida(p) : mxDisplay;
                const regenBase = parseFloat(f[key]?.regeneracao) || 0;
                const regenBuff = getBuffs(f, key).regeneracao || 0;
                const regen = regenBase + regenBuff;
                if (regen > 0 && teto > 0 && (f[key].atual || 0) < teto) {
                    const antes = f[key].atual || 0;
                    f[key].atual = Math.min(teto, antes + regen);
                    fracoesCuradas.push((f[key].atual - antes) / teto);
                }
            });
            if (fracoesCuradas.length > 0) {
                if (!f.combate) f.combate = {};
                const reducao = calcularReducaoFadigaPorRegeneracao(fracoesCuradas);
                f.combate.fadigaExtra = Math.max(0, (Number(f.combate.fadigaExtra) || 0) - reducao);
            }
        });
        salvarFichaSilencioso();
    }, [updateFicha, allVitals, getVitalMax, getVitalMaxEstavel]);

    const resetarTurno = useCallback(() => {
        updateFicha(f => {
            if (!f.acoes) return;
            f.acoes.padrao.atual = f.acoes.padrao.max;
            f.acoes.bonus.atual = f.acoes.bonus.max;
            f.acoes.reacao.atual = f.acoes.reacao.max;
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const changeActionMax = useCallback((tipo, delta) => {
        updateFicha(f => {
            if (!f.acoes) f.acoes = { padrao: { max: 1, atual: 1 }, bonus: { max: 1, atual: 1 }, reacao: { max: 1, atual: 1 } };
            const newMax = Math.max(1, f.acoes[tipo].max + delta);
            f.acoes[tipo].max = newMax;
            if (f.acoes[tipo].atual > newMax) f.acoes[tipo].atual = newMax;
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const toggleActionDot = useCallback((tipo, isAvailable) => {
        updateFicha(f => {
            if (!f.acoes) f.acoes = { padrao: { max: 1, atual: 1 }, bonus: { max: 1, atual: 1 }, reacao: { max: 1, atual: 1 } };
            if (isAvailable) {
                f.acoes[tipo].atual = Math.max(0, f.acoes[tipo].atual - 1);
            } else {
                f.acoes[tipo].atual = Math.min(f.acoes[tipo].max, f.acoes[tipo].atual + 1);
            }
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const value = useMemo(() => ({
        ficha,
        updateFicha,
        targetBar, setTargetBar,
        inputDano, setInputDano,
        inputLetalidade, setInputLetalidade,
        showCores, setShowCores,
        salvandoCores,
        tempCores,
        vitalsBars,
        vitaisEspeciais,
        allVitals,
        handleColorChange,
        salvarCores,
        resetarCores,
        getVitalMax,
        getVitalMaxEstavel,
        alterarVital,
        curarTudo,
        aplicarRegeneracaoTurno,
        resetarTurno,
        changeActionMax,
        toggleActionDot,
    }), [
        ficha, updateFicha,
        targetBar, inputDano, inputLetalidade,
        showCores, salvandoCores, tempCores,
        vitalsBars, vitaisEspeciais, allVitals,
        handleColorChange, salvarCores, resetarCores,
        getVitalMax, getVitalMaxEstavel, alterarVital, curarTudo,
        aplicarRegeneracaoTurno, resetarTurno,
        changeActionMax, toggleActionDot,
    ]);

    return (
        <StatusFormContext.Provider value={value}>
            {children}
        </StatusFormContext.Provider>
    );
}
