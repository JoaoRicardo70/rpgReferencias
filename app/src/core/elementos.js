// ==========================================
// ELEMENTOS DO SISTEMA — lista única (id, nome, ícone, cor, categoria) usada pelas Afinidades,
// Habilidades de Redução de Dano e pelos seletores de elemento do Ataque e da Defesa.
// O id é o nome em minúsculas, sem acento e sem o prefixo "Elemento " (ex.: 'vacuo', 'madeira').
// A polaridade (Yin/Yang/Neutro) de cada um vive em core/polaridade.js.
// ==========================================
import { normalizarNome } from './polaridade.js';

export const CATEGORIAS_ELEMENTO = [
    'Cinético',
    'Elementos Básicos',
    'Elementos Avançados',
    'Elementos Primordiais',
    'Primordiais Verdadeiros',
    'Elementos Absolutos',
    'Elementos Astrais',
    'Kekkei Genkai',
    'Kekkei Touta'
];

const E = (categoria, id, nome, icone, cor) => ({ id, nome, icone, cor, categoria });

export const ELEMENTOS_SISTEMA = [
    E('Cinético', 'fisico', 'Cinético', '⚔️', '#cccccc'),
    // Básicos
    E('Elementos Básicos', 'fogo', 'Fogo', '🔥', '#ff4444'),
    E('Elementos Básicos', 'agua', 'Água', '💧', '#0088ff'),
    E('Elementos Básicos', 'raio', 'Raio', '⚡', '#ffcc00'),
    E('Elementos Básicos', 'terra', 'Terra', '🪨', '#d2a679'),
    E('Elementos Básicos', 'vento', 'Vento', '🌪️', '#4dff88'),
    // Avançados
    E('Elementos Avançados', 'solar', 'Solar', '☀️', '#ffb366'),
    E('Elementos Avançados', 'energia', 'Energia', '💫', '#ff66ff'),
    E('Elementos Avançados', 'gelo', 'Gelo', '❄️', '#00ffff'),
    E('Elementos Avançados', 'vacuo', 'Vácuo', '🕳️', '#999999'),
    E('Elementos Avançados', 'natureza', 'Natureza', '🌿', '#66ff66'),
    // Primordiais
    E('Elementos Primordiais', 'luz', 'Luz', '✨', '#fffbd6'),
    E('Elementos Primordiais', 'trevas', 'Trevas', '🌑', '#8800ff'),
    E('Elementos Primordiais', 'ether', 'Éter', '🌌', '#b366ff'),
    // Primordiais Verdadeiros
    E('Primordiais Verdadeiros', 'celestial', 'Celestial', '🌟', '#ffffcc'),
    E('Primordiais Verdadeiros', 'infernal', 'Infernal', '🌋', '#cc0000'),
    E('Primordiais Verdadeiros', 'caos', 'Caos', '🌀', '#ff3399'),
    // Absolutos
    E('Elementos Absolutos', 'criacao', 'Criação', '🎇', '#00ffcc'),
    E('Elementos Absolutos', 'destruicao', 'Destruição', '💥', '#8b0000'),
    E('Elementos Absolutos', 'cosmos', 'Cosmos', '♾️', '#4d0099'),
    // Astrais
    E('Elementos Astrais', 'vida', 'Vida', '🌺', '#33ff77'),
    E('Elementos Astrais', 'morte', 'Morte', '💀', '#4d4d4d'),
    E('Elementos Astrais', 'vazio', 'Vazio', '⬛', '#1a1a1a'),
    // Kekkei Genkai
    E('Kekkei Genkai', 'madeira', 'Madeira', '🪵', '#8b5a2b'),
    E('Kekkei Genkai', 'mineral', 'Mineral', '💎', '#e6e6fa'),
    E('Kekkei Genkai', 'nevoa', 'Névoa', '🌫️', '#b0e0e6'),
    E('Kekkei Genkai', 'areia', 'Areia', '🏜️', '#f4a460'),
    E('Kekkei Genkai', 'tempestade', 'Tempestade', '🌩️', '#ccccff'),
    E('Kekkei Genkai', 'vapor', 'Vapor', '♨️', '#ffb6c1'),
    E('Kekkei Genkai', 'cinzas', 'Cinzas', '🌫️', '#808080'),
    E('Kekkei Genkai', 'igneo', 'Ígneo', '☄️', '#ff4500'),
    E('Kekkei Genkai', 'lava', 'Lava', '🌋', '#ff0000'),
    E('Kekkei Genkai', 'tufao', 'Tufão', '🌪️', '#98fb98'),
    // Kekkei Touta
    E('Kekkei Touta', 'velocidade', 'Velocidade', '💨', '#e6ffff'),
    E('Kekkei Touta', 'poeira', 'Poeira', '🔲', '#d9d9d9'),
    E('Kekkei Touta', 'cal', 'Cal', '⬜', '#e6ccb3'),
    E('Kekkei Touta', 'carbono', 'Carbono', '⬛', '#595959'),
    E('Kekkei Touta', 'veneno', 'Veneno', '☣️', '#9933ff'),
    E('Kekkei Touta', 'som', 'Som', '🔊', '#a6a6a6'),
    E('Kekkei Touta', 'magnetismo', 'Magnetismo', '🧲', '#4169e1'),
    E('Kekkei Touta', 'calor', 'Calor', '🌡️', '#ff6600')
];

// Chave canônica pra comparar elementos vindos de lugares diferentes (id da Ficha, nome do seletor
// de Técnicas, texto livre): minúsculas, sem acento, sem "Elemento " na frente e sem o sufixo
// "Verdadeiro/Verdadeira" (a variante Verdadeira conta como o elemento base).
const APELIDOS_CHAVE = { eter: 'ether', treva: 'trevas' };

export function chaveElemento(nome) {
    const chave = normalizarNome(nome)
        .replace(/^elemento\s+/, '')
        .replace(/\s+verdadeir[oa]$/, '')
        .trim();
    return APELIDOS_CHAVE[chave] || chave;
}

// Agrupa uma lista de elementos ({ categoria }) mantendo a ordem de CATEGORIAS_ELEMENTO; elementos
// personalizados (do Compêndio) sem categoria vão pra "Personalizados" no fim.
export function agruparElementosPorCategoria(elementos) {
    const grupos = new Map();
    CATEGORIAS_ELEMENTO.forEach(c => grupos.set(c, []));
    (Array.isArray(elementos) ? elementos : []).forEach((el) => {
        if (!el) return;
        const cat = el.categoria && grupos.has(el.categoria) ? el.categoria : 'Personalizados';
        if (!grupos.has(cat)) grupos.set(cat, []);
        grupos.get(cat).push(el);
    });
    return [...grupos.entries()].filter(([, itens]) => itens.length > 0).map(([titulo, itens]) => ({ titulo, itens }));
}

// ---------- Custo sugerido por categoria de magia ----------
// Custo POR NÍVEL (cada nível/ciclo com o seu): a sugestão pré-preenche o campo Custo (%) do formulário de Técnica Elemental e é
// sempre editável. Não há espaços de magia nem recurso x/y.
// Magia de Ciclo comum (as 'Magias Arcanas/Negra de Nº Ciclo' e os Truques NÃO têm sugestão).
export const CUSTO_SUGERIDO_CICLO = { 1: 10, 2: 11, 3: 12, 4: 13, 5: 14, 6: 15, 7: 16, 8: 17, 9: 18, 10: 20 };
// Por grupo do Grimório que EXISTE no app (título do grupo começa com a chave).
export const CUSTO_SUGERIDO_POR_GRUPO = { 'Kekkei Genkai': 10, 'Kekkei Touta': 20 };
// Tabelas de categorias que o app ainda NÃO tem (guardadas aqui para quando existirem; nada as usa hoje):
//   Magia Ancestral por nível: 1 = 10%, 2 = 15%, 3 = 25% (o app não distingue o nível da Ancestral).
//   Respiração (1) = 20%; Domínio Simples = 40%; Nen: técnicas de Nen = 5%, Nen avançado = 15%, Especializações = 30%, Não-especializado = 50%.
//   Portões: 1º ao 9º = 10% + 5% por portão aberto (custoSugeridoPortao); 10º Portão = 100%.
//   Composição de elementos: 2 elementos = 20%, 3 elementos = 30% (o app não tem composição).
export const CUSTO_SUGERIDO_ANCESTRAL = { 1: 10, 2: 15, 3: 25 };
export const CUSTO_SUGERIDO_FIXO = { respiracao: 20, dominioSimples: 40, nenTecnica: 5, nenAvancado: 15, nenEspecializacao: 30, nenNaoEspecializado: 50, decimoPortao: 100 };
export const custoSugeridoPortao = (n) => (n === 10 ? 100 : n >= 1 && n <= 9 ? 10 + 5 * (n - 1) : null);

// Custo sugerido (% inteiro) ou null: `nomeElemento` = o elemento/categoria escolhido ('Magias de 3º Ciclo'), `tituloGrupo` = o grupo do Grimório onde ele está.
export function custoSugeridoDaCategoria(nomeElemento, tituloGrupo = '') {
    const m = /^Magias de (\d+)º Ciclo$/.exec(String(nomeElemento || '').trim());
    if (m) return CUSTO_SUGERIDO_CICLO[Number(m[1])] ?? null;
    const grupo = Object.keys(CUSTO_SUGERIDO_POR_GRUPO).find(k => String(tituloGrupo || '').startsWith(k));
    return grupo ? CUSTO_SUGERIDO_POR_GRUPO[grupo] : null;
}
