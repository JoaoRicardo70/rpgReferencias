import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useStore from '../stores/useStore';
import TrocaRapidaMestre from '../components/layout/TrocaRapidaMestre';
import { salvarFirebaseImediato, carregarFichaDoFirebase } from '../services/firebase-sync';

vi.mock('../services/firebase-sync', () => ({
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    carregarFichaDoFirebase: vi.fn(() => Promise.resolve(null)),
}));

function congelarProfundo(o) {
    Object.values(o).forEach(v => { if (v && typeof v === 'object') congelarProfundo(v); });
    return Object.freeze(o);
}
const fichaDe = (extra = {}) => ({ donoDaFicha: 'x', ascensaoBase: 3, iniciativa: 1, bio: {}, ...extra });

function montar({ isMestre = true, personagens } = {}) {
    useStore.setState({
        isMestre, meuNome: 'Atual',
        personagens: personagens || {
            Atual: fichaDe(),
            Goblin: fichaDe({ isNPC: true, ascensaoBase: 7 }),
            Ana: fichaDe({ ascensaoBase: 4 }),
        },
    });
    return render(<TrocaRapidaMestre />);
}

beforeEach(() => {
    vi.clearAllMocks();
    salvarFirebaseImediato.mockImplementation(() => Promise.resolve());
    carregarFichaDoFirebase.mockImplementation(() => Promise.resolve(null));
    localStorage.clear();
    useStore.getState().resetFicha();
});
afterEach(() => { cleanup(); });

describe('TrocaRapidaMestre', () => {
    it('não renderiza nada para não-Mestre', () => {
        const { container } = montar({ isMestre: false });
        expect(container.innerHTML).toBe('');
    });

    it('Mestre vê o botão e, ao abrir, lista NPCs e Jogadores sem o personagem atual', () => {
        montar();
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(screen.getByText(/Controlar/));
        expect(screen.getByRole('dialog')).toBeDefined();
        expect(screen.getByText(/NPCs/)).toBeDefined();
        expect(screen.getByText(/Jogadores/)).toBeDefined();
        expect(screen.getByText('Goblin')).toBeDefined();
        expect(screen.getByText('Ana')).toBeDefined();
        expect(screen.queryByText('Atual')).toBeNull();
    });

    it('busca filtra a lista e mostra mensagem quando vazio', () => {
        montar();
        fireEvent.click(screen.getByText(/Controlar/));
        const input = screen.getByPlaceholderText(/Buscar/);
        fireEvent.change(input, { target: { value: 'gob' } });
        expect(screen.getByText('Goblin')).toBeDefined();
        expect(screen.queryByText('Ana')).toBeNull();
        fireEvent.change(input, { target: { value: 'zzz' } });
        expect(screen.getByText('Nenhum personagem encontrado.')).toBeDefined();
    });

    it('Esc fecha o painel', () => {
        montar();
        fireEvent.click(screen.getByText(/Controlar/));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('clicar troca meuNome, carrega a ficha do Firebase, salva antes e registra recente', async () => {
        carregarFichaDoFirebase.mockImplementation(() => Promise.resolve(fichaDe({ isNPC: true, ascensaoBase: 9 })));
        montar();
        fireEvent.click(screen.getByText(/Controlar/));
        fireEvent.click(screen.getByText('Goblin'));
        await waitFor(() => expect(useStore.getState().meuNome).toBe('Goblin'));
        expect(carregarFichaDoFirebase).toHaveBeenCalledWith('Goblin');
        expect(salvarFirebaseImediato).toHaveBeenCalled();
        expect(useStore.getState().minhaFicha.ascensaoBase).toBe(9);
        expect(localStorage.getItem('rpgNome')).toBe('Goblin');
        expect(JSON.parse(localStorage.getItem('rpg_mestre_recentes'))).toEqual(['Goblin']);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('fallback para personagens[n] congelado não lança e carrega a ficha', async () => {
        const personagens = congelarProfundo({
            Atual: fichaDe(),
            Ana: fichaDe({ ascensaoBase: 4, armaEspiritual: { nome: 'Lança', passivas: [] } }),
        });
        montar({ personagens });
        fireEvent.click(screen.getByText(/Controlar/));
        fireEvent.click(screen.getByText('Ana'));
        await waitFor(() => expect(useStore.getState().meuNome).toBe('Ana'));
        expect(useStore.getState().minhaFicha.ascensaoBase).toBe(4);
        expect(useStore.getState().minhaFicha.armaEspiritual.acessoArma).toBe(true);
    });

    it('falha de salvarFirebaseImediato não impede a troca', async () => {
        salvarFirebaseImediato.mockImplementation(() => Promise.reject(new Error('offline')));
        montar();
        fireEvent.click(screen.getByText(/Controlar/));
        fireEvent.click(screen.getByText('Ana'));
        await waitFor(() => expect(useStore.getState().meuNome).toBe('Ana'));
    });

    it('sem ficha em lugar nenhum: avisa e mantém o personagem atual', async () => {
        montar({ personagens: { Atual: fichaDe(), Vazia: { x: 1 } } });
        fireEvent.click(screen.getByText(/Controlar/));
        fireEvent.click(screen.getByText('Vazia'));
        await waitFor(() => expect(useStore.getState().avisosAcao.some(a => a.texto.includes('Não consegui abrir'))).toBe(true));
        expect(useStore.getState().meuNome).toBe('Atual');
    });

    it('recentes aparecem no topo quando existem no localStorage', () => {
        localStorage.setItem('rpg_mestre_recentes', JSON.stringify(['Ana', 'Fantasma']));
        montar();
        fireEvent.click(screen.getByText(/Controlar/));
        expect(screen.getByText(/Recentes/)).toBeDefined();
        expect(screen.getAllByText('Ana').length).toBe(2);
    });

    it('localStorage de recentes corrompido não quebra', () => {
        localStorage.setItem('rpg_mestre_recentes', '{{nao-json');
        expect(() => montar()).not.toThrow();
    });
});
