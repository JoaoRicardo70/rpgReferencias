import React from 'react';
import { cleanup, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { TestesFormProvider, useTestesForm } from './TestesFormContext';

vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
}));

const wrapper = ({ children }) => <TestesFormProvider>{children}</TestesFormProvider>;
const ef = (atributo, valor, extra = {}) => ({ nome: 'e', atributo, propriedade: 'base', valor, ...extra });
const r = (v) => (v - 0.5) / 20; // Math.random que dá o valor v num d20
// Com vantagem/desvantagem por efeito, executarRolagem consome UM d20 descartado (rolarDado) antes de rolarDadosComVantagem.
const VD = (...dados) => [10, ...dados];

function rolarTeste(efeitos, dados, { skill = 'furtividade', attr = 'destreza', extra = {}, ficha = {} } = {}) {
    vi.restoreAllMocks();
    const spy = vi.spyOn(Math, 'random');
    dados.forEach(v => spy.mockReturnValueOnce(r(v)));
    spy.mockReturnValue(r(10));
    useStore.setState({ minhaFicha: { passivas: [{ efeitos }], ...ficha }, meuNome: 'Ana', setAbaAtiva: vi.fn(), ...extra });
    const { result } = renderHook(() => useTestesForm(), { wrapper });
    enviarParaFeed.mockClear();
    result.current.executarRolagem(skill, 'Furtividade', attr, false);
    expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    return enviarParaFeed.mock.calls[0][0];
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('executarRolagem: sem efeitos (regressao)', () => {
    it('d20 simples sem texto de vantagem/piso', () => {
        const e = rolarTeste([], [13]);
        expect(e.total).toBe(13);
        expect(e.detalheCalc).not.toContain('por efeito');
        expect(e.detalheCalc).not.toContain('Piso');
    });
    it('20 natural continua marcando CRITICO', () => {
        expect(rolarTeste([], [20]).detalheCalc).toContain('CRITICO!');
    });
});

describe('executarRolagem: vantagem/desvantagem por efeito', () => {
    it('vantagem sem escopo NAO vale em teste (padrao ataque)', () => {
        const e = rolarTeste([ef('vantagem', 1)], [5, 17]);
        expect(e.total).toBe(5);
        expect(e.detalheCalc).not.toContain('vantagem');
    });
    it('escopo "teste" vale: mantem o maior dos dois dados', () => {
        const e = rolarTeste([ef('vantagem', 1, { escopo: 'teste' })], VD(5, 17));
        expect(e.total).toBe(17);
        expect(e.detalheCalc).toContain('1 vantagem(ns) por efeito');
    });
    it('escopo "tudo" vale em teste', () => {
        expect(rolarTeste([ef('vantagem', 1, { escopo: 'tudo' })], VD(5, 17)).total).toBe(17);
    });
    it('escopo "ataque" NAO vale em teste', () => {
        expect(rolarTeste([ef('vantagem', 1, { escopo: 'ataque' })], [5, 17]).total).toBe(5);
    });
    it('escopo teste:<pericia> vale so naquela pericia ou no atributo dela', () => {
        const efeitos = [ef('vantagem', 1, { escopo: 'teste:furtividade' })];
        expect(rolarTeste(efeitos, VD(5, 17)).total).toBe(17);
        expect(rolarTeste(efeitos, [5, 17], { skill: 'acrobacia', attr: 'destreza' }).total).toBe(5);
        expect(rolarTeste([ef('vantagem', 1, { escopo: 'teste:destreza' })], VD(5, 17), { skill: 'acrobacia', attr: 'destreza' }).total).toBe(17);
    });
    it('desvantagem por efeito (escopo teste) mantem o menor', () => {
        const e = rolarTeste([ef('desvantagem', 1, { escopo: 'teste' })], VD(5, 17));
        expect(e.total).toBe(5);
        expect(e.detalheCalc).toContain('1 desvantagem(ns) por efeito');
    });
    it('vantagem e desvantagem iguais se anulam', () => {
        const e = rolarTeste([ef('vantagem', 1, { escopo: 'teste' }), ef('desvantagem', 1, { escopo: 'teste' })], VD(5, 17));
        expect(e.total).toBe(5);
    });
    it('condicao em_combate: so com iniciativa na ficha', () => {
        const efeitos = [ef('vantagem', 1, { escopo: 'teste', quando: 'em_combate' })];
        expect(rolarTeste(efeitos, [5, 17]).total).toBe(5);
        expect(rolarTeste(efeitos, VD(5, 17), { ficha: { iniciativa: 8 } }).total).toBe(17);
    });
    it('condicao desconhecida nunca vale', () => {
        expect(rolarTeste([ef('vantagem', 1, { escopo: 'tudo', quando: 'lua' })], [5, 17]).total).toBe(5);
    });
});

describe('executarRolagem: piso_d20', () => {
    it('sem escopo vale em todo teste (padrao teste): 3 vira 8', () => {
        const e = rolarTeste([ef('piso_d20', 8)], [3]);
        expect(e.total).toBe(8);
        expect(e.detalheCalc).toContain('Piso do d20: 3 vale 8');
    });
    it('escopo "ataque" NAO vale em teste', () => {
        expect(rolarTeste([ef('piso_d20', 8, { escopo: 'ataque' })], [3]).total).toBe(3);
    });
    it('1 que vira piso nao e falha critica; 20 continua CRITICO sem ajuste', () => {
        const e1 = rolarTeste([ef('piso_d20', 8)], [1]);
        expect(e1.total).toBe(8);
        expect(e1.detalheCalc).not.toContain('FALHA CRITICA');
        const e20 = rolarTeste([ef('piso_d20', 8)], [20]);
        expect(e20.total).toBe(20);
        expect(e20.detalheCalc).toContain('CRITICO!');
    });
    it('dado acima do piso nao muda', () => {
        const e = rolarTeste([ef('piso_d20', 8)], [12]);
        expect(e.total).toBe(12);
        expect(e.detalheCalc).not.toContain('Piso');
    });
    it('vale sobre o dado mantido da vantagem', () => {
        const e = rolarTeste([ef('vantagem', 1, { escopo: 'teste' }), ef('piso_d20', 8)], VD(2, 4));
        expect(e.total).toBe(8);
    });
    it('varios pisos: vale o maior', () => {
        expect(rolarTeste([ef('piso_d20', 6), ef('piso_d20', 9)], [2]).total).toBe(9);
    });
});
