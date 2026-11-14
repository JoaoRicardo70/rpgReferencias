// ==========================================
// 💥 ZENKAI (habilidade de Raça) — lógica PURA. Depois de um combate, quem tem Zenkai evolui o Poder de forma PERMANENTE, e o ganho
// depende de QUÃO DIFÍCIL foi a luta PARA O PERSONAGEM (não de quão forte ele ficou).
//
// FLUXO
//  1. Telemetria por combate em `ficha.combate.zenkai` (só acumula com `ficha.combate.zenkaiLigado === true` E a telemetria aberta, `ativo: true`,
//     o que acontece ao INICIAR o combate ou no primeiro turno do portador). NUNCA entra no cálculo de Poder (nem de nenhum outro número da ficha).
//       danoRecebido    soma do dano que de fato reduziu a Vida (bruto; o que Imunidade total/escudos absorveram não conta)
//       vidaMax         maior Vida máxima bruta vista (base da fração de dano)
//       vidaMinimaFracao menor Vida atual / Vida máxima observada (0..1; null = ainda não observada)
//       energiaBuffer   gasto de Energia do TURNO CORRENTE (fração da soma dos tetos de energia): energias descontadas + custo equivalente de golpes
//                       conjurados "como Poder" (sem desgaste). Ao começar o próximo turno do portador (ou ao calcular no fim) entra em energiaContada
//                       limitado a TETO_GASTO_TURNO: despejar tudo no turno 1 vale como UM turno de gasto alto, não mais.
//       energiaContada  soma dos buffers já fechados (cada um já limitado pelo teto por turno)
//       turnos          turnos do portador com o combate ativo
//       fadigaPico      maior Fadiga Atual (%) vista nos turnos
//       formasTurnos    turnos com alguma Forma ativa
//       razaoSoma/razaoTurnos  a cada turno, Poder do oponente hostil mais forte ÷ Poder do portador (limitada a [0, 2]); sem oponente válido não registra
//  2. calcularZenkai(ficha) -> pontuação S = Σ peso_i × c_i, c_i em [0,1]:
//       dano = min(1, danoRecebido / vidaMax)      energia = min(1, energiaContada)      fadiga = fadigaPico / 100
//       duracao = min(1, turnos / TURNOS_DURACAO_REF)      quaseMorte = 1 se a Vida mínima ficou ≤ 10% E o personagem está vivo (> 0), senão 0
//       formas = formasTurnos / turnos
//     fatorOponente = clamp(razaoMedia, FATOR_OPONENTE_MIN, FATOR_OPONENTE_MAX); SEM dado de oponente = FATOR_OPONENTE_MIN (o mais seguro contra
//     abuso: lutar contra quem não se mediu rende pouco; o Mestre ajusta no diálogo de aprovação).
//     Zenkai % = min(teto, teto × (S / pontuacaoRef) × fatorOponente) × min(1, turnos / turnosMinimos[padrão 3]). Sem turnos do portador = 0.
//  3. Ao encerrar o combate o Mestre/Co-Mestre vê o valor sugerido e o detalhamento, ajusta e libera/recusa (core/aprovacaoPermanente.js).
//     aplicarZenkaiPermanente soma p/100 em ficha.ganhosPermanentes.poderCalculado (modo 'somar', mesmos limites de core/adaptacao.js).
//
// Config por personagem: ficha.combate.zenkaiConfig = { pesos: {...}, teto, pontuacaoRef } (gravada pelo modelo "Zenkai"; padrão se ausente).
// ⚠️ Este módulo NÃO importa core/poder.js nem core/disputaPoder.js (medições de Poder ficam em core/adaptacaoTurno.js).
// ==========================================
import { LIMITE_ADAPTACAO_GANHO_PERC, LIMITE_ADAPTACAO_GANHO_PERC_MIN, LIMITE_ADAPTACAO_TOTAL_PERMANENTE, CAMINHO_GANHO_PERMANENTE_PODER } from './adaptacao.js';

export const ZENKAI_TETO_PADRAO = 5;            // % máximo de Poder por combate
export const ZENKAI_TETO_MIN = 0;
export const ZENKAI_TETO_MAX = 100;
export const ZENKAI_PONTUACAO_REF_PADRAO = 2;   // S = 2 enche o teto (com oponente de mesma força)
export const ZENKAI_PONTUACAO_REF_MIN = 0.1;
export const ZENKAI_PONTUACAO_REF_MAX = 100;
export const ZENKAI_PESO_MIN = 0;
export const ZENKAI_PESO_MAX = 10;
export const PESOS_ZENKAI_PADRAO = Object.freeze({ dano: 1, energia: 0.8, fadiga: 0.5, duracao: 0.5, quaseMorte: 0.7, formas: 0.3 });
export const COMPONENTES_ZENKAI = Object.freeze([
    { id: 'dano', rotulo: 'Dano recebido' },
    { id: 'energia', rotulo: 'Energia gasta' },
    { id: 'fadiga', rotulo: 'Fadiga acumulada' },
    { id: 'duracao', rotulo: 'Duração do combate' },
    { id: 'quaseMorte', rotulo: 'Quase morte' },
    { id: 'formas', rotulo: 'Uso de Formas' },
]);
export const TETO_GASTO_TURNO = 0.5;            // fração da energia total máxima que UM turno pode contar
export const TURNOS_DURACAO_REF = 10;           // turnos para a duração valer 1
export const TURNOS_PARA_ZENKAI_CHEIO = 3;      // ANTI-ABUSO de combate curto: com menos turnos o Zenkai % final é multiplicado por turnos/este valor
export const TURNOS_MINIMOS_MIN = 1;
export const TURNOS_MINIMOS_MAX = 50;
export const LIMIAR_QUASE_MORTE = 0.1;          // Vida mínima (fração) que conta como quase morte
export const RAZAO_OPONENTE_MAX = 2;            // razão por turno limitada a [0, 2]
export const FATOR_OPONENTE_MIN = 0.1;
export const FATOR_OPONENTE_MAX = 1.5;
export const LIMITE_TURNOS_ZENKAI = 9999;
export const ENERGIAS_ZENKAI = Object.freeze(['chakra', 'mana', 'aura', 'corpo']);

// Caminhos do Firebase (formato 'a/b') tocados por registrar / aplicar / zerar.
export const CAMINHOS_ZENKAI = ['combate/zenkai'];

const numero = (v, padrao = 0) => { const n = Number(v); return Number.isFinite(n) ? n : padrao; };
const preso = (n, min, max) => Math.max(min, Math.min(max, n));
const arred4 = (v) => Math.round(v * 1e4) / 1e4;
const arred9 = (v) => Math.round(v * 1e9) / 1e9;
const fmt = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

// ---------- Configuração ----------
export function limitarTetoZenkai(v) {
    const n = Number(v);
    if (v === '' || v === null || v === undefined || !Number.isFinite(n)) return ZENKAI_TETO_PADRAO;
    return preso(n, ZENKAI_TETO_MIN, ZENKAI_TETO_MAX);
}

export function limitarPontuacaoRefZenkai(v) {
    const n = Number(v);
    if (v === '' || v === null || v === undefined || !Number.isFinite(n)) return ZENKAI_PONTUACAO_REF_PADRAO;
    return preso(n, ZENKAI_PONTUACAO_REF_MIN, ZENKAI_PONTUACAO_REF_MAX);
}

export function limitarTurnosMinimosZenkai(v) {
    const n = Number(v);
    if (v === '' || v === null || v === undefined || !Number.isFinite(n)) return TURNOS_PARA_ZENKAI_CHEIO;
    return preso(n, TURNOS_MINIMOS_MIN, TURNOS_MINIMOS_MAX);
}

// Configuração saneada de uma ficha (ausente/inválida -> padrão). Sempre devolve { pesos, teto, pontuacaoRef }.
export function getConfigZenkai(ficha) {
    const bruta = ficha && ficha.combate && ficha.combate.zenkaiConfig && typeof ficha.combate.zenkaiConfig === 'object' ? ficha.combate.zenkaiConfig : {};
    const pesosBrutos = bruta.pesos && typeof bruta.pesos === 'object' ? bruta.pesos : {};
    const pesos = {};
    COMPONENTES_ZENKAI.forEach(({ id }) => {
        const v = pesosBrutos[id];
        const n = v === '' || v === null || v === undefined ? NaN : Number(v);
        pesos[id] = Number.isFinite(n) ? preso(n, ZENKAI_PESO_MIN, ZENKAI_PESO_MAX) : PESOS_ZENKAI_PADRAO[id];
    });
    return { pesos, teto: limitarTetoZenkai(bruta.teto), pontuacaoRef: limitarPontuacaoRefZenkai(bruta.pontuacaoRef), turnosMinimos: limitarTurnosMinimosZenkai(bruta.turnosMinimos) };
}

export const zenkaiLigado = (ficha) => !!(ficha && ficha.combate && ficha.combate.zenkaiLigado === true);

// ---------- Telemetria ----------
export function novaTelemetriaZenkai() {
    return { ativo: true, danoRecebido: 0, vidaMax: 0, vidaMinimaFracao: null, energiaBuffer: 0, energiaContada: 0, turnos: 0, fadigaPico: 0, formasTurnos: 0, razaoSoma: 0, razaoTurnos: 0 };
}

// Telemetria saneada (todos os campos numéricos finitos e >= 0), ou null se não existe/não está aberta.
export function lerTelemetriaZenkai(ficha) {
    const z = ficha && ficha.combate && ficha.combate.zenkai;
    if (!z || typeof z !== 'object' || z.ativo !== true) return null;
    const min = z.vidaMinimaFracao === null || z.vidaMinimaFracao === undefined || z.vidaMinimaFracao === '' ? null : Number(z.vidaMinimaFracao);
    return {
        ativo: true,
        danoRecebido: Math.max(0, numero(z.danoRecebido)),
        vidaMax: Math.max(0, numero(z.vidaMax)),
        vidaMinimaFracao: min !== null && Number.isFinite(min) ? preso(min, 0, 1) : null,
        energiaBuffer: Math.max(0, numero(z.energiaBuffer)),
        energiaContada: Math.max(0, numero(z.energiaContada)),
        turnos: Math.min(LIMITE_TURNOS_ZENKAI, Math.max(0, Math.floor(numero(z.turnos)))),
        fadigaPico: preso(numero(z.fadigaPico), 0, 100),
        formasTurnos: Math.max(0, Math.floor(numero(z.formasTurnos))),
        razaoSoma: Math.max(0, numero(z.razaoSoma)),
        razaoTurnos: Math.max(0, Math.floor(numero(z.razaoTurnos))),
    };
}

// Mutáveis só no rascunho e só com Zenkai ligado e telemetria aberta; senão devolvem null e não mudam nada.
function telemetriaAberta(ficha) {
    if (!zenkaiLigado(ficha)) return null;
    const z = ficha.combate.zenkai;
    if (!z || typeof z !== 'object' || z.ativo !== true) return null;
    return z;
}

// Abre (ou reabre do zero) a telemetria. Só com Zenkai ligado. Devolve o objeto ou null.
export function iniciarZenkai(ficha) {
    if (!zenkaiLigado(ficha)) return null;
    ficha.combate.zenkai = novaTelemetriaZenkai();
    return ficha.combate.zenkai;
}

// Garante telemetria aberta (quem entra no combate depois do início). Devolve o objeto ou null (Zenkai desligado).
export function garantirZenkai(ficha) {
    if (!zenkaiLigado(ficha)) return null;
    return telemetriaAberta(ficha) || iniciarZenkai(ficha);
}

function atualizarVidaMinima(z, vidaAtual, vidaMax) {
    const max = numero(vidaMax);
    if (max > 0) z.vidaMax = Math.max(numero(z.vidaMax), max);
    const base = numero(z.vidaMax);
    if (!(base > 0)) return;
    const f = preso(numero(vidaAtual) / base, 0, 1);
    const atual = z.vidaMinimaFracao === null || z.vidaMinimaFracao === undefined ? NaN : Number(z.vidaMinimaFracao);
    if (!Number.isFinite(atual) || f < atual) z.vidaMinimaFracao = arred9(f);
}

// Dano que chegou à Vida (bruto, > 0) e a Vida mínima depois dele. `ficha.vida.atual` já é a Vida APÓS o dano. Devolve true se registrou.
export function registrarDanoZenkai(ficha, danoBruto, vidaMaxBruta) {
    const z = telemetriaAberta(ficha);
    if (!z) return false;
    const d = numero(danoBruto);
    if (d > 0) z.danoRecebido = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, numero(z.danoRecebido)) + d);
    atualizarVidaMinima(z, ficha.vida && ficha.vida.atual, vidaMaxBruta);
    return true;
}

// Gasto de Energia (fração da soma dos tetos de energia) no turno corrente. Devolve true se registrou.
export function registrarGastoEnergiaZenkai(ficha, fracao) {
    const z = telemetriaAberta(ficha);
    const f = numero(fracao);
    if (!z || !(f > 0)) return false;
    z.energiaBuffer = Math.max(0, numero(z.energiaBuffer)) + f;
    return true;
}

// Fecha o turno de gasto: o buffer entra em energiaContada limitado a TETO_GASTO_TURNO. Devolve true se havia algo.
export function fecharGastoDoTurnoZenkai(ficha) {
    const z = telemetriaAberta(ficha);
    if (!z) return false;
    const buf = Math.max(0, numero(z.energiaBuffer));
    if (!(buf > 0)) { if (z.energiaBuffer !== 0) z.energiaBuffer = 0; return false; }
    z.energiaContada = Math.max(0, numero(z.energiaContada)) + Math.min(buf, TETO_GASTO_TURNO);
    z.energiaBuffer = 0;
    return true;
}

// Registra o turno do portador. medida = { fadigaPct, formaAtiva, razao (oponente/portador; null = sem oponente), vidaMaxBruta }. Devolve true se registrou.
export function registrarTurnoZenkai(ficha, medida = {}) {
    const z = telemetriaAberta(ficha);
    if (!z) return false;
    const turnos = Math.max(0, Math.floor(numero(z.turnos)));
    if (turnos >= LIMITE_TURNOS_ZENKAI) return false;
    z.turnos = turnos + 1;
    z.fadigaPico = Math.max(preso(numero(z.fadigaPico), 0, 100), preso(numero(medida.fadigaPct), 0, 100));
    if (medida.formaAtiva === true) z.formasTurnos = Math.max(0, Math.floor(numero(z.formasTurnos))) + 1;
    const r = medida.razao === null || medida.razao === undefined || medida.razao === '' ? NaN : Number(medida.razao);
    if (Number.isFinite(r)) {
        z.razaoSoma = arred9(Math.max(0, numero(z.razaoSoma)) + preso(r, 0, RAZAO_OPONENTE_MAX));
        z.razaoTurnos = Math.max(0, Math.floor(numero(z.razaoTurnos))) + 1;
    }
    atualizarVidaMinima(z, ficha.vida && ficha.vida.atual, medida.vidaMaxBruta);
    return true;
}

// Apaga a telemetria (NÃO aplica). Devolve true se havia algo a apagar.
export function zerarZenkai(ficha) {
    const c = ficha && ficha.combate;
    if (!c || c.zenkai === undefined) return false;
    delete c.zenkai;
    return true;
}

// ---------- Cálculo ----------
// Devolve { ativo, turnos, componentes: [{ id, rotulo, valor, peso, contribuicao, detalhe }], score, razaoMedia, semOponente, fatorOponente, teto,
// pontuacaoRef, quaseMorte, pctBruto, pct }. `pct` já limitado ao teto. Sem telemetria/turnos: tudo 0. Nunca lança.
// opcoes.vidaMaxBruta: sobrepõe a Vida máxima guardada na telemetria.
export function calcularZenkai(ficha, opcoes = {}) {
    const cfg = getConfigZenkai(ficha);
    const t = lerTelemetriaZenkai(ficha);
    const vazio = { ativo: false, turnos: 0, componentes: [], score: 0, razaoMedia: null, semOponente: true, fatorOponente: FATOR_OPONENTE_MIN, teto: cfg.teto, pontuacaoRef: cfg.pontuacaoRef, turnosMinimos: cfg.turnosMinimos, fatorDuracao: 0, quaseMorte: false, pctBruto: 0, pct: 0 };
    if (!t || !zenkaiLigado(ficha)) return vazio;
    const vidaMax = Math.max(numero(opcoes.vidaMaxBruta), t.vidaMax);
    const vidaAtual = numero(ficha && ficha.vida && ficha.vida.atual);
    const quaseMorte = t.vidaMinimaFracao !== null && t.vidaMinimaFracao <= LIMIAR_QUASE_MORTE && vidaAtual > 0;
    const energiaTotal = t.energiaContada + Math.min(t.energiaBuffer, TETO_GASTO_TURNO);
    const c = {
        dano: vidaMax > 0 ? preso(t.danoRecebido / vidaMax, 0, 1) : 0,
        energia: preso(energiaTotal, 0, 1),
        fadiga: preso(t.fadigaPico / 100, 0, 1),
        duracao: preso(t.turnos / TURNOS_DURACAO_REF, 0, 1),
        quaseMorte: quaseMorte ? 1 : 0,
        formas: t.turnos > 0 ? preso(t.formasTurnos / t.turnos, 0, 1) : 0,
    };
    const detalhes = {
        dano: `${fmt(c.dano * 100)}% da Vida máxima`,
        energia: `${fmt(c.energia * 100)}% da energia total (máx. ${fmt(TETO_GASTO_TURNO * 100)}% por turno)`,
        fadiga: `pico de ${fmt(t.fadigaPico)}%`,
        duracao: `${t.turnos} ${t.turnos === 1 ? 'turno' : 'turnos'} (cheio com ${TURNOS_DURACAO_REF})`,
        quaseMorte: quaseMorte ? `Vida chegou a ${fmt((t.vidaMinimaFracao || 0) * 100)}% e sobreviveu` : 'não houve',
        formas: `${t.formasTurnos} de ${t.turnos} turnos`,
    };
    const componentes = COMPONENTES_ZENKAI.map(({ id, rotulo }) => ({ id, rotulo, valor: arred4(c[id]), peso: cfg.pesos[id], contribuicao: arred4(cfg.pesos[id] * c[id]), detalhe: detalhes[id] }));
    const score = arred4(componentes.reduce((s, x) => s + x.contribuicao, 0));
    const razaoMedia = t.razaoTurnos > 0 ? t.razaoSoma / t.razaoTurnos : null;
    const semOponente = razaoMedia === null || !Number.isFinite(razaoMedia);
    const fatorOponente = semOponente ? FATOR_OPONENTE_MIN : preso(razaoMedia, FATOR_OPONENTE_MIN, FATOR_OPONENTE_MAX);
    let pctBruto = t.turnos > 0 ? cfg.teto * (score / cfg.pontuacaoRef) * fatorOponente : 0;
    if (!Number.isFinite(pctBruto) || pctBruto < 0) pctBruto = 0;
    // 🛑 Combate curto: o % final é multiplicado por min(1, turnos / turnosMinimos) (padrão 3), além do componente "duração".
    const fatorDuracao = preso(t.turnos / cfg.turnosMinimos, 0, 1);
    const pct = arred4(Math.min(cfg.teto, pctBruto) * fatorDuracao);
    return { ativo: true, turnos: t.turnos, turnosMinimos: cfg.turnosMinimos, fatorDuracao: arred4(fatorDuracao), componentes, score, razaoMedia: semOponente ? null : arred4(razaoMedia), semOponente, fatorOponente: arred4(fatorOponente), teto: cfg.teto, pontuacaoRef: cfg.pontuacaoRef, quaseMorte, pctBruto: arred4(pctBruto), pct };
}

// Frase curta do detalhamento (feed e diálogo): "Dano 40% · Energia 30% · ... · oponente ×1".
export function resumirZenkai(calc) {
    if (!calc || !calc.ativo) return '';
    const partes = calc.componentes.filter(x => x.valor > 0).map(x => `${x.rotulo} ${fmt(x.valor * 100)}%`);
    partes.push(calc.semOponente ? 'sem dados do oponente (×0,1)' : `oponente ×${fmt(calc.fatorOponente)}`);
    if (calc.fatorDuracao < 1) partes.push(`combate curto ×${fmt(calc.fatorDuracao)}`);
    return partes.join(' · ');
}

// Soma pctFinal/100 em ficha.ganhosPermanentes.poderCalculado (modo 'somar'; mesmos limites de converterAdaptacaoEmPermanente). NÃO zera a telemetria.
// pctFinal inválido, <= 0 ou NaN = nada. Devolve { percentual, total } ou null.
export function aplicarZenkaiPermanente(ficha, pctFinal) {
    if (!ficha) return null;
    const bruto = Number(pctFinal);
    if (!Number.isFinite(bruto)) return null;
    const p = Math.max(LIMITE_ADAPTACAO_GANHO_PERC_MIN, Math.min(LIMITE_ADAPTACAO_GANHO_PERC, bruto));
    if (!(p > 0)) return null;
    if (!ficha.ganhosPermanentes || typeof ficha.ganhosPermanentes !== 'object') ficha.ganhosPermanentes = {};
    const atual = Number(ficha.ganhosPermanentes.poderCalculado);
    const base = Number.isFinite(atual) && atual > 0 ? atual : 0;
    const total = arred9(Math.max(0, Math.min(LIMITE_ADAPTACAO_TOTAL_PERMANENTE, base + p / 100)));
    ficha.ganhosPermanentes.poderCalculado = total;
    return { percentual: p, total };
}

// Valor do campo editável do diálogo: vazio/inválido = o sugerido; senão preso a [0, 100] com 4 casas.
export function limitarPctFinalZenkai(v, sugerido = 0) {
    const n = v === '' || v === null || v === undefined ? NaN : Number(v);
    const base = Number.isFinite(n) ? n : numero(sugerido);
    return arred4(preso(base, 0, 100));
}

// Decisão do fim do combate no RASCUNHO. modo: 'converter' (opção desligada: aplica o sugerido), 'liberar' (aplica pctFinal, ou o sugerido se omitido),
// 'recusar' / 'limpar' (descarta). 'adiar' não faz nada. A telemetria sempre zera (exceto 'adiar'). Devolve { aplicou, texto, caminhos }.
export function decidirZenkaiNoFim(ficha, modo, { pctFinal, nome } = {}) {
    const res = { aplicou: null, texto: '', caminhos: [] };
    if (!ficha || modo === 'adiar') return res;
    const tinha = !!(ficha.combate && ficha.combate.zenkai !== undefined);
    if (!tinha) return res;
    const calc = calcularZenkai(ficha);
    if (modo === 'converter' || modo === 'liberar') {
        const pct = modo === 'liberar' && pctFinal !== undefined && pctFinal !== null ? limitarPctFinalZenkai(pctFinal, calc.pct) : calc.pct;
        const r = aplicarZenkaiPermanente(ficha, pct);
        if (r) {
            res.aplicou = r;
            res.caminhos.push(CAMINHO_GANHO_PERMANENTE_PODER);
            res.texto = `🔥 ${nome ? `${nome}: ` : ''}Zenkai +${fmt(r.percentual)}% de Poder permanente (${resumirZenkai(calc)}); total ${fmt(r.total * 100)}%`;
        }
    } else if (calc.ativo && calc.turnos > 0 && modo === 'recusar') {
        res.texto = `❌ ${nome ? `${nome}: ` : ''}Zenkai recusado pelo Mestre`;
    }
    if (zerarZenkai(ficha)) res.caminhos.push(...CAMINHOS_ZENKAI);
    return res;
}

// Campos (caminhos aninhados 'combate/zenkai/<campo>', null apaga) que diferem entre duas telemetrias; só eles vão ao Firebase de OUTRO jogador (evita
// sobrescrever o nó inteiro). Os valores ainda são acumulados sobre o espelho local (sem transação): granular reduz, não elimina, a corrida.
export function camposZenkaiAlterados(antes, depois) {
    const campos = {};
    if (!depois || typeof depois !== 'object') { if (antes) campos['combate/zenkai'] = null; return campos; }
    const a = antes && typeof antes === 'object' ? antes : {};
    Object.keys(depois).forEach((k) => { if (JSON.stringify(a[k]) !== JSON.stringify(depois[k])) campos[`combate/zenkai/${k}`] = depois[k] === undefined ? null : depois[k]; });
    Object.keys(a).forEach((k) => { if (!(k in depois)) campos[`combate/zenkai/${k}`] = null; });
    return campos;
}

// Para gravar a telemetria na ficha de OUTRO jogador sem mutar a cópia local: aplica `registrar(clone)` numa cópia RASA (só vida/combate/combate.zenkai)
// e devolve só os campos alterados (camposZenkaiAlterados) ou null se nada mudou (Zenkai desligado/sem telemetria aberta).
export function zenkaiAposRegistrar(ficha, registrar) {
    try {
        if (!zenkaiLigado(ficha) || !telemetriaAberta(ficha)) return null;
        const clone = { ...ficha, vida: ficha.vida ? { ...ficha.vida } : ficha.vida, combate: { ...ficha.combate, zenkai: { ...ficha.combate.zenkai } } };
        const mudou = registrar(clone);
        if (!mudou) return null;
        const campos = camposZenkaiAlterados(ficha.combate.zenkai, clone.combate.zenkai);
        return Object.keys(campos).length > 0 ? campos : null;
    } catch (e) { return null; }
}

// Primeiro passo do início do turno do portador: abre a telemetria (do zero se `reiniciar`: início do combate; ou se ainda não existe: quem entrou depois)
// ou fecha o gasto do turno anterior. Só com Zenkai ligado. Devolve true se mexeu.
export function abrirTurnoZenkai(ficha, { reiniciar = false } = {}) {
    if (!zenkaiLigado(ficha)) return false;
    if (reiniciar || !telemetriaAberta(ficha)) { iniciarZenkai(ficha); return true; }
    fecharGastoDoTurnoZenkai(ficha);
    return true;
}
