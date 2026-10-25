import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useStore from '../../stores/useStore';
import TrocaRapidaMestre from './TrocaRapidaMestre';
import { salvarCamposPersonagem } from '../../services/firebase-sync';

vi.mock('../../services/firebase-sync', () => ({
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    carregarFichaDoFirebase: vi.fn(() => Promise.resolve(null)),
    salvarCamposPersonagem: vi.fn(() => Promise.resolve()),
}));

const fichaDe = (extra = {}) => ({ donoDaFicha: 'x', ascensaoBase: 3, iniciativa: 1, bio: {}, ...extra });

function montar({ isMestre, meuNome = 'Ana', personagens }) {
    useStore.setState({ isMestre, meuNome, personagens, minhaFicha: personagens[meuNome] || fichaDe() });
    return render(<TrocaRapidaMestre />);
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(cleanup);

describe('TrocaRapidaMestre - NPC compartilhado (jogador)', () => {
    it('jogador sem NPC liberado não vê o botão', () => {
        const { container } = montar({ isMestre: false, personagens: {
            Ana: fichaDe(), Goblin: fichaDe({ isNPC: true }), Lobo: fichaDe({ isNPC: true, acessoJogadores: ['Bia'] }),
        } });
        expect(screen.queryByText(/Controlar/)).toBeNull();
        expect(container.innerHTML).toBe('');
    });
    it('jogador com NPC liberado vê o botão e só os liberados', () => {
        montar({ isMestre: false, personagens: {
            Ana: fichaDe(), Goblin: fichaDe({ isNPC: true }),
            Lobo: fichaDe({ isNPC: true, acessoJogadores: ['Ana'] }),
            Pet: fichaDe({ isNPC: true, acessoJogadores: { 0: 'Ana' } }),
            Bia: fichaDe(),
        } });
        fireEvent.click(screen.getByText(/Controlar/));
        expect(screen.getByText('Lobo')).toBeTruthy();
        expect(screen.getByText('Pet')).toBeTruthy();
        expect(screen.queryByText('Goblin')).toBeNull();
        expect(screen.queryByText('Bia')).toBeNull();
        expect(screen.queryByLabelText(/Acesso de jogadores/)).toBeNull();
        expect(screen.queryByPlaceholderText(/Buscar/)).toBeNull();
    });
});

describe('TrocaRapidaMestre - NPC compartilhado (Mestre)', () => {
    const personagens = () => ({
        Mestre: fichaDe(),
        Goblin: fichaDe({ isNPC: true }),
        Lobo: fichaDe({ isNPC: true, acessoJogadores: ['Ana'] }),
        Ana: fichaDe(), Bia: fichaDe(),
    });
    const abrir = () => {
        montar({ isMestre: true, meuNome: 'Mestre', personagens: personagens() });
        fireEvent.click(screen.getByText(/Controlar/));
    };

    it('mostra um 👥 por NPC (não por jogador), com contagem', () => {
        abrir();
        expect(screen.getAllByLabelText(/Acesso de jogadores a/).length).toBe(2);
        expect(screen.getByLabelText('Acesso de jogadores a Lobo').textContent).toContain('1');
    });
    it('marcar um jogador salva a lista com ele', () => {
        abrir();
        fireEvent.click(screen.getByLabelText('Acesso de jogadores a Goblin'));
        fireEvent.click(screen.getByLabelText(/Bia/, { selector: 'input' }));
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Goblin', { acessoJogadores: ['Bia'] });
    });
    it('marcar outro jogador acrescenta à lista existente', () => {
        abrir();
        fireEvent.click(screen.getByLabelText('Acesso de jogadores a Lobo'));
        fireEvent.click(screen.getByLabelText(/Bia/, { selector: 'input' }));
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Lobo', { acessoJogadores: ['Ana', 'Bia'] });
    });
    it('desmarcar o último manda null', () => {
        abrir();
        fireEvent.click(screen.getByLabelText('Acesso de jogadores a Lobo'));
        const caixa = screen.getByLabelText(/Ana/, { selector: 'input' });
        expect(caixa.checked).toBe(true);
        fireEvent.click(caixa);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Lobo', { acessoJogadores: null });
    });
});
