// ==========================================
// REGENERAÇÃO AUTOMÁTICA POR TURNO — réplica pura de aplicarRegeneracaoTurno em
// components/status/StatusFormContext.jsx, para reuso fora da Ficha (ex.: quando o
// turno de alguém volta no Mapa, ver MapaFormContext.jsx).
// ==========================================
import { getMaximo, getMaximoSemFormas, getRawBase, getBuffs } from './attributes.js';
import { getPrestigioReal } from './prestige.js';
import { calcularReducaoFadigaPorRegeneracao } from './fadiga.js';

const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
export const VITAIS_REGENERAVEIS = ['vida', 'mana', 'aura', 'chakra', 'corpo', 'pv', 'pm'];
const VITAIS_PRINCIPAIS = ['vida', 'mana', 'aura', 'chakra', 'corpo'];

// ==========================================
// TRAVAMENTO DE VITAIS AO ATIVAR/DESATIVAR FORMAS — réplica única usada por togglePoder,
// ativarFormaPoder, deletarFormaPoder (components/poderes/PoderesFormContext.jsx),
// ativarFormaItem, toggleEquiparItem, deletarFormaItem, deletarItem
// (components/arsenal/ArsenalFormContext.jsx), toggleEquiparById, removeItemById
// (Ficha Def/RelicarioPanel.jsx) e toggleSerSelado/ativarFormaSer/deletarFormaSer/
// removeSerSelado (components/ficha/FichaFormContext.jsx) — que antes duplicavam essa lógica
// cada uma com sua própria cópia.
//
// 🛡️ HISTÓRICO — 3 tentativas anteriores, nenhuma resolveu o problema de verdade:
//   1ª: corrigiu o arredondamento de um "atual" fracionário em toggles que nem afetavam o vital.
//   2ª: estendeu a mesma correção pra mais call sites que a 1ª tinha esquecido.
//   3ª: trocou o rescale PROPORCIONAL (atual * novoMax/oldMax) por um travamento absoluto —
//       ativar/desativar nunca reduz "atual", só clampa pra baixo se ultrapassar o novo máximo.
//       Continuava comparando "atual" contra o máximo BRUTO (getMaximo), sem efeito real algum.
//
// 🔥 CAUSA RAIZ DE VERDADE (só descoberta na 4ª rodada): "atual" NUNCA foi guardado no valor
// bruto de getMaximo — ele é guardado já na ESCALA DE EXIBIÇÃO (calcVitalScale/mxDisplay abaixo,
// a mesma notação comprimida que aplicarRegeneracaoDeTurno/descansarCompleto usam pra escrever, e
// que StatusSubComponents.jsx/Marcados.jsx/DiarioNPC.jsx usam pra exibir). Isso por si só já
// tornava o travamento da 3ª tentativa incapaz de fazer QUALQUER coisa útil (comparava unidades
// diferentes — um "atual" pequeno, já comprimido, contra um "máximo" bruto, gigante). Só que o
// dano real não estava nem nessa comparação: os componentes de EXIBIÇÃO recalculam mxDisplay do
// zero a cada render, direto do getMaximo ATUAL — e SEMPRE que uma Forma empurra o máximo bruto
// através de uma fronteira de dígitos (calcVitalScale comprime mais a partir de 9+ dígitos em
// mana/aura/chakra/corpo, 9+ em vida/pv/pm), o mxDisplay pode CAIR de uma hora pra outra mesmo
// com o máximo bruto tendo CRESCIDO — e o próprio componente de exibição então trunca o "atual"
// (nunca alterado) pra caber nesse teto menor, na tela, na hora, sem nunca escrever nada na
// ficha. Nenhuma das 3 correções anteriores tocava nisso, porque nenhuma delas testava a
// exibição — só o dado bruto, que de fato nunca mudava.
//
// 🔥 5ª RODADA — CORREÇÃO DEFINITIVA: as duas correções anteriores (conversão de notação e
// travamento absoluto) só mexiam em COMO "atual" reage à mudança de escala — mas quem decide a
// escala (p) sempre foi o máximo BRUTO COMPLETO (getMaximo, COM o multiplicador de Formas). Isso
// significa que a decisão de escala em si continuava vulnerável a uma Forma temporária empurrando
// o máximo através de uma fronteira de dígitos, mesmo com a conversão sendo matematicamente
// perfeita — o NÚMERO EXIBIDO ainda caía (ex.: 90.000.000 -> 9.000.000), porque não há indicador
// de "casa decimal" nenhum na tela pra avisar o jogador que só a notação mudou.
//
// A correção agora: quem decide a ESCALA DE NOTAÇÃO (p) nunca mais é o máximo completo — é o
// máximo ESTÁVEL (getMaximoSemFormas, sem o multiplicador de Formas), o mesmo valor que o
// personagem tem parado, sem nenhuma Forma ativa. O máximo COMPLETO (com Formas) continua sendo o
// NUMERADOR do valor exibido (mxDisplay = floor(máximo completo / 10^p)) — só a escala em si é que
// passa a ignorar Formas. Na prática: ativar/desativar uma Forma pura NUNCA mais muda "p" (porque
// o máximo estável não mudou), então o teto exibido só CRESCE ou volta ao normal, nunca "pula" de
// notação. Só mudanças ESTÁVEIS de verdade (Prestígio, equipamento permanente etc.) continuam
// podendo cruzar uma fronteira de dígitos — e aí a conversão de notação abaixo entra normalmente.
// (calcVitalScale já é definida mais abaixo neste arquivo, reaproveitada aqui por hoisting de
// function declaration — mesma função que aplicarRegeneracaoDeTurno/descansarCompleto usam, pra
// nunca haver duas cópias divergentes da mesma conta de notação dentro do próprio módulo.)
// ==========================================

export function capturarMaximosAtuais(ficha, vitais = VITAIS_PRINCIPAIS) {
    const maximos = {};
    // valor ESTÁVEL (sem Formas) — é só isso que decide se a escala de notação (p) muda; nunca o
    // máximo completo, senão uma Forma temporária poderia cruzar uma fronteira de dígitos sozinha.
    vitais.forEach(v => { maximos[v] = getMaximoSemFormas(ficha, v) || 1; });
    return maximos;
}

export function rescalarVitaisProporcional(ficha, maximosAntigosEstaveis, vitais = VITAIS_PRINCIPAIS) {
    if (!ficha) return;
    vitais.forEach(k => {
        if (!ficha[k]) return;
        const oldEstavel = (maximosAntigosEstaveis && maximosAntigosEstaveis[k]) || getMaximoSemFormas(ficha, k) || 1;
        const novoEstavel = getMaximoSemFormas(ficha, k) || 1;
        const novoRawCompleto = getMaximo(ficha, k) || 1; // COM Formas — é o que de fato aparece na tela

        const { p: pAntigo } = calcVitalScale(oldEstavel, k);
        // A escala (p) vem do estável; o numerador de mxDisplay vem do completo (com Formas).
        const { p: pNovo, mxDisplay: novoMaxExibido } = calcVitalScale(novoRawCompleto, k, novoEstavel);

        let atual = parseFloat(ficha[k].atual);
        if (isNaN(atual)) atual = novoMaxExibido || 1;

        // Converte "atual" pra nova escala de notação, se ela mudou — pura reescrita da mesma
        // quantidade absoluta noutra notação, nunca um encolhimento de verdade.
        if (pNovo !== pAntigo) atual = atual * Math.pow(10, pAntigo - pNovo);

        // Só depois da conversão de notação: nunca reduz além disso, só clampa pra baixo se
        // ultrapassar o novo teto exibido, e nunca abaixo de 0.
        ficha[k].atual = Math.min(Math.max(0, atual), novoMaxExibido || 1);
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

export function getVitalMax(key, ficha) {
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

// Réplica de getVitalMax, só que com o multiplicador de Formas travado fora (getMaximoSemFormas em
// vez de getMaximo) — pv/pm nunca passam por getMaximo/Formas, então ficam idênticos ao original.
export function getVitalMaxEstavel(key, ficha) {
    if (key === 'pv' || key === 'pm') return getVitalMax(key, ficha);
    const v = getMaximoSemFormas(ficha, key);
    return (v !== undefined && v !== null && !Number.isNaN(v)) ? v : 1;
}

// rawMxParaEscala decide SÓ a escala de notação (p) — por padrão é o próprio rawMx, mas os
// chamadores que precisam ignorar Formas na decisão de escala (ver bloco de comentário acima)
// passam o máximo ESTÁVEL aqui, mantendo rawMx (completo) como numerador de mxDisplay.
export function calcVitalScale(rawMx, key, rawMxParaEscala = rawMx) {
    if (!rawMx || rawMx <= 0) return { p: 0, mxDisplay: 0 };
    const limit = (key === 'vida' || key === 'pv' || key === 'pm') ? 8 : 9;
    const baseEscala = (rawMxParaEscala && rawMxParaEscala > 0) ? rawMxParaEscala : rawMx;
    const strMx = Math.floor(baseEscala).toString();
    const p = Math.max(0, strMx.length - limit);
    const mxDisplay = p > 0 ? Math.floor(rawMx / Math.pow(10, p)) : Math.floor(rawMx);
    return { p, mxDisplay };
}

// 🔥 ÚNICA FONTE DE VERDADE pro "teto EXIBIDO" (já na escala comprimida, sem Formas cruzando
// fronteira de dígitos) de um vital — combina getVitalMax + getVitalMaxEstavel + calcVitalScale
// num só lugar. Qualquer código fora deste módulo que precise saber "quanto vale o teto que o
// jogador VÊ na tela" (pra clampar dano, calcular custo em % do máximo, etc.) DEVE usar esta
// função em vez de reimplementar a conta — foi exatamente reimplementações separadas (em
// PoderesFormContext.jsx > dispararAtaque e AtaqueFormContext.jsx > cálculo manual) comparando um
// custo calculado sobre o máximo BRUTO (getMaximo, muito maior) contra o "atual" já comprimido que
// causou o vazamento de Energia real (drenos gigantescos, muito além do % pretendido) descoberto
// na 6ª rodada de investigação deste bug.
export function getVitalMxDisplay(key, ficha) {
    const rawMx = getVitalMax(key, ficha);
    const rawMxEstavel = getVitalMaxEstavel(key, ficha);
    return calcVitalScale(rawMx, key, rawMxEstavel).mxDisplay;
}

// Aplica ficha[key].regeneracao + o bônus de regeneração vindo de Poderes/Passivas/Itens ativos
// (getBuffs(ficha,key).regeneracao — propriedade 'regeneracao' num efeito, já filtrada por
// ativa/equipado do mesmo jeito que qualquer outro bônus da ficha) a cada vital (vida/mana/aura/
// chakra/corpo/pv/pm), até o máximo, mutando o rascunho Immer recebido — mesma regra que o botão
// "Regenerar" da página de Status, só que chamado automaticamente pelo próprio turno de cada
// jogador no Mapa. Também desconta da Fadiga acumulada (combate.fadigaExtra) proporcionalmente ao
// quanto foi de fato recuperado neste turno — ver core/fadiga.js > calcularReducaoFadigaPorRegeneracao.
//
// 🛡️ `pisoFadigaExtra` (opcional, padrão 0): piso que o desconto nunca derruba fadigaExtra abaixo
// dele. Existe só pro caso do Mapa (MapaFormContext.jsx > avanço de turno), onde o ganho DINÂMICO
// da Fadiga daquele mesmo turno (calcularGanhoFadigaDinamico, calculado ANTES desta função rodar
// e já somado a combate.fadigaExtra) precisa continuar refletindo o quão gasto o personagem estava
// ENTRANDO no turno — sem o piso, curar o vital por completo no mesmo tick anularia esse ganho
// (mascarando o desgaste real daquele turno), regressão coberta por
// MapaFormContext.combateAutoTurno.test.jsx. O botão manual "Regenerar" da Ficha não tem esse
// conceito de "ganho do próprio tick" e continua usando o padrão (piso 0, desconto livre até 0).
export function aplicarRegeneracaoDeTurno(ficha, pisoFadigaExtra = 0) {
    if (!ficha) return;
    const fracoesCuradas = [];
    VITAIS_REGENERAVEIS.forEach((key) => {
        // Cada vital é isolado no seu próprio try/catch — um erro calculando o máximo de UM
        // vital (ex.: dado malformado de uma ficha antiga) não pode abortar a regeneração dos
        // outros vitais nem quebrar o avanço de turno no Mapa.
        try {
            if (!ficha[key]) return;
            const rawMx = getVitalMax(key, ficha);
            const rawMxEstavel = getVitalMaxEstavel(key, ficha);
            const { mxDisplay } = calcVitalScale(rawMx, key, rawMxEstavel);
            const regenBase = parseFloat(ficha[key].regeneracao) || 0;
            const regenBuff = (getBuffs(ficha, key).regeneracao) || 0;
            const regen = regenBase + regenBuff;
            if (regen > 0 && mxDisplay > 0 && (ficha[key].atual || 0) < mxDisplay) {
                const antes = ficha[key].atual || 0;
                ficha[key].atual = Math.min(mxDisplay, antes + regen);
                fracoesCuradas.push((ficha[key].atual - antes) / mxDisplay);
            }
        } catch (e) { /* pula só este vital */ }
    });

    try {
        if (fracoesCuradas.length > 0) {
            if (!ficha.combate) ficha.combate = {};
            const reducao = calcularReducaoFadigaPorRegeneracao(fracoesCuradas);
            const piso = Math.max(0, Number(pisoFadigaExtra) || 0);
            const semDesconto = Math.max(0, (Number(ficha.combate.fadigaExtra) || 0) - reducao);
            ficha.combate.fadigaExtra = Math.max(piso, semDesconto);
        }
    } catch (e) { /* nunca deixa o desconto de Fadiga quebrar a Regeneração em si */ }
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
            const rawMxEstavel = getVitalMaxEstavel(key, ficha);
            const { mxDisplay } = calcVitalScale(rawMx, key, rawMxEstavel);
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
