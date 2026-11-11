// ==========================================
// 🎨 PERSONALIZAÇÃO DE COR DO GRIMÓRIO — lógica pura.
// O Grimório herda o estilo do app (classe `theme-*` no <body>, escolhido em Perfil > Aparência). A única coisa
// que a ficha guarda é a cor de destaque opcional: `ficha.esteticaGrimorio = { corDestaque: '#rrggbb' }`.
// Ela sobrescreve só as variáveis de cor do tema (--cor-primaria etc.) DENTRO do Grimório, então botões, campos
// e bordas continuam sendo os mesmos componentes do app. Sem cor = segue o tema, sem nada a guardar.
// ==========================================

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

// '#0af' ou '#00aaff' -> '#00aaff' (minúsculo); qualquer outra coisa -> ''.
export function normalizarCorDestaque(valor) {
    if (typeof valor !== 'string') return '';
    const v = valor.trim();
    if (HEX6.test(v)) return v.toLowerCase();
    if (HEX3.test(v)) return ('#' + v.slice(1).split('').map(c => c + c).join('')).toLowerCase();
    return '';
}

// '#00aaff' -> '0, 170, 255' (formato das variáveis --cor-*-rgb); cor inválida -> ''.
export function hexParaRgbTexto(hex) {
    const h = normalizarCorDestaque(hex);
    if (!h) return '';
    return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ');
}

// Migra o que estiver salvo em ficha.esteticaGrimorio (inclusive o formato antigo de "livro": corPapel,
// corTexto, corTinta, bgImg, modoFundo, corFundoTint, diarioFonte) para { corDestaque }.
// Campos antigos são descartados; a antiga cor de tinta, se válida, vira a cor de destaque. Nunca lança erro.
export function migrarEsteticaGrimorio(bruto) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
    const cor = normalizarCorDestaque(bruto.corDestaque) || normalizarCorDestaque(bruto.corTinta);
    return cor ? { corDestaque: cor } : {};
}

// Variáveis CSS que o Grimório aplica no elemento raiz para trocar a cor do tema ({} = segue o tema do app).
export function varsCssDestaque(corDestaque) {
    const cor = normalizarCorDestaque(corDestaque);
    if (!cor) return {};
    const rgb = hexParaRgbTexto(cor);
    return {
        '--cor-primaria': cor,
        '--cor-primaria-rgb': rgb,
        '--border-primary': `rgba(${rgb}, 0.35)`,
        '--shadow-primary': `rgba(${rgb}, 0.45)`,
        '--bg-panel-hover': `rgba(${rgb}, 0.12)`
    };
}
