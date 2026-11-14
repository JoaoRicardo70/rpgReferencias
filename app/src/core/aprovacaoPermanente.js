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
    mediaAdaptacao, getTurnosAdaptacao, getSomaAdaptacao, zerarAdaptacao, converterAdaptacaoEmPermanente, textoConversaoAdaptacao,
    CAMINHOS_ADAPTACAO, CAMINHO_GANHO_PERMANENTE_PODER, LIMITE_ADAPTACAO_GANHO_PERC, LIMITE_ADAPTACAO_GANHO_PERC_MIN, LIMITE_ADAPTACAO_TOTAL_PERMANENTE,
} from './adaptacao.js';
import { FATOR_PODER_MAX, FATOR_PODER_MIN } from './poder.js';
import { calcularZenkai, decidirZenkaiNoFim, resumirZenkai } from './zenkai.js';

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

// Fase 1 (ANTES dos gatilhos de fimDeLuta): trata a Adaptação. Devolve { textos, caminhos, pendencias }.
// `zenkaiPct` (modo 'liberar'): valor final do Zenkai (em %) ajustado pelo Mestre; ausente = o sugerido. `textosZenkai`: frases próprias do Zenkai (o feed as mostra à parte).
export function iniciarFim(ficha, modo, { nome, zenkaiPct, nomeZenkai } = {}) {
    const res = { textos: [], textosZenkai: [], caminhos: [], pendencias: calcularPendencias(ficha) };
    if (!ficha || !MODOS_FIM_PERMANENTE.includes(modo) || modo === 'adiar') return res;
    const caminhos = new Set();
    const antes = estadoAdaptacao(ficha);
    if (modo === 'converter' || modo === 'liberar') {
        const r = converterAdaptacaoEmPermanente(ficha);
        if (r) caminhos.add(CAMINHO_GANHO_PERMANENTE_PODER);
        if (modo === 'converter') { if (r) res.textos.push(textoConversaoAdaptacao(r)); }
        else if (res.pendencias.adaptacao || res.pendencias.derivados) {
            res.textos.push(`✅ ${nome ? `${nome}: ` : ''}ganho permanente liberado: ${descreverPendencias(res.pendencias)}`);
        }
    } else {
        // 'recusar' e 'limpar': zera SEM converter.
        zerarAdaptacao(ficha);
    }
    if (estadoAdaptacao(ficha) !== antes) CAMINHOS_ADAPTACAO.forEach(c => caminhos.add(c));
    // 💥 Zenkai: 'converter' aplica o sugerido, 'liberar' o valor do Mestre (ou o sugerido), 'recusar'/'limpar' descartam; a telemetria sempre zera.
    // Soma p/100 em poderCalculado como a Adaptação (aditivo: a ordem entre as duas não importa).
    try {
        const z = decidirZenkaiNoFim(ficha, modo, { pctFinal: zenkaiPct, nome: nomeZenkai });
        if (z.texto) res.textosZenkai.push(z.texto);
        z.caminhos.forEach(c => caminhos.add(c));
    } catch (e) { console.error('Zenkai no fim do combate falhou', e); }
    res.caminhos = [...caminhos];
    return res;
}

// Fase 2 (DEPOIS dos gatilhos de fimDeLuta): recusar restaura os ganhos permanentes à foto; todo modo que encerra a luta apaga a foto.
// `pendencias` = as da fase 1 (para o texto). Devolve { textos, caminhos }.
export function concluirFim(ficha, modo, { nome, pendencias } = {}) {
    const res = { textos: [], caminhos: [] };
    if (!ficha || !MODOS_FIM_PERMANENTE.includes(modo) || modo === 'adiar') return res;
    const caminhos = new Set();
    if (modo === 'recusar') {
        const foto = lerFotoGanhos(ficha);
        if (foto) {
            const atual = lerGanhosPermanentes(ficha);
            const mudouP = Math.abs(atual.poderCalculado - foto.poderCalculado) > EPS;
            const mudouF = Math.abs(atual.fatorPoder - foto.fatorPoder) > EPS;
            if (mudouP || mudouF) {
                if (!ficha.ganhosPermanentes || typeof ficha.ganhosPermanentes !== 'object') ficha.ganhosPermanentes = {};
                if (mudouP) { ficha.ganhosPermanentes.poderCalculado = foto.poderCalculado; caminhos.add(CAMINHO_GANHO_PERMANENTE_PODER); }
                if (mudouF) { ficha.ganhosPermanentes.fatorPoder = foto.fatorPoder; caminhos.add(CAMINHO_FATOR_PERMANENTE); }
            }
        }
        const p = pendencias || { temPendencia: false };
        const mudou = caminhos.size > 0;
        if (p.adaptacao || p.derivados || mudou) res.textos.push(`❌ ${nome ? `${nome}: ` : ''}o Mestre recusou os ganhos permanentes deste combate; Poder volta ao de antes`);
    }
    apagarFoto(ficha, caminhos);
    res.caminhos = [...caminhos];
    return res;
}

// Decisão completa no RASCUNHO (fase 1 + fase 2 em seguida). decisao: 'liberar' | 'recusar'. Devolve { textos, caminhos, pendencias }.
// Funções puras: nenhuma I/O; quem grava no Firebase usa os `caminhos` (core/gatilhosAplicar.js > camposParaGravar).
export function aplicarDecisao(ficha, decisao, opcoes = {}) {
    const modo = decisao === 'recusar' ? 'recusar' : 'liberar';
    const a = iniciarFim(ficha, modo, opcoes);
    const b = concluirFim(ficha, modo, { ...opcoes, pendencias: a.pendencias });
    return { textos: [...a.textos, ...b.textos], textosZenkai: a.textosZenkai, caminhos: [...new Set([...a.caminhos, ...b.caminhos])], pendencias: a.pendencias };
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
