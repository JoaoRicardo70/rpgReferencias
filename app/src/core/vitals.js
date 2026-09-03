// ==========================================
// REGENERAÇÃO AUTOMÁTICA POR TURNO — réplica pura de aplicarRegeneracaoTurno em
// components/status/StatusFormContext.jsx, para reuso fora da Ficha (ex.: quando o
// turno de alguém volta no Mapa, ver MapaFormContext.jsx).
// ==========================================
import { getMaximo, getRawBase } from './attributes.js';
import { getPrestigioReal } from './prestige.js';

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
const VITAIS_REGENERAVEIS = ['vida', 'mana', 'aura', 'chakra', 'corpo', 'pv', 'pm'];
const VITAIS_PRINCIPAIS = ['vida', 'mana', 'aura', 'chakra', 'corpo'];

// ==========================================
// RESCALA PROPORCIONAL AO ATIVAR/DESATIVAR FORMAS — réplica única usada por togglePoder e
// ativarFormaPoder (components/poderes/PoderesFormContext.jsx) e ativarFormaItem
// (components/arsenal/ArsenalFormContext.jsx), que antes duplicavam esta mesma lógica 3x cada
// uma com sua própria cópia. Preserva a PORCENTAGEM de "atual" quando o MÁXIMO calculado
// (getMaximo, que já soma mFormas/buffs de Formas ativas) muda: se o máximo dobra ao ativar uma
// Forma, o atual também dobra, mantendo a mesma fração cheia/vazia — e vice-versa ao desativar.
//
// 🛡️ CORREÇÃO: nunca deixa "atual" ser reduzido quando o máximo NÃO encolheu (novoMax >= oldMax).
// Antes, o rescale proporcional (atual * novoMax/oldMax, sempre arredondado pra baixo) podia
// "drenar" um pouco de energia mesmo ATIVANDO uma Forma — por exemplo, se "atual" já estivesse
// fracionário por qualquer motivo (edição manual, alguma conta anterior não inteira), qualquer
// toggle — inclusive de uma Forma que nem afeta aquele vital (razão exatamente 1) — arredondava
// pra baixo o valor fracionário, perdendo um pouco a cada ativação. Agora só reduz "atual" quando
// o máximo de fato encolhe (Forma sendo desativada, ou um efeito propositalmente negativo).
// ==========================================
export function capturarMaximosAtuais(ficha, vitais = VITAIS_PRINCIPAIS) {
    const maximos = {};
    vitais.forEach(v => { maximos[v] = getMaximo(ficha, v) || 1; });
    return maximos;
}

export function rescalarVitaisProporcional(ficha, maximosAntigos, vitais = VITAIS_PRINCIPAIS) {
    if (!ficha || !maximosAntigos) return;
    vitais.forEach(k => {
        if (!ficha[k]) return;
        const oldMax = maximosAntigos[k] || 1;
        const novoMax = getMaximo(ficha, k) || 1;
        let atual = parseFloat(ficha[k].atual);
        if (isNaN(atual)) atual = novoMax;
        let novoAtual = Math.floor(atual * (novoMax / oldMax));
        if (novoMax >= oldMax && novoAtual < atual) novoAtual = atual;
        if (isNaN(novoAtual) || novoAtual < 0 || novoAtual > novoMax) novoAtual = novoMax;
        ficha[k].atual = novoAtual;
    });
}

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

// Descanso completo: cura vida/mana/aura/chakra/corpo/pv/pm até o máximo e zera a Fadiga
// (fadigaTurnos + fadigaExtra) e o mUnico Crescente acumulados — mesma ideia do botão
// "💖 Descansar" (handleRegenerarTudo) da Ficha, disponível também no Mapa (ver
// MapaFormContext.jsx > descansar) pra o personagem não carregar a Fadiga de uma luta pra outra
// sem precisar voltar pra Ficha. Muta o rascunho Immer recebido.
export function descansarCompleto(ficha) {
    if (!ficha) return;
    VITAIS_REGENERAVEIS.forEach((key) => {
        try {
            if (!ficha[key]) return;
            const rawMx = getVitalMax(key, ficha);
            const { mxDisplay } = calcVitalScale(rawMx, key);
            ficha[key].atual = mxDisplay;
        } catch (e) { /* pula só este vital */ }
    });
    if (!ficha.combate) ficha.combate = {};
    ficha.combate.fadigaTurnos = 0;
    ficha.combate.fadigaExtra = 0;
    ficha.combate.municoTurnos = 0;
    delete ficha.combate.ultimoElementoRecebido;
    delete ficha.combate.ultimoElementoRecebidoNivel;
}
