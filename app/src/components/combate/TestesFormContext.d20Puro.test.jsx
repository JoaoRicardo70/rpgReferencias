import React from 'react';
import { render, screen, fireEvent, cleanup, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { TestesFormProvider, useTestesForm } from './TestesFormContext';
import { TestesModificadoresGlobais } from './TestesSubComponents';

vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
}));

const wrapper = ({ children }) => <TestesFormProvider>{children}</TestesFormProvider>;

function setFicha(ficha, extra = {}) {
    useStore.setState({ minhaFicha: ficha, meuNome: 'Ana', setAbaAtiva: vi.fn(), ...extra });
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('getModificadorDoisDigitos - sem bonus de Ascensao', () => {
    it('ascensaoBase 2 e forca.base 20000 mostra +20 (nao +220)', () => {
        setFicha({ ascensaoBase: 2, forca: { base: 20000 } });
        const { result } = renderHook(() => useTestesForm(), { wrapper });
        expect(result.current.getModificadorDoisDigitos('forca')).toBe(20);
    });
    it('ascensao nao altera o resultado', () => {
        setFicha({ ascensaoBase: 1, forca: { base: 20000 } });
        const a = renderHook(() => useTestesForm(), { wrapper }).result.current.getModificadorDoisDigitos('forca');
        setFicha({ ascensaoBase: 9, forca: { base: 20000 } });
        const b = renderHook(() => useTestesForm(), { wrapper }).result.current.getModificadorDoisDigitos('forca');
        expect(a).toBe(b);
    });
    it('valor pequeno (50) e atributo ausente nao quebram', () => {
        setFicha({ ascensaoBase: 3, destreza: { base: 50 } });
        const { result } = renderHook(() => useTestesForm(), { wrapper });
        expect(result.current.getModificadorDoisDigitos('destreza')).toBe(50);
        expect(result.current.getModificadorDoisDigitos('carisma')).toBe(0);
    });
    it('base 0 = 0', () => {
        setFicha({ forca: { base: 0 } });
        const { result } = renderHook(() => useTestesForm(), { wrapper });
        expect(result.current.getModificadorDoisDigitos('forca')).toBe(0);
    });
});

describe('rolarD20Puro', () => {
    it.each([
        [0, 1], [0.5, 11], [0.9999, 20],
    ])('Math.random=%s gera total %s e envia ao feed sem modificadores', (rnd, esperado) => {
        vi.spyOn(Math, 'random').mockReturnValue(rnd);
        const setAbaAtiva = vi.fn();
        setFicha({ proficienciaBase: 5, forca: { base: 99999 } }, { setAbaAtiva });
        const { result } = renderHook(() => useTestesForm(), { wrapper });
        result.current.rolarD20Puro();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        const e = enviarParaFeed.mock.calls[0][0];
        expect(e.tipo).toBe('skill');
        expect(e.nome).toBe('Ana');
        expect(e.nomeTeste).toBe('d20 Puro');
        expect(e.total).toBe(esperado);
        expect(e.detalheCalc).toContain('Sem modificadores');
        expect(e.detalheCalc).toContain(`<strong`);
        expect(setAbaAtiva).toHaveBeenCalledWith('aba-log');
    });
    it('20 marca CRITICO e 1 marca FALHA CRITICA', () => {
        setFicha({});
        const { result } = renderHook(() => useTestesForm(), { wrapper });
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        result.current.rolarD20Puro();
        expect(enviarParaFeed.mock.calls[0][0].detalheCalc).toContain('CRITICO!');
        vi.spyOn(Math, 'random').mockReturnValue(0);
        result.current.rolarD20Puro();
        expect(enviarParaFeed.mock.calls[1][0].detalheCalc).toContain('FALHA CRITICA');
    });
    it('100 rolagens reais ficam sempre entre 1 e 20', () => {
        setFicha({});
        const { result } = renderHook(() => useTestesForm(), { wrapper });
        for (let i = 0; i < 100; i++) result.current.rolarD20Puro();
        const totais = enviarParaFeed.mock.calls.map(c => c[0].total);
        expect(totais).toHaveLength(100);
        totais.forEach(t => { expect(Number.isInteger(t)).toBe(true); expect(t).toBeGreaterThanOrEqual(1); expect(t).toBeLessThanOrEqual(20); });
    });
});

describe('botao "Rolar d20 Puro" em TestesModificadoresGlobais', () => {
    it('renderiza e dispara o feed ao clicar', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.3);
        setFicha({ forca: { base: 100 } });
        render(<TestesFormProvider><TestesModificadoresGlobais /></TestesFormProvider>);
        fireEvent.click(screen.getByText(/Rolar d20 Puro/));
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        expect(enviarParaFeed.mock.calls[0][0]).toMatchObject({ tipo: 'skill', nomeTeste: 'd20 Puro', total: 7 });
    });
    it('sem provider mostra fallback e nao quebra', () => {
        render(<TestesModificadoresGlobais />);
        expect(screen.queryByText(/Rolar d20 Puro/)).toBeNull();
    });
});
