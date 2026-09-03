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
// TRAVAMENTO DE VITAIS AO ATIVAR/DESATIVAR FORMAS — réplica única usada por togglePoder,
// ativarFormaPoder, deletarFormaPoder (components/poderes/PoderesFormContext.jsx),
// ativarFormaItem, toggleEquiparItem, deletarFormaItem (components/arsenal/ArsenalFormContext.jsx),
// toggleEquiparById (Ficha Def/RelicarioPanel.jsx) e toggleSerSelado/ativarFormaSer/
// deletarFormaSer (components/ficha/FichaFormContext.jsx) — que antes duplicavam essa lógica cada
// uma com sua própria cópia.
//
// 🛡️ HISTÓRICO/CORREÇÃO DEFINITIVA: a primeira versão desta função fazia um RESCALE
// PROPORCIONAL (atual * novoMax/oldMax) pra preservar a % cheia/vazia quando o máximo mudava —
// mas isso ainda podia "drenar" energia em vários cenários (arredondamento pra baixo de um
// "atual" fracionário mesmo ativando uma Forma que não afetava aquele vital; e, por design,
// SEMPRE reduzia proporcionalmente o atual ao DESATIVAR qualquer Forma que tivesse aumentado o
// máximo, o que continuava sendo relatado como "gasto de energia" mesmo depois da correção do
// arredondamento). A versão atual abandona o rescale proporcional por completo: ativar OU
// desativar NUNCA reduz o valor ABSOLUTO de "atual" — o número que o jogador already tinha
// continua exatamente o mesmo, ponto. A ÚNICA coisa que pode acontecer é um CLAMP pra baixo, e
// só até o novo máximo, e só quando "atual" de fato ultrapassa esse novo teto (ex.: desativar uma
// Forma que tornava o máximo maior do que o normal, e "atual" tinha subido acima do teto normal
// enquanto ela estava ativa) — nunca abaixo disso, nunca por uma fração/arredondamento.
// ==========================================
export function capturarMaximosAtuais(ficha, vitais = VITAIS_PRINCIPAIS) {
    const maximos = {};
    vitais.forEach(v => { maximos[v] = getMaximo(ficha, v) || 1; });
    return maximos;
}

// `maximosAntigos` não é mais usado no cálculo (só existia pro extinto rescale proporcional) —
// o parâmetro continua aceito só pra não precisar mexer em todos os call sites que já o capturam
// via capturarMaximosAtuais antes de chamar esta função; passar `undefined`/`null` também funciona.
export function rescalarVitaisProporcional(ficha, maximosAntigos, vitais = VITAIS_PRINCIPAIS) {
    if (!ficha) return;
    vitais.forEach(k => {
        if (!ficha[k]) return;
        const novoMax = getMaximo(ficha, k) || 1;
        let atual = parseFloat(ficha[k].atual);
        if (isNaN(atual)) atual = novoMax;
        // Nunca reduz "atual" por conta própria — só clampa pra baixo se ele ultrapassar o novo
        // máximo, e nunca abaixo de 0.
        ficha[k].atual = Math.min(Math.max(0, atual), novoMax);
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
