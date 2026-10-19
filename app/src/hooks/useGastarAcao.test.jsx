import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useGastarAcao from './useGastarAcao';

let ficha;
const updateFicha = vi.fn((cb) => cb(ficha));
const salvar = vi.fn();
vi.mock('../components/Ficha Def/FichaAlvoContext', () => ({
    useFichaAtiva: () => ({ ficha, updateFicha }),
    useCallSaveAtivo: () => salvar
}));

let gastar;
function Harness() { gastar = useGastarAcao(); return null; }
const acoes = (p, b, r) => ({ padrao: { max: 2, atual: p, extra: 0 }, bonus: { max: 2, atual: b, extra: 0 }, reacao: { max: 2, atual: r, extra: 0 } });

beforeEach(() => {
    vi.clearAllMocks();
    ficha = { acoes: acoes(2, 2, 2) };
    window.confirm = vi.fn(() => true);
    render(<Harness />);
});
afterEach(() => cleanup());

describe('useGastarAcao', () => {
    it('sem tipo rastreado nao pergunta, nao desconta e retorna true', () => {
        let r;
        act(() => { r = gastar({ nome: 'X' }); });
        expect(r).toBe(true);
        act(() => { r = gastar({ tipoAcao: 'movimento' }); });
        expect(r).toBe(true);
        act(() => { r = gastar([{ tipoAcao: 'livre' }, null]); });
        expect(r).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(updateFicha).not.toHaveBeenCalled();
        expect(salvar).not.toHaveBeenCalled();
    });

    it('com Acao disponivel desconta, salva e nao pergunta', () => {
        let r;
        act(() => { r = gastar({ tipoAcao: 'reacao' }); });
        expect(r).toBe(true);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(ficha.acoes.reacao.atual).toBe(1);
        expect(ficha.acoes.padrao.atual).toBe(2);
        expect(salvar).toHaveBeenCalledTimes(1);
    });

    it('aceita lista e cobra um de cada tipo distinto (sem duplicar)', () => {
        act(() => { gastar([{ tipoAcao: 'acao' }, { tipoAcao: 'acao' }, { tipoAcao: 'bonus' }]); });
        expect(ficha.acoes.padrao.atual).toBe(1);
        expect(ficha.acoes.bonus.atual).toBe(1);
    });

    it('sem Acao pergunta; cancelar retorna false e nao gasta nem salva', () => {
        ficha.acoes = acoes(0, 2, 2);
        window.confirm = vi.fn(() => false);
        let r;
        act(() => { r = gastar({ tipoAcao: 'acao' }); });
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(window.confirm.mock.calls[0][0]).toMatch(/Sem Ação disponível/);
        expect(r).toBe(false);
        expect(updateFicha).not.toHaveBeenCalled();
        expect(salvar).not.toHaveBeenCalled();
        expect(ficha.acoes.padrao.atual).toBe(0);
    });

    it('sem Acao e confirmar retorna true, salva e o contador nunca fica negativo', () => {
        ficha.acoes = acoes(0, 2, 2);
        let r;
        act(() => { r = gastar({ tipoAcao: 'acao' }); });
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(r).toBe(true);
        expect(ficha.acoes.padrao.atual).toBe(0);
        expect(salvar).toHaveBeenCalledTimes(1);
    });

    it('mensagem junta os tipos em falta', () => {
        ficha.acoes = acoes(0, 2, 0);
        act(() => { gastar([{ tipoAcao: 'acao' }, { tipoAcao: 'reacao' }]); });
        expect(window.confirm.mock.calls[0][0]).toContain('Sem Ação e Reação disponível');
    });

    it('sem argumento (undefined) retorna true', () => {
        let r;
        act(() => { r = gastar(undefined); });
        expect(r).toBe(true);
    });
});
