/**
 * ComunicacaoPanel agora hospeda Chats, Sala da Party, Mesa de Som (Jukebox) e Gravador dentro de uma
 * única aba, trocando de seção só por CSS (display: none/block). Isso é proposital: Jukebox guarda um
 * player do YouTube e GravadorPanel guarda MediaRecorder/AudioContext/streams, às vezes no meio de uma
 * gravação -- se o React desmontasse esses componentes ao trocar de seção ou de aba do app, a música
 * pararia e uma gravação em andamento seria cortada.
 *
 * Este arquivo verifica esse invariante de montagem de forma concreta: não só que o texto reaparece,
 * mas que é a MESMA instância (o mock do player do YouTube não é recriado, o MediaRecorder mockado não
 * é recriado nem parado, e os nós do DOM são os mesmos objetos) quando a seção ou a aba ativa mudam.
 *
 * Já os Chats (AbaChats) continuam sendo desmontados fora da aba/seção de propósito -- isso já é
 * coberto em ComunicacaoAba.test.jsx e não é repetido aqui.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('../services/firebase-sync', () => ({
    salvarCenarioCompleto: vi.fn(),
    enviarParaJukebox: vi.fn(),
    iniciarListenerJukebox: vi.fn(() => () => {}),
}));

import useStore from '../stores/useStore';
import { VoiceContext } from '../hooks/VoiceContext';
import { ChatContext } from '../hooks/ChatContext';
import ComunicacaoPanel from '../components/comunicacao/ComunicacaoPanel';
import { iniciarListenerJukebox } from '../services/firebase-sync';

// ---------------------------------------------------------------------------
// Mocks de mídia (MediaRecorder/AudioContext/MediaStream) -- mesmo padrão usado em
// GravadorPanel.mediaRecorder.test.js.
// ---------------------------------------------------------------------------

class MockMediaRecorder {
    constructor(stream, options) {
        this.stream = stream;
        this.options = options;
        this.state = 'inactive';
        this.ondataavailable = null;
        this.onstop = null;
        MockMediaRecorder.instances.push(this);
    }
    start() { this.state = 'recording'; }
    stop() {
        this.state = 'inactive';
        if (this.onstop) this.onstop();
    }
}
MockMediaRecorder.instances = [];

class MockAudioContext {
    constructor() { this.state = 'running'; MockAudioContext.instances.push(this); }
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 128, getByteFrequencyData: vi.fn() }; }
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ kind: 'audio' }] } }; }
    createGain() { return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }; }
    resume() {}
    close() { this.state = 'closed'; return Promise.resolve(); }
}
MockAudioContext.instances = [];

class MockMediaStream {
    constructor(tracks) { this.tracks = tracks || []; }
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
    getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
}

function criarStreamAudio(id) {
    const track = { kind: 'audio', stop: vi.fn() };
    return { id, getTracks: () => [track], getAudioTracks: () => [track] };
}

const chatParty = { id: 'party', tipo: 'party', nome: 'Party', membros: [], criadoPor: '', criadoEm: 0 };
const fakeChat = () => ({
    eu: 'Ana', chats: [chatParty], mensagens: {}, naoLidas: {}, totalNaoLidas: 0,
    marcarLido: vi.fn(), enviar: vi.fn(() => Promise.resolve(true)),
    abrirPrivado: vi.fn(), criarGrupo: vi.fn(), sair: vi.fn(),
});
const fakeVoz = () => ({ voiceStatus: 'Conectado', mutado: false, surdo: false, toggleMute: vi.fn(), toggleDeafen: vi.fn(), conexoes: [] });
const montarPainel = () => render(
    <VoiceContext.Provider value={fakeVoz()}>
        <ChatContext.Provider value={fakeChat()}>
            <ComunicacaoPanel />
        </ChatContext.Provider>
    </VoiceContext.Provider>
);

let getDisplayMediaMock;
let getUserMediaMock;
let rafSpy;
let telaTrack;
let micTrack;

beforeEach(() => {
    useStore.setState({ meuNome: 'Ana', cenario: { tavernaAtivos: [] }, personagens: { Ana: {} }, abaAtiva: 'aba-comunicacao' });

    // jsdom não implementa scrollIntoView (auto-scroll dos logs do Gravador) nem requestAnimationFrame
    // de forma útil (o visualizador de volume entraria num loop recursivo).
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(() => 0);

    MockMediaRecorder.instances = [];
    MockAudioContext.instances = [];
    global.MediaRecorder = MockMediaRecorder;
    window.MediaRecorder = MockMediaRecorder;
    global.AudioContext = MockAudioContext;
    window.AudioContext = MockAudioContext;
    global.MediaStream = MockMediaStream;
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();

    telaTrack = { kind: 'video', stop: vi.fn(), getSettings: () => ({ displaySurface: 'browser' }) };
    micTrack = null;
    getDisplayMediaMock = vi.fn(() => Promise.resolve({
        getTracks: () => [telaTrack],
        getVideoTracks: () => [telaTrack],
        getAudioTracks: () => [],
    }));
    getUserMediaMock = vi.fn(() => Promise.resolve(criarStreamAudio('micProprio')));
    Object.defineProperty(global.navigator, 'mediaDevices', {
        value: { getUserMedia: getUserMediaMock, getDisplayMedia: getDisplayMediaMock },
        configurable: true,
    });
});

afterEach(() => {
    cleanup();
    rafSpy.mockRestore();
    delete window.YT;
    vi.clearAllMocks();
});

describe('ComunicacaoPanel — Mesa de Som (Jukebox) nunca desmonta', () => {
    it('mantém a mesma instância do player do YouTube ao trocar de seção e de aba', async () => {
        const jogador = { setVolume: vi.fn(), destroy: vi.fn(), getPlayerState: vi.fn(() => 2), playVideo: vi.fn(), pauseVideo: vi.fn() };
        window.YT = {
            PlayerState: { PLAYING: 1, PAUSED: 2 },
            Player: vi.fn(function (id, o) { return jogador; }),
        };
        let callbackRemoto;
        iniciarListenerJukebox.mockImplementationOnce((cb) => { callbackRemoto = cb; return () => {}; });

        montarPainel();

        // Chega música pelo Firebase (simula outro jogador tocando algo) -- o listener do Jukebox foi
        // registrado no mount, independente da seção escolhida (o padrão inicial é "Chats").
        await act(async () => {
            callbackRemoto({ videoId: 'dQw4w9WgXcQ', playing: true, inputUrl: '' });
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(window.YT.Player).toHaveBeenCalledTimes(1);

        const containerYt = document.getElementById('yt-jukebox-player');
        expect(containerYt).toBeTruthy();

        // Troca de seção várias vezes, inclusive passando pela Mesa de Som -- nenhuma recriação.
        fireEvent.click(screen.getByText('🎬 Gravador'));
        fireEvent.click(screen.getByText('🎙️ Sala da Party'));
        fireEvent.click(screen.getByText('🎵 Mesa de Som'));
        expect(window.YT.Player).toHaveBeenCalledTimes(1);
        expect(jogador.destroy).not.toHaveBeenCalled();
        expect(document.getElementById('yt-jukebox-player')).toBe(containerYt);

        // Sai da aba Comunicação inteira e volta -- TabPanel (em App.jsx) só esconde por CSS, então o
        // ComunicacaoPanel e tudo que ele monta continuam no DOM; aqui simulamos o mesmo via abaAtiva.
        act(() => useStore.setState({ abaAtiva: 'aba-ficha' }));
        act(() => useStore.setState({ abaAtiva: 'aba-comunicacao' }));

        expect(window.YT.Player).toHaveBeenCalledTimes(1);
        expect(jogador.destroy).not.toHaveBeenCalled();
        expect(document.getElementById('yt-jukebox-player')).toBe(containerYt);
    });
});

describe('ComunicacaoPanel — Gravador nunca desmonta (gravação em andamento sobrevive)', () => {
    async function iniciarGravacao() {
        montarPainel();
        fireEvent.click(screen.getByText('🎬 Gravador'));
        await act(async () => {
            fireEvent.click(screen.getByText('▶ INICIAR GRAVAÇÃO'));
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });
    }

    it('mantém o mesmo MediaRecorder (ainda gravando) ao trocar de seção', async () => {
        await iniciarGravacao();

        expect(MockMediaRecorder.instances).toHaveLength(1);
        const recorder = MockMediaRecorder.instances[0];
        expect(recorder.state).toBe('recording');

        fireEvent.click(screen.getByText('🎵 Mesa de Som'));
        fireEvent.click(screen.getByText('💬 Chats'));
        fireEvent.click(screen.getByText('🎙️ Sala da Party'));
        fireEvent.click(screen.getByText('🎬 Gravador'));

        // Nenhuma outra gravação foi criada nem a atual foi parada -- é a mesma instância, ainda ativa.
        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(MockMediaRecorder.instances[0]).toBe(recorder);
        expect(recorder.state).toBe('recording');
        expect(recorder.onstop).toBeTruthy();
        expect(telaTrack.stop).not.toHaveBeenCalled();
    });

    it('mantém a gravação em andamento ao trocar para outra aba do app e voltar', async () => {
        await iniciarGravacao();
        const recorder = MockMediaRecorder.instances[0];
        expect(recorder.state).toBe('recording');

        act(() => useStore.setState({ abaAtiva: 'aba-ficha' }));
        act(() => useStore.setState({ abaAtiva: 'aba-comunicacao' }));

        expect(MockMediaRecorder.instances).toHaveLength(1);
        expect(MockMediaRecorder.instances[0]).toBe(recorder);
        expect(recorder.state).toBe('recording');
        expect(telaTrack.stop).not.toHaveBeenCalled();
        // O texto "Em direto" (indicador de captação) segue visível: o painel nem re-renderizou do zero.
        expect(screen.getByText('Em direto')).toBeTruthy();
    });
});
