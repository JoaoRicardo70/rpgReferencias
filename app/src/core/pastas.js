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

// ==========================================
// 📂 PASTAS ABERTAS NO LIVRO DOS PODERES
// As pastas NASCEM FECHADAS. O que está aberto fica guardado (store, só em memória) por "categoria::caminho",
// então trocar de aba, de página do Grimório ou remontar o livro não muda nada.
// ==========================================
export const SEPARADOR_CHAVE_PASTA = '::';

// ('habilidade', 'Taijutsu/Portões') -> 'habilidade::Taijutsu/Portões'
export function chavePastaAberta(categoria, caminho) {
    return `${categoria}${SEPARADOR_CHAVE_PASTA}${caminho}`;
}

// Chaves da pasta e de todas as pastas-mãe ("A/B" -> A e A/B): abrir uma subpasta tem que abrir o caminho até ela.
export function chavesComPastasMae(categoria, pasta) {
    const segs = segmentosPasta(pasta);
    const chaves = [];
    for (let i = 1; i <= segs.length; i++) chaves.push(chavePastaAberta(categoria, segs.slice(0, i).join(SEPARADOR_PASTA)));
    return chaves;
}

// Nome do "balde" dos itens sem pasta, quando a lista é agrupada (nunca colide com uma pasta real: o caminho é sempre trimado).
export const NOME_SEM_PASTA = 'Sem Pasta';

// Renomear/mover/remover uma pasta leva junto o "aberta/fechada" dela e das subpastas: devolve um novo mapa de pastas abertas
// onde as chaves de `categoria` sob `de` passam para o caminho novo (`para` vazio = pasta removida: a chave dela some e as das
// subpastas sobem pra pasta-mãe). Chaves de outras categorias ou fora de `de` ficam como estão.
export function migrarChavesPastasAbertas(abertas, categoria, de, para) {
    const origem = abertas || {};
    const ant = segmentosPasta(de);
    if (ant.length === 0) return { ...origem };
    const prefixo = `${categoria}${SEPARADOR_CHAVE_PASTA}`;
    const resultado = {};
    Object.keys(origem).forEach((chave) => {
        if (!origem[chave]) return;
        if (!chave.startsWith(prefixo)) { resultado[chave] = origem[chave]; return; }
        const segs = segmentosPasta(chave.slice(prefixo.length));
        const sob = segs.length >= ant.length && ant.every((s, i) => segs[i] === s);
        if (!sob) { resultado[chave] = origem[chave]; return; }
        if (segs.length === ant.length && segmentosPasta(para).length === 0) return; // pasta removida
        resultado[chavePastaAberta(categoria, renomearCaminhoPasta(segs.join(SEPARADOR_PASTA), de, para))] = true;
    });
    return resultado;
}
