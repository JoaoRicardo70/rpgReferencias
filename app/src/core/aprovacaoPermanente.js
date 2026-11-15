// ==========================================
// ✅ APROVAÇÃO DOS GANHOS PERMANENTES AO ENCERRAR O COMBATE — lógica PURA.
//
// Ao encerrar o combate, o Mestre/Co-Mestre decide se LIBERA ou RECUSA o Poder permanente que a Adaptação / Verg Avesta e seus DERIVADOS
// (qualquer gatilho `ganhoPermanente` com duração permanente, como o Ego Superior) geraram durante a luta.
//   - LIBERAR: fluxo de sempre (a média da Adaptação vira ganho permanente; os derivados ficam como estão).
//   - RECUSAR: o personagem VOLTA ao Poder de antes do combate (a Adaptação zera sem converter e ficha.ganhosPermanentes volta à "foto").
//
// FOTO: ao INICIAR o combate grava-se ficha.combate.ganhosAntesDoCombate = { poderCalculado, fatorPoder } (cópia de ficha.ganhosPermanentes
// naquele instante; 0/1 se ausente). Ela NUNCA entra em cálculo de Poder; é apagada ao fim do combate (liberado ou recusado).
// Quem entra na ordem depois do início NÃO tem foto: nesse caso só a Adaptação é recusável (os derivados dele ficam como estão).
//
// Modos do fimDeLuta (ctx.permanente em core/gatilhosAplicar.js > dispararEventoNaFicha):
//   'converter' = legado (opção desligada): converte a Adaptação sozinho.      'liberar' / 'recusar' = decisão do Mestre.
//   'adiar'     = há combate ativo (ex.: Descansar no meio da luta): não converte, não restaura, não zera; a foto fica.
//   'limpar'    = sem combate ativo: zera a Adaptação sem converter (sobra) e apaga a foto.
//
// A recusa restaura a foto DEPOIS dos gatilhos de fimDeLuta (concluirFim), assim o que um gatilho de fimDeLuta (ex.: Verg) ganhar também some.
// Limitação: um ajuste MANUAL do Mestre em ganhosPermanentes durante o combate também conta como "derivado" e é desfeito na recusa.
// ==========================================
import {
    mediaAdaptacao, getTurnosAdaptacao, getSomaAdaptacao, zerarAdaptacao, converterAdaptacaoEmPermanente,
    CAMINHOS_ADAPTACAO, CAMINHO_GANHO_PERMANENTE_PODER, LIMITE_ADAPTACAO_GANHO_PERC, LIMITE_ADAPTACAO_GANHO_PERC_MIN, LIMITE_ADAPTACAO_TOTAL_PERMANENTE,
} from './adaptacao.js';
import { FATOR_PODER_MAX, FATOR_PODER_MIN } from './poder.js';
import { calcularZenkai, decidirZenkaiNoFim, resumirZenkai } from './zenkai.js';
import { somarPorFonte, registrarHistorico, CAMINHOS_RASTRO } from './ganhosFonte.js';

export const CAMINHO_FOTO_GANHOS = 'combate/ganhosAntesDoCombate';
export const CAMINHO_FATOR_PERMANENTE = 'ganhosPermanentes/fatorPoder';
export const MODOS_FIM_PERMANENTE = ['converter', 'liberar', 'recusar', 'adiar', 'limpar'];
const EPS = 1e-9;

const fmtPerc = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

// Valores atuais de ficha.ganhosPermanentes, saneados (poder >= 0, fator em [FATOR_PODER_MIN, FATOR_PODER_MAX]; ausente/inválido = 0 / 1).
export function lerGanhosPermanentes(ficha) {
    const g = ficha && ficha.ganhosPermanentes;
    const p = Number(g && g.poderCalculado);
    const f = Number(g && g.fatorPoder);
    return {
        poderCalculado: Number.isFinite(p) && p > 0 ? Math.min(LIMITE_ADAPTACAO_TOTAL_PERMANENTE, p) : 0,
        fatorPoder: Number.isFinite(f) && f > 0 ? Math.min(FATOR_PODER_MAX, Math.max(FATOR_PODER_MIN, f)) : 1,
    };
}

// Foto gravada na ficha (saneada) ou null (sem foto / inválida).
export function lerFotoGanhos(ficha) {
    const foto = ficha && ficha.combate && ficha.combate.ganhosAntesDoCombate;
    if (!foto || typeof foto !== 'object') return null;
    return lerGanhosPermanentes({ ganhosPermanentes: foto });
}

// Grava a foto no RASCUNHO. Devolve a foto.
export function fotografarGanhos(ficha) {
    if (!ficha) return null;
    if (!ficha.combate || typeof ficha.combate !== 'object') ficha.combate = {};
    const foto = lerGanhosPermanentes(ficha);
    ficha.combate.ganhosAntesDoCombate = foto;
    return foto;
}

// O que está pendente de aprovação.
// adaptacao: { pct (média das %), turnos, soma } ou null; derivados: { poderCalculado (diferença aditiva), fatorPoder (razão atual/foto) } ou null
// (só com foto e só se algo mudou); zenkai: { pct (sugerido, em %), turnos, score, teto, fatorOponente, semOponente, componentes[], resumo } ou AUSENTE (só com Zenkai
// ligado e ao menos 1 turno do portador; o valor é sugestão e o Mestre pode ajustá-lo). O Zenkai NÃO entra em `derivados` (só é aplicado depois da decisão).
// temPendencia = há alguma das três.
export function calcularPendencias(ficha) {
    const turnos = getTurnosAdaptacao(ficha);
    const media = mediaAdaptacao(ficha);
    let adaptacao = null;
    if (turnos > 0 && media > 0) {
        adaptacao = { pct: Math.min(LIMITE_ADAPTACAO_GANHO_PERC, Math.max(LIMITE_ADAPTACAO_GANHO_PERC_MIN, media)), turnos, soma: getSomaAdaptacao(ficha) };
    }
    let derivados = null;
    const foto = lerFotoGanhos(ficha);
    if (foto) {
        const atual = lerGanhosPermanentes(ficha);
        const dp = atual.poderCalculado - foto.poderCalculado;
        const razao = atual.fatorPoder / foto.fatorPoder;
        const temDp = dp > EPS;
        const temFator = Math.abs(razao - 1) > EPS;
        if (temDp || temFator) derivados = { poderCalculado: temDp ? dp : 0, fatorPoder: temFator ? razao : 1 };
    }
    let zenkai = null;
    try {
        const z = calcularZenkai(ficha);
        if (z.ativo && z.turnos > 0) zenkai = { pct: z.pct, turnos: z.turnos, score: z.score, teto: z.teto, fatorOponente: z.fatorOponente, fatorDuracao: z.fatorDuracao, turnosMinimos: z.turnosMinimos, semOponente: z.semOponente, componentes: z.componentes, resumo: resumirZenkai(z) };
    } catch (e) { zenkai = null; }
    return { temPendencia: !!adaptacao || !!derivados || !!zenkai, adaptacao, derivados, ...(zenkai ? { zenkai } : {}) };
}

// Frase curta dos valores pendentes (para o diálogo e o feed), ex.: "+15% (Adaptação) · +50% (derivados)".
export function descreverPendencias(p) {
    const partes = [];
    if (p && p.adaptacao) partes.push(`+${fmtPerc(p.adaptacao.pct)}% (Adaptação)`);
    if (p && p.derivados) {
        const pc = p.derivados.poderCalculado > 0 ? p.derivados.poderCalculado * 100 : 0;
        if (pc > 0) partes.push(`+${fmtPerc(pc)}% (derivados)`);
        if (p.derivados.fatorPoder !== 1) partes.push(`×${fmtPerc(p.derivados.fatorPoder)} (derivados)`);
    }
    return partes.join(' · ');
}

const estadoAdaptacao = (ficha) => JSON.stringify(ficha && ficha.combate && [ficha.combate.adaptacaoFator, ficha.combate.adaptacaoSoma, ficha.combate.adaptacaoTurnos, ficha.combate.adaptacaoUltimo]);

function apagarFoto(ficha, caminhos) {
    if (ficha && ficha.combate && ficha.combate.ganhosAntesDoCombate !== undefined) { delete ficha.combate.ganhosAntesDoCombate; caminhos.add(CAMINHO_FOTO_GANHOS); }
}

// ---------- Decisão POR FONTE ----------
// Fontes decididas separadamente no diálogo: Adaptação, Zenkai e Derivados (gatilhos; o que mudou em ganhosPermanentes desde a foto).
export const FONTES_DECISAO = ['adaptacao', 'zenkai', 'derivados'];

// Decisões completas { adaptacao, zenkai, derivados } ('liberar'|'recusar'). `decisao` pode ser 'liberar'/'recusar' (vale para as três) ou um objeto parcial
// (a fonte ausente cai em 'liberar'). Qualquer outra coisa = tudo 'liberar'.
export function normalizarDecisoes(decisao) {
    if (decisao === 'recusar') return { adaptacao: 'recusar', zenkai: 'recusar', derivados: 'recusar' };
    const o = decisao && typeof decisao === 'object' ? decisao : {};
    return Object.fromEntries(FONTES_DECISAO.map(f => [f, o[f] === 'recusar' ? 'recusar' : 'liberar']));
}

// Modo efetivo de UMA fonte. Só 'liberar'/'recusar' (decisão do Mestre) consultam `fontes`; 'converter' (opção desligada) e 'limpar' valem para todas.
function modoDaFonte(modo, fontes, fonte) {
    if (modo !== 'liberar' && modo !== 'recusar') return modo;
    if (modo === 'recusar' && !fontes) return 'recusar';
    return fontes && fontes[fonte] === 'recusar' ? 'recusar' : (fontes && fontes[fonte] === 'liberar' ? 'liberar' : modo);
}

// Fase 1 (ANTES dos gatilhos de fimDeLuta): trata Adaptação e Zenkai, cada um pela sua decisão. Devolve { textos, partes, textosZenkai, caminhos, pendencias, aplicados }.
// `partes` = frases curtas por fonte para o feed ("✅ Adaptação +15%", "🔥 Zenkai +3% (...)", "❌ Zenkai recusado"); `aplicados.poderCalculado` = fração somada agora
// (a fase 2 precisa dela para restaurar os derivados à foto SEM perder o que foi liberado).
// `fontes` ({ adaptacao, zenkai, derivados } = 'liberar'|'recusar', com modo 'liberar'); `zenkaiPct` (em %): valor final do Zenkai ajustado pelo Mestre; ausente = o sugerido.
export function iniciarFim(ficha, modo, { nome, zenkaiPct, nomeZenkai, fontes, cena, rodada } = {}) {
    const res = { textos: [], partes: [], textosZenkai: [], caminhos: [], pendencias: calcularPendencias(ficha), aplicados: { poderCalculado: 0 } };
    if (!ficha || !MODOS_FIM_PERMANENTE.includes(modo) || modo === 'adiar') return res;
    const caminhos = new Set();
    const antes = estadoAdaptacao(ficha);
    const pa = res.pendencias.adaptacao;
    const mA = modoDaFonte(modo, fontes, 'adaptacao');
    if (mA === 'converter' || mA === 'liberar') {
        const r = converterAdaptacaoEmPermanente(ficha, { cena, rodada });
        if (r) { caminhos.add(CAMINHO_GANHO_PERMANENTE_PODER); res.aplicados.poderCalculado += r.delta; res.partes.push(`✅ Adaptação +${fmtPerc(r.percentual)}%`); }
    } else {
        // 'recusar' e 'limpar': zera SEM converter.
        zerarAdaptacao(ficha);
        if (mA === 'recusar' && pa) {
            res.partes.push('❌ Adaptação recusada');
            registrarHistorico(ficha, { fonte: 'adaptacao', pct: pa.pct, decisao: 'recusado', cena, rodada });
        }
    }
    if (estadoAdaptacao(ficha) !== antes) CAMINHOS_ADAPTACAO.forEach(c => caminhos.add(c));
    // 💥 Zenkai: 'converter' aplica o sugerido, 'liberar' o valor do Mestre (ou o sugerido), 'recusar'/'limpar' descartam; a telemetria sempre zera.
    // Soma p/100 em poderCalculado como a Adaptação (aditivo: a ordem entre as duas não importa).
    try {
        const mZ = modoDaFonte(modo, fontes, 'zenkai');
        const z = decidirZenkaiNoFim(ficha, mZ, { pctFinal: zenkaiPct, nome: nomeZenkai, cena, rodada });
        if (z.texto) res.textosZenkai.push(z.texto);
        if (z.aplicou) res.aplicados.poderCalculado += z.aplicou.delta;
        if (z.parte) res.partes.push(z.parte); else if (z.recusado) res.partes.push('❌ Zenkai recusado');
        z.caminhos.forEach(c => caminhos.add(c));
    } catch (e) { console.error('Zenkai no fim do combate falhou', e); }
    if (res.aplicados.poderCalculado > 0 || res.partes.length > 0) CAMINHOS_RASTRO.forEach(c => caminhos.add(c));
    res.caminhos = [...caminhos];
    return res;
}

// Fase 2 (DEPOIS dos gatilhos de fimDeLuta): a decisão sobre os DERIVADOS. Recusar restaura os ganhos permanentes à foto MAIS o que a fase 1 acabou de liberar
// (Adaptação/Zenkai: `aplicados`), então "restaurar derivados e SÓ DEPOIS somar o liberado" nunca perde nem duplica; porFonte.gatilhos cai do mesmo tanto.
// Todo modo que encerra a luta apaga a foto. `pendencias` = as da fase 1. Devolve { textos, partes, caminhos }.
export function concluirFim(ficha, modo, { nome, pendencias, fontes, aplicados, cena, rodada } = {}) {
    const res = { textos: [], partes: [], caminhos: [] };
    if (!ficha || !MODOS_FIM_PERMANENTE.includes(modo) || modo === 'adiar') return res;
    const caminhos = new Set();
    const somado = Math.max(0, Number(aplicados && aplicados.poderCalculado) || 0);
    const mD = modoDaFonte(modo, fontes, 'derivados');
    const foto = lerFotoGanhos(ficha);
    if ((mD === 'recusar' || mD === 'liberar') && foto) {
        const atual = lerGanhosPermanentes(ficha);
        const alvoP = foto.poderCalculado + somado;
        const dpAtual = atual.poderCalculado - alvoP; // o que os gatilhos ganharam (derivados)
        const razaoF = atual.fatorPoder / foto.fatorPoder;
        const mudouP = Math.abs(dpAtual) > EPS;
        const mudouF = Math.abs(razaoF - 1) > EPS;
        const notaFator = mudouF ? `fator ×${fmtPerc(razaoF)}` : undefined;
        if (mD === 'recusar') {
            if (mudouP || mudouF) {
                if (!ficha.ganhosPermanentes || typeof ficha.ganhosPermanentes !== 'object') ficha.ganhosPermanentes = {};
                if (mudouP) {
                    ficha.ganhosPermanentes.poderCalculado = alvoP; caminhos.add(CAMINHO_GANHO_PERMANENTE_PODER);
                    if (dpAtual > 0) somarPorFonte(ficha, 'gatilhos', -dpAtual);
                }
                if (mudouF) { ficha.ganhosPermanentes.fatorPoder = foto.fatorPoder; caminhos.add(CAMINHO_FATOR_PERMANENTE); }
                registrarHistorico(ficha, { fonte: 'gatilhos', pct: Math.max(0, dpAtual) * 100, decisao: 'recusado', cena, rodada, nota: notaFator });
            }
            const p = pendencias || { temPendencia: false };
            if (p.derivados || mudouP || mudouF) res.partes.push('❌ Derivados recusados');
        } else if (dpAtual > EPS || mudouF) {
            registrarHistorico(ficha, { fonte: 'gatilhos', pct: Math.max(0, dpAtual) * 100, decisao: 'liberado', cena, rodada, nota: notaFator });
            res.partes.push(`✅ Derivados${dpAtual > EPS ? ` +${fmtPerc(dpAtual * 100)}%` : ''}${mudouF ? ` ×${fmtPerc(razaoF)}` : ''}`);
        }
    }
    apagarFoto(ficha, caminhos);
    if (caminhos.has(CAMINHO_GANHO_PERMANENTE_PODER) || res.partes.length > 0) CAMINHOS_RASTRO.forEach(c => caminhos.add(c));
    res.caminhos = [...caminhos];
    return res;
}

// Decisão completa no RASCUNHO (fase 1 + fase 2 em seguida). decisao: 'liberar' | 'recusar' (todas as fontes) ou { adaptacao, zenkai, derivados } por fonte.
// Devolve { textos, partes, textosZenkai, caminhos, pendencias }. Funções puras: nenhuma I/O; quem grava no Firebase usa os `caminhos` (core/gatilhosAplicar.js > camposParaGravar).
export function aplicarDecisao(ficha, decisao, opcoes = {}) {
    const fontes = normalizarDecisoes(decisao);
    const modo = FONTES_DECISAO.every(f => fontes[f] === 'recusar') ? 'recusar' : 'liberar';
    const a = iniciarFim(ficha, modo, { ...opcoes, fontes });
    const b = concluirFim(ficha, modo, { ...opcoes, fontes, pendencias: a.pendencias, aplicados: a.aplicados });
    return { textos: [...a.textos, ...b.textos], partes: [...a.partes, ...b.partes], textosZenkai: a.textosZenkai, caminhos: [...new Set([...a.caminhos, ...b.caminhos])], pendencias: a.pendencias };
}

// Opção do Mestre/Co-Mestre (cenario.aprovarGanhosPermanentes). AUSENTE = LIGADA (padrão); só `false` desliga.
export function aprovarGanhosPermanentesLigado(cenario) {
    return !(cenario && cenario.aprovarGanhosPermanentes === false);
}

// Novo cenário (cópia) com a opção ligada/desligada. Ligada = remove a chave (padrão); desligada = grava false.
export function cenarioComAprovacao(cenario, ligado) {
    const novo = JSON.parse(JSON.stringify(cenario || {}));
    if (ligado) delete novo.aprovarGanhosPermanentes; else novo.aprovarGanhosPermanentes = false;
    return novo;
}
