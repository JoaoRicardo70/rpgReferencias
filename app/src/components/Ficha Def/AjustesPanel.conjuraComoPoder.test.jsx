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

const fichaBase = (combate) => ({
    bio: { classe: '', mesa: 'presente' },
    forca: { base: 50000, mBase: 1 },
    vida: { base: 100000000, mBase: 1, atual: 100000000 },
    dano: { mBase: 1, mPotencial: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', danoBruto: 0 },
    ...(combate ? { combate } : {})
});
const caixa = () => screen.getByLabelText(/Liberado para este personagem/);

beforeEach(() => {
    salvarFichaSilencioso.mockClear();
    useStore.setState({ meuNome: 'Ana', minhaFicha: fichaBase(), personagens: {} });
});
afterEach(() => cleanup());

describe('AjustesPanel > Conjurar como Poder', () => {
    it('mostra a secao e o checkbox desmarcado por padrao (sem ficha.combate)', () => {
        render(<AjustesPanel />);
        expect(screen.getByText(/Conjurar como Poder/)).toBeTruthy();
        expect(caixa().checked).toBe(false);
    });

    it('mostra marcado quando combate.conjuraComoPoder e true', () => {
        useStore.setState({ minhaFicha: fichaBase({ conjuraComoPoder: true }) });
        render(<AjustesPanel />);
        expect(caixa().checked).toBe(true);
    });

    it('marcar grava true (criando ficha.combate) e dispara o save', () => {
        render(<AjustesPanel />);
        fireEvent.click(caixa());
        expect(useStore.getState().minhaFicha.combate.conjuraComoPoder).toBe(true);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(caixa().checked).toBe(true);
    });

    it('desmarcar grava false e preserva outros campos de combate', () => {
        useStore.setState({ minhaFicha: fichaBase({ conjuraComoPoder: true, outro: 7 }) });
        render(<AjustesPanel />);
        fireEvent.click(caixa());
        const c = useStore.getState().minhaFicha.combate;
        expect(c.conjuraComoPoder).toBe(false);
        expect(c.outro).toBe(7);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });
});
