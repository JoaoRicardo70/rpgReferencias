// ==========================================
// 🗂️ CATEGORIAS DE PODER — lista ÚNICA das abas do Livro dos Poderes (Grimório). Lógica pura.
// Cada categoria diz: id (o que fica em `poder.categoria`), rótulos, ícone, regra de liberação na ficha
// (Hierarquia da Alma, Marcados > pág. 4, só o Mestre marca) e flags de regra (copiável, usa Maestria...).
// Tudo que antes assumia 'habilidade' | 'forma' | 'poder' deve consultar este arquivo.
// ==========================================

const sempre = () => true;

// Texto do grau de Singularidade (mesmo texto da Hierarquia da Alma, ClassificacaoPanel.jsx).
export const GRAUS_SINGULARIDADE = {
    '0': 'Grau 0 (Marcado)',
    '1': 'Grau 1 (Nascida)',
    '2': 'Grau 2 (Desenvolvida)',
    '3': 'Grau 3 (Herdada)',
};

// Campos:
//   liberada(ficha)  — a ficha pode ter/criar poderes nesta categoria? (habilidade/forma/poder: sempre)
//   copiavel         — pode ser ensinado/copiado (Mimetismo)? Singularidade NUNCA.
//   maestriaRequerida— usa Maestria + Maestria Requerida (Habilidade/Poder e as novas); Forma tem Maestria + Fadiga por Uso.
//   dicaLiberacao    — o que o Mestre precisa marcar na ficha (só as categorias com liberação)
export const CATEGORIAS_PODER = [
    { id: 'habilidade', rotulo: '🗡️ Habilidades', icone: '🗡️', nome: 'Habilidades', singular: 'Habilidade', artigo: ['uma', 'a'], pluralComArtigo: 'as Habilidades', liberada: sempre, copiavel: true, maestriaRequerida: true, ehForma: false },
    { id: 'forma', rotulo: '🎭 Formas', icone: '🎭', nome: 'Formas', singular: 'Forma', artigo: ['uma', 'a'], pluralComArtigo: 'as Formas', liberada: sempre, copiavel: true, maestriaRequerida: false, ehForma: true },
    { id: 'poder', rotulo: '✨ Poderes', icone: '✨', nome: 'Poderes', singular: 'Poder', artigo: ['um', 'o'], pluralComArtigo: 'os Poderes', liberada: sempre, copiavel: true, maestriaRequerida: true, ehForma: false },
    { id: 'ocular', rotulo: '👁️ Poderes Oculares', icone: '👁️', nome: 'Poderes Oculares', singular: 'Poder Ocular', artigo: ['um', 'o'], pluralComArtigo: 'os Poderes Oculares', liberada: (ficha) => ficha?.hierarquia?.ocular === true, copiavel: true, maestriaRequerida: true, ehForma: false, dicaLiberacao: 'Poderes Oculares' },
    { id: 'infinity', rotulo: '♾️ Infinities', icone: '♾️', nome: 'Infinities', singular: 'Infinity', artigo: ['um', 'o'], pluralComArtigo: 'os Infinities', liberada: (ficha) => ficha?.hierarquia?.infinity === true, copiavel: true, maestriaRequerida: true, ehForma: false, dicaLiberacao: 'Infinity' },
    { id: 'singularidade', rotulo: '🌌 Singularidades', icone: '🌌', nome: 'Singularidades', singular: 'Singularidade', artigo: ['uma', 'a'], pluralComArtigo: 'as Singularidades', liberada: (ficha) => !!ficha?.hierarquia?.singularidade, copiavel: false, maestriaRequerida: true, ehForma: false, dicaLiberacao: 'Singularidade' },
];

export const IDS_CATEGORIA_PODER = CATEGORIAS_PODER.map(c => c.id);
// As 3 categorias originais, sempre disponíveis.
export const IDS_CATEGORIA_BASE = ['habilidade', 'forma', 'poder'];

const POR_ID = Object.fromEntries(CATEGORIAS_PODER.map(c => [c.id, c]));

const minusculo = (v) => String(v == null ? '' : v).normalize('NFKC').replace(/[​-‏⁠﻿]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Plural e singular aceitos (a IA às vezes devolve "habilidades", "infinities", "poderes oculares"...).
const APELIDOS = {
    habilidades: 'habilidade', formas: 'forma', poderes: 'poder',
    oculares: 'ocular', 'poder ocular': 'ocular', 'poderes oculares': 'ocular', olho: 'ocular', olhos: 'ocular', dojutsu: 'ocular',
    infinities: 'infinity', infinitys: 'infinity', infinito: 'infinity',
    singularidades: 'singularidade',
};

// Id canônico de um valor qualquer ('Infinities' -> 'infinity'); '' se não existe.
export function idCategoriaPoder(valor) {
    const v = minusculo(valor);
    if (POR_ID[v]) return v;
    return APELIDOS[v] || '';
}

export const categoriaExiste = (valor) => !!idCategoriaPoder(valor);

// Dados da categoria; desconhecida cai em 'habilidade' (nada quebra com uma categoria que não conhecemos).
export function infoCategoriaPoder(valor) {
    return POR_ID[idCategoriaPoder(valor)] || POR_ID.habilidade;
}

// Categoria de um poder da ficha. Sem categoria = 'poder' (comportamento antigo); inexistente = 'habilidade'.
export function categoriaDoPoderFicha(p) {
    const bruta = p && p.categoria;
    if (bruta == null || String(bruta).trim() === '') return 'poder';
    return idCategoriaPoder(bruta) || 'habilidade';
}

// Mensagem de bloqueio quando o poder é de uma categoria que exige liberação do Mestre e a ficha ainda não tem ('' = pode).
export function mensagemCategoriaNaoLiberada(poder, ficha) {
    const cat = POR_ID[categoriaDoPoderFicha(poder)];
    if (!cat || !cat.dicaLiberacao || cat.liberada(ficha)) return '';
    return `O Mestre ainda não liberou ${cat.dicaLiberacao} para este personagem (Ficha > pág. 4, Marcados). Peça a liberação e aceite de novo.`;
}

export const categoriaLiberadaNaFicha = (valor, ficha) => {
    const id = idCategoriaPoder(valor);
    return !!id && POR_ID[id].liberada(ficha);
};

// Categorias liberadas na ficha, mais as que já têm poderes (os dados nunca ficam escondidos), na ordem da lista única.
export function categoriasVisiveisNaFicha(ficha) {
    const poderes = Array.isArray(ficha?.poderes) ? ficha.poderes : [];
    const comDados = new Set(poderes.filter(Boolean).map(p => idCategoriaPoder(p.categoria)).filter(Boolean));
    return CATEGORIAS_PODER.filter(c => c.liberada(ficha) || comDados.has(c.id));
}

// Categorias que existem mas ainda não foram liberadas (pra dica ao Mestre).
export const categoriasNaoLiberadas = (ficha) => CATEGORIAS_PODER.filter(c => !c.liberada(ficha));

// A categoria usa Maestria + Maestria Requerida (Habilidade, Poder e as novas)? Forma tem Maestria + Fadiga por Uso.
// Categoria desconhecida = false (não usa Maestria nenhuma, como antes).
export const usaMaestriaRequerida = (valor) => !!POR_ID[idCategoriaPoder(valor)]?.maestriaRequerida;
export const ehCategoriaForma = (valor) => idCategoriaPoder(valor) === 'forma';

// Poder copiável/ensinável? Só Singularidade é bloqueada.
export const poderEhCopiavel = (poder) => {
    const id = idCategoriaPoder(poder && poder.categoria);
    return id ? POR_ID[id].copiavel : true;
};
export const MENSAGEM_SINGULARIDADE_NAO_COPIA = 'Singularidade é impossível de copiar ou ensinar (regra absoluta da Hierarquia da Alma).';

// Texto do grau liberado ('' sem grau).
export const textoGrauSingularidade = (ficha) => GRAUS_SINGULARIDADE[String(ficha?.hierarquia?.singularidade ?? '')] || '';

// Dica ao Mestre quando alguma categoria especial não está liberada.
export const DICA_LIBERAR_CATEGORIAS = 'Libere Oculares/Infinity/Singularidade na Ficha > pág. 4 (Marcados).';
