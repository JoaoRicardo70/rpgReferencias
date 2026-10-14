import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const salvarFichaSilencioso = vi.fn();
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: (...a) => salvarFichaSilencioso(...a),
    salvarFichaAlvoSilencioso: vi.fn(), salvarFichaAlvoImediato: vi.fn(), salvarFirebaseImediato: vi.fn(),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(), enviarParaFeed: vi.fn()
}));

import AjustesPanel from './AjustesPanel';
import useStore from '../../stores/useStore';

const fichaBase = () => ({
    bio: { classe: '', mesa: 'presente' },
    forca: { base: 50000, mBase: 1 },
    vida: { base: 100000000, mBase: 1, atual: 100000000 },
    dano: { mBase: 1, mPotencial: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', danoBruto: 0 }
});

beforeEach(() => {
    salvarFichaSilencioso.mockClear();
    useStore.setState({ meuNome: 'Ana', minhaFicha: fichaBase(), personagens: {} });
});
afterEach(() => { cleanup(); });

describe('AjustesPanel', () => {
    it('Editor de Atributos mostra a Força na escala de exibição (base/1000)', () => {
        render(<AjustesPanel />);
        expect(screen.getByText(/Editor de Atributos/)).toBeTruthy();
        const base = screen.getAllByRole('spinbutton')[0];
        expect(Number(base.value)).toBe(50);
    });

    it('salva a Base editada na escala bruta (x1000) e dispara o save', () => {
        render(<AjustesPanel />);
        fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '80' } });
        fireEvent.click(screen.getByText('SALVAR ATRIBUTOS'));
        expect(useStore.getState().minhaFicha.forca.base).toBe(80000);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('Multiplicadores de Poder gravam em ficha.dano', () => {
        render(<AjustesPanel />);
        expect(screen.getByText(/Multiplicadores de Poder/)).toBeTruthy();
        const geral = screen.getByLabelText(/Mult Geral/);
        fireEvent.change(geral, { target: { value: '2.5' } });
        fireEvent.click(screen.getByText('SALVAR MULTIPLICADORES'));
        expect(useStore.getState().minhaFicha.dano.mGeral).toBe(2.5);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });

    it('valor inválido nos multiplicadores volta para 1', () => {
        render(<AjustesPanel />);
        fireEvent.change(screen.getAllByLabelText(/Mult Base/).pop(), { target: { value: '' } });
        fireEvent.click(screen.getByText('SALVAR MULTIPLICADORES'));
        expect(useStore.getState().minhaFicha.dano.mBase).toBe(1);
    });

    it('sem ficha não renderiza nada', () => {
        useStore.setState({ minhaFicha: null });
        const { container } = render(<AjustesPanel />);
        expect(container.firstChild).toBeNull();
    });
});
