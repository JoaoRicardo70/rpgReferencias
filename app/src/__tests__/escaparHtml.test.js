import { describe, it, expect, vi, afterEach } from 'vitest';
import { escaparHtml, sanitizarHtml, htmlParaTexto } from '../core/escaparHtml.js';

const PERMITIDAS = new Set(['b', 'strong', 'i', 'em', 'u', 'br', 'span', 'div', 'small', 'p', 'strike', 's', 'del']);

// Invariante de seguranca: a saida so contem tags da whitelist e atributos class/style.
function auditar(saida) {
    const doc = new DOMParser().parseFromString(`<body>${saida}</body>`, 'text/html');
    doc.body.querySelectorAll('*').forEach((el) => {
        expect(PERMITIDAS.has(el.tagName.toLowerCase())).toBe(true);
        Array.from(el.attributes).forEach((a) => expect(['class', 'style']).toContain(a.name));
    });
    expect(saida).not.toMatch(/<\s*(script|img|svg|iframe|style|a|form|math|table|template|noscript|xmp|plaintext|body|input)\b/i);
}

describe('escaparHtml', () => {
    it('escapa & < > " e aspa simples', () => {
        expect(escaparHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    });
    it('null/undefined viram string vazia; numero vira texto', () => {
        expect(escaparHtml(null)).toBe('');
        expect(escaparHtml(undefined)).toBe('');
        expect(escaparHtml(0)).toBe('0');
        expect(escaparHtml(12.5)).toBe('12.5');
        expect(escaparHtml(false)).toBe('false');
    });
    it('nao muda texto simples e unicode', () => {
        expect(escaparHtml('Ação ⚔️ 日本')).toBe('Ação ⚔️ 日本');
    });
    it('payload classico fica inerte', () => {
        expect(escaparHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    });
});

describe('sanitizarHtml: bateria de payloads', () => {
    const payloads = {
        script: '<script>alert(1)</script>ok',
        imgOnerror: '<img src=x onerror=alert(1)>ok',
        svgOnload: '<svg onload=alert(1)><circle/></svg>ok',
        aJs: '<a href="javascript:alert(1)">clique</a>',
        iframeSrcdoc: '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
        style: '<style>body{display:none}</style>ok',
        mglyph: '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
        formMath: '<form><math><mtext></form><form><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src>">',
        tableImg: '<table><img src=x onerror=alert(1)></table>',
        noscript: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
        template: '<template><img src=x onerror=alert(1)></template>',
        xmp: '<xmp><img src=x onerror=alert(1)></xmp>',
        plaintext: '<plaintext><img src=x onerror=alert(1)>',
        cdata: '<![CDATA[<img src=x onerror=alert(1)>]]>',
        condicional: '<!--[if IE]><img src=x onerror=alert(1)><![endif]-->',
        bodyOnload: '<body onload=alert(1)>texto',
        onclickSpan: '<span onclick="alert(1)" onmouseover="x()">t</span>',
        hrefSrcDiv: '<div href="http://x" src="http://y">t</div>',
    };
    Object.entries(payloads).forEach(([nome, p]) => {
        it(`neutraliza ${nome}`, () => {
            auditar(sanitizarHtml(p));
        });
    });
    it('remove atributos on*, href e src mantendo a tag permitida e o texto', () => {
        expect(sanitizarHtml('<span onclick="x()" href="h" src="s">oi</span>')).toBe('<span>oi</span>');
    });
    it('script e style: conteudo descartado', () => {
        expect(sanitizarHtml('a<script>evil()</script>b')).toBe('ab');
        expect(sanitizarHtml('a<style>.x{}</style>b')).toBe('ab');
    });
    it('tag nao permitida some e o texto interno fica', () => {
        expect(sanitizarHtml('<a href="javascript:x">link</a>')).toBe('link');
    });
});

describe('sanitizarHtml: style', () => {
    const estilo = (v) => sanitizarHtml(`<span style="${v}">t</span>`);
    it.each([
        ['url(', 'background:url(http://x/a.png)'],
        ['expression', 'color:expression(alert(1))'],
        ['@import', 'color:red;@import url(x)'],
        ['barra invertida \\75 rl(', 'background:\\75 rl(http://x)'],
        ['position:fixed', 'position:fixed;top:0'],
        ['font-size:9em', 'font-size:9em'],
        ['display:flex', 'display:flex'],
    ])('descarta %s', (_n, v) => {
        const s = estilo(v);
        expect(s).not.toMatch(/url|expression|import|fixed|flex|9em/i);
    });
    it('descarta o que e perigoso e a tag fica sem style (casos puros)', () => {
        expect(estilo('background:url(http://x/a.png)')).toBe('<span>t</span>');
        expect(estilo('position:fixed;top:0')).toBe('<span>t</span>');
        expect(estilo('font-size:9em')).toBe('<span>t</span>');
        expect(estilo('display:flex')).toBe('<span>t</span>');
    });
    it('entidade &#59; nao contrabandeia url()', () => {
        const s = estilo('color:red&#59;background:url(http://x)');
        expect(s).not.toMatch(/url/i);
    });
    it('mantem rgba(), 1.1em, color hex e display:inline-block', () => {
        expect(estilo('color:rgba(255,0,60,0.5)')).toContain('style="color:rgba(255,0,60,0.5)"');
        expect(estilo('font-size:1.1em')).toContain('style="font-size:1.1em"');
        expect(estilo('color:#ff003c')).toContain('style="color:#ff003c"');
        expect(estilo('display:inline-block')).toContain('style="display:inline-block"');
    });
    it('mistura: mantem so as declaracoes seguras', () => {
        expect(estilo('color:#fff;position:fixed;font-weight:bold')).toBe('<span style="color:#fff;font-weight:bold">t</span>');
    });
});

describe('sanitizarHtml: class', () => {
    it('so elem-*; modal-overlay descartada, elem-fogo mantida', () => {
        expect(sanitizarHtml('<span class="modal-overlay">x</span>')).toBe('<span>x</span>');
        expect(sanitizarHtml('<span class="elem-fogo">x</span>')).toBe('<span class="elem-fogo">x</span>');
        expect(sanitizarHtml('<span class="elem-fogo modal-overlay">x</span>')).toBe('<span>x</span>');
    });
});

describe('sanitizarHtml: legitimo, escape e bordas', () => {
    it('formatacao legitima intacta', () => {
        const h = '<strong>Ana</strong> usou <small>x</small> <span class="elem-fogo">FOGO</span><br>fim';
        expect(sanitizarHtml(h)).toBe(h);
    });
    it('nao duplica escape de entidades ja escapadas', () => {
        expect(sanitizarHtml('&lt;b&gt; &amp; &quot;')).toBe('&lt;b&gt; &amp; &quot;');
        expect(sanitizarHtml(escaparHtml('<img onerror=x>'))).toBe('&lt;img onerror=x&gt;');
    });
    it('texto com < solto fica escapado', () => {
        expect(sanitizarHtml('1 < 2 & 3 > 2')).toBe('1 &lt; 2 &amp; 3 &gt; 2');
    });
    it('entrada nao-string e vazia', () => {
        expect(sanitizarHtml(null)).toBe('');
        expect(sanitizarHtml(undefined)).toBe('');
        expect(sanitizarHtml('')).toBe('');
        expect(sanitizarHtml(42)).toBe('42');
        expect(sanitizarHtml({})).toBe('[object Object]');
        expect(sanitizarHtml(['<b>a</b>'])).toBe('<b>a</b>');
    });
    it('string enorme e aninhamento profundo', () => {
        const grande = '<b>x</b>'.repeat(20000) + '<script>1</script>';
        const s = sanitizarHtml(grande);
        expect(s.length).toBe(grande.length - '<script>1</script>'.length);
        const fundo = '<div>'.repeat(300) + 'x' + '</div>'.repeat(300);
        expect(() => sanitizarHtml(fundo)).not.toThrow();
    });
    it('cache de 500 entradas nao muda o resultado', () => {
        const alvo = '<b>alvo</b><img src=x onerror=1>';
        const antes = sanitizarHtml(alvo);
        expect(sanitizarHtml(alvo)).toBe(antes);
        for (let i = 0; i < 1200; i++) sanitizarHtml(`<i>${i}</i><script>${i}</script>`);
        expect(sanitizarHtml(alvo)).toBe(antes);
        expect(antes).toBe('<b>alvo</b>');
    });
});

describe('sanitizarHtml: sem DOMParser', () => {
    afterEach(() => vi.unstubAllGlobals());
    it('sem DOM escapa tudo', () => {
        vi.stubGlobal('DOMParser', undefined);
        expect(sanitizarHtml('<b>x</b><script>1</script>')).toBe('&lt;b&gt;x&lt;/b&gt;&lt;script&gt;1&lt;/script&gt;');
    });
    it('DOMParser que lanca excecao escapa tudo', async () => {
        vi.resetModules();
        vi.stubGlobal('DOMParser', class { parseFromString() { throw new Error('boom'); } });
        const { sanitizarHtml, escaparHtml } = await import('../core/escaparHtml.js');
        const entrada = '<b>unico-' + Math.random() + '</b>';
        expect(sanitizarHtml(entrada)).toBe(escaparHtml(entrada));
    });
});

describe('htmlParaTexto', () => {
    it('remove tags e decodifica entidades', () => {
        expect(htmlParaTexto('<strong>a</strong> &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;')).toBe('a & b <c> "d" \'e\'');
    });
    it('nulos e espacos', () => {
        expect(htmlParaTexto(null)).toBe('');
        expect(htmlParaTexto('  a \n\n b  ')).toBe('a b');
    });
    it('&amp;lt; vira &lt; (decodifica uma vez)', () => {
        expect(htmlParaTexto('&amp;lt;')).toBe('&lt;');
    });
});
