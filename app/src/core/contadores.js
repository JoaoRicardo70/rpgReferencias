// ==========================================
// 🔢 CONTADORES — lógica pura. Um contador manual da ficha (ex.: "Arco de Conversão" 0–5, "Poeira acumulada", stacks próprios):
//   ficha.contadores = [{ id, nome, valor, min, max, poderId?, reset? }]
// reset: 'cena' = volta ao mínimo ao fim do combate/cena (fimDeLuta, descansar); ausente = permanente (padrão; sem campo no Firebase).
// Com `poderId` apontando para um Poder com Estágios, o valor comanda o estágio dele: estágio = valor + 1 (valor 0 = estágio 1).
// Só UM contador comanda o estágio de um poder: o primeiro vinculado a ele (ordem de ficha.contadores); os demais não mexem no estágio.
// O estágio só é sincronizado quando o VALOR muda de fato (nunca ao editar nome/limites/reinício). Ao criar/vincular o comandante,
// o valor inicial vira estágioAtual − 1 (preso a min/max) em vez de forçar o estágio.
// Muda quando a pessoa mexe e também por gatilhos automáticos (core/gatilhos.js, ação `contador`) e pelo reset de cena.
// ==========================================
import { temEstagios, limitarEstagio, getEstagioAtual } from './estagios.js';
import { capturarMaximosAtuais, rescalarVitaisProporcional } from './vitals.js';

export const LIMITE_CONTADORES = 12;
export const LIMITE_VALOR_CONTADOR = 9999;
const LIMITE_NOME = 40;
export const RESETS_CONTADOR = [
    { id: 'permanente', rotulo: 'Permanente' },
    { id: 'cena', rotulo: 'Zera ao fim da cena/combate' },
];

const inteiro = (v, padrao) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? n : padrao;
};
const preso = (n) => Math.max(-LIMITE_VALOR_CONTADOR, Math.min(LIMITE_VALOR_CONTADOR, n));

// Contador limpo: min <= max, valor dentro de [min, max]. Sem nome vira "Contador".
export function normalizarContador(c) {
    if (!c || typeof c !== 'object') return null;
    let min = preso(inteiro(c.min, 0));
    let max = preso(inteiro(c.max, 10));
    if (max < min) [min, max] = [max, min];
    const valor = Math.max(min, Math.min(max, preso(inteiro(c.valor, min))));
    const saida = { id: String(c.id ?? ''), nome: String(c.nome ?? '').trim().slice(0, LIMITE_NOME) || 'Contador', valor, min, max };
    if (c.poderId !== undefined && c.poderId !== null && c.poderId !== '') saida.poderId = c.poderId;
    if (c.reset === 'cena') saida.reset = 'cena';
    return saida;
}

// Id novo e estável de contador (também usado pelos contadores do rascunho de um poder, antes de gravar).
export const novoIdContador = () => `ct_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

export const listaDeContadores = (ficha) => (ficha && Array.isArray(ficha.contadores) ? ficha.contadores.filter(c => c && typeof c === 'object') : []);

// Estágio que um valor do contador representa (valor 0 = estágio 1).
export const estagioDoValor = (valor) => Math.max(1, inteiro(valor, 0) + 1);

// Põe o Poder no estágio `n` (limitado ao que ele tem), sem drenar Vida/Energia. Use dentro de updateFicha.
// Devolve true se mudou algo.
export function definirEstagio(ficha, poderId, n) {
    if (!ficha) return false;
    const p = (ficha.poderes || []).find(po => po && String(po.id) === String(poderId));
    if (!p || !temEstagios(p)) return false;
    const alvo = limitarEstagio(p, n);
    if (p.estagioAtual === alvo) return false;
    const oldM = capturarMaximosAtuais(ficha);
    p.estagioAtual = alvo;
    rescalarVitaisProporcional(ficha, oldM);
    return true;
}

const poderDaFicha = (ficha, poderId) => (ficha && Array.isArray(ficha.poderes) ? ficha.poderes : []).find(po => po && String(po.id) === String(poderId));
const temPoderId = (c) => !!c && c.poderId !== undefined && c.poderId !== null && c.poderId !== '';

// O contador que comanda o estágio do poder: o primeiro vinculado a ele, se o poder tem Estágios. null se não houver.
export function contadorComandante(ficha, poderId) {
    if (!ficha || poderId === undefined || poderId === null || poderId === '') return null;
    const p = poderDaFicha(ficha, poderId);
    if (!p || !temEstagios(p)) return null;
    return listaDeContadores(ficha).find(c => temPoderId(c) && String(c.poderId) === String(poderId)) || null;
}
const ehComandante = (ficha, contador) => {
    if (!temPoderId(contador)) return false;
    const p = poderDaFicha(ficha, contador.poderId);
    if (!p || !temEstagios(p)) return false;
    const cmd = contadorComandante(ficha, contador.poderId);
    return !cmd || String(cmd.id) === String(contador.id); // contador ainda fora da lista e sem outro vinculado: comanda
};

// Se o contador é o comandante do estágio de um Poder com Estágios, aplica o estágio do valor atual. Use dentro de updateFicha.
export function sincronizarEstagioDoContador(ficha, contador) {
    if (!ehComandante(ficha, contador)) return false;
    return definirEstagio(ficha, contador.poderId, estagioDoValor(contador.valor));
}

// Contador recém-criado/vinculado que virou comandante: o VALOR passa a refletir o estágio atual do poder (estágio − 1, preso a min/max).
// Não mexe no estágio. Muta `contador` (que deve estar em ficha.contadores). Devolve true se o valor mudou.
export function adotarEstagioDoPoder(ficha, contador) {
    if (!ehComandante(ficha, contador)) return false;
    const p = poderDaFicha(ficha, contador.poderId);
    const alvo = Math.max(contador.min, Math.min(contador.max, getEstagioAtual(p) - 1));
    if (alvo === contador.valor) return false;
    contador.valor = alvo;
    return true;
}

// Todas as mutações abaixo trabalham no RASCUNHO (dentro de updateFicha) e devolvem true se mudaram algo.
// Devolve false se o limite de contadores foi atingido (nada é alterado). Aceita `reset: 'cena'`.
export function adicionarContador(ficha, { id, nome = 'Contador', min = 0, max = 5, poderId, reset } = {}) {
    if (!ficha) return false;
    if (!Array.isArray(ficha.contadores)) ficha.contadores = [];
    if (ficha.contadores.length >= LIMITE_CONTADORES) return false;
    const novo = normalizarContador({ id: id ?? novoIdContador(), nome, valor: min, min, max, poderId, reset });
    ficha.contadores.push(novo);
    adotarEstagioDoPoder(ficha, novo);
    return true;
}

export function removerContador(ficha, id) {
    if (!ficha || !Array.isArray(ficha.contadores)) return false;
    const antes = ficha.contadores.length;
    ficha.contadores = ficha.contadores.filter(c => !c || String(c.id) !== String(id));
    return ficha.contadores.length !== antes;
}

// Muda campos (nome, min, max, valor, poderId, reset) e re-normaliza. O estágio só é reaplicado quando o VALOR mudou de fato
// (e o contador é o comandante); vincular a um poder com Estágios adota o estágio atual dele como valor.
export function atualizarContador(ficha, id, patch) {
    if (!ficha || !Array.isArray(ficha.contadores)) return false;
    const i = ficha.contadores.findIndex(c => c && String(c.id) === String(id));
    if (i < 0) return false;
    const mescla = { ...ficha.contadores[i], ...patch };
    if (patch && 'poderId' in patch && (patch.poderId === '' || patch.poderId == null)) delete mescla.poderId;
    const antes = ficha.contadores[i];
    const novo = normalizarContador(mescla);
    ficha.contadores[i] = novo;
    const mudouPoder = String(antes.poderId ?? '') !== String(novo.poderId ?? '');
    if (patch && 'valor' in patch && novo.valor !== antes.valor) sincronizarEstagioDoContador(ficha, novo); // valor explícito manda no estágio
    else if (mudouPoder) adotarEstagioDoPoder(ficha, novo);
    return true;
}

// +1 / −1 (ou qualquer delta), parando nos limites.
export function mudarContador(ficha, id, delta) {
    const c = listaDeContadores(ficha).find(x => String(x.id) === String(id));
    if (!c) return false;
    const novoValor = Math.max(c.min, Math.min(c.max, inteiro(c.valor, c.min) + inteiro(delta, 0)));
    if (novoValor === c.valor) return false;
    return atualizarContador(ficha, id, { valor: novoValor });
}

// Fim da cena/combate: os contadores com reset 'cena' voltam ao mínimo; os permanentes ficam. Trabalha no RASCUNHO e devolve os ÍNDICES alterados.
export function resetarContadoresDeCena(ficha) {
    const indices = [];
    if (!ficha || !Array.isArray(ficha.contadores)) return indices;
    ficha.contadores.forEach((c, i) => {
        if (!c || c.reset !== 'cena') return;
        const minimo = inteiro(c.min, 0);
        if (inteiro(c.valor, minimo) === minimo) return;
        if (atualizarContador(ficha, c.id, { valor: minimo })) indices.push(i);
    });
    return indices;
}

// ===== Contadores DENTRO de um poder (Habilidade/Forma/Poder/qualquer categoria) =====
// O contador pertence a um poder pelo `poderId`. No formulário do poder ele vive no RASCUNHO
// (`contadoresRascunho`: [{ id, nome, min, max, reset? }], sem valor) e só vai para ficha.contadores junto com o poder.

export const contadoresDoPoder = (ficha, poderId) => (poderId === undefined || poderId === null || poderId === ''
    ? [] : listaDeContadores(ficha).filter(c => c.poderId !== undefined && String(c.poderId) === String(poderId)));

// Contadores sem dono (poderId ausente ou apontando para um poder que não existe mais).
export function contadoresAvulsos(ficha) {
    const ids = new Set((ficha && Array.isArray(ficha.poderes) ? ficha.poderes : []).filter(Boolean).map(p => String(p.id)));
    return listaDeContadores(ficha).filter(c => c.poderId === undefined || c.poderId === null || c.poderId === '' || !ids.has(String(c.poderId)));
}

// Nome do poder dono do contador ('' se avulso ou se o poder não existe mais).
export function nomeDoPoderDoContador(ficha, contador) {
    if (!contador || contador.poderId === undefined || contador.poderId === null || contador.poderId === '') return '';
    const p = (ficha && Array.isArray(ficha.poderes) ? ficha.poderes : []).find(po => po && String(po.id) === String(contador.poderId));
    return p ? String(p.nome || '') : '';
}

// Dado cru do rascunho -> item limpo do rascunho (sem valor).
export function normalizarContadorRascunho(c) {
    if (!c || typeof c !== 'object') return null;
    const n = normalizarContador({ ...c, valor: c && c.min });
    if (!n) return null;
    const saida = { id: n.id || novoIdContador(), nome: n.nome, min: n.min, max: n.max };
    if (n.reset === 'cena') saida.reset = 'cena';
    return saida;
}

// Gatilho que menciona o contador `id` (evento, ação de contador ou ganho permanente a partir dele).
const gatilhoUsaContador = (g, id) => {
    if (!g || typeof g !== 'object') return false;
    const alvo = String(id);
    if (g.evento && g.evento.tipo === 'contadorAtingiu' && String(g.evento.contadorId) === alvo) return true;
    return (Array.isArray(g.acoes) ? g.acoes : []).some(a => a && ((a.tipo === 'contador' && String(a.id) === alvo)
        || (a.tipo === 'ganhoPermanente' && a.deContador && String(a.deContador.id) === alvo)));
};
// Gatilhos (de um poder ou uma lista deles) que usam o contador `id`.
export const referenciasDoContador = (poderOuGatilhos, id) => {
    const lista = Array.isArray(poderOuGatilhos) ? poderOuGatilhos : (poderOuGatilhos && Array.isArray(poderOuGatilhos.gatilhos) ? poderOuGatilhos.gatilhos : []);
    return lista.filter(g => gatilhoUsaContador(g, id));
};
// Mesma lista sem os gatilhos que usam o contador (para quando ele é removido).
export const semReferenciasDoContador = (gatilhos, id) => (Array.isArray(gatilhos) ? gatilhos : []).filter(g => !gatilhoUsaContador(g, id));

// Planeja gravar os contadores do rascunho de um poder SEM mutar nada.
// Regras: os do poder que saíram do rascunho são removidos; um item cujo id existe na ficha só é aceito se o contador for AVULSO ou já deste poder
// (atualizado, valor preservado, vinculado ao poder se avulso); se pertence a OUTRO poder, o item é IGNORADO com um aviso (nunca "rouba");
// se o id NÃO existe na ficha (ex.: rascunho persistente de contador já removido), é uma criação normal.
// Devolve { ok, erro, avisos, criar, atualizar, vincular, remover, total }.
export function planejarContadoresDoPoder(ficha, poderId, rascunho) {
    const lista = listaDeContadores(ficha);
    const itens = [];
    const vistos = new Set();
    (Array.isArray(rascunho) ? rascunho : []).forEach((c) => {
        const n = normalizarContadorRascunho(c);
        if (n && !vistos.has(String(n.id))) { vistos.add(String(n.id)); itens.push(n); }
    });
    const porId = new Map(lista.map(c => [String(c.id), c]));
    const meus = new Set(contadoresDoPoder(ficha, poderId).map(c => String(c.id)));
    const avulsos = new Set(contadoresAvulsos(ficha).map(c => String(c.id)));
    const criar = []; const atualizar = []; const vincular = []; const avisos = [];
    itens.forEach((n) => {
        const id = String(n.id);
        if (!porId.has(id)) { criar.push(normalizarContador({ ...n, valor: n.min, poderId })); return; }
        if (!meus.has(id) && !avulsos.has(id)) { avisos.push(`O contador "${n.nome}" pertence a outro poder e foi ignorado.`); return; }
        atualizar.push(n);
        if (!meus.has(id)) vincular.push(id);
    });
    const remover = [...meus].filter(id => !vistos.has(id));
    const total = lista.length - remover.length + criar.length;
    const erro = total > LIMITE_CONTADORES
        ? `A ficha só comporta ${LIMITE_CONTADORES} contadores (ficaria com ${total}). Remova algum contador antes de salvar.`
        : '';
    return { ok: !erro, erro, avisos, criar, atualizar, vincular, remover, total };
}

// Aplica o plano no RASCUNHO da ficha (dentro de updateFicha). Só grava com plano.ok. Devolve true se gravou.
export function aplicarContadoresDoPoder(ficha, poderId, plano) {
    if (!ficha || !plano || !plano.ok) return false;
    if (!Array.isArray(ficha.contadores)) ficha.contadores = [];
    const remover = new Set(plano.remover.map(String));
    const mudar = new Map(plano.atualizar.map(c => [String(c.id), c]));
    const novos = [];
    ficha.contadores.forEach((c) => {
        if (!c || remover.has(String(c.id))) return;
        const a = mudar.get(String(c.id));
        if (!a) { novos.push(c); return; }
        // Valor preservado (preso ao novo intervalo); sem `reset` = permanente.
        const base = { ...c, nome: a.nome, min: a.min, max: a.max, poderId };
        if (a.reset === 'cena') base.reset = 'cena'; else delete base.reset;
        novos.push(normalizarContador(base) || c);
    });
    plano.criar.forEach(c => novos.push(c));
    ficha.contadores = novos;
    // Contador recém-criado/vinculado que virou o comandante adota o estágio atual do poder como valor (não força o estágio).
    [...plano.vincular, ...plano.criar.map(c => String(c.id))].forEach((id) => {
        const c = ficha.contadores.find(x => x && String(x.id) === id);
        if (c) adotarEstagioDoPoder(ficha, c);
    });
    return true;
}
