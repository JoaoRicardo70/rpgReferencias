// ==========================================
// 🗂️ PASTAS ANINHADAS — Formas, Habilidades e Poderes do Grimório (e a lista de técnicas do Mapa)
// podem ter pastas dentro de pastas. O campo `pasta` continua sendo UM texto (nada muda nas fichas
// já salvas): o caminho é escrito com "/" entre os níveis. Ex.: "Taijutsu/Portões" é a pasta
// "Portões" dentro de "Taijutsu". Uma pasta sem "/" é de primeiro nível, igual a antes.
// ==========================================

export const SEPARADOR_PASTA = '/';

// "Taijutsu / Portões " -> ['Taijutsu', 'Portões']
export function segmentosPasta(pasta) {
    return String(pasta ?? '').split(SEPARADOR_PASTA).map(s => s.trim()).filter(Boolean);
}

// Caminho limpo: sem espaços sobrando, sem "//" nem "/" nas pontas.
export function normalizarPasta(pasta) {
    return segmentosPasta(pasta).join(SEPARADOR_PASTA);
}

// Último nível do caminho ("Taijutsu/Portões" -> "Portões").
export function rotuloPasta(caminho) {
    const segs = segmentosPasta(caminho);
    return segs.length ? segs[segs.length - 1] : '';
}

// Todos os caminhos usados pelos itens, incluindo as pastas-mãe ("A/B/C" traz "A", "A/B" e "A/B/C"),
// em ordem alfabética — alimenta a sugestão do campo Pasta e o "Recolher/Expandir tudo".
export function listarCaminhosPastas(itens, getPasta = (p) => p && p.pasta) {
    const set = new Set();
    (itens || []).forEach(item => {
        const segs = segmentosPasta(getPasta(item));
        for (let i = 1; i <= segs.length; i++) set.add(segs.slice(0, i).join(SEPARADOR_PASTA));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// Árvore de pastas dos itens:
//   { semPasta: [itens soltos], pastas: [{ nome, caminho, itens, filhos, total }] }
// `itens` são só os que estão DIRETO naquela pasta; `total` conta também as subpastas.
// Pastas e subpastas saem em ordem alfabética (pt-BR).
export function construirArvorePastas(itens, getPasta = (p) => p && p.pasta) {
    const semPasta = [];
    const raiz = { filhos: new Map() };
    (itens || []).forEach(item => {
        if (!item) return;
        const segs = segmentosPasta(getPasta(item));
        if (segs.length === 0) { semPasta.push(item); return; }
        let no = raiz;
        segs.forEach((seg, i) => {
            if (!no.filhos.has(seg)) no.filhos.set(seg, { nome: seg, caminho: segs.slice(0, i + 1).join(SEPARADOR_PASTA), itens: [], filhos: new Map() });
            no = no.filhos.get(seg);
        });
        no.itens.push(item);
    });
    const finalizar = (no) => {
        const filhos = Array.from(no.filhos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(finalizar);
        return { nome: no.nome, caminho: no.caminho, itens: no.itens, filhos, total: no.itens.length + filhos.reduce((s, f) => s + f.total, 0) };
    };
    return { semPasta, pastas: Array.from(raiz.filhos.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(finalizar) };
}

// Quantos itens da pasta (e das subpastas) satisfazem `teste` (padrão: técnica ligada).
export function contarNaPasta(no, teste = (p) => !!(p && p.ativa)) {
    if (!no) return 0;
    return no.itens.filter(teste).length + no.filhos.reduce((s, f) => s + contarNaPasta(f, teste), 0);
}

// Renomeia/move a pasta `antigo` para `novo` dentro do caminho `pasta`, levando as subpastas junto:
//   renomearCaminhoPasta('Portões/Extra', 'Portões', 'Taijutsu/Portões') -> 'Taijutsu/Portões/Extra'
// `novo` vazio remove a pasta: os itens e as subpastas dela sobem pra pasta-mãe (ou ficam soltos, se era de primeiro nível).
// Caminhos que não estão sob `antigo` voltam como estavam.
export function renomearCaminhoPasta(pasta, antigo, novo) {
    const segs = segmentosPasta(pasta);
    const ant = segmentosPasta(antigo);
    if (ant.length === 0 || segs.length < ant.length || ant.some((s, i) => segs[i] !== s)) return String(pasta ?? '').trim();
    const destino = segmentosPasta(novo);
    const base = destino.length > 0 ? destino : ant.slice(0, -1);
    return [...base, ...segs.slice(ant.length)].join(SEPARADOR_PASTA);
}
