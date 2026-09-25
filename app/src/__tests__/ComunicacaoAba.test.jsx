import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('../services/firebase-sync', () => ({
    salvarCenarioCompleto: vi.fn(),
    // ComunicacaoPanel agora também monta a Mesa de Som (Jukebox), que depende destas duas.
    enviarParaJukebox: vi.fn(),
    iniciarListenerJukebox: vi.fn(() => () => {}),
}));

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
    // O Gravador (agora sempre montado nesta aba) rola os logs para baixo a cada render; jsdom não implementa scrollIntoView.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => cleanup());

describe('ComunicacaoPanel', () => {
    it('esconde os Chats fora da aba comunicacao, mas mantem Mesa de Som e Gravador montados', () => {
        // Mesa de Som (Jukebox) e Gravador têm estado próprio (player do YouTube, MediaRecorder):
        // precisam continuar rodando em segundo plano mesmo fora desta aba, então ficam sempre no
        // DOM (escondidos só por CSS). Já os Chats só existem quando a aba está mesmo visível.
        com(<ComunicacaoPanel />);
        expect(screen.getByText(/Mesa de Som \(Controlo Mestre/)).toBeTruthy();
        expect(screen.getByText(/Gravação da Sessão/)).toBeTruthy();
        expect(screen.queryByText('+ Nova conversa')).toBeNull();
    });
    it('renderiza o painel quando a aba esta ativa', () => {
        useStore.setState({ abaAtiva: 'aba-comunicacao' });
        const { container } = com(<ComunicacaoPanel />);
        expect(container.querySelector('.comunicacao-aba')).toBeTruthy();
        expect(screen.getByRole('region', { name: 'Comunicação' })).toBeTruthy();
        expect(screen.getByText(/Sala da Party/, { selector: 'button' })).toBeTruthy();
        expect(container.querySelector('.painel-com-aba')).toBeTruthy();
        expect(screen.queryByTitle('Fechar')).toBeNull();
        // Seção inicial é Chats.
        expect(screen.getByText('+ Nova conversa')).toBeTruthy();
    });
    it('troca de secao mostra Sala da Party, Mesa de Som e Gravador sem desmontar os dois ultimos', () => {
        useStore.setState({ abaAtiva: 'aba-comunicacao' });
        com(<ComunicacaoPanel />);

        fireEvent.click(screen.getByText('🎙️ Sala da Party'));
        expect(screen.getByText(/Na Sala da Party/)).toBeTruthy();
        expect(screen.queryByText('+ Nova conversa')).toBeNull();

        fireEvent.click(screen.getByText('🎵 Mesa de Som'));
        expect(screen.getByText(/Mesa de Som \(Controlo Mestre/)).toBeTruthy();

        fireEvent.click(screen.getByText('🎬 Gravador'));
        expect(screen.getByText(/Gravação da Sessão/)).toBeTruthy();
        // Mesmo fora de vista, a Mesa de Som continua montada (não reapareceu do zero).
        expect(screen.getByText(/Mesa de Som \(Controlo Mestre/)).toBeTruthy();
    });
    it('reage a troca de aba (Chats aparecem e desaparecem, o resto continua montado)', () => {
        com(<ComunicacaoPanel />);
        expect(screen.queryByText('+ Nova conversa')).toBeNull();
        act(() => useStore.setState({ abaAtiva: 'aba-comunicacao' }));
        expect(screen.getByText('+ Nova conversa')).toBeTruthy();
        act(() => useStore.setState({ abaAtiva: 'aba-ficha' }));
        expect(screen.queryByText('+ Nova conversa')).toBeNull();
        expect(screen.getByText(/Gravação da Sessão/)).toBeTruthy();
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
        const botao = screen.getByTitle('Comunicação (Chat, Voz e Mesa de Som)');
        expect(botao.closest('.sub-abas-wrapper').className).toContain('aberta');
        expect(botao.closest('.gaveta-container').querySelector('[title="Multiverso"]')).toBeTruthy();
        fireEvent.click(botao);
        expect(useStore.getState().abaAtiva).toBe('aba-comunicacao');
    });
});
