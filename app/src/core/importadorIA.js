// ==========================================
// 🔮 CÍRCULO DE INVOCAÇÃO (IA) — lógica pura. O jogador cola o texto original de uma Habilidade/Forma/Poder (do Google Docs),
// copia o prompt gerado, leva a uma IA e cola de volta o JSON. Aqui: monta o prompt (com as listas REAIS de atributos,
// propriedades e estados do sistema), lê a resposta da IA (que costuma vir com ```json e texto em volta), valida cada item com
// o mesmo normalizarPoder da Sexta-Feira e prepara a PRÉVIA que o jogador revisa antes de gravar.
// ==========================================
import { ESTADOS } from './condicoes';
import { ATRIBUTOS_EFEITO, PROPRIEDADES_EFEITO, CATEGORIAS_PODER, normalizarPoder, resumirProposta } from './sextaFeiraCriacao';
import { ATRIBUTOS_COM_QUANDO } from './efeitosCondicionais';

export const ROTULO_CATEGORIA = { habilidade: 'Habilidades', forma: 'Formas', poder: 'Poderes' };

// Multiplicadores (xN no dano, xN em status, xN em Poder Direto...) das fichas antigas NÃO são importados por enquanto: foram
// pensados para outra escala (o multiplicador de dano virou aumento de Poder Calculado). Ficam nas notas, para o jogador decidir.
export const PROPRIEDADES_NAO_IMPORTADAS = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'];

// 'dano' não tem efeito no Grimório (os multiplicadores de dano só entram no Poder Calculado e o editor já esconde esse atributo).
export const ATRIBUTOS_NAO_IMPORTADOS = ['dano'];

const LIMITE_NOTAS = 4000;

export function montarPromptImportacao(texto, categoria = 'habilidade') {
    const rotulo = ROTULO_CATEGORIA[categoria] || ROTULO_CATEGORIA.habilidade;
    const padrao = ROTULO_CATEGORIA[categoria] ? categoria : 'habilidade';
    return `Atue como extrator de dados de um sistema de RPG.
Transforme TODAS as ${rotulo.toLowerCase()} do texto abaixo em itens do array "poderes", UM item por habilidade (não junte, não resuma, não pule nenhuma).
Mesmo que usem fogo, gelo ou magia, COLOQUE em "poderes": o usuário quer registrá-las nesta aba.

CAMPOS DE CADA ITEM
- "nome" e "descricao" (copie o texto original da habilidade, sem resumir).
- "categoria": "habilidade", "forma" ou "poder" (se o texto não disser, use "${padrao}").
- "danoQtd" e "danoFaces": "15d6" vira 15 e 6. Sem dano: 0 e 0.
- "custoPercentual": custo em % das energias, se o texto disser (senão 0). "alcance" e "area": em quadrados (senão 0).
- "tipoAcao": "acao", "bonus", "reacao", "movimento", "livre" ou "" se não estiver claro.
- "efeitos": efeitos que valem enquanto a habilidade está LIGADA (ativa).
- "efeitosPassivos": efeitos que valem SEMPRE (seções "Passivas", "sempre ativo", "você recebe..."). Se a habilidade só tem passivas, use só este campo.
  Cada efeito: {"nome": "...", "atributo": "...", "propriedade": "...", "valor": 0}. "valor" é SEMPRE um número puro.
- "aplicaEstados": estados que a habilidade causa em quem ela atinge: [{"id": "...", "stacks": 1}]. Ids válidos: ${ESTADOS.map(e => e.id).join(', ')}.
- "notasIA": regras que NÃO cabem nos campos acima (condições, gatilhos, usos por cena, testes, requisitos), em frases curtas, uma por linha.
- "naoAplicado": lista de frases curtas com tudo que o texto diz e que você NÃO conseguiu colocar em nenhum campo.

ATRIBUTOS VÁLIDOS de um efeito (use exatamente estes nomes): ${ATRIBUTOS_EFEITO.join(', ')}
PROPRIEDADE: use "base" (soma fixa) na grande maioria. Outras: reducaocusto, regeneracao (em % do máximo por turno), elemento_inato.

COMO TRADUZIR
- "+N de CA" ou "+N na CA": crie DOIS efeitos, {"atributo":"evasiva","propriedade":"base","valor":N} e {"atributo":"resistencia","propriedade":"base","valor":N}.
- "+N de Acerto" ou "+N na rolagem de ataque": {"atributo":"acerto","propriedade":"base","valor":N}.
- "+N em Força/Destreza/Inteligência...": {"atributo":"forca" (ou destreza, inteligencia...),"propriedade":"base","valor":N}.
- "reduz o dano em X%": {"atributo":"reducao_dano","propriedade":"base","valor":X}.
- Reação que reduz o dano de um ataque que acertou você em X% (ex.: "pela metade" = 50): {"atributo":"reacao_acertou","propriedade":"reduzir_dano","valor":X}.
- "+N ações/ações bônus/reações por turno": atributo acao_padrao, acao_bonus ou acao_reacao, propriedade "base".
- "+N na Iniciativa": {"atributo":"iniciativa","propriedade":"base","valor":N}.
- "vantagem nas jogadas de ataque": {"atributo":"vantagem","propriedade":"base","valor":1,"escopo":"ataque"}. "vantagem em testes de Percepção": {"atributo":"vantagem","propriedade":"base","valor":1,"escopo":"teste:percepcao"} (escopo: "teste" = todos os testes; "teste:<perícia ou atributo>" = um só, ex.: intuicao, percepcao, procurar, furtividade, acrobacia, atletismo, trapacear, diplomacia, sentir_motiv, forca, destreza; "tudo" = ataques e testes). "desvantagem": mesmo formato com atributo "desvantagem".
- "trate um resultado de 7 ou menos no d20 como 8" (em testes de Intuição): {"atributo":"piso_d20","propriedade":"base","valor":8,"escopo":"teste:intuicao"}.
- Crítico: "Crítico a partir de 14": {"atributo":"margem_critico","propriedade":"base","valor":14}. "Crítico FATAL a partir de 19": {"atributo":"margem_critico_fatal","propriedade":"base","valor":19}. Crítico e Crítico Fatal são DIFERENTES: não troque um pelo outro. "Todo acerto contra um alvo surpreso é crítico": {"atributo":"critico_automatico","propriedade":"base","valor":1,"quando":"alvo_com_estado:surpreso"} (use "critico_fatal_automatico" se o texto disser Crítico Fatal).
- CONDIÇÃO ("quando", opcional): só use se o texto condicionar o efeito. Valores: "em_combate", "empunhando_arma" ou "empunhando_arma:<tipo, ex.: espada>", "alvo_com_estado:<id do estado>", "alvo_vida_abaixo:<%>". Sem condição, não escreva o campo. O "quando" SÓ pode ser usado nestes atributos: ${ATRIBUTOS_COM_QUANDO.join(', ')}. Para qualquer outro atributo (forca, dano, vida...), NÃO escreva "quando": o efeito condicional vai para "naoAplicado".
NÃO CONVERTA multiplicadores (xN no dano, xN em status, xN em poder direto, "dobra", "triplica"...): não crie efeito para eles. Coloque cada um em "naoAplicado" (ex.: "x40 em todo dano").
Se não existir um atributo exato para o que o texto pede, NÃO invente: coloque em "naoAplicado" e em "notasIA".

TEXTO:
${String(texto || '').trim()}

RETORNE SOMENTE UM JSON PURO, sem explicações:
{
  "poderes": [{ "nome": "X", "descricao": "Y", "categoria": "${padrao}", "danoQtd": 0, "danoFaces": 0, "custoPercentual": 0, "alcance": 0, "area": 0, "tipoAcao": "", "efeitos": [], "efeitosPassivos": [{ "nome": "Pele dura", "atributo": "evasiva", "propriedade": "base", "valor": 5 }], "aplicaEstados": [], "notasIA": "", "naoAplicado": [] }]
}`;
}

// Acha o primeiro JSON (objeto ou lista) numa resposta de IA: tira cercas ```json e texto em volta, ignorando chaves dentro de strings.
export function extrairJson(texto, aPartirDe = 0) {
    const s = String(texto || '').replace(/```(?:json|JSON)?/g, ' ');
    const inicio = s.slice(aPartirDe).search(/[{[]/) + aPartirDe;
    if (inicio < aPartirDe) return null;
    const abre = s[inicio];
    const fecha = abre === '{' ? '}' : ']';
    let nivel = 0, emTexto = false, escape = false;
    for (let i = inicio; i < s.length; i++) {
        const c = s[i];
        if (emTexto) {
            if (escape) escape = false;
            else if (c === '\\') escape = true;
            else if (c === '"') emTexto = false;
            continue;
        }
        if (c === '"') emTexto = true;
        else if (c === abre) nivel++;
        else if (c === fecha && --nivel === 0) return s.slice(inicio, i + 1);
    }
    return null;
}

const CHAVES_DE_LISTA = ['poderes', 'habilidades', 'formas', 'itens', 'poder', 'habilidade', 'forma', 'items', 'abilities'];
const ehObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v);

// A IA nem sempre obedece ao formato: aceita a lista na raiz, sob qualquer chave conhecida (ou qualquer lista de objetos), um poder
// solto (objeto com "nome") e um mapa { "Nome": { ... } }. Devolve a lista ou null.
function acharListaDePoderes(dados) {
    if (Array.isArray(dados)) return dados;
    if (!ehObjeto(dados)) return null;
    // Uma chave conhecida vazia não pode vencer outra preenchida ({"poderes":[], "habilidades":[...]}).
    const conhecida = CHAVES_DE_LISTA.find(chave => Array.isArray(dados[chave]) && dados[chave].length > 0);
    if (conhecida) return dados[conhecida];
    if (typeof dados.nome === 'string') return [dados];
    // Só vale lista de objetos COM nome: senão a lista de efeitos de um poder solto (sem "nome") seria tomada por poderes.
    const listaQualquer = Object.values(dados).find(v => Array.isArray(v) && v.some(o => ehObjeto(o) && typeof o.nome === 'string'));
    if (listaQualquer) return listaQualquer;
    const mapa = Object.values(dados).filter(v => ehObjeto(v) && typeof v.nome === 'string');
    return mapa.length ? mapa : null;
}

// Lê a resposta da IA. Devolve { ok: true, itens: [objetos] } ou { ok: false, erro }.
export function lerRespostaDaIA(texto) {
    // A instrução gerada traz exemplos de JSON: se ela for colada no lugar da resposta, o leitor tolerante os tomaria por poderes.
    if (/Atue como extrator/i.test(String(texto || ''))) return { ok: false, erro: 'Você colou a instrução (o prompt) em vez da resposta da IA. Leve a instrução à IA e cole aqui o JSON que ela devolver.' };
    const limpo = String(texto || '').replace(/```(?:json|JSON)?/g, ' ');
    // Varre os blocos de JSON do texto, do primeiro ao último. Texto solto antes da resposta ("veja [1]", "[nota]") não pode
    // esconder a resposta de verdade: um bloco que não parseia é tentado de novo um caractere adiante; um bloco que parseia mas
    // não rende itens é PULADO (nunca se entra nele, senão a lista de efeitos de um poder viraria "poderes").
    let pos = 0;
    let acheiBloco = false;
    let primeiroLido;
    let listaVazia = false;
    for (;;) {
        const bruto = extrairJson(limpo, pos);
        if (!bruto) break;
        acheiBloco = true;
        const inicio = limpo.indexOf(bruto, pos);
        let dados;
        try { dados = JSON.parse(bruto); } catch (e) { pos = inicio + 1; continue; }
        if (primeiroLido === undefined) primeiroLido = dados;
        const lista = acharListaDePoderes(dados);
        if (Array.isArray(lista)) {
            const itens = lista.filter(ehObjeto);
            if (itens.length) return { ok: true, itens };
            listaVazia = true;
        }
        pos = inicio + bruto.length;
    }
    if (!acheiBloco) return { ok: false, erro: 'Não achei um JSON na resposta. Cole a resposta completa da IA.' };
    if (primeiroLido === undefined) return { ok: false, erro: 'O JSON está incompleto ou com erro. Peça à IA para devolver de novo, só o JSON.' };
    if (listaVazia) return { ok: false, erro: 'A lista "poderes" veio vazia.' };
    const chaves = ehObjeto(primeiroLido) ? Object.keys(primeiroLido).slice(0, 8).join(', ') : '';
    return { ok: false, erro: `O JSON foi lido, mas não achei nele a lista de habilidades${chaves ? ` (chaves encontradas: ${chaves})` : ''}. Peça à IA para devolver {"poderes": [ ... ]}.` };
}

const num = (v, padrao = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : padrao; };
const minusculo = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const existeNaLista = (lista, v) => lista.some(op => minusculo(op) === minusculo(v));
// Lista de frases sem vazias e sem repetidas (a IA costuma repetir o mesmo item em notasIA e em naoAplicado).
const textoLista = (v) => {
    const vistos = new Set();
    return (Array.isArray(v) ? v : (v ? [v] : [])).map(s => String(s ?? '').trim()).filter(s => {
        const chave = s.toLowerCase();
        if (!s || vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
};
// A IA às vezes devolve a categoria no plural ou fora da lista: aceita o plural e, se não reconhecer, usa a aba aberta.
const CATEGORIA_POR_NOME = { habilidade: 'habilidade', habilidades: 'habilidade', poder: 'poder', poderes: 'poder', forma: 'forma', formas: 'forma' };
const categoriaDoItem = (v, padrao) => CATEGORIA_POR_NOME[minusculo(v)] || padrao;
const descreverEfeito = (e) => `${e && e.nome ? `${e.nome}: ` : ''}${e && e.atributo ? e.atributo : '?'} ${e && e.propriedade ? e.propriedade : '?'} ${e && e.valor !== undefined ? e.valor : '?'}`;

// Tira os efeitos que não vamos importar (multiplicadores) ou que não têm valor numérico; o que sair vira texto em `naoAplicado`.
function separarEfeitosImportaveis(lista, naoAplicado) {
    return (Array.isArray(lista) ? lista : []).filter((e) => {
        if (!e || typeof e !== 'object') {
            if (typeof e === 'string' && e.trim()) naoAplicado.push(`Efeito em formato inválido não importado (${e.trim()})`);
            return false;
        }
        if (Object.keys(e).length === 0) return false; // {} não diz nada: não polui as notas
        if (!existeNaLista(ATRIBUTOS_EFEITO, e.atributo) || !existeNaLista(PROPRIEDADES_EFEITO, e.propriedade)) {
            naoAplicado.push(`Efeito que o sistema ainda não tem, não importado (${descreverEfeito(e)})`);
            return false;
        }
        if (PROPRIEDADES_NAO_IMPORTADAS.includes(minusculo(e.propriedade))) {
            naoAplicado.push(`Multiplicador não importado (${descreverEfeito(e)})`);
            return false;
        }
        const condicao = String(e.quando ?? '').trim();
        if (condicao && minusculo(condicao) !== 'sempre' && !ATRIBUTOS_COM_QUANDO.includes(minusculo(e.atributo))) {
            naoAplicado.push(`Efeito condicional que o sistema ainda não suporta nesse atributo, não importado (${descreverEfeito(e)}; quando: ${condicao})`);
            return false;
        }
        if (ATRIBUTOS_NAO_IMPORTADOS.includes(minusculo(e.atributo))) {
            naoAplicado.push(`Efeito em dano não importado (${descreverEfeito(e)})`);
            return false;
        }
        if (!Number.isFinite(parseFloat(String(e.valor ?? '').replace(',', '.')))) {
            naoAplicado.push(`Efeito sem valor numérico não importado (${descreverEfeito(e)})`);
            return false;
        }
        return true;
    }).map(e => ({ ...e, valor: num(e.valor) }));
}

// Valida UM item vindo da IA e devolve { objeto, avisos, naoAplicado, valido }. `objeto` já está no formato do Grimório (sem id).
export function prepararItemImportado(bruto, categoriaPadrao = 'habilidade') {
    const p = bruto && typeof bruto === 'object' ? bruto : {};
    const naoAplicado = textoLista(p.naoAplicado);
    const faces = num(p.danoFaces ?? p.dadosFaces);
    const dados = {
        ...p,
        categoria: categoriaDoItem(p.categoria, categoriaPadrao),
        dadosQtd: Math.max(0, Math.floor(num(p.danoQtd ?? p.dadosQtd))),
        dadosFaces: faces > 0 ? Math.floor(faces) : undefined,
        custoPercentual: num(p.custoPercentual),
        alcance: num(p.alcance),
        area: num(p.area),
        fadigaPorUso: num(p.fadigaPorUso),
        efeitos: separarEfeitosImportaveis(p.efeitos, naoAplicado),
        efeitosPassivos: separarEfeitosImportaveis(p.efeitosPassivos, naoAplicado),
    };
    if (p.suporte && typeof p.suporte === 'object' && Array.isArray(p.suporte.buffs)) {
        dados.suporte = { ...p.suporte, buffs: separarEfeitosImportaveis(p.suporte.buffs, naoAplicado) };
    }
    const { objeto, avisos, valido } = normalizarPoder(dados);
    objeto.custoPercentualMax = 0;
    objeto.semComoPoder = false;
    objeto.naoAplicado = naoAplicado;
    objeto.notasIA = juntarNotas(objeto.notasIA, naoAplicado);
    return { objeto, avisos, naoAplicado, valido };
}

// Notas finais do poder: o que a IA escreveu + o que não foi aplicado, para nada se perder.
export function juntarNotas(notas, naoAplicado) {
    const lista = textoLista(naoAplicado);
    const bloco = lista.length ? `Não aplicado automaticamente:\n${lista.map(s => `- ${s}`).join('\n')}` : '';
    // O bloco "não aplicado" é o que mais importa não perder: se faltar espaço, corta-se o texto da IA, não o bloco.
    const espaco = bloco ? Math.max(0, LIMITE_NOTAS - bloco.length - 2) : LIMITE_NOTAS;
    const base = String(notas || '').trim().substring(0, espaco).trim();
    return [base, bloco].filter(Boolean).join('\n\n').substring(0, LIMITE_NOTAS);
}

// Prepara a lista inteira para a prévia: [{ chave, marcado, objeto, avisos, naoAplicado, valido }].
export function prepararImportacao(itens, categoriaPadrao = 'habilidade', chaveInicial = 1) {
    return (Array.isArray(itens) ? itens : []).map((bruto, i) => {
        const r = prepararItemImportado(bruto, categoriaPadrao);
        return { chave: chaveInicial + i, marcado: r.valido, objeto: r.objeto, avisos: r.avisos, naoAplicado: r.naoAplicado, valido: r.valido };
    });
}

// Troca a categoria de um item da prévia mantendo os campos coerentes (Forma tem fadiga; Habilidade/Poder têm Maestria Requerida).
export function mudarCategoriaImportada(objeto, categoria) {
    if (!objeto || !CATEGORIAS_PODER.includes(categoria)) return objeto;
    const novo = { ...objeto, categoria };
    if (categoria === 'forma') {
        delete novo.maestriaRequerida;
        novo.fadigaPorUso = novo.fadigaPorUso ?? 0;
    } else {
        delete novo.fadigaPorUso;
        novo.maestriaRequerida = novo.maestriaRequerida ?? 0;
    }
    return novo;
}

// Resumo de uma linha para a prévia.
export function resumirItemImportado(objeto) {
    return objeto ? resumirProposta('poder', objeto, { extras: false }) : '';
}

// Poder pronto para ir para ficha.poderes: cópia profunda (a prévia e a ficha nunca dividem objetos) + id.
export function montarPoderFinal(objeto, id) {
    const copia = JSON.parse(JSON.stringify(objeto || {}));
    delete copia.naoAplicado;
    return { ...copia, id };
}

// Compatibilidade: um item vindo da IA direto para o formato do Grimório (usado antes da prévia existir).
export function montarPoderImportado(p, categoria, id) {
    return montarPoderFinal(prepararItemImportado(p, categoria).objeto, id);
}
