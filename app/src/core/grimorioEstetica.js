// ==========================================
// 🎨 PERSONALIZAÇÃO DE COR DO GRIMÓRIO — lógica pura.
// O Grimório herda o estilo do app (classe `theme-*` no <body>, escolhido em Perfil > Aparência). A única coisa
// que a ficha guarda são três cores opcionais: `ficha.esteticaGrimorio = { corDestaque, corTexto, corFundo }` (#rrggbb).
// Elas sobrescrevem só variáveis CSS DENTRO do Grimório (destaque -> --cor-primaria & cia; texto -> --grimorio-texto;
// fundo -> --grimorio-fundo e --bg-body-2). Cor ausente = segue o tema do app, sem nada a guardar.
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

// Chaves do formato antigo de "livro" (papel/tinta). Nele `corTexto` era tinta sobre papel e NÃO vale como cor de texto atual.
const CHAVES_LEGADO = ['corPapel', 'corTinta', 'bgImg', 'modoFundo', 'corFundoTint', 'diarioFonte'];

// Migra o que estiver salvo em ficha.esteticaGrimorio para { corDestaque?, corTexto?, corFundo? }.
// Formato antigo: só a cor de tinta (se válida) vira destaque; o resto é descartado. Nunca lança erro.
export function migrarEsteticaGrimorio(bruto) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
    const legado = CHAVES_LEGADO.some(k => k in bruto);
    const saida = {};
    const destaque = normalizarCorDestaque(bruto.corDestaque) || normalizarCorDestaque(bruto.corTinta);
    if (destaque) saida.corDestaque = destaque;
    if (!legado) {
        const texto = normalizarCorDestaque(bruto.corTexto);
        const fundo = normalizarCorDestaque(bruto.corFundo);
        if (texto) saida.corTexto = texto;
        if (fundo) saida.corFundo = fundo;
    }
    return saida;
}

// Monta o objeto a gravar, só com as cores válidas (ausente = segue o tema).
export function montarEsteticaGrimorio({ corDestaque, corTexto, corFundo } = {}) {
    const saida = {};
    const d = normalizarCorDestaque(corDestaque);
    const t = normalizarCorDestaque(corTexto);
    const f = normalizarCorDestaque(corFundo);
    if (d) saida.corDestaque = d;
    if (t) saida.corTexto = t;
    if (f) saida.corFundo = f;
    return saida;
}

// Todas as variáveis do Grimório a partir de { corDestaque, corTexto, corFundo }. Só valores derivados de hex validado.
export function varsCssGrimorio(estetica) {
    const e = montarEsteticaGrimorio(estetica || {});
    const vars = varsCssDestaque(e.corDestaque);
    if (e.corTexto) vars['--grimorio-texto'] = e.corTexto;
    if (e.corFundo) {
        vars['--grimorio-fundo'] = e.corFundo;
        vars['--bg-body-2'] = e.corFundo;
    }
    return vars;
}

// Luminância relativa WCAG de '#rrggbb' (0..1); cor inválida -> null.
export function luminanciaRelativa(hex) {
    const h = normalizarCorDestaque(hex);
    if (!h) return null;
    const [r, g, b] = [1, 3, 5].map(i => {
        const c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Razão de contraste WCAG (1..21) entre duas cores hex; inválida -> null.
export function razaoContraste(hexA, hexB) {
    const a = luminanciaRelativa(hexA);
    const b = luminanciaRelativa(hexB);
    if (a === null || b === null) return null;
    const [claro, escuro] = a >= b ? [a, b] : [b, a];
    return (claro + 0.05) / (escuro + 0.05);
}

export const CONTRASTE_MINIMO = 3;

// true se a razão entre texto e fundo for conhecida e menor que o mínimo.
export function contrasteBaixo(corTexto, corFundo) {
    const r = razaoContraste(corTexto, corFundo);
    return r !== null && r < CONTRASTE_MINIMO;
}

// Valor computado do navegador ('rgb(10, 20, 30)', '#abc') -> '#rrggbb'; senão ''.
export function cssParaHex(valor) {
    if (typeof valor !== 'string') return '';
    const v = valor.trim();
    const hex = normalizarCorDestaque(v);
    if (hex) return hex;
    const paraHex = (rgb) => '#' + rgb.map(n => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0')).join('');
    const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(v);
    if (m) return paraHex([m[1], m[2], m[3]].map(Number));
    const h = /^hsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%/i.exec(v);
    if (!h) return '';
    const matiz = ((Number(h[1]) % 360) + 360) % 360;
    const s = Math.min(100, Number(h[2])) / 100;
    const l = Math.min(100, Number(h[3])) / 100;
    const f = (n) => {
        const k = (n + matiz / 30) % 12;
        return (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
    };
    return paraHex([f(0), f(8), f(4)]);
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
