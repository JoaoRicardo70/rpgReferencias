import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

vi.mock('../services/firebase-sync', () => ({ salvarCenarioCompleto: vi.fn() }));

import useStore from '../stores/useStore';
import { VoiceContext } from '../hooks/VoiceContext';
import { ChatContext } from '../hooks/ChatContext';
import { salvarCenarioCompleto } from '../services/firebase-sync';
import DockComunicacao, { PainelComunicacao } from '../components/comunicacao/DockComunicacao';
import { definirBufferLigado, lerBufferLigado, useBufferLigado } from '../core/estadoBuffer';
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
            expect(screen.getByText(/Ninguém na call agora/)).toBeTruthy();
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

    describe('indicador de gravacao no FAB', () => {
        afterEach(() => act(() => { definirBufferLigado(false); }));

        it('mostra .dock-com-rec quando o buffer esta ligado e some ao desligar', () => {
            montar();
            const fab = screen.getByLabelText('Abrir comunicação');
            expect(fab.querySelector('.dock-com-rec')).toBeNull();
            act(() => { definirBufferLigado(true); });
            expect(fab.querySelector('.dock-com-rec')).toBeTruthy();
            act(() => { definirBufferLigado(false); });
            expect(fab.querySelector('.dock-com-rec')).toBeNull();
        });

        it('ja aparece se o buffer estava ligado antes de montar', () => {
            definirBufferLigado(true);
            montar();
            expect(screen.getByLabelText('Abrir comunicação').querySelector('.dock-com-rec')).toBeTruthy();
        });
    });

    describe('estadoBuffer', () => {
        afterEach(() => act(() => { definirBufferLigado(false); }));

        it('define/le com coercao booleana e notifica so quando muda', () => {
            const fn = vi.fn();
            function Sonda() { fn(useBufferLigado()); return null; }
            render(<Sonda />);
            expect(lerBufferLigado()).toBe(false);
            expect(fn).toHaveBeenLastCalledWith(false);
            const chamadas = fn.mock.calls.length;
            act(() => { definirBufferLigado(false); });
            expect(fn.mock.calls.length).toBe(chamadas);
            act(() => { definirBufferLigado('sim'); });
            expect(lerBufferLigado()).toBe(true);
            expect(fn).toHaveBeenLastCalledWith(true);
            act(() => { definirBufferLigado(0); });
            expect(lerBufferLigado()).toBe(false);
            expect(fn).toHaveBeenLastCalledWith(false);
        });

        it('desassina ao desmontar', () => {
            const fn = vi.fn();
            function Sonda() { fn(useBufferLigado()); return null; }
            const r = render(<Sonda />);
            r.unmount();
            const n = fn.mock.calls.length;
            act(() => { definirBufferLigado(true); });
            expect(fn.mock.calls.length).toBe(n);
        });
    });

    describe('Sala da Party redesenhada (cartoes)', () => {
        const audioCtxOriginal = window.AudioContext;
        beforeEach(() => {
            window.AudioContext = class {
                constructor() { this.state = 'running'; }
                resume() {}
                createMediaStreamSource() { return { connect: vi.fn() }; }
                createAnalyser() { return { fftSize: 0, frequencyBinCount: 8, getByteFrequencyData: vi.fn(), smoothingTimeConstant: 0 }; }
                close() { this.state = 'closed'; return Promise.resolve(); }
            };
        });
        afterEach(() => { window.AudioContext = audioCtxOriginal; });

        const tabCompleta = () => render(
            <VoiceContext.Provider value={vozCompleta.current}>
                <ChatContext.Provider value={fakeChat()}>
                    <PainelComunicacao />
                </ChatContext.Provider>
            </VoiceContext.Provider>
        );
        const vozCompleta = { current: null };
        function abrirDock(voz) {
            montar(fakeChat(), voz);
            fireEvent.click(screen.getByLabelText('Abrir comunicação'));
            fireEvent.click(screen.getByText(/Sala da Party/, { selector: 'button' }));
        }
        function abrirTab(voz) {
            vozCompleta.current = voz;
            const r = tabCompleta();
            fireEvent.click(screen.getByText(/Sala da Party/, { selector: 'button' }));
            return r;
        }
        const cartao = (nome) => screen.getByText(nome, { selector: 'span' }).closest('.fade-in');
        const setTaverna = (lista) => useStore.setState({ meuNome: 'Ana', cenario: { tavernaAtivos: lista }, personagens: { Ana: {}, Bob: {}, Cida: {}, Dani: {} } });

        it('renderiza um cartao por pessoa com o nome e o titulo com a contagem', () => {
            setTaverna(['Ana', 'Bob', 'Cida']);
            abrirTab(fakeVoz());
            expect(screen.getByText('Na Sala da Party (3)')).toBeTruthy();
            ['Ana', 'Bob', 'Cida'].forEach(n => expect(cartao(n)).toBeTruthy());
            expect(document.querySelectorAll('.sala-party-grade .fade-in')).toHaveLength(3);
            expect(screen.queryByText(/Ninguém na call agora/)).toBeNull();
        });

        it('vazio: mostra o texto de ninguem na call, titulo (0) e nenhum cartao', () => {
            setTaverna([]);
            abrirTab(fakeVoz());
            expect(screen.getByText(/Ninguém na call agora/)).toBeTruthy();
            expect(screen.getByText('Na Sala da Party (0)')).toBeTruthy();
            expect(document.querySelectorAll('.sala-party-grade .fade-in')).toHaveLength(0);
        });

        it('cenario invalido (tavernaAtivos nao-array) trata como vazio', () => {
            useStore.setState({ meuNome: 'Ana', cenario: { tavernaAtivos: 'Bob' }, personagens: {} });
            abrirTab(fakeVoz());
            expect(screen.getByText('Na Sala da Party (0)')).toBeTruthy();
        });

        it.each([
            [['Bob'], '400px'],
            [['Bob', 'Cida'], '350px'],
            [['Bob', 'Cida', 'Dani'], '280px'],
            [['Ana', 'Bob', 'Cida', 'Dani'], '280px'],
        ])('aba completa: %j usa cartao de %s', (lista, largura) => {
            setTaverna(lista);
            abrirTab(fakeVoz());
            expect(cartao(lista[0]).style.width).toBe(largura);
            expect(document.querySelector('.sala-party-grade').className).not.toContain('compacta');
        });

        it('dock flutuante (compacto): cartao 100% e grade com classe compacta', () => {
            setTaverna(['Bob']);
            abrirDock(fakeVoz());
            expect(cartao('Bob').style.width).toBe('100%');
            expect(document.querySelector('.sala-party-grade').className).toContain('compacta');
        });

        it('na call: mostra selects de mic/saida e o filtro de eco', () => {
            setTaverna(['Ana', 'Bob']);
            const voz = fakeVoz({
                mics: [{ deviceId: 'm1abcd', label: 'Mic Um' }, { deviceId: 'm2abcd', label: '' }],
                speakers: [{ deviceId: 's1abcd', label: 'Fone' }],
                selectedMic: 'm1abcd', selectedSpeaker: 's1abcd',
                trocarMicrofone: vi.fn(), trocarSpeaker: vi.fn(), setSupressorAtivo: vi.fn(), supressorAtivo: false,
            });
            abrirTab(voz);
            const mic = screen.getByLabelText('Microfone');
            expect(Array.from(mic.options).map(o => o.textContent)).toEqual(['Mic Um', 'Mic m2ab']);
            fireEvent.change(mic, { target: { value: 'm2abcd' } });
            expect(voz.trocarMicrofone).toHaveBeenCalledWith('m2abcd');
            expect(screen.getByLabelText('Saída de áudio')).toBeTruthy();
            const eco = screen.getByLabelText(/Filtro de Eco/);
            fireEvent.click(eco);
            expect(voz.setSupressorAtivo).toHaveBeenCalledWith(true);
        });

        it('na call sem dispositivos listados nao renderiza selects, mas mantem o filtro de eco', () => {
            setTaverna(['Ana']);
            abrirTab(fakeVoz({ setSupressorAtivo: vi.fn() }));
            expect(screen.queryByLabelText('Microfone')).toBeNull();
            expect(screen.queryByLabelText('Saída de áudio')).toBeNull();
            expect(screen.getByLabelText(/Filtro de Eco/)).toBeTruthy();
        });

        it('fora da call: ajustes (selects e filtro de eco) ficam ocultos', () => {
            setTaverna(['Bob']);
            abrirTab(fakeVoz({ mics: [{ deviceId: 'm1', label: 'A' }], speakers: [{ deviceId: 's1', label: 'B' }] }));
            expect(screen.queryByLabelText('Microfone')).toBeNull();
            expect(screen.queryByLabelText('Saída de áudio')).toBeNull();
            expect(screen.queryByText(/Filtro de Eco/)).toBeNull();
        });

        it('FORÇAR LIGAÇÃO aparece para remoto sem conexao e chama fazerChamada(nome)', () => {
            setTaverna(['Ana', 'Bob']);
            const voz = fakeVoz({ fazerChamada: vi.fn() });
            abrirTab(voz);
            const botoes = screen.getAllByText(/FORÇAR LIGAÇÃO/);
            expect(botoes).toHaveLength(1);
            fireEvent.click(botoes[0]);
            expect(voz.fazerChamada).toHaveBeenCalledWith('Bob');
        });

        it('sem FORÇAR LIGAÇÃO para mim nem para remoto ja conectado', () => {
            setTaverna(['Ana', 'Bob']);
            abrirTab(fakeVoz({ conexoes: [{ id: 'anime-rpg-bob', stream: null }], fazerChamada: vi.fn() }));
            expect(screen.queryByText(/FORÇAR LIGAÇÃO/)).toBeNull();
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
