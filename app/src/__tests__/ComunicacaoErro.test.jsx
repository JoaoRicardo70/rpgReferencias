import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../services/firebase-sync', () => ({ salvarCenarioCompleto: vi.fn() }));
vi.mock('../services/chat-sync', () => ({ ultimoErroChat: vi.fn() }));

import useStore from '../stores/useStore';
import { VoiceContext } from '../hooks/VoiceContext';
import { ChatContext } from '../hooks/ChatContext';
import { ultimoErroChat } from '../services/chat-sync';
import DockComunicacao from '../components/comunicacao/DockComunicacao';

const chatParty = { id: 'party', tipo: 'party', nome: 'Party', membros: [], criadoPor: '', criadoEm: 0 };
function montar() {
    const chat = {
        eu: 'Ana', chats: [chatParty], mensagens: {}, naoLidas: {}, totalNaoLidas: 0,
        marcarLido: vi.fn(), enviar: vi.fn(() => Promise.resolve(false)),
        abrirPrivado: vi.fn(), criarGrupo: vi.fn(), sair: vi.fn(),
    };
    render(
        <VoiceContext.Provider value={{ voiceStatus: 'x', conexoes: [] }}>
            <ChatContext.Provider value={chat}><DockComunicacao /></ChatContext.Provider>
        </VoiceContext.Provider>
    );
    fireEvent.click(screen.getByLabelText('Abrir comunicação'));
    fireEvent.click(screen.getByText('Party', { selector: 'strong' }));
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'oi' } });
    fireEvent.click(screen.getByText('Enviar'));
}

beforeEach(() => {
    useStore.setState({ meuNome: 'Ana', cenario: {}, personagens: {}, abaAtiva: 'aba-ficha' });
});
afterEach(() => cleanup());

describe('JanelaDoChat erro de envio', () => {
    it('PERMISSION_DENIED mostra mensagem sobre regras do Firebase', async () => {
        ultimoErroChat.mockReturnValue({ codigo: 'PERMISSION_DENIED', operacao: 'enviar mensagem' });
        montar();
        const alerta = await screen.findByRole('alert');
        expect(alerta.textContent).toMatch(/regras do Firebase/);
    });
    it('erro nulo mostra mensagem generica', async () => {
        ultimoErroChat.mockReturnValue(null);
        montar();
        const alerta = await screen.findByRole('alert');
        expect(alerta.textContent).toContain('Não foi possível enviar');
    });
    it('erro de rede mostra mensagem de conexao', async () => {
        ultimoErroChat.mockReturnValue({ codigo: 'network-error', operacao: 'enviar mensagem' });
        montar();
        expect((await screen.findByRole('alert')).textContent).toMatch(/Sem conexão/);
    });
});
