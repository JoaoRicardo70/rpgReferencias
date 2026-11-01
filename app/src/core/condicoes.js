// ==========================================
// 🩸 ESTADOS NEGATIVOS (condições) — regras puras. A ficha guarda só `condicoes: [{ id, stacks, fonte? }]` (stacks 1 a 6,
// `fonte` = quem causou, opcional). Daqui saem os efeitos reais, para que Acerto, Evasiva/Resistência, cura, custo de defesa,
// Testes e o início de turno leiam a MESMA conta (as descrições estão no Compêndio > Condições).
//
// Cadeias (um estado puxa outros, pelas regras do Compêndio):
//   Exausto 1 desv. em testes · 2 Lento · 3 desv. em ataques · 4 cura -50% · 5 Imobilizado · 6 Incapacitado
//   Sangrando: a cada SANGRANDO_POR_EXAUSTAO stacks soma 1 nível de Exaustão
//   Queimado: com QUEIMADO_VULNERAVEL stacks fica Vulnerável · Criogenia: Lento e, com CRIOGENIA_IMOBILIZA stacks, Imobilizado
//   Petrificado: 1 Lento → 2 Vulnerável → 3 Imobilizado → 4+ Petrificado (Incapacitado)
// ==========================================

export const MAX_STACKS = 6;
export const SANGRANDO_POR_EXAUSTAO = 3;
export const QUEIMADO_VULNERAVEL = 4;
export const CRIOGENIA_LENTO = 3;
export const CRIOGENIA_IMOBILIZA = 6;
// Cada stack de Queimado/Sangrando encarece em 10% a Energia gasta para se defender.
export const CUSTO_DEFESA_POR_STACK = 0.1;

// Dano no começo do turno do afetado, por stack (dados da descrição do Compêndio).
export const DANO_POR_TURNO = {
    queimado: { qtd: 8, faces: 4 },
    sangrando: { qtd: 5, faces: 4 },
    criogenia: { qtd: 5, faces: 4 },
    envenenado: { qtd: 5, faces: 4 },
    necrosado: { qtd: 8, faces: 4 }
};

export const ESTADOS = [
    { id: 'sangrando', nome: 'Sangrando', icone: '🩸' }, { id: 'queimado', nome: 'Queimado', icone: '🔥' },
    { id: 'exausto', nome: 'Exausto', icone: '😮‍💨' }, { id: 'envenenado', nome: 'Envenenado', icone: '🤢' },
    { id: 'criogenia', nome: 'Criogenia', icone: '❄️' }, { id: 'lento', nome: 'Lento', icone: '🐢' },
    { id: 'imobilizado', nome: 'Imobilizado', icone: '⛓️' }, { id: 'incapacitado', nome: 'Incapacitado', icone: '☠️' },
    { id: 'vulneravel', nome: 'Vulnerável', icone: '🛡️' }, { id: 'amedrontado', nome: 'Amedrontado', icone: '👻' },
    { id: 'enlouquecido', nome: 'Enlouquecido', icone: '🌀' }, { id: 'necrosado', nome: 'Necrosado', icone: '💀' },
    { id: 'cegosurdo', nome: 'Cego/Surdo', icone: '🙈' }, { id: 'petrificado', nome: 'Petrificado', icone: '🗿' },
    { id: 'charmado', nome: 'Charmado', icone: '💖' }, { id: 'provocado', nome: 'Provocado', icone: '💢' }
];
const IDS = new Set(ESTADOS.map(e => e.id));
export const ehEstadoValido = (id) => typeof id === 'string' && IDS.has(id);
export const nomeDoEstado = (id) => (ESTADOS.find(e => e.id === id) || { nome: String(id) }).nome;
export const iconeDoEstado = (id) => (ESTADOS.find(e => e.id === id) || { icone: '❔' }).icone;

const limitarStacks = (n) => Math.max(0, Math.min(MAX_STACKS, Math.floor(Number(n) || 0)));

// Lista limpa de condições da ficha (ids válidos, stacks de 1 a 6, sem repetir id).
export function condicoesDaFicha(ficha) {
    const lista = Array.isArray(ficha && ficha.condicoes) ? ficha.condicoes : [];
    const vistos = new Map();
    lista.forEach((c) => {
        if (!c || !ehEstadoValido(c.id)) return;
        const stacks = limitarStacks(c.stacks);
        if (stacks <= 0) return;
        const antes = vistos.get(c.id);
        if (!antes || stacks > antes.stacks) vistos.set(c.id, { id: c.id, stacks, ...(c.fonte ? { fonte: String(c.fonte).slice(0, 60) } : {}) });
    });
    return [...vistos.values()];
}

export function stacksDe(ficha, id) {
    const c = condicoesDaFicha(ficha).find(x => x.id === id);
    return c ? c.stacks : 0;
}

// Quanto cada estado "vale" depois das cadeias. `nivelExaustao` já soma o que o Sangrando acrescenta.
export function estadosEfetivos(ficha) {
    const s = (id) => stacksDe(ficha, id);
    const nivelExaustao = Math.min(MAX_STACKS, s('exausto') + Math.floor(s('sangrando') / SANGRANDO_POR_EXAUSTAO));
    const pet = s('petrificado');
    const petrificadoTotal = pet >= 4;
    const imobilizado = s('imobilizado') > 0 || nivelExaustao >= 5 || s('criogenia') >= CRIOGENIA_IMOBILIZA || pet >= 3;
    const incapacitado = s('incapacitado') > 0 || nivelExaustao >= 6 || petrificadoTotal;
    const lento = s('lento') > 0 || nivelExaustao >= 2 || s('criogenia') >= CRIOGENIA_LENTO || pet >= 1;
    const vulneravel = s('vulneravel') > 0 || s('queimado') >= QUEIMADO_VULNERAVEL || pet >= 2;
    return { nivelExaustao, lento, imobilizado, incapacitado, vulneravel, petrificado: petrificadoTotal, cegosurdo: s('cegosurdo') > 0 };
}

// Tudo que os estados mudam nas contas. Ficha sem condições devolve o "neutro".
export function modificadoresDeEstados(ficha) {
    const e = estadosEfetivos(ficha);
    const s = (id) => stacksDe(ficha, id);
    const imovel = e.imobilizado || e.incapacitado;
    const desvTestes = (e.nivelExaustao >= 1 ? 1 : 0) + (e.cegosurdo ? 1 : 0);
    const desvAtaque = (e.nivelExaustao >= 3 ? 1 : 0) + (e.cegosurdo ? 2 : 0) + (e.incapacitado ? 1 : 0);
    const desvPorAtributo = {
        forca: (e.imobilizado ? 1 : 0) + (e.vulneravel ? 1 : 0),
        destreza: (e.imobilizado ? 1 : 0) + (e.lento ? 1 : 0)
    };
    const vantagemContraEle = e.incapacitado ? 2 : (e.imobilizado ? 1 : 0);
    const custoDefesaMult = 1 + CUSTO_DEFESA_POR_STACK * (s('queimado') + s('sangrando'));
    return {
        ...e,
        semMovimento: imovel,
        movimentoMult: imovel ? 0 : (e.lento ? 0.5 : 1),
        // Evasiva zera parado/incapacitado, cai pela metade com Lento (mesma regra de sempre da engine).
        evasivaMult: imovel ? 0 : (e.lento ? 0.5 : 1),
        resistenciaMult: e.vulneravel ? 0.5 : 1,
        curaMult: curaDeEstados(ficha),
        custoDefesaMult,
        desvTestes, desvAtaque, desvPorAtributo, vantagemContraEle,
        perdeFormas: e.incapacitado
    };
}

// Cura: Sangrando/Queimado/Criogenia cortam 50% por stack; Exaustão 4+ corta 50%.
function curaDeEstados(ficha) {
    let mult = 1;
    ['sangrando', 'queimado', 'criogenia'].forEach((id) => { for (let i = 0; i < stacksDe(ficha, id); i++) mult *= 0.5; });
    if (estadosEfetivos(ficha).nivelExaustao >= 4) mult *= 0.5;
    return mult;
}

// Frases curtas do que cada estado está causando AGORA (para a ficha, o aviso e o feed).
export function resumoDosEstados(ficha) {
    const m = modificadoresDeEstados(ficha);
    const linhas = [];
    condicoesDaFicha(ficha).forEach((c) => {
        if (c.id === 'envenenado') linhas.push(`🤢 Envenenado: ${5 * c.stacks}d4 de dano no começo do turno (cada acerto com veneno também fica mais eficaz, conta do Mestre).`);
        if (c.id === 'necrosado') linhas.push(`💀 Necrosado: ${8 * c.stacks}d4 de dano no começo do turno.`);
        if (c.id === 'enlouquecido') linhas.push('🌀 Enlouquecido: sem regra automática, o Mestre define.');
        if (c.id === 'amedrontado') linhas.push(`👻 Amedrontado: não ataca${c.fonte ? ` ${c.fonte}` : ' a fonte do medo'} e só se afasta dela.`);
        if (c.id === 'charmado') linhas.push(`💖 Charmado: não ataca${c.fonte ? ` ${c.fonte}` : ' quem o charmou'} e o defende.`);
        if (c.id === 'provocado') linhas.push(`💢 Provocado: só foca${c.fonte ? ` ${c.fonte}` : ' em quem o provocou'}.`);
    });
    if (m.incapacitado) linhas.push('☠️ Incapacitado: sem Formas, todos atacam com dupla vantagem.');
    else if (m.imobilizado) linhas.push('⛓️ Imobilizado: 0 de movimento, quem ataca tem vantagem.');
    else if (m.lento) linhas.push('🐢 Lento: metade do movimento e da Evasiva.');
    if (m.vulneravel) linhas.push('🛡️ Vulnerável: metade da Resistência.');
    if (m.nivelExaustao > 0) linhas.push(`😮‍💨 Exaustão ${m.nivelExaustao}/6.`);
    if (m.desvTestes > 0) linhas.push(`🎲 ${m.desvTestes} desvantagem(ns) em testes.`);
    if (m.desvAtaque > 0) linhas.push(`🎯 ${m.desvAtaque} desvantagem(ns) em ataques.`);
    if (m.curaMult < 1) linhas.push(`💔 Cura em ${Math.round(m.curaMult * 1000) / 10}%.`);
    if (m.custoDefesaMult > 1) linhas.push(`🛡️ Defender custa ${Math.round((m.custoDefesaMult - 1) * 100)}% mais Energia.`);
    return linhas;
}

// ---------- Aplicar / tirar ----------

// Soma stacks de um estado (sem passar de 6). Devolve a NOVA lista; não muta a ficha.
export function somarEstado(condicoes, id, stacks = 1, fonte = '') {
    if (!ehEstadoValido(id)) return condicoesDaFicha({ condicoes });
    const lista = condicoesDaFicha({ condicoes });
    const n = limitarStacks(stacks);
    if (n <= 0) return lista;
    const i = lista.findIndex(c => c.id === id);
    if (i >= 0) {
        lista[i] = { ...lista[i], stacks: limitarStacks(lista[i].stacks + n), ...(fonte ? { fonte: String(fonte).slice(0, 60) } : {}) };
    } else {
        lista.push({ id, stacks: n, ...(fonte ? { fonte: String(fonte).slice(0, 60) } : {}) });
    }
    return lista;
}

export function tirarEstado(condicoes, id, stacks = MAX_STACKS) {
    return condicoesDaFicha({ condicoes }).map(c => (c.id === id ? { ...c, stacks: c.stacks - Math.max(0, Math.floor(Number(stacks) || 0)) } : c)).filter(c => c.stacks > 0);
}

// Muta uma ficha (rascunho Immer ou cópia solta) ou um Dummie: soma o estado. Devolve a lista nova.
export function aplicarEstadoNaFicha(ficha, id, stacks = 1, fonte = '') {
    ficha.condicoes = somarEstado(ficha.condicoes, id, stacks, fonte);
    return ficha.condicoes;
}

// ---------- Dano do começo do turno ----------

const rolarSoma = (qtd, faces, rolar) => {
    let soma = 0;
    for (let i = 0; i < qtd; i++) soma += rolar(faces);
    return soma;
};

// Dano dos estados no começo do turno do afetado. `rolar(faces)` devolve 1..faces (injetável para teste).
// Devolve { total, partes: [{ id, stacks, dado, dano }] }.
export function danoDeEstadosNoTurno(ficha, rolar = (faces) => Math.floor(Math.random() * faces) + 1) {
    const partes = [];
    condicoesDaFicha(ficha).forEach((c) => {
        const d = DANO_POR_TURNO[c.id];
        if (!d) return;
        const qtd = d.qtd * c.stacks;
        partes.push({ id: c.id, stacks: c.stacks, dado: `${qtd}d${d.faces}`, dano: rolarSoma(qtd, d.faces, rolar) });
    });
    return { total: partes.reduce((s, p) => s + p.dano, 0), partes };
}

export function descreverDanoDeEstados(r) {
    if (!r || r.partes.length === 0) return '';
    return r.partes.map(p => `${iconeDoEstado(p.id)} ${nomeDoEstado(p.id)} ${p.stacks}x (${p.dado}) = ${p.dano.toLocaleString('pt-BR')}`).join(' · ');
}
