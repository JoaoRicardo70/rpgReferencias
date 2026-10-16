import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

let ctxMock;
vi.mock('./AtaqueFormContext', () => ({
    useAtaqueForm: () => ctxMock,
    STATS_LIST: [{ value: 'forca', label: 'Forca' }],
    ENERGIA_LIST: [{ value: 'mana', label: 'Mana' }]
}));
vi.mock('./DisputaPoderResumo', () => ({ default: () => null }));

import { AtaquesSalvosChips, AtaqueBotoesAcao } from './AtaqueSubComponents';

const rolarAtaqueSalvo = vi.fn();
const deletarAtaqueSalvo = vi.fn();
const salvarAtaque = vi.fn();
const A = { id: 11, nome: 'Rajada', versao: 2, config: {} };
const B = { id: 22, nome: 'Estocada', versao: 2, config: {} };
const montar = ({ salvos = [A, B], podeRolarDano = true, ignorarTravaAcerto = false, ficha } = {}) => {
    ctxMock = {
        minhaFicha: ficha !== undefined ? ficha : { ataqueConfig: { ataquesSalvos: salvos } },
        rolarAtaqueSalvo, deletarAtaqueSalvo, salvarAtaque, podeRolarDano, ignorarTravaAcerto,
        setIgnorarTravaAcerto: vi.fn(), salvarConfigAtaque: vi.fn(), rolarDano: vi.fn(), dummieAlvo: null, disputaAlvo: null
    };
};
beforeEach(() => { rolarAtaqueSalvo.mockClear(); deletarAtaqueSalvo.mockClear(); salvarAtaque.mockClear(); });
afterEach(() => cleanup());

describe('AtaquesSalvosChips', () => {
    it('lista um chip por ataque salvo', () => {
        montar();
        render(<AtaquesSalvosChips />);
        expect(screen.getByText('▶ Rajada')).toBeTruthy();
        expect(screen.getByText('▶ Estocada')).toBeTruthy();
    });
    it('clicar chama rolarAtaqueSalvo com o registro', () => {
        montar();
        render(<AtaquesSalvosChips />);
        fireEvent.click(screen.getByText('▶ Estocada'));
        expect(rolarAtaqueSalvo).toHaveBeenCalledTimes(1);
        expect(rolarAtaqueSalvo).toHaveBeenCalledWith(B);
    });
    it('desabilitado sem podeRolarDano e sem ignorarTravaAcerto', () => {
        montar({ podeRolarDano: false });
        render(<AtaquesSalvosChips />);
        const b = screen.getByText('▶ Rajada');
        expect(b.disabled).toBe(true);
        fireEvent.click(b);
        expect(rolarAtaqueSalvo).not.toHaveBeenCalled();
    });
    it('habilitado se ignorarTravaAcerto mesmo sem podeRolarDano', () => {
        montar({ podeRolarDano: false, ignorarTravaAcerto: true });
        render(<AtaquesSalvosChips />);
        const b = screen.getByText('▶ Rajada');
        expect(b.disabled).toBe(false);
        fireEvent.click(b);
        expect(rolarAtaqueSalvo).toHaveBeenCalledWith(A);
    });
    it('apagar chama deletarAtaqueSalvo(id) e nao executa o ataque', () => {
        montar();
        render(<AtaquesSalvosChips />);
        fireEvent.click(screen.getAllByTitle('Apagar')[1]);
        expect(deletarAtaqueSalvo).toHaveBeenCalledWith(22);
        expect(rolarAtaqueSalvo).not.toHaveBeenCalled();
    });
    it('comExcluir=false esconde os botoes de apagar', () => {
        montar();
        render(<AtaquesSalvosChips comExcluir={false} />);
        expect(screen.queryAllByTitle('Apagar')).toHaveLength(0);
    });
    it('nao renderiza sem salvos, sem ataqueConfig, sem ficha ou sem contexto', () => {
        for (const cfg of [{ salvos: [] }, { ficha: {} }, { ficha: null }, { ficha: { ataqueConfig: {} } }]) {
            montar(cfg);
            const { container, unmount } = render(<AtaquesSalvosChips />);
            expect(container.innerHTML).toBe('');
            unmount();
        }
        ctxMock = null;
        const { container } = render(<AtaquesSalvosChips />);
        expect(container.innerHTML).toBe('');
    });
});

describe('AtaqueBotoesAcao - Salvar Ataque', () => {
    it('botao Salvar Ataque chama salvarAtaque e os chips aparecem junto', () => {
        montar();
        render(<AtaqueBotoesAcao />);
        fireEvent.click(screen.getByText(/Salvar Ataque/));
        expect(salvarAtaque).toHaveBeenCalledTimes(1);
        expect(screen.getByText('▶ Rajada')).toBeTruthy();
    });
});
