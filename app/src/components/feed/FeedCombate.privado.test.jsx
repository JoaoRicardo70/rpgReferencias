import React from 'react';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import FeedCombate from './FeedCombate';
import useStore from '../../stores/useStore';
import { revelarEntradaFeed } from '../../services/firebase-sync';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({ revelarEntradaFeed: vi.fn() }));

function montar(feed, isMestre) {
    const state = { feedCombate: feed, isMestre, minhaFicha: {} };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    return render(<FeedCombate />);
}
const dano = (extra = {}) => ({ tipo: 'dano', nome: 'Ana', dano: 35, letalidade: 0, atributosUsados: 'Força', ...extra });

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => cleanup());

describe('FeedCombate - rolagens privadas do Mestre', () => {
    it('Mestre vê a rolagem privada com a barra e revela pela _chave', () => {
        const { container } = montar([dano({ privado: true, _chave: 'k9' })], true);
        expect(screen.getByText(/Rolagem do Mestre: só você vê/)).toBeTruthy();
        expect(container.querySelector('.feed-privado')).not.toBeNull();
        fireEvent.click(screen.getByText(/Revelar aos jogadores/));
        expect(revelarEntradaFeed).toHaveBeenCalledWith('k9');
    });
    it('botão revelar desabilitado sem _chave', () => {
        montar([dano({ privado: true })], true);
        const b = screen.getByText(/Revelar aos jogadores/);
        expect(b.disabled).toBe(true);
        fireEvent.click(b);
        expect(revelarEntradaFeed).not.toHaveBeenCalled();
    });
    it('entrada pública do Mestre não tem barra', () => {
        montar([dano()], true);
        expect(screen.queryByText(/Rolagem do Mestre/)).toBeNull();
    });
    it('jogador NÃO vê a entrada privada', () => {
        const { container } = montar([dano({ privado: true, _chave: 'k9' })], false);
        expect(screen.queryByText(/Rolagem do Mestre/)).toBeNull();
        expect(screen.queryByText(/Revelar/)).toBeNull();
        expect(screen.getByText(/Aguardando acoes de combate/)).toBeTruthy();
        expect(container.querySelector('.feed-privado')).toBeNull();
    });
    it('jogador vê a pública e não a privada no mesmo feed', () => {
        const { container } = montar([dano({ nome: 'Publica' }), dano({ nome: 'Secreta', privado: true, _chave: 'a' })], false);
        expect(container.textContent).toContain('Publica');
        expect(container.textContent).not.toContain('Secreta');
    });
    it('checkbox só para Mestre', () => {
        montar([dano()], false);
        expect(screen.queryByLabelText(/Dados do Mestre privados/)).toBeNull();
        cleanup();
        montar([dano()], true);
        expect(screen.getByLabelText(/Dados do Mestre privados/)).toBeTruthy();
    });
    it('checkbox aparece com feed vazio e grava no localStorage', () => {
        montar([], true);
        const cb = screen.getByLabelText(/Dados do Mestre privados/);
        expect(cb.checked).toBe(true);
        fireEvent.click(cb);
        expect(localStorage.getItem('rpg_dados_mestre_privados')).toBe('0');
        expect(screen.getByLabelText(/Dados do Mestre privados/).checked).toBe(false);
        fireEvent.click(screen.getByLabelText(/Dados do Mestre privados/));
        expect(localStorage.getItem('rpg_dados_mestre_privados')).toBe('1');
    });
});
