import { describe, it, expect } from 'vitest';
import {
    montarEsteticaGrimorio, varsCssGrimorio, luminanciaRelativa, razaoContraste,
    contrasteBaixo, cssParaHex, migrarEsteticaGrimorio
} from './grimorioEstetica';

describe('montarEsteticaGrimorio', () => {
    it('mantém as três cores válidas normalizadas', () => {
        expect(montarEsteticaGrimorio({ corDestaque: '#0AF', corTexto: '#FFFFFF', corFundo: '#000' }))
            .toEqual({ corDestaque: '#00aaff', corTexto: '#ffffff', corFundo: '#000000' });
    });
    it('omite ausentes e inválidas', () => {
        expect(montarEsteticaGrimorio({ corTexto: '#fff', corFundo: 'red;}', corDestaque: '' })).toEqual({ corTexto: '#ffffff' });
    });
    it('aceita undefined/vazio', () => {
        expect(montarEsteticaGrimorio()).toEqual({});
        expect(montarEsteticaGrimorio({})).toEqual({});
    });
});

describe('varsCssGrimorio', () => {
    it('vazio/null/undefined => {}', () => {
        expect(varsCssGrimorio({})).toEqual({});
        expect(varsCssGrimorio(null)).toEqual({});
        expect(varsCssGrimorio(undefined)).toEqual({});
    });
    it('destaque gera variáveis --cor-primaria*', () => {
        const v = varsCssGrimorio({ corDestaque: '#ff0000' });
        expect(v['--cor-primaria']).toBe('#ff0000');
        expect(v['--cor-primaria-rgb']).toBe('255, 0, 0');
        expect(v['--grimorio-texto']).toBeUndefined();
        expect(v['--grimorio-fundo']).toBeUndefined();
    });
    it('texto só gera --grimorio-texto', () => {
        expect(varsCssGrimorio({ corTexto: '#abc' })).toEqual({ '--grimorio-texto': '#aabbcc' });
    });
    it('fundo gera --grimorio-fundo e --bg-body-2', () => {
        expect(varsCssGrimorio({ corFundo: '#111111' })).toEqual({ '--grimorio-fundo': '#111111', '--bg-body-2': '#111111' });
    });
    it('valores só derivam de hex validado (sem injeção)', () => {
        const v = varsCssGrimorio({ corDestaque: 'red;}body{x:y', corTexto: 'url(x)', corFundo: '#12345' });
        expect(v).toEqual({});
        const ok = varsCssGrimorio({ corDestaque: '#123456', corTexto: '#654321', corFundo: '#abcdef' });
        for (const val of Object.values(ok)) expect(val).toMatch(/^(#[0-9a-f]{6}|\d+, \d+, \d+|rgba\(\d+, \d+, \d+, [\d.]+\))$/);
    });
});

describe('luminância e contraste', () => {
    it('luminância de preto/branco e inválido', () => {
        expect(luminanciaRelativa('#000000')).toBe(0);
        expect(luminanciaRelativa('#ffffff')).toBeCloseTo(1, 5);
        expect(luminanciaRelativa('xyz')).toBeNull();
        expect(luminanciaRelativa(null)).toBeNull();
    });
    it('preto/branco = 21; iguais = 1; simétrica', () => {
        expect(razaoContraste('#000', '#fff')).toBeCloseTo(21, 5);
        expect(razaoContraste('#fff', '#000')).toBeCloseTo(21, 5);
        expect(razaoContraste('#777777', '#777777')).toBe(1);
        expect(razaoContraste('#336699', '#ffeecc')).toBeCloseTo(razaoContraste('#ffeecc', '#336699'), 10);
    });
    it('inválida => null', () => {
        expect(razaoContraste('#fff', 'nada')).toBeNull();
        expect(razaoContraste(undefined, '#fff')).toBeNull();
    });
    it('contrasteBaixo', () => {
        expect(contrasteBaixo('#ffffff', '#fefefe')).toBe(true);
        expect(contrasteBaixo('#000000', '#ffffff')).toBe(false);
        expect(contrasteBaixo(null, '#fff')).toBe(false);
        expect(contrasteBaixo('', '')).toBe(false);
        expect(contrasteBaixo('#fff', undefined)).toBe(false);
    });
    it('limite do mínimo 3', () => {
        expect(contrasteBaixo('#949494', '#ffffff')).toBe(false);
        expect(contrasteBaixo('#aaaaaa', '#ffffff')).toBe(true);
    });
});

describe('cssParaHex', () => {
    it.each([
        ['#abc', '#aabbcc'], ['#AABBCC', '#aabbcc'], ['rgb(255, 0, 10)', '#ff000a'],
        ['rgba(0, 128, 255, 0.5)', '#0080ff'], ['rgb(255 0 0)', '#ff0000'],
        ['  rgb(1,2,3) ', '#010203'], ['rgb(300, 0, 0)', '#ff0000'],
        ['hsl(0, 100%, 50%)', '#ff0000'], ['hsl(120, 100%, 50%)', '#00ff00'],
        ['hsla(240, 100%, 50%, 0.3)', '#0000ff'], ['hsl(360, 100%, 50%)', '#ff0000'],
        ['hsl(-120, 100%, 50%)', '#0000ff'], ['hsl(0, 0%, 100%)', '#ffffff'], ['hsl(0, 0%, 0%)', '#000000']
    ])('%s -> %s', (entrada, esperado) => expect(cssParaHex(entrada)).toBe(esperado));
    it.each(['color-mix(in srgb, red, blue)', 'red', '', '   ', 'var(--x)', 'rgb(a,b,c)', '#12'])('rejeita %s', (e) => {
        expect(cssParaHex(e)).toBe('');
    });
    it('não-string => ""', () => {
        expect(cssParaHex(null)).toBe('');
        expect(cssParaHex(undefined)).toBe('');
        expect(cssParaHex(123)).toBe('');
        expect(cssParaHex({})).toBe('');
    });
});

describe('migrarEsteticaGrimorio', () => {
    it('nulos/arrays/primitivos => {}', () => {
        for (const x of [null, undefined, [], ['#fff'], 'x', 5, true]) expect(migrarEsteticaGrimorio(x)).toEqual({});
    });
    it('legado: só corTinta vira destaque; corTexto antigo ignorado', () => {
        const r = migrarEsteticaGrimorio({ corPapel: '#f4e4bc', corTinta: '#112233', corTexto: '#ffffff', corFundo: '#000000', bgImg: 'x', modoFundo: 'm', corFundoTint: '#123456', diarioFonte: 'f' });
        expect(r).toEqual({ corDestaque: '#112233' });
    });
    it('qualquer chave legada isolada faz corTexto ser ignorado', () => {
        for (const k of ['corPapel', 'corTinta', 'bgImg', 'modoFundo', 'corFundoTint', 'diarioFonte'])
            expect(migrarEsteticaGrimorio({ [k]: '#111111', corTexto: '#ffffff' }).corTexto).toBeUndefined();
    });
    it('legado com tinta inválida => {}', () => {
        expect(migrarEsteticaGrimorio({ corTinta: 'red;}body{}', corPapel: '#fff' })).toEqual({});
    });
    it('novo formato só com corTexto é mantido', () => {
        expect(migrarEsteticaGrimorio({ corTexto: '#FFF' })).toEqual({ corTexto: '#ffffff' });
    });
    it('formato novo completo mantém tudo', () => {
        const n = { corDestaque: '#111111', corTexto: '#222222', corFundo: '#333333' };
        expect(migrarEsteticaGrimorio(n)).toEqual(n);
    });
    it('idempotente', () => {
        const entradas = [
            { corTinta: '#123456', corPapel: '#fff', corTexto: '#000' },
            { corTexto: '#abc', corFundo: '#def' },
            { corDestaque: '#111111', corTexto: '#222222', corFundo: '#333333' },
            { corDestaque: 'bad' }
        ];
        for (const e of entradas) {
            const um = migrarEsteticaGrimorio(e);
            expect(migrarEsteticaGrimorio(um)).toEqual(um);
        }
    });
    it('hex inválido e injeção descartados; chaves extras não vazam', () => {
        const r = migrarEsteticaGrimorio({ corDestaque: 'red;}body{display:none}', corTexto: '#12', corFundo: 'url(javascript:1)', extra: 1 });
        expect(r).toEqual({});
    });
    it('aceita objeto congelado', () => {
        expect(() => migrarEsteticaGrimorio(Object.freeze({ corTinta: '#123456', corPapel: '#fff' }))).not.toThrow();
    });
});
