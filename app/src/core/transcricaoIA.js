// ==========================================
// ✨ "Ler com a IA" (Círculo de Invocação): lógica pura da leitura em uma etapa.
// Divide o texto colado em partes que cabem num pedido ao Gemini, junta as respostas de todas as partes
// e traduz os erros para mensagens amigáveis. A chamada em si mora em services/transcricaoIA.js.
// ==========================================

import { prepararItemImportado } from './importadorIA';

// Tamanho máximo de cada parte, em caracteres (textos maiores são lidos em várias chamadas, em sequência).
export const LIMITE_CARACTERES_PARTE = 7000;

export const MENSAGEM_SEM_CHAVE = 'O Mestre ainda não cadastrou a chave do Gemini (aba Sexta-Feira > Config). Use o modo manual em Avançado.';
export const MENSAGEM_COTA = 'A cota gratuita do Gemini acabou por agora. Tente de novo em alguns minutos.';
export const MENSAGEM_TIMEOUT = 'O Gemini demorou demais para responder. Tente de novo.';
export const MENSAGEM_NAO_JSON = 'A IA respondeu, mas não devolveu um JSON válido. Tente de novo ou use o modo manual em Avançado.';
export const MENSAGEM_CANCELADO = 'Leitura cancelada.';

const FIM_DE_FRASE = /[.!?…]["')\]]*$/;

const normalizarQuebras = (texto) => String(texto || '').replace(/\r\n?/g, '\n');

// Sem acento, minúsculo, sem espaços repetidos (chave de comparação de nomes).
export const normalizarNome = (nome) => String(nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Bloco de uma linha só que parece título ("Rinnegan Supremo:", "## Técnicas", "HABILIDADES").
function pareceTitulo(bloco) {
    const t = bloco.trim();
    if (!t || t.includes('\n') || t.length > 80) return false;
    if (/^#{1,6}\s/.test(t) || /^[=\-_*]{3,}$/.test(t)) return true;
    if (/^[-•*]\s/.test(t)) return false;
    if (FIM_DE_FRASE.test(t)) return false;
    return true;
}
// Bloco que continua o anterior (item de lista: "- Limbo: ...", "• ...").
const pareceItemDeLista = (bloco) => /^\s*[-•*–]\s+\S/.test(bloco);

// Quebra um trecho grande demais: primeiro por linhas, depois por frases, por fim em espaços.
function quebrarTrechoGrande(trecho, limite) {
    const pedacos = [];
    const linhas = trecho.split('\n').filter(l => l.trim());
    const unidadesFinas = [];
    linhas.forEach((linha) => {
        if (linha.length <= limite) { unidadesFinas.push({ texto: linha, sep: '\n' }); return; }
        // Frase = fim na pontuação + espaço: decimais ("3.5") e reticências coladas não se quebram, e nenhum trecho some.
        const frases = linha.split(/(?<=[.!?…]["')\]]*)\s+/).filter(f => f.trim());
        frases.forEach((f) => {
            let resto = f.trim();
            while (resto.length > limite) {
                let corte = resto.lastIndexOf(' ', limite);
                if (corte < limite / 2) {
                    corte = limite;
                    // Não corta no meio de um par substituto (emoji).
                    const anterior = resto.charCodeAt(corte - 1);
                    if (anterior >= 0xD800 && anterior <= 0xDBFF) corte -= 1;
                }
                unidadesFinas.push({ texto: resto.slice(0, corte).trim(), sep: ' ' });
                resto = resto.slice(corte).trim();
            }
            if (resto) unidadesFinas.push({ texto: resto, sep: ' ' });
        });
    });
    // Junta de volta respeitando o limite; entre linhas usa \n, entre frases usa espaço.
    let atual = '';
    unidadesFinas.forEach((u) => {
        const junta = atual ? atual + u.sep + u.texto : u.texto;
        if (atual && junta.length > limite) { pedacos.push(atual); atual = u.texto; } else { atual = junta; }
    });
    if (atual) pedacos.push(atual);
    return pedacos;
}

// Divide o texto em partes de até `limite` caracteres, em limites naturais (linhas em branco), mantendo
// cada título junto do que vem logo abaixo e itens de lista junto da habilidade principal.
// Devolve [] se o texto for vazio.
export function dividirEmPartes(texto, limite = LIMITE_CARACTERES_PARTE) {
    const max = Math.max(200, Number(limite) || LIMITE_CARACTERES_PARTE);
    const limpo = normalizarQuebras(texto).trim();
    if (!limpo) return [];
    if (limpo.length <= max) return [limpo];

    const blocos = limpo.split(/\n[ \t]*\n+/).map(b => b.trim()).filter(Boolean);
    // Unidades indivisíveis: título + bloco seguinte; itens de lista colam no bloco anterior.
    const unidades = [];
    let tituloPendente = '';
    blocos.forEach((bloco) => {
        if (pareceTitulo(bloco)) {
            if (tituloPendente) { unidades.push(tituloPendente); }
            tituloPendente = bloco;
            return;
        }
        if (tituloPendente) { unidades.push(`${tituloPendente}\n\n${bloco}`); tituloPendente = ''; return; }
        if (pareceItemDeLista(bloco) && unidades.length) { unidades[unidades.length - 1] += `\n\n${bloco}`; return; }
        unidades.push(bloco);
    });
    if (tituloPendente) unidades.push(tituloPendente);

    // Unidade maior que o limite é quebrada em linhas/frases (o título fica na primeira parte).
    const pecas = [];
    unidades.forEach((u) => { if (u.length <= max) pecas.push(u); else quebrarTrechoGrande(u, max).forEach(p => pecas.push(p)); });

    const partes = [];
    let atual = '';
    pecas.forEach((p) => {
        const junta = atual ? `${atual}\n\n${p}` : p;
        if (atual && junta.length > max) { partes.push(atual); atual = p; } else { atual = junta; }
    });
    if (atual) partes.push(atual);
    return partes;
}

// Texto enviado de verdade pra uma parte: avisa a IA quando o documento foi dividido.
export function montarTextoDaParte(parte, indice, total) {
    if (!(total > 1)) return parte;
    return `(Trecho ${indice} de ${total} de um documento maior. Extraia só o que está NESTE trecho; se ele começar ou terminar no meio de uma habilidade, extraia o que houver dela mesmo assim.)\n\n${parte}`;
}

// Lista de frases sem vazias e sem repetidas (ignora caixa).
function juntarListas(a, b) {
    const lista = (v) => (Array.isArray(v) ? v : (v ? [v] : [])).map(s => String(s ?? '').trim()).filter(Boolean);
    const vistos = new Set();
    return [...lista(a), ...lista(b)].filter((s) => { const k = s.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

const AVISO_MESMO_NOME = 'Item de mesmo nome, conteúdo diferente: confira se é duplicado.';

// Assinatura do conteúdo de um item (cru da IA ou já preparado): descrição normalizada + números principais + efeitos.
function assinaturaDoItem(bruto) {
    // Os dois lados (item cru da IA e objeto já preparado da prévia) passam pelo mesmo preparo: mesmos padrões e aliases.
    let item = bruto;
    try { item = prepararItemImportado(bruto).objeto || bruto; } catch (e) { item = bruto; }
    // Efeitos vêm do item original (o preparo descarta efeitos inválidos, o que apagaria a diferença entre dois itens).
    const efeitosDe = (campo) => (Array.isArray(bruto[campo]) ? bruto[campo] : item[campo]);
    const n = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
    const efs = (lista) => (Array.isArray(lista) ? lista : []).filter(e => e && typeof e === 'object').map(e => `${normalizarNome(e.atributo)}|${normalizarNome(e.propriedade)}|${n(e.valor)}`).sort();
    return JSON.stringify([
        normalizarNome(item.descricao),
        n(item.danoQtd ?? item.dadosQtd), n(item.danoFaces ?? item.dadosFaces),
        n(item.custoPercentual), n(item.alcance), n(item.area), n(item.usosMax),
        efs(efeitosDe('efeitos')), efs(efeitosDe('efeitosPassivos')),
    ]);
}

// Mesmo item (nome e conteúdo iguais; ex.: título repetido no fim de uma parte e no começo da outra): mantém o primeiro
// e acrescenta o que o segundo trouxe de novo em naoAplicado/notasIA.
function absorverDuplicata(base, extra) {
    const resultado = { ...base };
    const naoAplicado = juntarListas(base.naoAplicado, extra.naoAplicado);
    if (naoAplicado.length) resultado.naoAplicado = naoAplicado;
    const notas = juntarListas(base.notasIA, extra.notasIA);
    if (notas.length) resultado.notasIA = notas.join('\n');
    return resultado;
}

// Mesmo nome, conteúdo diferente: mantém o item e avisa na prévia (naoAplicado, que a prévia já exibe).
const comAvisoMesmoNome = (item) => ({ ...item, naoAplicado: juntarListas(item.naoAplicado, [AVISO_MESMO_NOME]) });

// Junta os itens (já lidos) de todas as partes em uma lista só. Mesmo nome normalizado: conteúdo igual = duplicata (descartada);
// conteúdo diferente = mantém os dois, com aviso. Itens sem nome nunca deduplicam.
// `jaExistentes` = itens com `nome` já na prévia (ou só nomes: sem conteúdo para comparar, o nome repetido é descartado).
export function mesclarRespostas(listasDeItens, jaExistentes = []) {
    const itens = [];
    const indicesPorNome = new Map();
    const existentes = new Map(); // nome -> [assinatura | null]
    (Array.isArray(jaExistentes) ? jaExistentes : []).forEach((e) => {
        const nome = normalizarNome(e && typeof e === 'object' ? e.nome : e);
        if (!nome) return;
        if (!existentes.has(nome)) existentes.set(nome, []);
        existentes.get(nome).push(e && typeof e === 'object' ? assinaturaDoItem(e) : null);
    });
    (Array.isArray(listasDeItens) ? listasDeItens : []).forEach((lista) => {
        (Array.isArray(lista) ? lista : []).forEach((item) => {
            if (!item || typeof item !== 'object') return;
            const nome = normalizarNome(item.nome);
            if (!nome) { itens.push(item); return; }
            const assinatura = assinaturaDoItem(item);
            const doExistente = existentes.get(nome) || [];
            if (doExistente.some(a => a === null || a === assinatura)) return;
            const indices = indicesPorNome.get(nome) || [];
            const igual = indices.find(i => assinaturaDoItem(itens[i]) === assinatura);
            if (igual !== undefined) { itens[igual] = absorverDuplicata(itens[igual], item); return; }
            indicesPorNome.set(nome, [...indices, itens.length]);
            itens.push(doExistente.length > 0 || indices.length > 0 ? comAvisoMesmoNome(item) : item);
        });
    });
    return itens;
}

// Classifica um erro da leitura: { tipo, mensagem } com texto amigável.
// tipos: 'sem-chave' | 'cota' | 'timeout' | 'cancelado' | 'json' | 'rede' | 'outro'
export function classificarErroLeitura(erro) {
    if (erro && erro.cancelado) return { tipo: 'cancelado', mensagem: MENSAGEM_CANCELADO };
    const msg = String((erro && erro.message) || erro || '');
    const m = msg.toLowerCase();
    if (/chave do gemini/.test(m) && /(não foi configurada|cadastr)/.test(m) && !/inválida/.test(m)) return { tipo: 'sem-chave', mensagem: MENSAGEM_SEM_CHAVE };
    if (/cota/.test(m) || /\b429\b/.test(m)) return { tipo: 'cota', mensagem: MENSAGEM_COTA };
    if (/demorou demais|parou de responder|timeout/.test(m)) return { tipo: 'timeout', mensagem: MENSAGEM_TIMEOUT };
    if (/json/.test(m) || /lista de habilidades|lista "poderes"/.test(m)) return { tipo: 'json', mensagem: MENSAGEM_NAO_JSON };
    if (/falar com o gemini|conex/.test(m)) return { tipo: 'rede', mensagem: msg };
    return { tipo: 'outro', mensagem: msg || 'Não consegui ler o texto com a IA.' };
}

// Erros em que não adianta tentar as próximas partes agora.
export const erroBloqueiaProximas = (tipo) => tipo === 'sem-chave' || tipo === 'cota' || tipo === 'cancelado';

// "Parte 2 não pôde ser lida (motivo)" para cada parte que falhou.
export function descreverFalhas(falhas) {
    return (Array.isArray(falhas) ? falhas : []).map(f => `Parte ${f.indice} de ${f.total} não pôde ser lida${f.erro && f.erro.mensagem ? ` (${f.erro.mensagem})` : ''}.`);
}

// Texto da linha de progresso.
export const textoProgresso = (indice, total) => (total > 1 ? `Lendo parte ${indice} de ${total}…` : 'Lendo o texto…');

// Chave do rascunho do importador na store (um por dono da ficha; só memória).
export const chaveImportadorIA = (dono) => `${dono || '_'}|importador`;
