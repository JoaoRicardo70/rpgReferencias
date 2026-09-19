import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('../services/firebase-sync', () => ({ salvarCenarioCompleto: vi.fn() }));

import useStore from '../stores/useStore';
import { VoiceContext } from '../hooks/VoiceContext';
import { ChatContext } from '../hooks/ChatContext';
import ComunicacaoPanel from '../components/comunicacao/ComunicacaoPanel';
import DockComunicacao from '../components/comunicacao/DockComunicacao';
import Sidebar from '../components/layout/Sidebar';

const chatParty = { id: 'party', tipo: 'party', nome: 'Party', membros: [], criadoPor: '', criadoEm: 0 };
const fakeChat = (over = {}) => ({
    eu: 'Ana', chats: [chatParty], mensagens: {}, naoLidas: {}, totalNaoLidas: 0,
    marcarLido: vi.fn(), enviar: vi.fn(() => Promise.resolve(true)),
    abrirPrivado: vi.fn(), criarGrupo: vi.fn(), sair: vi.fn(), ...over,
});
const fakeVoz = () => ({ voiceStatus: 'Conectado', mutado: false, surdo: false, toggleMute: vi.fn(), toggleDeafen: vi.fn(), conexoes: [] });
const com = (ui, chat = fakeChat()) => render(
    <VoiceContext.Provider value={fakeVoz()}><ChatContext.Provider value={chat}>{ui}</ChatContext.Provider></VoiceContext.Provider>
);

beforeEach(() => {
    useStore.setState({ meuNome: 'Ana', cenario: { tavernaAtivos: [] }, personagens: { Ana: {} }, abaAtiva: 'aba-ficha' });
});
afterEach(() => cleanup());

describe('ComunicacaoPanel', () => {
    it('nao renderiza fora da aba comunicacao', () => {
        const { container } = com(<ComunicacaoPanel />);
        expect(container.firstChild).toBeNull();
    });
    it('renderiza o painel quando a aba esta ativa', () => {
        useStore.setState({ abaAtiva: 'aba-comunicacao' });
        const { container } = com(<ComunicacaoPanel />);
        expect(container.querySelector('.comunicacao-aba')).toBeTruthy();
        expect(screen.getByRole('region', { name: 'Comunicação' })).toBeTruthy();
        expect(screen.getByText(/Sala da Party/, { selector: 'button' })).toBeTruthy();
        expect(container.querySelector('.painel-com-aba')).toBeTruthy();
        expect(screen.queryByTitle('Fechar')).toBeNull();
    });
    it('reage a troca de aba', () => {
        const { container } = com(<ComunicacaoPanel />);
        expect(container.firstChild).toBeNull();
        act(() => useStore.setState({ abaAtiva: 'aba-comunicacao' }));
        expect(container.querySelector('.comunicacao-aba')).toBeTruthy();
    });
    it('sem providers nao renderiza o dialogo', () => {
        useStore.setState({ abaAtiva: 'aba-comunicacao' });
        const { container } = render(<ComunicacaoPanel />);
        expect(container.querySelector('[role=dialog]')).toBeNull();
    });
});

describe('DockComunicacao FAB por aba', () => {
    it('nao renderiza na aba comunicacao', () => {
        useStore.setState({ abaAtiva: 'aba-comunicacao' });
        expect(com(<DockComunicacao />).container.firstChild).toBeNull();
    });
    it('renderiza nas outras abas', () => {
        expect(com(<DockComunicacao />).container.querySelector('.dock-com-fab')).toBeTruthy();
    });
});

describe('Sidebar Comunicacao', () => {
    it('botao dentro da gaveta Multiverso define abaAtiva', () => {
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(screen.getByTitle('Multiverso'));
        const botao = screen.getByTitle('Comunicação (Chat e Voz)');
        expect(botao.closest('.sub-abas-wrapper').className).toContain('aberta');
        expect(botao.closest('.gaveta-container').querySelector('[title="Multiverso"]')).toBeTruthy();
        fireEvent.click(botao);
        expect(useStore.getState().abaAtiva).toBe('aba-comunicacao');
    });
});
