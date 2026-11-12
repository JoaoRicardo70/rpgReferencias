import { describe, it, expect } from 'vitest';
import {
    LIMITE_USOS, PERIODOS_DE_USO, normalizarUsos, limiteDeUsos, usosGastos, usosRestantes,
    podeUsar, gastarUso, restaurarUsos, descreverUsos,
} from './usosPoder';
import { descansarCompleto } from './vitals';
import { normalizarPoder } from './sextaFeiraCriacao';
import { prepararItemImportado, montarPoderFinal } from './importadorIA';

const poderCena = (extra = {}) => ({ id: 'p1', nome: 'Golpe', usosMax: 2, usosPor: 'cena', ...extra });
const fichaVazia = () => ({ combate: {} });

describe('usosPoder - constantes', () => {
    it('limite 99 e periodos cena/descanso', () => {
        expect(LIMITE_USOS).toBe(99);
        expect(PERIODOS_DE_USO.map(p => p.id)).toEqual(['cena', 'descanso']);
    });
});

describe('normalizarUsos', () => {
    it.each([
        [3, 'cena', { max: 3, por: 'cena' }],
        ['3', 'descanso', { max: 3, por: 'descanso' }],
        ['2,7', 'cena', { max: 2, por: 'cena' }],
        ['2.9', 'descanso', { max: 2, por: 'descanso' }],
        [1, 'cena', { max: 1, por: 'cena' }],
        [99, 'cena', { max: 99, por: 'cena' }],
        [100, 'cena', { max: 99, por: 'cena' }],
        [5000, 'descanso', { max: 99, por: 'descanso' }],
        [3, 'invalido', { max: 3, por: 'cena' }],
        [3, undefined, { max: 3, por: 'cena' }],
        [3, null, { max: 3, por: 'cena' }],
        [' 4 ', 'descanso', { max: 4, por: 'descanso' }],
    ])('normalizarUsos(%j, %j)', (max, por, esperado) => {
        expect(normalizarUsos(max, por)).toEqual(esperado);
    });

    it.each([[0], [-1], ['-3'], [''], [null], [undefined], ['abc'], [NaN], [Infinity], [0.4], ['0'], [{}]])('ilimitado (null) para %j', (v) => {
        expect(normalizarUsos(v, 'cena')).toBeNull();
    });
});

describe('limiteDeUsos', () => {
    it('null para poder null/undefined/sem campos/zero', () => {
        expect(limiteDeUsos(null)).toBeNull();
        expect(limiteDeUsos(undefined)).toBeNull();
        expect(limiteDeUsos({ id: 1 })).toBeNull();
        expect(limiteDeUsos({ id: 1, usosMax: 0 })).toBeNull();
    });
    it('le usosMax/usosPor', () => {
        expect(limiteDeUsos({ usosMax: 2, usosPor: 'descanso' })).toEqual({ max: 2, por: 'descanso' });
        expect(limiteDeUsos({ usosMax: 2, usosPor: 'x' })).toEqual({ max: 2, por: 'cena' });
    });
});

describe('usosGastos / usosRestantes / podeUsar', () => {
    it('sem registro: 0 gastos, todos restantes', () => {
        expect(usosGastos(fichaVazia(), poderCena(), 'c1')).toBe(0);
        expect(usosRestantes(fichaVazia(), poderCena(), 'c1')).toBe(2);
        expect(podeUsar(fichaVazia(), poderCena(), 'c1')).toBe(true);
    });
    it('ficha null / sem combate nao quebra', () => {
        expect(usosGastos(null, poderCena())).toBe(0);
        expect(usosGastos({}, poderCena())).toBe(0);
        expect(usosRestantes(null, poderCena())).toBe(2);
    });
    it('ilimitado: 0 gastos, Infinity restantes, sempre pode', () => {
        const f = { combate: { usosPoderes: { p1: { n: 50, cena: 'c1' } } } };
        expect(usosGastos(f, { id: 'p1' }, 'c1')).toBe(0);
        expect(usosRestantes(f, { id: 'p1' }, 'c1')).toBe(Infinity);
        expect(podeUsar(f, { id: 'p1' }, 'c1')).toBe(true);
    });
    it('por cena conta na mesma cena e NAO conta em outra', () => {
        const f = { combate: { usosPoderes: { p1: { n: 2, cena: 'c1' } } } };
        expect(usosGastos(f, poderCena(), 'c1')).toBe(2);
        expect(usosRestantes(f, poderCena(), 'c1')).toBe(0);
        expect(podeUsar(f, poderCena(), 'c1')).toBe(false);
        expect(usosGastos(f, poderCena(), 'c2')).toBe(0);
        expect(podeUsar(f, poderCena(), 'c2')).toBe(true);
    });
    it('cena undefined/null equivale a "default"', () => {
        const f = { combate: { usosPoderes: { p1: { n: 1, cena: 'default' } } } };
        expect(usosGastos(f, poderCena())).toBe(1);
        expect(usosGastos(f, poderCena(), undefined)).toBe(1);
        expect(usosGastos(f, poderCena(), null)).toBe(1);
        const g = { combate: { usosPoderes: { p1: { n: 1 } } } };
        expect(usosGastos(g, poderCena(), 'default')).toBe(1);
        expect(usosGastos(g, poderCena(), 'outra')).toBe(0);
    });
    it('ids de cena numericos e string se igualam', () => {
        const f = { combate: { usosPoderes: { p1: { n: 1, cena: '7' } } } };
        expect(usosGastos(f, poderCena(), 7)).toBe(1);
    });
    it('descanso vale em qualquer cena', () => {
        const p = poderCena({ usosPor: 'descanso' });
        const f = { combate: { usosPoderes: { p1: { n: 2, cena: 'c1' } } } };
        expect(usosGastos(f, p, 'c1')).toBe(2);
        expect(usosGastos(f, p, 'c9')).toBe(2);
        expect(podeUsar(f, p, 'c9')).toBe(false);
    });
    it('registro corrompido nao quebra', () => {
        expect(usosGastos({ combate: { usosPoderes: { p1: 5 } } }, poderCena())).toBe(0);
        expect(usosGastos({ combate: { usosPoderes: { p1: { n: 'x', cena: 'default' } } } }, poderCena())).toBe(0);
        expect(usosGastos({ combate: { usosPoderes: { p1: { n: -3, cena: 'default' } } } }, poderCena())).toBe(0);
        expect(usosRestantes({ combate: { usosPoderes: { p1: { n: 99, cena: 'default' } } } }, poderCena())).toBe(0);
    });
    it('ids numericos como chave', () => {
        const p = { id: 42, usosMax: 1, usosPor: 'descanso' };
        const f = { combate: { usosPoderes: { 42: { n: 1, cena: 'default' } } } };
        expect(podeUsar(f, p)).toBe(false);
    });
});

describe('gastarUso', () => {
    it('incrementa ate esgotar; depois devolve false sem mexer', () => {
        const f = fichaVazia();
        expect(gastarUso(f, poderCena(), 'c1')).toBe(true);
        expect(f.combate.usosPoderes.p1).toEqual({ n: 1, cena: 'c1' });
        expect(gastarUso(f, poderCena(), 'c1')).toBe(true);
        expect(f.combate.usosPoderes.p1).toEqual({ n: 2, cena: 'c1' });
        const antes = JSON.stringify(f);
        expect(gastarUso(f, poderCena(), 'c1')).toBe(false);
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('cria combate e usosPoderes quando ausentes', () => {
        const f = {};
        expect(gastarUso(f, poderCena())).toBe(true);
        expect(f.combate.usosPoderes.p1).toEqual({ n: 1, cena: 'default' });
    });
    it('ilimitado devolve true sem criar nada', () => {
        const f = {};
        expect(gastarUso(f, { id: 'x' }, 'c1')).toBe(true);
        expect(f).toEqual({});
        expect(gastarUso(f, null)).toBe(true);
        expect(f).toEqual({});
    });
    it('trocar de cena recomeca a contagem em 1 na nova cena', () => {
        const f = fichaVazia();
        gastarUso(f, poderCena(), 'c1'); gastarUso(f, poderCena(), 'c1');
        expect(gastarUso(f, poderCena(), 'c2')).toBe(true);
        expect(f.combate.usosPoderes.p1).toEqual({ n: 1, cena: 'c2' });
    });
    it('por descanso acumula atravessando cenas', () => {
        const p = poderCena({ usosPor: 'descanso' });
        const f = fichaVazia();
        expect(gastarUso(f, p, 'c1')).toBe(true);
        expect(gastarUso(f, p, 'c2')).toBe(true);
        expect(gastarUso(f, p, 'c3')).toBe(false);
        expect(f.combate.usosPoderes.p1.n).toBe(2);
    });
    it('poderes diferentes tem contadores independentes (id numerico)', () => {
        const f = fichaVazia();
        const a = { id: 1, usosMax: 1 }; const b = { id: 2, usosMax: 1 };
        gastarUso(f, a);
        expect(podeUsar(f, a)).toBe(false);
        expect(podeUsar(f, b)).toBe(true);
        expect(Object.keys(f.combate.usosPoderes)).toEqual(['1']);
    });
});

describe('restaurarUsos', () => {
    it('apaga usosPoderes e preserva o resto de combate', () => {
        const f = { combate: { fadigaTurnos: 3, usosPoderes: { p1: { n: 1 } } } };
        restaurarUsos(f);
        expect('usosPoderes' in f.combate).toBe(false);
        expect(f.combate.fadigaTurnos).toBe(3);
    });
    it('nao quebra com null/sem combate/sem usosPoderes', () => {
        expect(() => restaurarUsos(null)).not.toThrow();
        expect(() => restaurarUsos({})).not.toThrow();
        expect(() => restaurarUsos({ combate: {} })).not.toThrow();
    });
});

describe('descreverUsos', () => {
    it('formata restantes/max e periodo', () => {
        const f = { combate: { usosPoderes: { p1: { n: 1, cena: 'c1' } } } };
        expect(descreverUsos(f, poderCena(), 'c1')).toBe('1/2 usos (por cena)');
        expect(descreverUsos(f, poderCena(), 'c2')).toBe('2/2 usos (por cena)');
        expect(descreverUsos(f, poderCena({ usosPor: 'descanso' }), 'c2')).toBe('1/2 usos (por descanso)');
    });
    it('esgotado mostra 0/N', () => {
        const f = { combate: { usosPoderes: { p1: { n: 2, cena: 'default' } } } };
        expect(descreverUsos(f, poderCena())).toBe('0/2 usos (por cena)');
    });
    it('vazio quando ilimitado / poder null', () => {
        expect(descreverUsos({}, { id: 1 })).toBe('');
        expect(descreverUsos({}, null)).toBe('');
    });
});

describe('descansarCompleto apaga usosPoderes', () => {
    const vital = () => ({ base: 100, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1, atual: 1, regeneracao: 5 });
    const base = () => ({
        vida: vital(), mana: vital(), aura: vital(), chakra: vital(), corpo: vital(),
        pv: { atual: 1, regeneracao: 2, max: 0 }, pm: { atual: 1, regeneracao: 2, max: 0 },
        multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
    });
    it('remove usosPoderes (cena e descanso) sem tocar em outras chaves', () => {
        const f = { ...base(), combate: { fadigaTurnos: 2, fadigaExtra: 5, ultimoElementoRecebido: 'Fogo', outraChave: 'ok', usosPoderes: { a: { n: 1, cena: 'c1' }, b: { n: 3, cena: 'x' } } } };
        descansarCompleto(f);
        expect('usosPoderes' in f.combate).toBe(false);
        expect('ultimoElementoRecebido' in f.combate).toBe(false);
        expect(f.combate.outraChave).toBe('ok');
    });
    it('sem usosPoderes nao cria a chave', () => {
        const f = { ...base(), combate: {} };
        descansarCompleto(f);
        expect('usosPoderes' in f.combate).toBe(false);
    });
    it('apos descansar o poder volta a poder ser usado', () => {
        const f = { ...base(), combate: {} };
        const p = { id: 'p1', usosMax: 1, usosPor: 'descanso' };
        gastarUso(f, p, 'c1');
        expect(podeUsar(f, p, 'c1')).toBe(false);
        descansarCompleto(f);
        expect(podeUsar(f, p, 'c1')).toBe(true);
    });
});

describe('normalizarPoder - usos', () => {
    it('grava usosMax/usosPor quando ha limite', () => {
        const { objeto } = normalizarPoder({ nome: 'A', categoria: 'habilidade', usosMax: 3, usosPor: 'descanso' });
        expect(objeto.usosMax).toBe(3);
        expect(objeto.usosPor).toBe('descanso');
    });
    it('string, periodo invalido e clamp 99', () => {
        let o = normalizarPoder({ nome: 'A', categoria: 'poder', usosMax: '2', usosPor: 'semana' }).objeto;
        expect(o).toMatchObject({ usosMax: 2, usosPor: 'cena' });
        o = normalizarPoder({ nome: 'A', categoria: 'forma', usosMax: 500, usosPor: 'cena' }).objeto;
        expect(o.usosMax).toBe(99);
    });
    it.each([[0], ['abc'], [-2], [''], [null], [undefined]])('nao grava com usosMax=%j', (v) => {
        const { objeto } = normalizarPoder({ nome: 'A', categoria: 'habilidade', usosMax: v, usosPor: 'descanso' });
        expect('usosMax' in objeto).toBe(false);
        expect('usosPor' in objeto).toBe(false);
    });
    it('usosPor sozinho nao grava nada', () => {
        const { objeto } = normalizarPoder({ nome: 'A', categoria: 'habilidade', usosPor: 'cena' });
        expect('usosPor' in objeto).toBe(false);
    });
});

describe('importador - usos', () => {
    it('preserva usosMax/usosPor validos', () => {
        const r = prepararItemImportado({ nome: 'Raio', categoria: 'habilidade', usosMax: 1, usosPor: 'cena' });
        expect(r.objeto).toMatchObject({ usosMax: 1, usosPor: 'cena' });
        expect(montarPoderFinal(r.objeto, 9)).toMatchObject({ id: 9, usosMax: 1, usosPor: 'cena' });
    });
    it('normaliza texto/clamp/periodo invalido', () => {
        const r = prepararItemImportado({ nome: 'Raio', usosMax: '300', usosPor: 'dia' });
        expect(r.objeto).toMatchObject({ usosMax: 99, usosPor: 'cena' });
    });
    it('sem limite ou invalido: nao grava', () => {
        for (const bruto of [{ nome: 'R' }, { nome: 'R', usosMax: 0, usosPor: 'cena' }, { nome: 'R', usosMax: 'muitos' }]) {
            const r = prepararItemImportado(bruto);
            expect('usosMax' in r.objeto).toBe(false);
            expect('usosPor' in r.objeto).toBe(false);
        }
    });
});
