// Escape e sanitização de HTML (lógica pura). Todo texto vindo de jogador/IA/Firebase que for
// montado em HTML deve passar por escaparHtml() NA ORIGEM; e o ponto de render que usa
// dangerouslySetInnerHTML deve passar o resultado por sanitizarHtml() (entradas antigas do feed
// podem conter HTML não escapado vindo de outros clientes).

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escaparHtml(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const TAGS_PERMITIDAS = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'span', 'div', 'small', 'p', 'strike', 's', 'del']);
const PROPRIEDADES_PERMITIDAS = new Set([
    'color', 'font-weight', 'font-size', 'font-family', 'font-style', 'margin-top', 'margin-bottom',
    'padding', 'background', 'background-color', 'border-radius', 'border-left', 'text-align',
    'text-shadow', 'text-transform', 'display', 'opacity',
]);

// Aceita só valores simples: sem url(), expression(), @import, barras invertidas, comentários etc.
// Funções permitidas apenas rgb()/rgba()/hsl()/hsla().
const CLASSES_PERMITIDAS = new Set([]); // classes fixas legítimas além do prefixo elem-* (hoje só elem-* é usada: engine.js > formatElemSpan)
const DISPLAYS_PERMITIDOS = new Set(['inline', 'block', 'inline-block']);

function classesSeguras(classe) {
    const lista = String(classe ?? '').trim().split(/\s+/).filter(Boolean);
    if (lista.length === 0 || lista.length > 4) return '';
    const ok = lista.every((c) => /^[a-z0-9_-]{1,60}$/i.test(c) && (c.startsWith('elem-') || CLASSES_PERMITIDAS.has(c)));
    return ok ? lista.join(' ') : '';
}

export function valorCssSeguro(valor) {
    const v = String(valor ?? '').trim();
    if (!v || v.length > 120) return false;
    if (/[;{}<>@\\]|\/\*|\*\/|expression|javascript|behavior|binding/i.test(v)) return false;
    if (!/^[a-z0-9#%.,() +\-'"]+$/i.test(v)) return false;
    const funcoes = v.match(/[a-z-]+\s*\(/gi) || [];
    return funcoes.every((f) => /^(rgb|rgba|hsl|hsla)\s*\($/i.test(f));
}

export function estiloSeguro(estilo) {
    return String(estilo ?? '').split(';').map((d) => {
        const i = d.indexOf(':');
        if (i < 0) return '';
        const prop = d.slice(0, i).trim().toLowerCase();
        const valor = d.slice(i + 1).trim();
        if (!PROPRIEDADES_PERMITIDAS.has(prop) || !valorCssSeguro(valor)) return '';
        if (prop === 'display' && !DISPLAYS_PERMITIDOS.has(valor.toLowerCase())) return '';
        if (prop === 'font-size') { const m = valor.match(/^([\d.]+)(em|rem|px|%)$/i); if (!m) return ''; const n = parseFloat(m[1]); const max = { em: 3, rem: 3, px: 48, '%': 300 }[m[2].toLowerCase()]; if (!(n <= max)) return ''; }
        return `${prop}:${valor}`;
    }).filter(Boolean).join(';');
}

function serializar(no, doc) {
    let saida = '';
    no.childNodes.forEach((filho) => {
        if (filho.nodeType === 3) { // texto
            saida += escaparHtml(filho.nodeValue);
        } else if (filho.nodeType === 1) { // elemento
            const tag = filho.nodeName.toLowerCase();
            if (!TAGS_PERMITIDAS.has(tag)) {
                // Tags não permitidas somem; o texto interno é mantido (exceto script/style, descartados).
                if (tag === 'script' || tag === 'style') return;
                saida += serializar(filho, doc);
                return;
            }
            if (tag === 'br') { saida += '<br>'; return; }
            const estilo = estiloSeguro(filho.getAttribute('style'));
            const classe = classesSeguras(filho.getAttribute('class'));
            const attrClasse = classe ? ` class="${classe}"` : '';
            saida += `<${tag}${attrClasse}${estilo ? ` style="${escaparHtml(estilo)}"` : ''}>${serializar(filho, doc)}</${tag}>`;
        }
    });
    return saida;
}

// Cache pequeno (o feed re-renderiza as mesmas strings muitas vezes) e um único DOMParser.
const CACHE_MAX = 500;
const cache = new Map();
let parser = null;

// Whitelist mínima: tags de formatação, style filtrado e class elem-*. Nunca on*, href, src, etc.
// Sem DOMParser (ambiente sem DOM), escapa tudo por segurança.
export function sanitizarHtml(html) {
    const bruto = String(html ?? '');
    if (!bruto) return '';
    if (typeof DOMParser === 'undefined') return escaparHtml(bruto);
    if (cache.has(bruto)) return cache.get(bruto);
    let saida;
    try {
        if (!parser) parser = new DOMParser();
        const doc = parser.parseFromString(`<body>${bruto}</body>`, 'text/html');
        saida = serializar(doc.body, doc);
    } catch (e) {
        saida = escaparHtml(bruto);
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(bruto, saida);
    return saida;
}

// Texto puro para quem não renderiza HTML (ex.: contexto da IA): remove tags e decodifica as entidades comuns.
export function htmlParaTexto(html) {
    return String(html ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ').trim();
}
