// ==========================================
// ⏳ DURAÇÃO DOS ESTADOS EM TURNOS — lógica pura. A ficha guarda `duracaoEstados: { [idDoEstado]: turnosRestantes }` (inteiro de 1 a 99).
// Estado SEM entrada aqui é permanente (só sai à mão ou por remoção), como sempre foi. A conta imita a dos buffs temporários
// (core/suporte.js > passarTurnoDosBuffs): conta os turnos do PRÓPRIO portador, desce no FIM do turno dele (encerrarDuracaoDeEstados, em avancarTurno, depois do gatilho turnoFim; por isso um estado aplicado por um gatilho turnoFim com duração 1 já expira ali mesmo)
// e, ao chegar a 0, o estado sai por completo (todos os stacks).
// Regras de (re)aplicação: estado novo com duração entra com ela; reaplicar um estado já com prazo renova para o MAIOR entre o
// que resta e o novo; reaplicar SEM duração (permanente) torna o estado permanente; estado permanente que recebe um prazo continua permanente.
// Os estados de condicoes.js não conhecem a duração: aqui só se mexe em `condicoes` através de condicoes.js.
// ==========================================
import { ehEstadoValido, condicoesDaFicha, aplicarEstadoNaFicha, tirarEstado, nomeDoEstado, iconeDoEstado, MAX_STACKS } from './condicoes.js';

export const DURACAO_ESTADO_MAX = 99;
export const LIMITES_DURACAO_DADO = { qtdMax: 20, facesMax: 100, bonusMax: 99 };

// Turnos inteiros de 1 a 99 (acima de 99 vira 99); null se vazio, zero, negativo ou inválido.
export function normalizarDuracao(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    const i = Math.floor(n);
    if (i < 1) return null;
    return Math.min(DURACAO_ESTADO_MAX, i);
}

const RE_DADO = /^\s*(\d{1,2})\s*d\s*(\d{1,3})\s*(?:\+\s*(\d{1,3}))?\s*$/i;

// Aceita número (1 a 99) OU dado 'NdM' / 'NdM+K' (guardado em forma canônica, sorteado só ao aplicar). Devolve número, texto ou null.
export function normalizarDuracaoSpec(v) {
    if (typeof v === 'string') {
        const m = RE_DADO.exec(v);
        if (m) {
            const qtd = Number(m[1]); const faces = Number(m[2]); const bonus = Number(m[3] || 0);
            if (qtd < 1 || qtd > LIMITES_DURACAO_DADO.qtdMax || faces < 1 || faces > LIMITES_DURACAO_DADO.facesMax || bonus > LIMITES_DURACAO_DADO.bonusMax) return null;
            return `${qtd}d${faces}${bonus > 0 ? `+${bonus}` : ''}`;
        }
    }
    return normalizarDuracao(v);
}

// Sorteia a duração de um spec (número ou dado) com o rng injetável (0 a <1). Resultado 1 a 99, ou null se o spec for inválido.
export function sortearDuracao(spec, rng = Math.random) {
    const s = normalizarDuracaoSpec(spec);
    if (s === null) return null;
    if (typeof s === 'number') return s;
    const m = RE_DADO.exec(s);
    let total = Number(m[3] || 0);
    for (let i = 0; i < Number(m[1]); i++) total += Math.floor(rng() * Number(m[2])) + 1;
    return normalizarDuracao(total);
}

// Texto do spec para a UI e o feed: 3 -> "3 turnos", "1d12+1" -> "1d12+1 turnos".
export function descreverDuracaoSpec(spec) {
    const s = normalizarDuracaoSpec(spec);
    if (s === null) return '';
    return typeof s === 'number' ? `${s} ${s === 1 ? 'turno' : 'turnos'}` : `${s} turnos`;
}

export const rotuloDuracao = (n) => { const d = normalizarDuracao(n); return d === null ? '' : `⏳ ${d} ${d === 1 ? 'turno' : 'turnos'}`; };

// Mapa limpo { id: turnos }: só ids de estado válidos que estão ATIVOS na ficha, turnos inteiros de 1 a 99.
export function duracoesDaFicha(ficha) {
    const bruto = ficha && ficha.duracaoEstados;
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
    const ativos = new Set(condicoesDaFicha(ficha).map(c => c.id));
    const saida = {};
    Object.keys(bruto).forEach((id) => {
        if (!ehEstadoValido(id) || !ativos.has(id)) return;
        const n = normalizarDuracao(bruto[id]);
        if (n !== null) saida[id] = n;
    });
    return saida;
}

export const duracaoDe = (ficha, id) => duracoesDaFicha(ficha)[id] || 0;

// Lista para a UI: [{ id, nome, icone, restantes, rotulo }] na ordem dos estados da ficha.
export function listarDuracoes(ficha) {
    const mapa = duracoesDaFicha(ficha);
    return condicoesDaFicha(ficha).filter(c => mapa[c.id]).map(c => ({ id: c.id, nome: nomeDoEstado(c.id), icone: iconeDoEstado(c.id), restantes: mapa[c.id], rotulo: rotuloDuracao(mapa[c.id]) }));
}

// Grava o mapa na ficha (rascunho Immer ou cópia solta); mapa vazio apaga a chave.
function gravarMapa(ficha, mapa) {
    if (Object.keys(mapa).length === 0) delete ficha.duracaoEstados; else ficha.duracaoEstados = mapa;
}

// Mapa novo depois de (re)aplicar `id` com `novo` (turnos ou null = permanente). `existia`: o estado já estava na ficha. Não muta nada.
export function somarDuracao(mapa, id, novo, existia) {
    const saida = { ...(mapa || {}) };
    const n = normalizarDuracao(novo);
    const atual = saida[id];
    if (!existia) { if (n !== null) saida[id] = n; else delete saida[id]; return saida; }
    if (n === null) { delete saida[id]; return saida; } // reaplicado sem prazo: fica permanente
    if (atual === undefined) return saida; // já era permanente: continua
    saida[id] = Math.max(atual, n);
    return saida;
}

// Aplica o estado (soma stacks) e cuida da duração. `duracao`: turnos já sorteados (número) ou nada = permanente. Muta a ficha.
export function aplicarEstadoComDuracao(ficha, id, stacks = 1, fonte = '', duracao = null) {
    if (!ficha || !ehEstadoValido(id)) return;
    const existia = condicoesDaFicha(ficha).some(c => c.id === id);
    const mapa = duracoesDaFicha(ficha);
    aplicarEstadoNaFicha(ficha, id, stacks, fonte);
    gravarMapa(ficha, somarDuracao(mapa, id, duracao, existia));
}

// Tira da duração o que não está mais ativo (chame depois de mexer em `condicoes` à mão ou por remoção). Devolve true se algo mudou.
export function sincronizarDuracoes(ficha) {
    if (!ficha || ficha.duracaoEstados === undefined) return false;
    const antes = JSON.stringify(ficha.duracaoEstados);
    gravarMapa(ficha, duracoesDaFicha(ficha));
    return JSON.stringify(ficha.duracaoEstados) !== antes;
}

// Apaga toda a duração (limpar condições).
export function limparDuracoes(ficha) {
    if (!ficha || ficha.duracaoEstados === undefined) return false;
    delete ficha.duracaoEstados;
    return true;
}

// Edição manual: define os turnos do estado ATIVO (null/vazio = permanente). Estado que não está na ficha não ganha prazo. Devolve true se mudou.
export function definirDuracaoManual(ficha, id, turnos) {
    if (!ficha || !ehEstadoValido(id) || !condicoesDaFicha(ficha).some(c => c.id === id)) return false;
    const mapa = duracoesDaFicha(ficha);
    const antes = mapa[id];
    const n = normalizarDuracao(turnos);
    if (n === null) delete mapa[id]; else mapa[id] = n;
    if (mapa[id] === antes) return false;
    gravarMapa(ficha, mapa);
    return true;
}

// Remove o estado por inteiro (todos os stacks) e a duração dele. Devolve true se mudou.
export function removerEstadoComDuracao(ficha, id) {
    if (!ficha) return false;
    const antes = JSON.stringify(ficha.condicoes || []);
    const lista = tirarEstado(ficha.condicoes, id, MAX_STACKS);
    if (JSON.stringify(lista) === antes) return false;
    if (lista.length === 0) delete ficha.condicoes; else ficha.condicoes = lista;
    sincronizarDuracoes(ficha);
    return true;
}

// Fim do turno do dono: cada estado com prazo perde 1 turno; os que chegam a 0 saem por completo.
// Muta a ficha. Devolve { expirados: [ids], textos: ['⛓️ Imobilizado terminou'], mudou }.
export function passarTurnoDosEstados(ficha) {
    const vazio = { expirados: [], textos: [], mudou: false };
    if (!ficha || !ficha.duracaoEstados) return vazio;
    const mapa = duracoesDaFicha(ficha);
    const ids = Object.keys(mapa);
    if (ids.length === 0) { const mudou = sincronizarDuracoes(ficha); return { ...vazio, mudou }; }
    const expirados = [];
    ids.forEach((id) => {
        if (mapa[id] - 1 <= 0) { expirados.push(id); delete mapa[id]; } else mapa[id] -= 1;
    });
    let lista = condicoesDaFicha(ficha);
    expirados.forEach((id) => { lista = tirarEstado(lista, id, MAX_STACKS); });
    if (expirados.length > 0) { if (lista.length === 0) delete ficha.condicoes; else ficha.condicoes = lista; }
    gravarMapa(ficha, mapa);
    return { expirados, textos: expirados.map(id => `${iconeDoEstado(id)} ${nomeDoEstado(id)} terminou`), mudou: true };
}
