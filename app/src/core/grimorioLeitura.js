// ==========================================
// LIVRO DA ENTIDADE (Sandbox do Mestre) — organização da ficha de OUTRO personagem para leitura.
// Lógica pura: separa Habilidades / Poderes / Formas (como a aba Poderes Clássicos), agrupa por
// pasta (mesma regra de components/poderes/PoderesSubComponents.jsx > PoderesLista), agrupa as
// Técnicas Elementais por elemento e decide em qual aba um pedido da Sexta-Feira aparece.
// ==========================================

export const SEM_PASTA = 'Sem Pasta';

// Abas do livro da entidade (Sandbox do Mestre), na ordem em que aparecem. 'ficha' é a Ficha
// Definitiva; as outras são as leituras desta ficha.
export const ABAS_LIVRO_ENTIDADE = [
    { id: 'ficha', icone: '📕', nome: 'Ficha Definitiva' },
    { id: 'habilidade', icone: '🌀', nome: 'Habilidades' },
    { id: 'poder', icone: '⚡', nome: 'Poderes' },
    { id: 'forma', icone: '🎭', nome: 'Formas' },
    { id: 'magias', icone: '🔥', nome: 'Técnicas Elementais' },
    { id: 'inventario', icone: '🎒', nome: 'Inventário' },
];

// Listas da ficha podem chegar do banco como objeto ({0: .., 1: ..}) em vez de array.
export function listaDaFicha(v) {
    const base = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);
    return base.filter(item => item && typeof item === 'object');
}

// Categoria de um poder na aba Poderes Clássicos (sem categoria = 'poder', como lá).
export function categoriaDoPoder(p) {
    const cat = String(p?.categoria || 'poder').toLowerCase();
    return ['habilidade', 'poder', 'forma'].includes(cat) ? cat : 'poder';
}

export function separarPoderesPorCategoria(poderes) {
    const grupos = { habilidade: [], poder: [], forma: [] };
    listaDaFicha(poderes).forEach(p => { grupos[categoriaDoPoder(p)].push(p); });
    return grupos;
}

// Formas SEMPRE por pasta; Habilidades e Poderes só quando algum item já tem pasta (senão lista
// simples). Devolve null pra "lista simples" ou [{ nome, itens }] com "Sem Pasta" por último.
export function agruparPorPasta(itens, categoria) {
    const lista = listaDaFicha(itens);
    if (categoria !== 'forma' && !lista.some(p => String(p.pasta || '').trim())) return null;
    const mapa = {};
    lista.forEach(p => {
        const nome = String(p.pasta || '').trim() || SEM_PASTA;
        (mapa[nome] = mapa[nome] || []).push(p);
    });
    const nomes = Object.keys(mapa).filter(n => n !== SEM_PASTA).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (mapa[SEM_PASTA]) nomes.push(SEM_PASTA);
    return nomes.map(nome => ({ nome, itens: mapa[nome] }));
}

// Técnicas Elementais por elemento, em ordem alfabética: [{ elemento, itens }].
export function agruparTecnicasPorElemento(magias) {
    const mapa = {};
    listaDaFicha(magias).forEach(m => {
        const elemento = String(m.elemento || '').trim() || 'Neutro';
        (mapa[elemento] = mapa[elemento] || []).push(m);
    });
    return Object.keys(mapa).sort((a, b) => a.localeCompare(b, 'pt-BR')).map(elemento => ({ elemento, itens: mapa[elemento] }));
}

// "[FORCA] MGERAL: +2" (mesmo texto da aba Poderes Clássicos).
export function textoEfeito(e) {
    if (!e || typeof e !== 'object') return '';
    return `[${String(e.atributo || '').replace('_', ' ').toUpperCase()}] ${String(e.propriedade || '').toUpperCase()}: +${e.valor || 0}`;
}

// Em qual aba do Livro da Entidade um pedido da Sexta-Feira aparece.
export function abaDoPedido(pedido) {
    if (!pedido) return null;
    if (pedido.tipo === 'poder') return categoriaDoPoder(pedido.objeto);
    if (pedido.tipo === 'magia') return 'magias';
    if (pedido.tipo === 'item') return 'inventario';
    return null;
}
