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
