import { describe, it, expect } from 'vitest';
import { normalizarCorDestaque, hexParaRgbTexto, migrarEsteticaGrimorio, varsCssDestaque } from './grimorioEstetica';

// QA — cor de destaque do Grimório (lógica pura). O CSS só pode receber valores de hex VALIDADO.

describe('normalizarCorDestaque', () => {
    it.each([
        ['#00aaff', '#00aaff'],
        ['#00AAFF', '#00aaff'],
        ['  #00aaff  ', '#00aaff'],
        ['#0af', '#00aaff'],
        ['#ABC', '#aabbcc'],
        ['#000', '#000000'],
        ['#fff', '#ffffff'],
    ])('aceita %j -> %j', (entrada, saida) => {
        expect(normalizarCorDestaque(entrada)).toBe(saida);
    });

    it.each([
        '', '   ', '00aaff', '#00aaf', '#00aaffa', '#0af0', '#gggggg', '#12345g', 'red', 'rgb(0,0,0)',
        '#00aaff; background:url(x)', '#fff)}', 'javascript:alert(1)', '#00aaff\n', '##00aaff', '# 00aaff',
    ])('rejeita %j', (entrada) => {
        // '#00aaff\n' tem o \n removido pelo trim: é válido, tratado abaixo.
        if (entrada === '#00aaff\n') { expect(normalizarCorDestaque(entrada)).toBe('#00aaff'); return; }
        expect(normalizarCorDestaque(entrada)).toBe('');
    });

    it.each([[null], [undefined], [123], [0], [true], [{}], [[]], [['#fff']], [() => '#fff']])('tipo não-string %j -> ""', (v) => {
        expect(normalizarCorDestaque(v)).toBe('');
    });
});

describe('hexParaRgbTexto', () => {
    it('converte hex de 6 e 3 dígitos', () => {
        expect(hexParaRgbTexto('#00aaff')).toBe('0, 170, 255');
        expect(hexParaRgbTexto('#fff')).toBe('255, 255, 255');
        expect(hexParaRgbTexto('#000')).toBe('0, 0, 0');
    });
    it('inválido -> ""', () => {
        expect(hexParaRgbTexto('azul')).toBe('');
        expect(hexParaRgbTexto(null)).toBe('');
    });
});

describe('migrarEsteticaGrimorio', () => {
    it('null/undefined/array/primitivos -> {}', () => {
        expect(migrarEsteticaGrimorio(null)).toEqual({});
        expect(migrarEsteticaGrimorio(undefined)).toEqual({});
        expect(migrarEsteticaGrimorio([])).toEqual({});
        expect(migrarEsteticaGrimorio([{ corDestaque: '#fff' }])).toEqual({});
        expect(migrarEsteticaGrimorio('#fff')).toEqual({});
        expect(migrarEsteticaGrimorio(5)).toEqual({});
        expect(migrarEsteticaGrimorio(true)).toEqual({});
    });
    it('objeto vazio -> {}', () => {
        expect(migrarEsteticaGrimorio({})).toEqual({});
    });
    it('corDestaque válida é mantida (normalizada)', () => {
        expect(migrarEsteticaGrimorio({ corDestaque: '#0AF' })).toEqual({ corDestaque: '#00aaff' });
    });
    it('corDestaque inválida -> {}', () => {
        expect(migrarEsteticaGrimorio({ corDestaque: 'azul' })).toEqual({});
        expect(migrarEsteticaGrimorio({ corDestaque: 42 })).toEqual({});
    });
    it('formato antigo: corTinta válida vira corDestaque e o resto é descartado', () => {
        const antigo = { corPapel: '#f4e4bc', corTexto: '#222', corTinta: '#8B0000', bgImg: 'http://x/y.png', modoFundo: 'imagem', corFundoTint: '#123456', diarioFonte: 'Caveat' };
        const r = migrarEsteticaGrimorio(antigo);
        expect(r).toEqual({ corDestaque: '#8b0000' });
        ['corPapel', 'corTexto', 'corTinta', 'bgImg', 'modoFundo', 'corFundoTint', 'diarioFonte'].forEach(k => expect(r).not.toHaveProperty(k));
    });
    it('formato antigo: corTinta inválida NÃO vira corDestaque', () => {
        expect(migrarEsteticaGrimorio({ corTinta: 'url(javascript:x)', corPapel: '#fff' })).toEqual({});
        expect(migrarEsteticaGrimorio({ corTinta: 123 })).toEqual({});
    });
    it('corDestaque válida tem prioridade sobre corTinta', () => {
        expect(migrarEsteticaGrimorio({ corDestaque: '#111111', corTinta: '#222222' })).toEqual({ corDestaque: '#111111' });
    });
    it('corDestaque inválida cai para corTinta válida', () => {
        expect(migrarEsteticaGrimorio({ corDestaque: 'x', corTinta: '#222' })).toEqual({ corDestaque: '#222222' });
    });
    it('não muta a entrada e devolve objeto novo', () => {
        const entrada = Object.freeze({ corDestaque: '#fff', extra: 1 });
        const r = migrarEsteticaGrimorio(entrada);
        expect(r).not.toBe(entrada);
        expect(entrada).toEqual({ corDestaque: '#fff', extra: 1 });
    });
    it('campos desconhecidos são descartados', () => {
        expect(migrarEsteticaGrimorio({ corDestaque: '#fff', lixo: '<script>' })).toEqual({ corDestaque: '#ffffff' });
    });
});

describe('varsCssDestaque', () => {
    const CHAVES = ['--cor-primaria', '--cor-primaria-rgb', '--border-primary', '--shadow-primary', '--bg-panel-hover'];

    it('sem cor / inválida -> {} (segue o tema)', () => {
        expect(varsCssDestaque('')).toEqual({});
        expect(varsCssDestaque(null)).toEqual({});
        expect(varsCssDestaque(undefined)).toEqual({});
        expect(varsCssDestaque('red')).toEqual({});
        expect(varsCssDestaque({})).toEqual({});
    });
    it('cor válida emite as variáveis esperadas', () => {
        const v = varsCssDestaque('#00aaff');
        expect(Object.keys(v).sort()).toEqual([...CHAVES].sort());
        expect(v['--cor-primaria']).toBe('#00aaff');
        expect(v['--cor-primaria-rgb']).toBe('0, 170, 255');
        expect(v['--border-primary']).toBe('rgba(0, 170, 255, 0.35)');
    });
    it('hex curto é expandido', () => {
        expect(varsCssDestaque('#0af')['--cor-primaria']).toBe('#00aaff');
    });
    it('NUNCA emite texto não validado (injeção de CSS)', () => {
        expect(varsCssDestaque('#fff; background:url(//evil)')).toEqual({});
        expect(varsCssDestaque('red; } body { display:none')).toEqual({});
    });
    it('todo valor emitido é hex ou rgba numérico', () => {
        const v = varsCssDestaque('#A1B2C3');
        Object.entries(v).forEach(([k, val]) => {
            expect(k.startsWith('--')).toBe(true);
            expect(val).toMatch(/^(#[0-9a-f]{6}|\d{1,3}, \d{1,3}, \d{1,3}|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0\.\d+\))$/);
        });
    });
});
