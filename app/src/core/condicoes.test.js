import { describe, it, expect } from 'vitest';
import {
    condicoesDaFicha, stacksDe, estadosEfetivos, modificadoresDeEstados, somarEstado, tirarEstado,
    aplicarEstadoNaFicha, danoDeEstadosNoTurno, descreverDanoDeEstados, resumoDosEstados, ehEstadoValido, MAX_STACKS
} from './condicoes';

const f = (...c) => ({ condicoes: c.map(([id, stacks, fonte]) => ({ id, stacks, fonte })) });

describe('condicoes - condicoesDaFicha', () => {
    it('ficha sem condicoes, null e undefined devolvem lista vazia', () => {
        expect(condicoesDaFicha({})).toEqual([]);
        expect(condicoesDaFicha(null)).toEqual([]);
        expect(condicoesDaFicha(undefined)).toEqual([]);
        expect(condicoesDaFicha({ condicoes: 'x' })).toEqual([]);
    });
    it('descarta ids invalidos, nulos e stacks <= 0', () => {
        const r = condicoesDaFicha({ condicoes: [null, { id: 'foo', stacks: 2 }, { id: 'lento', stacks: 0 }, { id: 'lento', stacks: -3 }, { id: 'queimado', stacks: 2 }] });
        expect(r).toEqual([{ id: 'queimado', stacks: 2 }]);
    });
    it('limita stacks a 6 e arredonda para baixo', () => {
        expect(condicoesDaFicha(f(['lento', 99]))[0].stacks).toBe(MAX_STACKS);
        expect(condicoesDaFicha(f(['lento', 2.9]))[0].stacks).toBe(2);
    });
    it('repetidos ficam com o maior stack', () => {
        expect(condicoesDaFicha(f(['lento', 2], ['lento', 4], ['lento', 3]))).toEqual([{ id: 'lento', stacks: 4 }]);
    });
    it('mantem fonte e corta em 60 caracteres', () => {
        expect(condicoesDaFicha(f(['amedrontado', 1, 'x'.repeat(100)]))[0].fonte).toHaveLength(60);
    });
    it('ehEstadoValido rejeita nao-string', () => {
        expect(ehEstadoValido('lento')).toBe(true);
        expect(ehEstadoValido(5)).toBe(false);
        expect(ehEstadoValido('')).toBe(false);
    });
});

describe('condicoes - cadeias de estados', () => {
    it('neutro sem condicoes', () => {
        expect(modificadoresDeEstados({})).toMatchObject({ lento: false, imobilizado: false, incapacitado: false, vulneravel: false, nivelExaustao: 0, evasivaMult: 1, resistenciaMult: 1, curaMult: 1, custoDefesaMult: 1, desvTestes: 0, desvAtaque: 0, vantagemContraEle: 0, movimentoMult: 1, semMovimento: false });
    });
    it('Exausto: 1 desv testes, 2 Lento, 3 desv ataque, 4 cura -50%, 5 Imobilizado, 6 Incapacitado', () => {
        const m = (n) => modificadoresDeEstados(f(['exausto', n]));
        expect(m(1)).toMatchObject({ desvTestes: 1, desvAtaque: 0, lento: false });
        expect(m(2)).toMatchObject({ lento: true, evasivaMult: 0.5, movimentoMult: 0.5 });
        expect(m(3)).toMatchObject({ desvAtaque: 1 });
        expect(m(3).curaMult).toBe(1);
        expect(m(4).curaMult).toBe(0.5);
        expect(m(5)).toMatchObject({ imobilizado: true, evasivaMult: 0, semMovimento: true, vantagemContraEle: 1 });
        expect(m(6)).toMatchObject({ incapacitado: true, perdeFormas: true, vantagemContraEle: 2 });
    });
    it('Sangrando: a cada 3 stacks soma 1 de Exaustao', () => {
        expect(estadosEfetivos(f(['sangrando', 2])).nivelExaustao).toBe(0);
        expect(estadosEfetivos(f(['sangrando', 3])).nivelExaustao).toBe(1);
        expect(estadosEfetivos(f(['sangrando', 6])).nivelExaustao).toBe(2);
        expect(estadosEfetivos(f(['sangrando', 6])).lento).toBe(true);
        expect(estadosEfetivos(f(['sangrando', 6], ['exausto', 4])).nivelExaustao).toBe(6);
    });
    it('nivel de Exaustao nunca passa de 6', () => {
        expect(estadosEfetivos(f(['sangrando', 6], ['exausto', 6])).nivelExaustao).toBe(6);
    });
    it('Queimado 4+ deixa Vulneravel (resistencia pela metade)', () => {
        expect(estadosEfetivos(f(['queimado', 3])).vulneravel).toBe(false);
        const m = modificadoresDeEstados(f(['queimado', 4]));
        expect(m.vulneravel).toBe(true);
        expect(m.resistenciaMult).toBe(0.5);
        expect(m.desvPorAtributo.forca).toBe(1);
    });
    it('Criogenia: 3 Lento, 6 Imobilizado', () => {
        expect(estadosEfetivos(f(['criogenia', 2])).lento).toBe(false);
        expect(estadosEfetivos(f(['criogenia', 3])).lento).toBe(true);
        expect(estadosEfetivos(f(['criogenia', 5])).imobilizado).toBe(false);
        expect(estadosEfetivos(f(['criogenia', 6])).imobilizado).toBe(true);
    });
    it('Petrificado por estagios: 1 Lento, 2 Vulneravel, 3 Imobilizado, 4 Petrificado/Incapacitado', () => {
        const e = (n) => estadosEfetivos(f(['petrificado', n]));
        expect(e(1)).toMatchObject({ lento: true, vulneravel: false, imobilizado: false, petrificado: false });
        expect(e(2)).toMatchObject({ lento: true, vulneravel: true, imobilizado: false });
        expect(e(3)).toMatchObject({ imobilizado: true, incapacitado: false });
        expect(e(4)).toMatchObject({ petrificado: true, incapacitado: true });
    });
    it('Cego/Surdo: 1 desv em testes e 2 em ataques', () => {
        expect(modificadoresDeEstados(f(['cegosurdo', 1]))).toMatchObject({ desvTestes: 1, desvAtaque: 2 });
    });
    it('Incapacitado direto soma desv ataque e dupla vantagem contra', () => {
        expect(modificadoresDeEstados(f(['incapacitado', 1]))).toMatchObject({ desvAtaque: 1, vantagemContraEle: 2, evasivaMult: 0 });
    });
    it('desvPorAtributo: Imobilizado (e o Lento que ele nao implica) e Vulneravel', () => {
        expect(modificadoresDeEstados(f(['imobilizado', 1])).desvPorAtributo).toEqual({ forca: 1, destreza: 1 });
        expect(modificadoresDeEstados(f(['vulneravel', 1])).desvPorAtributo).toEqual({ forca: 1, destreza: 0 });
        expect(modificadoresDeEstados(f(['lento', 1])).desvPorAtributo).toEqual({ forca: 0, destreza: 1 });
    });
    it('cura: cada stack de Sangrando/Queimado/Criogenia corta 50%', () => {
        expect(modificadoresDeEstados(f(['queimado', 2])).curaMult).toBe(0.25);
        expect(modificadoresDeEstados(f(['sangrando', 1], ['criogenia', 1])).curaMult).toBe(0.25);
    });
    it('custoDefesaMult: +10% por stack de Queimado e Sangrando', () => {
        expect(modificadoresDeEstados(f(['queimado', 2], ['sangrando', 1])).custoDefesaMult).toBeCloseTo(1.3, 10);
        expect(modificadoresDeEstados(f(['criogenia', 3])).custoDefesaMult).toBe(1);
    });
    it('stacksDe devolve 0 quando ausente', () => {
        expect(stacksDe(f(['lento', 2]), 'queimado')).toBe(0);
        expect(stacksDe(f(['lento', 2]), 'lento')).toBe(2);
    });
});

describe('condicoes - somarEstado / tirarEstado / aplicarEstadoNaFicha', () => {
    it('soma em estado novo e existente, sem mutar a original', () => {
        const orig = [{ id: 'lento', stacks: 1 }];
        expect(somarEstado(orig, 'lento', 2)).toEqual([{ id: 'lento', stacks: 3 }]);
        expect(orig).toEqual([{ id: 'lento', stacks: 1 }]);
        expect(somarEstado(orig, 'queimado', 1)).toHaveLength(2);
    });
    it('trava em 6', () => {
        expect(somarEstado([{ id: 'lento', stacks: 5 }], 'lento', 5)[0].stacks).toBe(6);
    });
    it('id invalido ou stacks 0 nao mudam nada; lista indefinida vira lista', () => {
        expect(somarEstado([{ id: 'lento', stacks: 1 }], 'xx', 2)).toEqual([{ id: 'lento', stacks: 1 }]);
        expect(somarEstado([{ id: 'lento', stacks: 1 }], 'lento', 0)).toEqual([{ id: 'lento', stacks: 1 }]);
        expect(somarEstado(undefined, 'lento', 1)).toEqual([{ id: 'lento', stacks: 1 }]);
    });
    it('guarda a fonte', () => {
        expect(somarEstado([], 'amedrontado', 1, 'Dragao')).toEqual([{ id: 'amedrontado', stacks: 1, fonte: 'Dragao' }]);
    });
    it('tirarEstado reduz stacks e remove ao chegar a zero; sem stacks remove tudo', () => {
        const l = [{ id: 'lento', stacks: 3 }, { id: 'queimado', stacks: 1 }];
        expect(tirarEstado(l, 'lento', 1)).toEqual([{ id: 'lento', stacks: 2 }, { id: 'queimado', stacks: 1 }]);
        expect(tirarEstado(l, 'lento')).toEqual([{ id: 'queimado', stacks: 1 }]);
        expect(tirarEstado(l, 'inexistente', 1)).toHaveLength(2);
    });
    it('aplicarEstadoNaFicha muta a ficha', () => {
        const ficha = {};
        const r = aplicarEstadoNaFicha(ficha, 'queimado', 2);
        expect(ficha.condicoes).toEqual([{ id: 'queimado', stacks: 2 }]);
        expect(r).toBe(ficha.condicoes);
    });
});

describe('condicoes - danoDeEstadosNoTurno', () => {
    it('sem condicoes: total 0', () => {
        expect(danoDeEstadosNoTurno({}, () => 1)).toEqual({ total: 0, partes: [] });
    });
    it('Queimado 2x = 16d4 com dado fixo', () => {
        const r = danoDeEstadosNoTurno(f(['queimado', 2]), () => 3);
        expect(r.partes).toEqual([{ id: 'queimado', stacks: 2, dado: '16d4', dano: 48 }]);
        expect(r.total).toBe(48);
    });
    it('rolar recebe as faces certas e soma varios estados; ignora estados sem dano', () => {
        const faces = [];
        const r = danoDeEstadosNoTurno(f(['sangrando', 1], ['criogenia', 1], ['lento', 5]), (n) => { faces.push(n); return 1; });
        expect(r.partes.map(p => p.id)).toEqual(['sangrando', 'criogenia']);
        expect(r.total).toBe(10);
        expect(new Set(faces)).toEqual(new Set([4]));
        expect(faces).toHaveLength(10);
    });
    it('rolar maximo/minimo', () => {
        expect(danoDeEstadosNoTurno(f(['sangrando', 1]), (n) => n).total).toBe(20);
        expect(danoDeEstadosNoTurno(f(['sangrando', 1]), () => 1).total).toBe(5);
    });
    it('sem rolar injetado, usa aleatorio dentro do intervalo', () => {
        const r = danoDeEstadosNoTurno(f(['sangrando', 1]));
        expect(r.total).toBeGreaterThanOrEqual(5);
        expect(r.total).toBeLessThanOrEqual(20);
    });
    it('descreverDanoDeEstados', () => {
        expect(descreverDanoDeEstados(null)).toBe('');
        expect(descreverDanoDeEstados({ partes: [] })).toBe('');
        const t = descreverDanoDeEstados(danoDeEstadosNoTurno(f(['sangrando', 1]), () => 1));
        expect(t).toContain('Sangrando');
        expect(t).toContain('5d4');
    });
});

describe('condicoes - resumoDosEstados', () => {
    it('vazio sem condicoes', () => { expect(resumoDosEstados({})).toEqual([]); });
    it('menciona Lento, Vulneravel e custo', () => {
        const t = resumoDosEstados(f(['lento', 1], ['queimado', 4])).join('\n');
        expect(t).toContain('Lento');
        expect(t).toContain('Vulnerável');
        expect(t).toContain('40%');
    });
    it('Amedrontado usa a fonte', () => {
        expect(resumoDosEstados(f(['amedrontado', 1, 'Zeus'])).join('')).toContain('Zeus');
    });
});
