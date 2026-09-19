import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../services/firebase-sync', () => ({ salvarCenarioCompleto: vi.fn() }));

import useStore from '../stores/useStore';
import { VoiceContext } from '../hooks/VoiceContext';
import { ChatContext } from '../hooks/ChatContext';
import { salvarCenarioCompleto } from '../services/firebase-sync';
import DockComunicacao from '../components/comunicacao/DockComunicacao';
import AudioVozGlobal from '../components/comunicacao/AudioVozGlobal';

const chatParty = { id: 'party', tipo: 'party', nome: 'Party', membros: [], criadoPor: '', criadoEm: 0 };

function fakeChat(over = {}) {
    return {
        eu: 'Ana',
        chats: [chatParty],
        mensagens: { party: [{ id: '1', autor: 'Bob', texto: 'ola pessoal', ts: 1000 }] },
        naoLidas: { party: 3 },
        totalNaoLidas: 3,
        marcarLido: vi.fn(),
        enviar: vi.fn(() => Promise.resolve(true)),
        abrirPrivado: vi.fn(() => Promise.resolve('dm__Ana__Bob')),
        criarGrupo: vi.fn(() => Promise.resolve('grp__1')),
        sair: vi.fn(),
        ...over,
    };
}
function fakeVoz(over = {}) {
    return {
        voiceStatus: 'Conectado', mutado: false, surdo: false,
        toggleMute: vi.fn(), toggleDeafen: vi.fn(), conexoes: [], selectedSpeaker: '', ...over,
    };
}
function montar(chat = fakeChat(), voz = fakeVoz()) {
    return render(
        <VoiceContext.Provider value={voz}>
            <ChatContext.Provider value={chat}>
                <DockComunicacao />
            </ChatContext.Provider>
        </VoiceContext.Provider>
    );
}

describe('DockComunicacao', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStore.setState({ meuNome: 'Ana', cenario: { tavernaAtivos: ['Bob'], outro: 1 }, personagens: { Ana: {}, Bob: {}, Cida: {} } });
    });
    afterEach(() => cleanup());

    it('nao renderiza nada sem contextos', () => {
        const { container } = render(<DockComunicacao />);
        expect(container.firstChild).toBeNull();
    });

    it('nao renderiza sem o ChatContext ou sem o VoiceContext', () => {
        const a = render(<VoiceContext.Provider value={fakeVoz()}><DockComunicacao /></VoiceContext.Provider>);
        expect(a.container.firstChild).toBeNull();
        a.unmount();
        const b = render(<ChatContext.Provider value={fakeChat()}><DockComunicacao /></ChatContext.Provider>);
        expect(b.container.firstChild).toBeNull();
    });

    it('FAB mostra badge de nao lidas', () => {
        montar();
        const fab = screen.getByLabelText('Abrir comunicação');
        expect(fab.textContent).toContain('3');
        expect(fab.className).toContain('tem-nova');
    });

    it('badge mostra 99+ e some quando zero', () => {
        montar(fakeChat({ totalNaoLidas: 150 }));
        expect(screen.getByLabelText('Abrir comunicação').textContent).toContain('99+');
        cleanup();
        montar(fakeChat({ totalNaoLidas: 0, naoLidas: {} }));
        const fab = screen.getByLabelText('Abrir comunicação');
        expect(fab.querySelector('.dock-com-badge')).toBeNull();
        expect(fab.className).not.toContain('tem-nova');
    });

    it('abre o painel e lista a Party com ultima mensagem', () => {
        montar();
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(screen.getByLabelText('Abrir comunicação'));
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByText('Party', { selector: 'strong' })).toBeTruthy();
        expect(screen.getByText('Bob: ola pessoal')).toBeTruthy();
    });

    it('fecha o painel pelo botao de fechar', () => {
        montar();
        fireEvent.click(screen.getByLabelText('Abrir comunicação'));
        fireEvent.click(screen.getByTitle('Fechar'));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('abrir a conversa marca como lido e enviar chama enviar(chatId, texto)', async () => {
        const chat = fakeChat();
        montar(chat);
        fireEvent.click(screen.getByLabelText('Abrir comunicação'));
        fireEvent.click(screen.getByText('Party', { selector: 'strong' }));
        expect(chat.marcarLido).toHaveBeenCalledWith('party');
        expect(screen.getByText('ola pessoal')).toBeTruthy();

        const input = screen.getByLabelText('Mensagem');
        fireEvent.change(input, { target: { value: 'minha msg' } });
        fireEvent.click(screen.getByText('Enviar'));
        await waitFor(() => expect(chat.enviar).toHaveBeenCalledWith('party', 'minha msg'));
        await waitFor(() => expect(input.value).toBe(''));
        expect(screen.queryByText(/Não foi possível enviar/)).toBeNull();
    });

    it('botao Enviar desabilitado com texto vazio e nao chama enviar', () => {
        const chat = fakeChat();
        montar(chat);
        fireEvent.click(screen.getByLabelText('Abrir comunicação'));
        fireEvent.click(screen.getByText('Party', { selector: 'strong' }));
        const btn = screen.getByText('Enviar');
        expect(btn.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: '   ' } });
        expect(btn.disabled).toBe(true);
        fireEvent.submit(screen.getByLabelText('Mensagem').closest('form'));
        expect(chat.enviar).not.toHaveBeenCalled();
    });

    it('mostra erro quando enviar retorna false', async () => {
        const chat = fakeChat({ enviar: vi.fn(() => Promise.resolve(false)) });
        montar(chat);
        fireEvent.click(screen.getByLabelText('Abrir comunicação'));
        fireEvent.click(screen.getByText('Party', { selector: 'strong' }));
        fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'x' } });
        fireEvent.click(screen.getByText('Enviar'));
        await waitFor(() => expect(screen.getByText(/Não foi possível enviar/)).toBeTruthy());
    });

    it('Party nao tem botao Sair; voltar retorna para a lista', () => {
        montar();
        fireEvent.click(screen.getByLabelText('Abrir comunicação'));
        fireEvent.click(screen.getByText('Party', { selector: 'strong' }));
        expect(screen.queryByText('Sair')).toBeNull();
        fireEvent.click(screen.getByTitle('Voltar para as conversas'));
        expect(screen.getByText('+ Nova conversa')).toBeTruthy();
    });

    it('grupo tem botao Sair que confirma e chama sair(id)', () => {
        const grupo = { id: 'grp__1', tipo: 'grupo', nome: 'Time', membros: ['Ana', 'Bob'], criadoPor: 'Ana', criadoEm: 1 };
        const chat = fakeChat({ chats: [chatParty, grupo], mensagens: {}, naoLidas: {}, totalNaoLidas: 0 });
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar(chat);
        fireEvent.click(screen.getByLabelText('Abrir comunicação'));
        fireEvent.click(screen.getByText('Time'));
        fireEvent.click(screen.getByText('Sair'));
        expect(confirmSpy).toHaveBeenCalled();
        expect(chat.sair).toHaveBeenCalledWith('grp__1');
        confirmSpy.mockRestore();
    });

    it('nova conversa privada lista candidatos (sem eu) e chama abrirPrivado', async () => {
        const chat = fakeChat();
        montar(chat);
        fireEvent.click(screen.getByLabelText('Abrir comunicação'));
        fireEvent.click(screen.getByText('+ Nova conversa'));
        expect(screen.queryByText(/Ana/)).toBeNull();
        expect(screen.getByText(/Cida/)).toBeTruthy();
        fireEvent.click(screen.getByText(/Bob/));
        await waitFor(() => expect(chat.abrirPrivado).toHaveBeenCalledWith('Bob'));
    });

    describe('aba Voz', () => {
        function abrirVoz() {
            fireEvent.click(screen.getByLabelText('Abrir comunicação'));
            fireEvent.click(screen.getByText(/Sala da Party/, { selector: 'button' }));
        }

        it('entrar na call salva cenario com meuNome adicionado', () => {
            montar();
            abrirVoz();
            expect(screen.getByText('Entrar na call')).toBeTruthy();
            expect(screen.getByText(/Na Sala da Party \(1\)/)).toBeTruthy();
            fireEvent.click(screen.getByText('Entrar na call'));
            expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
            expect(salvarCenarioCompleto).toHaveBeenCalledWith({ tavernaAtivos: ['Bob', 'Ana'], outro: 1 });
        });

        it('sair da call remove meuNome de tavernaAtivos', () => {
            useStore.setState({ cenario: { tavernaAtivos: ['Ana', 'Bob'] } });
            montar();
            abrirVoz();
            fireEvent.click(screen.getByText('Sair da call'));
            expect(salvarCenarioCompleto).toHaveBeenCalledWith({ tavernaAtivos: ['Bob'] });
        });

        it('nao muta o cenario original da store', () => {
            const cen = { tavernaAtivos: ['Bob'] };
            useStore.setState({ cenario: cen });
            montar();
            abrirVoz();
            fireEvent.click(screen.getByText('Entrar na call'));
            expect(cen.tavernaAtivos).toEqual(['Bob']);
        });

        it('cenario sem tavernaAtivos: entra criando a lista, botoes mute desabilitados fora da call', () => {
            useStore.setState({ cenario: {} });
            montar();
            abrirVoz();
            expect(screen.getByText('Ninguém na call agora.')).toBeTruthy();
            expect(screen.getByTitle('Silenciar microfone').disabled).toBe(true);
            fireEvent.click(screen.getByText('Entrar na call'));
            expect(salvarCenarioCompleto).toHaveBeenCalledWith({ tavernaAtivos: ['Ana'] });
        });

        it('na call habilita mute/ensurdecer e chama os toggles', () => {
            useStore.setState({ cenario: { tavernaAtivos: ['Ana'] } });
            const voz = fakeVoz();
            montar(fakeChat(), voz);
            abrirVoz();
            fireEvent.click(screen.getByTitle('Silenciar microfone'));
            fireEvent.click(screen.getByTitle('Ensurdecer'));
            expect(voz.toggleMute).toHaveBeenCalled();
            expect(voz.toggleDeafen).toHaveBeenCalled();
            expect(screen.getByText('Conectado', { exact: false })).toBeTruthy();
        });
    });
});

describe('AudioVozGlobal', () => {
    beforeEach(() => {
        localStorage.clear();
        // jsdom nao implementa play()
        window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    });
    afterEach(() => cleanup());

    const stream = (id) => ({ id });

    it('nao renderiza sem contexto ou sem conexoes array', () => {
        expect(render(<AudioVozGlobal tavernaAtivos={['Ana']} />).container.firstChild).toBeNull();
        cleanup();
        const { container } = render(<VoiceContext.Provider value={{}}><AudioVozGlobal /></VoiceContext.Provider>);
        expect(container.firstChild).toBeNull();
    });

    it('renderiza um <audio> por conexao com stream e ignora sem stream', () => {
        const voz = fakeVoz({ conexoes: [
            { id: 'anime-rpg-bob', stream: stream(1) },
            { id: 'anime-rpg-cida', stream: stream(2) },
            { id: 'anime-rpg-zed', stream: null },
        ] });
        const { container } = render(
            <VoiceContext.Provider value={voz}><AudioVozGlobal tavernaAtivos={['Bob', 'Cida']} /></VoiceContext.Provider>
        );
        expect(container.querySelectorAll('audio')).toHaveLength(2);
    });

    it('sem conexoes nao renderiza audio; tavernaAtivos invalido nao quebra', () => {
        const { container } = render(
            <VoiceContext.Provider value={fakeVoz({ conexoes: [{ id: 'anime-rpg-bob', stream: stream(1) }] })}>
                <AudioVozGlobal tavernaAtivos={undefined} />
            </VoiceContext.Provider>
        );
        expect(container.querySelectorAll('audio')).toHaveLength(1);
        cleanup();
        const r2 = render(<VoiceContext.Provider value={fakeVoz()}><AudioVozGlobal tavernaAtivos={['A']} /></VoiceContext.Provider>);
        expect(r2.container.querySelectorAll('audio')).toHaveLength(0);
    });

    it('aplica volume salvo e zera quando surdo', () => {
        localStorage.setItem('rpg_vol_Bob', '0.4');
        const voz = fakeVoz({ conexoes: [{ id: 'anime-rpg-bob', stream: stream(1) }] });
        const { container, rerender } = render(
            <VoiceContext.Provider value={voz}><AudioVozGlobal tavernaAtivos={['Bob']} /></VoiceContext.Provider>
        );
        expect(container.querySelector('audio').volume).toBeCloseTo(0.4);
        rerender(<VoiceContext.Provider value={{ ...voz, surdo: true }}><AudioVozGlobal tavernaAtivos={['Bob']} /></VoiceContext.Provider>);
        expect(container.querySelector('audio').volume).toBe(0);
    });
});
