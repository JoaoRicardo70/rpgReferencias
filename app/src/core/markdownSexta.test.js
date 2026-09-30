import { describe, it, expect } from 'vitest';
import { analisarInline, analisarMarkdown, markdownParaTextoFalado } from './markdownSexta';

const t = (valor) => ({ tipo: 'texto', valor });

describe('analisarInline', () => {
    it('texto simples vira um unico no de texto', () => {
        expect(analisarInline('ola mundo')).toEqual([t('ola mundo')]);
    });
    it('negrito com ** e __', () => {
        expect(analisarInline('a **b** c')).toEqual([t('a '), { tipo: 'negrito', filhos: [t('b')] }, t(' c')]);
        expect(analisarInline('__b__')).toEqual([{ tipo: 'negrito', filhos: [t('b')] }]);
    });
    it('italico com * e _', () => {
        expect(analisarInline('a *b* c')).toEqual([t('a '), { tipo: 'italico', filhos: [t('b')] }, t(' c')]);
        expect(analisarInline('a _b_ c')).toEqual([t('a '), { tipo: 'italico', filhos: [t('b')] }, t(' c')]);
    });
    it('underscore no meio de palavra nao e italico', () => {
        expect(analisarInline('nome_de_variavel')).toEqual([t('nome_de_variavel')]);
    });
    it('codigo inline preserva marcadores dentro', () => {
        expect(analisarInline('use `**x**` aqui')).toEqual([t('use '), { tipo: 'codigo', valor: '**x**' }, t(' aqui')]);
    });
    it('aninhamento: negrito com italico dentro', () => {
        expect(analisarInline('**a *b* c**')).toEqual([{ tipo: 'negrito', filhos: [t('a '), { tipo: 'italico', filhos: [t('b')] }, t(' c')] }]);
    });
    it('marcadores sem par permanecem como texto', () => {
        expect(analisarInline('**abc')).toEqual([t('**abc')]);
        expect(analisarInline('*abc')).toEqual([t('*abc')]);
        expect(analisarInline('a ` b')).toEqual([t('a ` b')]);
        expect(analisarInline('2 * 3 * 4')).toEqual([t('2 * 3 * 4')]);
    });
    it('marcadores vazios permanecem como texto', () => {
        expect(analisarInline('****')).toEqual([t('****')]);
        expect(analisarInline('``')).toEqual([t('``')]);
    });
    it('null, undefined e vazio', () => {
        expect(analisarInline(null)).toEqual([]);
        expect(analisarInline(undefined)).toEqual([]);
        expect(analisarInline('')).toEqual([]);
    });
    it('numero e convertido para string', () => {
        expect(analisarInline(42)).toEqual([t('42')]);
    });
    it('HTML fica como texto literal', () => {
        expect(analisarInline('<b>x</b>')).toEqual([t('<b>x</b>')]);
    });
    it('entrada longa termina', () => {
        const r = analisarInline('*a '.repeat(3000));
        expect(Array.isArray(r)).toBe(true);
    });
});

describe('analisarMarkdown', () => {
    it('entrada vazia/nula', () => {
        expect(analisarMarkdown('')).toEqual([]);
        expect(analisarMarkdown(null)).toEqual([]);
        expect(analisarMarkdown('   \n\n  ')).toEqual([]);
    });
    it('titulos com niveis 1 a 6; 7 # nao e titulo', () => {
        const r = analisarMarkdown('# A\n## B\n###### F');
        expect(r.map(b => [b.tipo, b.nivel])).toEqual([['titulo', 1], ['titulo', 2], ['titulo', 6]]);
        expect(analisarMarkdown('####### x')[0].tipo).toBe('paragrafo');
        expect(analisarMarkdown('#semespaco')[0].tipo).toBe('paragrafo');
    });
    it('codigo cercado preserva o conteudo e ignora markdown dentro', () => {
        const r = analisarMarkdown('```js\n# nao titulo\n**x**\n```\ndepois');
        expect(r[0]).toEqual({ tipo: 'codigo', texto: '# nao titulo\n**x**' });
        expect(r[1].tipo).toBe('paragrafo');
    });
    it('codigo nao fechado consome ate o fim', () => {
        const r = analisarMarkdown('```\nlinha1\nlinha2');
        expect(r).toEqual([{ tipo: 'codigo', texto: 'linha1\nlinha2' }]);
    });
    it('somente abertura de cerca', () => {
        expect(analisarMarkdown('```')).toEqual([{ tipo: 'codigo', texto: '' }]);
    });
    it('lista nao ordenada com -, * e +', () => {
        for (const m of ['-', '*', '+']) {
            const r = analisarMarkdown(`${m} um\n${m} dois`);
            expect(r).toHaveLength(1);
            expect(r[0].tipo).toBe('lista');
            expect(r[0].ordenada).toBe(false);
            expect(r[0].itens).toHaveLength(2);
        }
    });
    it('lista ordenada com 1. e 1)', () => {
        const r = analisarMarkdown('1. a\n2) b');
        expect(r[0]).toMatchObject({ tipo: 'lista', ordenada: true });
        expect(r[0].itens).toHaveLength(2);
    });
    it('trocar de ordenada para nao ordenada cria duas listas', () => {
        const r = analisarMarkdown('1. a\n- b');
        expect(r.map(b => b.tipo)).toEqual(['lista', 'lista']);
        expect(r[0].ordenada).toBe(true);
        expect(r[1].ordenada).toBe(false);
    });
    it('linha de continuacao recuada junta ao item anterior', () => {
        const r = analisarMarkdown('- item um\n   continua aqui\n- item dois');
        expect(r[0].itens).toHaveLength(2);
        expect(r[0].itens[0]).toEqual([t('item um'), t(' '), t('continua aqui')]);
    });
    it('linha sem recuo apos lista abre paragrafo', () => {
        const r = analisarMarkdown('- item\ntexto solto');
        expect(r.map(b => b.tipo)).toEqual(['lista', 'paragrafo']);
    });
    it('tabela com linha separadora', () => {
        const r = analisarMarkdown('| A | B |\n|---|:--:|\n| 1 | **2** |\n| 3 | 4 |');
        expect(r).toHaveLength(1);
        expect(r[0].tipo).toBe('tabela');
        expect(r[0].cabecalho).toEqual([[t('A')], [t('B')]]);
        expect(r[0].linhas).toHaveLength(2);
        expect(r[0].linhas[0][1]).toEqual([{ tipo: 'negrito', filhos: [t('2')] }]);
    });
    it('tabela sem pipes nas bordas', () => {
        const r = analisarMarkdown('A | B\n--- | ---\n1 | 2');
        expect(r[0].tipo).toBe('tabela');
        expect(r[0].linhas).toHaveLength(1);
    });
    it('linha com pipe sem separador e paragrafo', () => {
        expect(analisarMarkdown('a | b\nc | d')[0].tipo).toBe('paragrafo');
    });
    it('tabela termina em linha vazia', () => {
        const r = analisarMarkdown('| A |\n|---|\n| 1 |\n\ntexto');
        expect(r.map(b => b.tipo)).toEqual(['tabela', 'paragrafo']);
    });
    it('citacao junta linhas com >', () => {
        const r = analisarMarkdown('> linha um\n> linha *dois*');
        expect(r).toHaveLength(1);
        expect(r[0].tipo).toBe('citacao');
        expect(r[0].inline).toEqual([t('linha um linha '), { tipo: 'italico', filhos: [t('dois')] }]);
    });
    it('regua horizontal', () => {
        for (const h of ['---', '***', '___', '- - -', '-----']) {
            expect(analisarMarkdown(h)).toEqual([{ tipo: 'regua' }]);
        }
    });
    it('paragrafo com quebras de linha mantem uma entrada por linha', () => {
        const r = analisarMarkdown('a\nb\nc');
        expect(r).toHaveLength(1);
        expect(r[0].linhas).toHaveLength(3);
    });
    it('paragrafo e interrompido por titulo, lista, citacao, codigo e regua', () => {
        const r = analisarMarkdown('texto\n# T\ntexto2\n- l\ntexto3\n> c\ntexto4\n```\nx\n```\ntexto5\n---');
        expect(r.map(b => b.tipo)).toEqual(['paragrafo', 'titulo', 'paragrafo', 'lista', 'paragrafo', 'citacao', 'paragrafo', 'codigo', 'paragrafo', 'regua']);
    });
    it('CRLF e CR sao normalizados', () => {
        expect(analisarMarkdown('# A\r\n\r\ntexto\rmais')).toHaveLength(2);
    });
    it('documento misto realista', () => {
        const md = '## Resumo\n\nO **Natsu** atacou.\n\n- Dano: 10\n- Dano: 20\n\n| Nome | Vida |\n|---|---|\n| Ana | 50% |\n\n> cuidado\n\n---\n\nfim';
        expect(analisarMarkdown(md).map(b => b.tipo)).toEqual(['titulo', 'paragrafo', 'lista', 'tabela', 'citacao', 'regua', 'paragrafo']);
    });

    describe('sempre termina (entradas malformadas)', () => {
        const casos = [
            '`', '``', '```', '````', '**', '*', '_', '__', '___', '****', '* * *', '- ', '-', '1.', '1. ', '>', '> ', '|', '||', '|---|', '| |\n|-|', '#', '# ', '######',
            '\n', '\r', '\r\n\r\n', '\t', '   ', '\u0000', '- - -\n- - -', '|a|\n|--|\n', '|a|\n|--|', 'a|\n--|', '> > >', '* ', '*\n*\n*', '1) \n2) ',
            '😀**😀', '**a\nb**', 'a\n---\nb', '```\n```\n```', '\\', '<script>alert(1)</script>',
        ];
        it.each(casos.map(c => [JSON.stringify(c), c]))('%s', (_n, entrada) => {
            const r = analisarMarkdown(entrada);
            expect(Array.isArray(r)).toBe(true);
            expect(() => JSON.stringify(r)).not.toThrow();
            expect(() => markdownParaTextoFalado(entrada)).not.toThrow();
        });
        it('fuzz deterministico com alfabeto de marcadores', () => {
            const alfabeto = ['*', '_', '`', '#', '-', '>', '|', ' ', '\n', '1', '.', ')', ':', 'a', '\t', '~'];
            let seed = 12345;
            const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
            for (let n = 0; n < 1500; n++) {
                const len = Math.floor(rnd() * 60);
                let s = '';
                for (let k = 0; k < len; k++) s += alfabeto[Math.floor(rnd() * alfabeto.length)];
                const r = analisarMarkdown(s);
                expect(Array.isArray(r)).toBe(true);
                markdownParaTextoFalado(s);
            }
        });
        it('entrada grande (200k caracteres) termina', () => {
            const r = analisarMarkdown('linha *a* **b** `c`\n'.repeat(10000));
            expect(r.length).toBeGreaterThan(0);
        });
        it('muitas linhas de tabela/lista', () => {
            expect(analisarMarkdown('- x\n'.repeat(5000))[0].itens).toHaveLength(5000);
            expect(analisarMarkdown('|a|\n|--|\n' +'|1|\n'.repeat(5000))[0].linhas).toHaveLength(5000);
        });
    });
});

describe('markdownParaTextoFalado', () => {
    it('remove negrito, italico, titulo e lista', () => {
        expect(markdownParaTextoFalado('# Titulo\n\nUm **forte** e *leve*.\n\n- item um\n- item dois')).toBe('Titulo. Um forte e leve. item um item dois');
    });
    it('remove codigo cercado e mantem o conteudo do inline', () => {
        expect(markdownParaTextoFalado('antes\n```js\ncodigo()\n```\ndepois `x` fim')).not.toContain('codigo()');
        expect(markdownParaTextoFalado('use `foo` aqui')).toBe('use foo aqui');
    });
    it('remove emojis', () => {
        const r = markdownParaTextoFalado('Ola 😀 mundo ⚔️ fim 🎖️');
        expect(r).toBe('Ola mundo fim');
    });
    it('citacao perde o >', () => {
        expect(markdownParaTextoFalado('> cuidado')).toBe('cuidado');
    });
    it('tabela vira texto separado por virgulas, sem a linha separadora', () => {
        const r = markdownParaTextoFalado('| A | B |\n|---|---|\n| 1 | 2 |');
        expect(r).not.toContain('|');
        expect(r).not.toContain('---');
        expect(r).toContain('A');
        expect(r).toContain('2');
    });
    it('regua some', () => {
        expect(markdownParaTextoFalado('a\n\n---\n\nb')).not.toContain('---');
    });
    it('vazio, null e undefined', () => {
        expect(markdownParaTextoFalado('')).toBe('');
        expect(markdownParaTextoFalado(null)).toBe('');
        expect(markdownParaTextoFalado(undefined)).toBe('');
    });
    it('preserva acentos e pontuacao', () => {
        expect(markdownParaTextoFalado('Ação, não! Está aí?')).toBe('Ação, não! Está aí?');
    });
    it('nao altera underscore no meio de palavra', () => {
        expect(markdownParaTextoFalado('nome_de_variavel')).toBe('nome_de_variavel');
    });
});
