// ==========================================
// MARKDOWN DA SEXTA-FEIRA — leitor puro (sem React, sem HTML cru) do subconjunto de Markdown que
// o Gemini costuma usar: títulos, negrito/itálico, código, listas, tabelas, citações e réguas.
// Devolve uma árvore simples que components/ia/MarkdownSexta.jsx transforma em elementos React
// (nada é injetado como HTML, então texto vindo da IA nunca vira código na página).
// ==========================================

// Trechos inline: **negrito**, __negrito__, *itálico*, _itálico_, `código`.
export function analisarInline(texto) {
    const s = String(texto ?? '');
    const resultado = [];
    let buffer = '';
    const soltarTexto = () => { if (buffer) { resultado.push({ tipo: 'texto', valor: buffer }); buffer = ''; } };
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (c === '`') {
            const fim = s.indexOf('`', i + 1);
            if (fim > i + 1) { soltarTexto(); resultado.push({ tipo: 'codigo', valor: s.slice(i + 1, fim) }); i = fim + 1; continue; }
        }
        if ((c === '*' || c === '_') && s[i + 1] === c) {
            const marca = c + c;
            const fim = s.indexOf(marca, i + 2);
            if (fim > i + 2) { soltarTexto(); resultado.push({ tipo: 'negrito', filhos: analisarInline(s.slice(i + 2, fim)) }); i = fim + 2; continue; }
        }
        if (c === '*' || c === '_') {
            const antes = i === 0 ? ' ' : s[i - 1];
            const fim = s.indexOf(c, i + 1);
            // "_" no meio de palavra (ex.: nome_de_variavel) não é itálico.
            const inicioValido = c === '*' || /[\s(["']/.test(antes);
            if (inicioValido && fim > i + 1 && s[i + 1] !== ' ' && s[fim - 1] !== ' ') {
                soltarTexto(); resultado.push({ tipo: 'italico', filhos: analisarInline(s.slice(i + 1, fim)) }); i = fim + 1; continue;
            }
        }
        buffer += c;
        i++;
    }
    soltarTexto();
    return resultado;
}

const RE_TITULO = /^(#{1,6})\s+(.*)$/;
const RE_LISTA = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
const RE_REGUA = /^\s*([-*_])(\s*\1){2,}\s*$/;
const RE_SEPARADOR_TABELA = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function celulasTabela(linha) {
    let l = linha.trim();
    if (l.startsWith('|')) l = l.slice(1);
    if (l.endsWith('|')) l = l.slice(0, -1);
    return l.split('|').map(c => analisarInline(c.trim()));
}

// Blocos: titulo | paragrafo | lista | tabela | codigo | citacao | regua.
export function analisarMarkdown(texto) {
    const linhas = String(texto ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocos = [];
    let i = 0;
    while (i < linhas.length) {
        const linha = linhas[i];
        if (!linha.trim()) { i++; continue; }

        if (linha.trim().startsWith('```')) {
            const corpo = [];
            i++;
            while (i < linhas.length && !linhas[i].trim().startsWith('```')) { corpo.push(linhas[i]); i++; }
            i++; // pula o ``` de fechamento (se houver)
            blocos.push({ tipo: 'codigo', texto: corpo.join('\n') });
            continue;
        }
        const titulo = linha.match(RE_TITULO);
        if (titulo) { blocos.push({ tipo: 'titulo', nivel: titulo[1].length, inline: analisarInline(titulo[2].trim()) }); i++; continue; }
        if (RE_REGUA.test(linha)) { blocos.push({ tipo: 'regua' }); i++; continue; }

        if (linha.includes('|') && i + 1 < linhas.length && RE_SEPARADOR_TABELA.test(linhas[i + 1])) {
            const cabecalho = celulasTabela(linha);
            const corpo = [];
            i += 2;
            while (i < linhas.length && linhas[i].includes('|') && linhas[i].trim()) { corpo.push(celulasTabela(linhas[i])); i++; }
            blocos.push({ tipo: 'tabela', cabecalho, linhas: corpo });
            continue;
        }
        if (linha.trim().startsWith('>')) {
            const corpo = [];
            while (i < linhas.length && linhas[i].trim().startsWith('>')) { corpo.push(linhas[i].trim().replace(/^>\s?/, '')); i++; }
            blocos.push({ tipo: 'citacao', inline: analisarInline(corpo.join(' ')) });
            continue;
        }
        const item = linha.match(RE_LISTA);
        if (item) {
            const ordenada = /\d/.test(item[1]);
            const itens = [];
            while (i < linhas.length) {
                const m = linhas[i].match(RE_LISTA);
                if (m && /\d/.test(m[1]) === ordenada) { itens.push(analisarInline(m[2])); i++; continue; }
                // Linha de continuação (recuada) do item anterior.
                if (itens.length && linhas[i].trim() && /^\s{2,}/.test(linhas[i]) && !RE_LISTA.test(linhas[i])) {
                    itens[itens.length - 1] = [...itens[itens.length - 1], { tipo: 'texto', valor: ' ' }, ...analisarInline(linhas[i].trim())];
                    i++; continue;
                }
                break;
            }
            blocos.push({ tipo: 'lista', ordenada, itens });
            continue;
        }
        // Parágrafo: junta linhas até uma linha vazia ou o começo de outro bloco.
        const corpo = [linha];
        i++;
        while (i < linhas.length && linhas[i].trim() && !RE_TITULO.test(linhas[i]) && !RE_LISTA.test(linhas[i])
            && !linhas[i].trim().startsWith('```') && !linhas[i].trim().startsWith('>') && !RE_REGUA.test(linhas[i])
            && !(linhas[i].includes('|') && i + 1 < linhas.length && RE_SEPARADOR_TABELA.test(linhas[i + 1]))) {
            corpo.push(linhas[i]); i++;
        }
        blocos.push({ tipo: 'paragrafo', linhas: corpo.map(l => analisarInline(l)) });
    }
    return blocos;
}

// Texto limpo pra leitura em voz alta (sem marcas de Markdown nem emojis de enfeite).
export function markdownParaTextoFalado(texto) {
    return String(texto ?? '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/^\s*#{1,6}\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
        .replace(/\*\*|__/g, '')
        .replace(/(^|\s)[*_](\S)/g, '$1$2')
        .replace(/(\S)[*_](?=\s|$|[.,;:!?])/g, '$1')
        .replace(/\|/g, ', ')
        .replace(/^[\s,:-]*-{3,}[\s,:-]*$/gm, '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
        .replace(/\n{2,}/g, '. ')
        .replace(/\s+/g, ' ')
        .trim();
}
