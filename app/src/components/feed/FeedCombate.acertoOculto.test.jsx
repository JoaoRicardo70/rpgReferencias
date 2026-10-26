import React from 'react';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import FeedCombate from './FeedCombate';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({ revelarEntradaFeed: vi.fn() }));

function montar(feed, isMestre) {
    const state = { feedCombate: feed, isMestre, minhaFicha: {} };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    return render(<FeedCombate />);
}
const acerto = (extra = {}) => ({
    tipo: 'acerto', nome: 'Boss', atributosUsados: 'Força', acertoTotal: 23, profBonusTexto: '(+4 prof)', rolagem: 19, ...extra,
});

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => cleanup());

describe('FeedCombate - valor do Acerto escondido', () => {
    it('jogador vê "🎲 ?" e a frase, sem número nem Rolagem Base', () => {
        const { container } = montar([acerto({ valorOculto: true })], false);
        expect(container.querySelector('.damage-number').textContent).toBe('🎲 ?');
        expect(screen.getByText('Valor do acerto escondido pelo Mestre')).toBeTruthy();
        expect(container.textContent).not.toContain('23');
        expect(container.textContent).not.toContain('Rolagem Base');
        expect(container.textContent).not.toContain('prof');
    });
    it('Mestre vê o número e o aviso de valor escondido', () => {
        const { container } = montar([acerto({ valorOculto: true })], true);
        expect(container.querySelector('.damage-number').textContent).toBe('23');
        expect(screen.getByText('🙈 Valor escondido dos jogadores')).toBeTruthy();
        expect(container.textContent).toContain('Rolagem Base');
    });
    it('acerto normal (sem valorOculto) mostra tudo ao jogador e sem aviso', () => {
        const { container } = montar([acerto()], false);
        expect(container.querySelector('.damage-number').textContent).toBe('23');
        expect(container.textContent).toContain('Rolagem Base');
        expect(container.querySelector('.feed-acerto-oculto')).toBeNull();
    });
    it('checkbox "Esconder o valor do meu Acerto" só para Mestre', () => {
        montar([acerto()], false);
        expect(screen.queryByLabelText(/Esconder o valor do meu Acerto/)).toBeNull();
        cleanup();
        montar([acerto()], true);
        expect(screen.getByLabelText(/Esconder o valor do meu Acerto/)).toBeTruthy();
    });
    it('checkbox vem ligado por padrão e grava no localStorage', () => {
        montar([], true);
        const cb = screen.getByLabelText(/Esconder o valor do meu Acerto/);
        expect(cb.checked).toBe(true);
        fireEvent.click(cb);
        expect(localStorage.getItem('rpg_acerto_mestre_oculto')).toBe('0');
        expect(screen.getByLabelText(/Esconder o valor do meu Acerto/).checked).toBe(false);
    });
});
