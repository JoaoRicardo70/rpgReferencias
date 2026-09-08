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
        let atual = parseFloat(ficha[k].atual);

        // 🩸 Vida não usa mais a escala comprimida de calcVitalScale (cada barra vale um valor FIXO,
        // LIMIAR_BARRA_VIDA) — não existe mais "conversão de notação" nenhuma a fazer aqui pra
        // vida: "atual" já está na unidade certa antes e depois de qualquer mudança no máximo, só
        // precisa ser RE-CLAMPADO pro novo teto (que pode crescer/encolher conforme o máximo
        // ESTÁVEL muda, ex.: ao ativar/desativar uma Forma).
        if (k === 'vida') {
            const novoEstavel = getMaximoSemFormas(ficha, 'vida') || 1;
            const novoTeto = getTetoVida(novoEstavel, 'vida');
            if (isNaN(atual)) atual = novoTeto;
            ficha[k].atual = Math.min(Math.max(0, atual), novoTeto || 1);
            return;
        }

        const oldEstavel = (maximosAntigosEstaveis && maximosAntigosEstaveis[k]) || getMaximoSemFormas(ficha, k) || 1;
        const novoEstavel = getMaximoSemFormas(ficha, k) || 1;
        const novoRawCompleto = getMaximo(ficha, k) || 1; // COM Formas — é o que de fato aparece na tela

        const { p: pAntigo } = calcVitalScale(oldEstavel, k);
        // A escala (p) vem do estável; o numerador de mxDisplay vem do completo (com Formas).
        const { p: pNovo, mxDisplay: novoMaxExibido } = calcVitalScale(novoRawCompleto, k, novoEstavel);

        if (isNaN(atual)) atual = novoMaxExibido || 1;

        // Converte "atual" pra nova escala de notação, se ela mudou — pura reescrita da mesma
        // quantidade absoluta noutra notação, nunca um encolhimento de verdade.
        if (pNovo !== pAntigo) atual = atual * Math.pow(10, pAntigo - pNovo);

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
    // 🔥 Números MUITO grandes (>= 1e21) viram notação científica no .toString() ("1e+21"), cujo
    // .length não reflete a contagem real de dígitos — mesma correção já existente nas cópias
    // locais desta conta (Ficha Def/Marcados.jsx > calcularEscala, e o cálculo do Scouter/
    // vitalidadeGlobal no mesmo arquivo), trazida pra cá pra ser a única versão robusta.
    let digitos = strMx.length;
    if (strMx.includes('e')) {
        const partes = strMx.split('e');
        const expoente = parseInt(partes[1].replace('+', ''), 10);
        if (!isNaN(expoente)) digitos = expoente + 1;
    }
    const p = Math.max(0, digitos - limit);
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

// ==========================================
// 🩸 MÚLTIPLAS BARRAS DE VIDA (pedido do usuário, paridade nenhuma com mana/aura/chakra/corpo/pv/
// pm — só Vida faz isso): em vez de guardar um array de barras na ficha, "atual" continua sendo um
// ÚNICO número — o TOTAL restante somando todas as barras — e as barras individuais são só
// DERIVADAS dele aqui, na hora de exibir/editar. Isso faz dano e cura funcionarem automaticamente
// sem mudar nenhum outro código (Math.max(0, atual-dano) e Math.min(novoTeto, atual+cura)
// continuam corretos, só o TETO usado pra clampar cura/regen muda), e faz "derrotado" continuar
// sendo simplesmente "atual <= 0" (só quando TODAS as barras zeram).
//
// 🔢 REGRA DO TAMANHO DE CADA BARRA (3ª versão, pedido do usuário): o TOTAL de Vida exibido NUNCA
// é maior nem menor que o máximo bruto real do personagem — a mecânica só REPARTE esse total em
// blocos visuais de até LIMIAR_BARRA_VIDA (100 milhões) cada, ao ultrapassar cada 100 milhões de
// Vida (máximo ESTÁVEL, sem Formas — mesma regra de sempre pra decisão ESTRUTURAL de quantas
// barras existem, pra uma Forma temporária nunca fazer surgir/sumir uma barra sozinha). Toda barra
// JÁ COMPLETA fica "cravada" em exatamente 100 milhões (cheia, permanente); a barra de TRÁS (índice
// mais alto — a mais recente, ainda em formação) mostra só o RESTO real (total - blocos já
// cravados) — nunca os 100 milhões cheios antes disso, senão um personagem com, digamos, 75 milhões de Vida (abaixo do
// 1º limiar) veria sua Vida máxima inflada artificialmente pra 100 milhões, e o total pularia de
// ~100M pra 200M só por cruzar o limiar por 1 unidade. Isso substitui a 2ª versão (toda barra,
// inclusive a ativa, valia o limiar CHEIO) e a 1ª (cada barra usava mxDisplay, a escala comprimida
// de calcVitalScale, mudando junto quando a Vida bruta cruzasse uma ORDEM DE GRANDEZA inteira —
// 1e9, 1e10... — não a cada 100 milhões, o oposto do "cravar em 100 milhões, sucessivamente"
// pedido). Ver montarBarrasVida, a implementação compartilhada por calcularBarrasVida (personagens)
// e calcularBarrasVidaDummy (dummies).
//
// A barra da FRENTE (índice 0) é a primeira a ser atingida por dano; o excesso da MESMA pancada já
// transborda pra próxima barra (decisão do usuário — sujeita a mudar futuramente).
//
// ⚠️ Consequência matemática INEVITÁVEL de derivar as barras de um único total (em vez de guardar
// um array com o estado de cada uma): como a barra da frente é SEMPRE a primeira a ESVAZIAR
// conforme o total cai, ela também é, necessariamente, a ÚLTIMA a voltar a ENCHER conforme o total
// sobe de novo (cura/regeneração) — a barra de trás (a única que ainda tinha alguma Vida quando o
// personagem estava quase morto) é quem recebe os primeiros pontos de cura, só depois "transborda"
// pra frente. Não é um bug nem uma inversão acidental: dado um único número guardado, é a ÚNICA
// distribuição possível que respeita "a frente esvazia primeiro" nos dois sentidos (dano E cura
// percorrem a MESMA reta numérica, só em direções opostas). Se no futuro o pedido for "a barra da
// frente enche primeiro ao curar, independente de qual esvaziou primeiro no dano", isso exige
// guardar o estado de CADA barra separadamente (não dá mais pra derivar de um total único).
export const LIMIAR_BARRA_VIDA = 100000000;

// Vitalidade de Vida (2ª versão): 1 ponto pra CADA 100 milhões COMPLETOS de Vida bruta ESTÁVEL
// (sem Formas). Generaliza a Vitalidade antiga (que só subia ao cruzar uma ORDEM DE GRANDEZA
// inteira — 1e8, 1e9, 1e10...) pra subir a CADA 100 milhões dentro desse intervalo também.
export function getVitalidadeVida(rawValorEstavel) {
    return Math.max(0, Math.floor((Number(rawValorEstavel) || 0) / LIMIAR_BARRA_VIDA));
}

// Núcleo compartilhado de "Break Bars" de Vida — usado tanto por calcularBarrasVida (personagens)
// quanto por calcularBarrasVidaDummy (dummies/NPCs do Mapa). O TOTAL de Vida NUNCA é inflado nem
// encolhido por esta conta: ele é SEMPRE exatamente o "total" recebido — a mecânica só reparte
// esse mesmo número em blocos visuais de até LIMIAR_BARRA_VIDA (100 milhões) cada. Barras
// COMPLETAS (totalmente "cravadas") valem exatamente 100 milhões; a barra ATIVA (a mais recente,
// ainda em formação) fica com o RESTO exato (total - vitalidade*LIMIAR) — sem criar uma barra
// "fantasma" de max=0 quando o total for um múltiplo EXATO de 100 milhões.
function montarBarrasVida(total, atualTotal) {
    const max = Math.max(0, Number(total) || 0);
    const vitalidade = getVitalidadeVida(max);
    const resto = max - vitalidade * LIMIAR_BARRA_VIDA;

    let numBarras, capUltimaBarra;
    if (max <= 0) {
        numBarras = 1;
        capUltimaBarra = 0;
    } else if (resto > 0) {
        numBarras = vitalidade + 1;
        capUltimaBarra = resto;
    } else {
        numBarras = Math.max(1, vitalidade);
        capUltimaBarra = LIMIAR_BARRA_VIDA;
    }

    let atual = Number(atualTotal);
    if (atualTotal === undefined || atualTotal === null || atualTotal === '' || isNaN(atual)) atual = max;
    atual = Math.min(Math.max(0, atual), max);

    const barras = [];
    const danoTotal = max - atual;
    let danoAcumulado = 0;
    for (let i = 0; i < numBarras; i++) {
        const capBarra = (i === numBarras - 1) ? capUltimaBarra : LIMIAR_BARRA_VIDA;
        const danoNestaBarra = capBarra > 0 ? Math.min(Math.max(0, danoTotal - danoAcumulado), capBarra) : 0;
        barras.push({ atual: capBarra - danoNestaBarra, max: capBarra });
        danoAcumulado += capBarra;
    }

    return { vitalidade, numBarras, totalMax: max, atual, barras };
}

// Teto REAL de Vida (soma de todas as barras, que é SEMPRE igual ao valor bruto recebido — ver
// montarBarrasVida) — usar isto em vez de calcVitalScale(...).mxDisplay sempre que o código for
// clampar/regenerar/curar o vital 'vida' até o máximo. Para as demais chaves (mana/aura/chakra/
// corpo/pv/pm) é idêntico a mxDisplay (numBarras sempre 1) — essas continuam na escala comprimida
// de calcVitalScale, sem nenhuma mudança.
export function getTetoVida(rawMx, key, rawMxParaEscala = rawMx) {
    if (key === 'vida') {
        const baseEscala = (rawMxParaEscala && rawMxParaEscala > 0) ? rawMxParaEscala : rawMx;
        return Math.max(0, Number(baseEscala) || 0);
    }
    const { mxDisplay } = calcVitalScale(rawMx, key, rawMxParaEscala);
    return mxDisplay;
}

// Deriva as barras individuais (front-to-back) a partir do TOTAL guardado em "atual". Reutilizável
// tanto pra uma ficha de personagem quanto pra um dummy/NPC do Mapa (que não tem sub-objeto
// ficha.vida — só passe o hpMax bruto dele como rawMx e hpAtual como atualTotal).
export function calcularBarrasVida(rawMx, key, atualTotal, rawMxParaEscala = rawMx) {
    if (key === 'vida') {
        const baseEscala = (rawMxParaEscala && rawMxParaEscala > 0) ? rawMxParaEscala : rawMx;
        const { vitalidade, numBarras, totalMax, atual, barras } = montarBarrasVida(baseEscala, atualTotal);
        return { p: vitalidade, mxDisplay: LIMIAR_BARRA_VIDA, numBarras, totalMax, atual, barras };
    }

    // mana/aura/chakra/corpo/pv/pm: continuam com 1 barra só, na escala comprimida de
    // calcVitalScale — nenhuma mudança de comportamento pra essas chaves.
    const { p, mxDisplay } = calcVitalScale(rawMx, key, rawMxParaEscala);
    let atual = Number(atualTotal);
    if (atualTotal === undefined || atualTotal === null || atualTotal === '' || isNaN(atual)) atual = mxDisplay;
    atual = Math.min(Math.max(0, atual), mxDisplay || 0);

    return { p, mxDisplay, numBarras: 1, totalMax: mxDisplay, atual, barras: [{ atual, max: mxDisplay }] };
}

// Recalcula o novo TOTAL de Vida a partir de uma edição manual numa barra específica (ex.: o
// jogador digita um valor direto na barra 2 de 3) — mantém as outras barras como estavam.
export function aplicarEdicaoBarraVida(barras, mxDisplay, indice, novoValor) {
    const novoClamp = Math.min(Math.max(0, Number(novoValor) || 0), mxDisplay || 0);
    return (barras || []).reduce((soma, b, i) => soma + (i === indice ? novoClamp : (Number(b.atual) || 0)), 0);
}

// Convenience: teto TOTAL de Vida já pronto a partir de uma ficha de personagem (usa Formas no
// numerador, mas ignora Formas na decisão da escala/nº de barras — mesma regra de sempre).
export function getVidaTotalMaxDisplay(ficha) {
    const rawMx = getVitalMax('vida', ficha);
    const rawMxEstavel = getVitalMaxEstavel('vida', ficha);
    return getTetoVida(rawMx, 'vida', rawMxEstavel);
}

// Variante de calcularBarrasVida pros dummies/NPCs simplificados do Mapa (MapaFerramentasMestre.jsx
// > MapaMestreGeradorDummies): eles não têm atributos (força/constituição/etc.) de onde extrair um
// "máximo bruto" — o "hpMax" que o Mestre digita É o total de verdade, o número que ele espera ver
// refletido no token, e NUNCA pode ser inflado/encolhido por esta conta. Usa a MESMA regra de
// LIMIAR_BARRA_VIDA (100 milhões) dos personagens: barras completas valem exatamente 100 milhões
// cada, e a ÚLTIMA fica com o RESTO (hpMax - vitalidade*100M) — assim a soma das barras bate
// EXATAMENTE com o hpMax configurado, sem arredondar (diferente de repartir hpMax igualmente pelo
// nº de barras, que só preservava o total por acaso quando ele já era múltiplo exato do nº de
// barras).
// Usa a mesma montarBarrasVida compartilhada com calcularBarrasVida — hpMax MÚLTIPLO EXATO de 100
// milhões (resto=0) não cria uma barra extra FANTASMA de max=0: as "vitalidade" barras já cheias
// bastam. hpMax=0 continua sendo o caso especial de sempre: 1 barra só, de max=0.
export function calcularBarrasVidaDummy(hpMaxBruto, hpAtualTotal) {
    const { vitalidade, numBarras, totalMax, atual, barras } = montarBarrasVida(hpMaxBruto, hpAtualTotal);
    return { p: vitalidade, numBarras, totalMax, atual, barras };
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
            // 🩸 Vida pode ter várias barras — o teto de regeneração é a SOMA de todas (getTetoVida),
            // não só uma barra.
            const teto = getTetoVida(rawMx, key, rawMxEstavel);
            const regenBase = parseFloat(ficha[key].regeneracao) || 0;
            const regenBuff = (getBuffs(ficha, key).regeneracao) || 0;
            const regen = regenBase + regenBuff;
            if (regen > 0 && teto > 0 && (ficha[key].atual || 0) < teto) {
                const antes = ficha[key].atual || 0;
                ficha[key].atual = Math.min(teto, antes + regen);
                fracoesCuradas.push((ficha[key].atual - antes) / teto);
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
            // 🩸 Vida cura até a SOMA de todas as barras, não só uma.
            ficha[key].atual = getTetoVida(rawMx, key, rawMxEstavel);
        } catch (e) { /* pula só este vital */ }
    });
    if (!ficha.combate) ficha.combate = {};
    ficha.combate.fadigaTurnos = 0;
    ficha.combate.fadigaExtra = 0;
    ficha.combate.municoTurnos = 0;
    delete ficha.combate.ultimoElementoRecebido;
    delete ficha.combate.ultimoElementoRecebidoNivel;
}
