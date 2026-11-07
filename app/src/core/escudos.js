// ==========================================
// 🛡️ ESCUDOS E VIDA TEMPORÁRIA — lógica pura. Pontos que absorvem o Dano ANTES da Vida (barreira de 1600, Vida Falsa +100…):
//   ficha.escudos = [{ id, nome, valor, valorMax?, tipo: 'escudo' | 'vidaTemporaria', poderId? }]
// Os valores ficam na escala EXIBIDA (a mesma do Dano na tela), não na Vida bruta.
// Ordem de consumo: primeiro os 'escudo' (barreiras), depois as 'vidaTemporaria'; dentro de cada tipo, na ordem da lista
// (o mais antigo primeiro). Cada um que chega a 0 sai da lista. O que sobra é o Dano que vai para a Vida.
// O escudo absorve TODO tipo de Dano que chega à Vida, inclusive Dano Verdadeiro (a absorção vem depois de Reduções/Resistências/Domínio).
// Escudo com `poderId` foi criado por um Poder ao ligar (escudoAoLigar) e some ao desligá-lo; escudos manuais não têm poderId.
// ==========================================

export const LIMITE_ESCUDOS = 12;
export const LIMITE_VALOR_ESCUDO = 1e15;
const LIMITE_NOME = 40;

export const TIPOS_ESCUDO = [
    { id: 'escudo', rotulo: '🛡️ Escudo' },
    { id: 'vidaTemporaria', rotulo: '💗 Vida temporária' },
];
const IDS_TIPO = new Set(TIPOS_ESCUDO.map(t => t.id));

const valorValido = (v) => {
    const n = Math.floor(parseFloat(String(v ?? '').replace(',', '.')));
    return Number.isFinite(n) ? Math.max(0, Math.min(LIMITE_VALOR_ESCUDO, n)) : null;
};

// Escudo limpo ou null (sem nome, valor inválido ou tipo desconhecido). Valor inteiro 0..1e15; valorMax >= valor.
export function normalizarEscudo(e) {
    if (!e || typeof e !== 'object') return null;
    const nome = String(e.nome ?? '').trim().slice(0, LIMITE_NOME);
    const valor = valorValido(e.valor);
    if (!nome || valor === null) return null;
    const tipo = IDS_TIPO.has(e.tipo) ? e.tipo : 'escudo';
    const saida = { id: String(e.id ?? ''), nome, valor, tipo };
    const max = valorValido(e.valorMax);
    saida.valorMax = max !== null && max >= valor ? max : valor;
    if (e.poderId !== undefined && e.poderId !== null && e.poderId !== '') saida.poderId = e.poderId;
    return saida;
}

export const listaDeEscudos = (ficha) => (ficha && Array.isArray(ficha.escudos) ? ficha.escudos.filter(e => e && typeof e === 'object') : []);

// Total que ainda pode ser absorvido (escala exibida).
export const totalDeEscudos = (ficha) => listaDeEscudos(ficha).reduce((s, e) => s + (valorValido(e.valor) || 0), 0);

// Todas as mutações abaixo trabalham no RASCUNHO (dentro de updateFicha) e devolvem true se mudaram algo.
export function adicionarEscudo(ficha, { id, nome, valor, tipo = 'escudo', poderId } = {}) {
    if (!ficha) return false;
    if (Array.isArray(ficha.escudos) && ficha.escudos.length >= LIMITE_ESCUDOS) return false;
    const novo = normalizarEscudo({ id: id ?? `esc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, nome, valor, tipo, poderId });
    if (!novo || novo.valor <= 0) return false; // recusado: não cria a chave `escudos` vazia
    if (!Array.isArray(ficha.escudos)) ficha.escudos = [];
    ficha.escudos.push(novo);
    return true;
}

export function removerEscudo(ficha, id) {
    if (!ficha || !Array.isArray(ficha.escudos)) return false;
    const antes = ficha.escudos.length;
    ficha.escudos = ficha.escudos.filter(e => !e || String(e.id) !== String(id));
    const mudou = ficha.escudos.length !== antes;
    if (ficha.escudos.length === 0) delete ficha.escudos; // nunca fica gravado vazio
    return mudou;
}

// Remove os escudos criados por um Poder (ao desligá-lo).
export function removerEscudosDoPoder(ficha, poderId) {
    if (!ficha || !Array.isArray(ficha.escudos) || poderId === undefined || poderId === null || poderId === '') return false;
    const antes = ficha.escudos.length;
    ficha.escudos = ficha.escudos.filter(e => !e || e.poderId === undefined || String(e.poderId) !== String(poderId));
    const mudou = ficha.escudos.length !== antes;
    if (ficha.escudos.length === 0) delete ficha.escudos; // nunca fica gravado vazio
    return mudou;
}

// Muda nome/valor/tipo e re-normaliza. Valor 0 remove o escudo. Se o valor sobe acima do máximo, o máximo sobe junto.
export function atualizarEscudo(ficha, id, patch) {
    if (!ficha || !Array.isArray(ficha.escudos)) return false;
    const i = ficha.escudos.findIndex(e => e && String(e.id) === String(id));
    if (i < 0) return false;
    const novo = normalizarEscudo({ ...ficha.escudos[i], ...patch });
    if (!novo) return false;
    if (novo.valor <= 0) { ficha.escudos.splice(i, 1); if (ficha.escudos.length === 0) delete ficha.escudos; return true; }
    ficha.escudos[i] = novo;
    return true;
}

// Quanto da ficha absorve do Dano `dano` (escala exibida), sem alterar nada.
// Devolve { restante, absorvido, detalhe: [{ id, nome, tipo, absorvido, restam }], escudosNovos } — escudosNovos é a lista nova (sem os zerados).
export function absorverDano(ficha, dano) {
    const lista = listaDeEscudos(ficha).map(normalizarEscudo).filter(Boolean);
    let falta = Math.min(1e18, Math.max(0, Number(dano) || 0));
    let absorvido = 0; // soma do que cada escudo tirou (total - falta perderia a precisao com danos enormes e deixaria o escudo sem consumir)
    const ordem = [...lista.filter(e => e.tipo === 'escudo'), ...lista.filter(e => e.tipo === 'vidaTemporaria')];
    const detalhe = [];
    const restamPorId = new Map();
    ordem.forEach((e) => {
        if (falta <= 0 || e.valor <= 0) { restamPorId.set(e, e.valor); return; }
        const tira = Math.min(e.valor, falta);
        falta -= tira;
        absorvido += tira;
        restamPorId.set(e, e.valor - tira);
        detalhe.push({ id: e.id, nome: e.nome, tipo: e.tipo, absorvido: tira, restam: e.valor - tira });
    });
    // Mantém a ordem original da lista; os que chegaram a 0 saem.
    const escudosNovos = lista.map(e => ({ ...e, valor: restamPorId.get(e) })).filter(e => e.valor > 0);
    return { restante: falta, absorvido, detalhe, escudosNovos };
}

const fmt = (n) => Math.floor(n).toLocaleString('pt-BR');

// "<nome> absorveu N (restam M)"; M = o que sobra em todos os escudos juntos. '' se nada foi absorvido.
export function descreverAbsorcao(nome, r) {
    if (!r || !(r.absorvido > 0)) return '';
    const restam = (r.escudosNovos || []).reduce((s, e) => s + e.valor, 0);
    return `${nome} absorveu ${fmt(r.absorvido)} (restam ${fmt(restam)})`;
}

// Aplica a absorção NO RASCUNHO (use dentro de updateFicha). Devolve { restante, absorvido, texto }; sem escudos, nada muda.
export function absorverNoRascunho(ficha, dano, nome = 'Escudo') {
    const r = absorverDano(ficha, dano);
    if (!(r.absorvido > 0)) return { restante: Math.max(0, Number(dano) || 0), absorvido: 0, texto: '' };
    if (r.escudosNovos.length > 0) ficha.escudos = r.escudosNovos; else delete ficha.escudos;
    return { restante: r.restante, absorvido: r.absorvido, texto: descreverAbsorcao(nome, r) };
}

// Descanso: some a Vida temporária e os escudos criados por Poder (poderId); escudos manuais permanecem. Use no rascunho.
export function limparEscudosNoDescanso(ficha) {
    if (!ficha || !Array.isArray(ficha.escudos)) return false;
    const antes = ficha.escudos.length;
    const resto = ficha.escudos.filter(e => e && e.tipo !== 'vidaTemporaria' && (e.poderId === undefined || e.poderId === null || e.poderId === ''));
    if (resto.length === antes) return false;
    if (resto.length > 0) ficha.escudos = resto; else delete ficha.escudos;
    return true;
}

// Escudo que um Poder cria ao ligar (campo `escudoAoLigar: { nome, valor, tipo }`); null se inválido.
export function normalizarEscudoAoLigar(e) {
    if (!e || typeof e !== 'object') return null;
    const n = normalizarEscudo({ id: 'x', nome: e.nome, valor: e.valor, tipo: e.tipo });
    if (!n || n.valor <= 0) return null;
    return { nome: n.nome, valor: n.valor, tipo: n.tipo };
}

// Liga/desliga: cria (ou renova) o escudo do Poder / remove o dele. Use dentro de updateFicha. Devolve true se mudou algo.
export function sincronizarEscudoDoPoder(ficha, poder, ligado) {
    if (!ficha || !poder) return false;
    if (!ligado) return removerEscudosDoPoder(ficha, poder.id);
    const cfg = normalizarEscudoAoLigar(poder.escudoAoLigar);
    if (!cfg) return false;
    // Ligar de novo renova o escudo (não soma): tira o antigo deste Poder e cria um cheio.
    removerEscudosDoPoder(ficha, poder.id);
    return adicionarEscudo(ficha, { ...cfg, poderId: poder.id, id: `esc_p${poder.id}` });
}
