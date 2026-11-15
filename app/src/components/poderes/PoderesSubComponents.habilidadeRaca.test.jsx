import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider } from './PoderesFormContext';
import { PoderesNavegacaoLivro, PoderesLista } from './PoderesSubComponents';
import useStore from '../../stores/useStore';

// Aba "Habilidades de Raça" do Grimório: campo "Raças com acesso" (Mestre edita, jogador só lê), selos e mensagem de aba vazia.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

const CENARIO = { racas: [
    { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: [], herdaDe: '' },
    { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' },
] };
let mockState;
function montar({ isMestre, raca = 'Saiyajin', poderes }) {
    mockState = {
        minhaFicha: { bio: { raca }, poderes },
        meuNome: 'Heroi', isMestre, cenario: CENARIO, adicionarAviso: vi.fn(),
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
    };
    useStore.getState = () => mockState;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    render(<PoderesFormProvider><PoderesNavegacaoLivro /><PoderesLista /></PoderesFormProvider>);
    fireEvent.click(screen.getByRole('tab', { name: /Habilidades de Raça/ }));
}
const zenkai = (extra = {}) => ({ id: 7, nome: 'Zenkai', categoria: 'habilidadeRaca', ativa: false, racasAcesso: ['saiyajin'], efeitos: [], efeitosPassivos: [], ...extra });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('Grimório — Habilidades de Raça', () => {
    it('Mestre vê os chips das raças, a contagem e alterna o acesso na hora', () => {
        montar({ isMestre: true, poderes: [zenkai()] });
        const grupo = screen.getByRole('group', { name: /Raças com acesso a Zenkai/ });
        expect(screen.getByText('1 raça(s) com acesso')).toBeTruthy();
        const saiyajin = within(grupo).getByRole('button', { name: /Saiyajin/ });
        const humano = within(grupo).getByRole('button', { name: /Humano/ });
        expect(saiyajin.getAttribute('aria-pressed')).toBe('true');
        expect(humano.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(humano);
        expect(mockState.minhaFicha.poderes[0].racasAcesso).toEqual(['saiyajin', 'humano']);
    });

    it('jogador só lê o texto das raças com acesso (sem chips)', () => {
        montar({ isMestre: false, poderes: [zenkai({ racasAcesso: ['saiyajin', 'humano'] })] });
        expect(screen.getByText(/Raças com acesso: Saiyajin, Humano/)).toBeTruthy();
        expect(screen.queryByRole('group', { name: /Raças com acesso/ })).toBeNull();
        expect(screen.queryByText(/raça\(s\) com acesso/)).toBeNull();
    });

    it('selo "Raça incompatível" quando a Raça atual não tem acesso, e nenhum selo quando tem', () => {
        montar({ isMestre: false, raca: 'Humano', poderes: [zenkai()] });
        expect(screen.getByText('⚠️ Raça incompatível')).toBeTruthy();
        cleanup();
        montar({ isMestre: false, raca: 'Saiyajin', poderes: [zenkai()] });
        expect(screen.queryByText('⚠️ Raça incompatível')).toBeNull();
    });

    it('selo "Exceção do Mestre" no poder concedido por exceção (e sem selo de incompatibilidade)', () => {
        montar({ isMestre: false, raca: 'Humano', poderes: [zenkai({ racaExcecao: true })] });
        expect(screen.getByText('Exceção do Mestre')).toBeTruthy();
        expect(screen.queryByText('⚠️ Raça incompatível')).toBeNull();
    });

    it('aba vazia explica como obter a habilidade', () => {
        montar({ isMestre: true, poderes: [] });
        expect(screen.getByText(/O Mestre concede Habilidades de Raça compatíveis com a sua Raça/)).toBeTruthy();
    });
});
