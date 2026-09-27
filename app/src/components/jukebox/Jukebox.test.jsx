import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('../../services/firebase-sync', () => ({
    enviarParaJukebox: vi.fn(),
    iniciarListenerJukebox: vi.fn(() => () => {})
}));

import Jukebox from './Jukebox';
import { iniciarListenerJukebox } from '../../services/firebase-sync';

const CHAVE = 'rpg_volume_musica';
const slider = () => screen.getByLabelText('Volume da música');

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); delete window.YT; vi.clearAllMocks(); });

describe('Jukebox - volume', () => {
    it('slider existe e o padrao e 60', () => {
        render(<Jukebox />);
        expect(slider()).toBeTruthy();
        expect(slider().value).toBe('60');
        expect(screen.getByText('60%')).toBeTruthy();
    });

    it('le o volume guardado em rpg_volume_musica', () => {
        localStorage.setItem(CHAVE, '25');
        render(<Jukebox />);
        expect(slider().value).toBe('25');
        expect(screen.getByText('25%')).toBeTruthy();
    });

    it('valor guardado invalido volta a 60 e fora da faixa e limitado', () => {
        localStorage.setItem(CHAVE, 'abc');
        const a = render(<Jukebox />);
        expect(slider().value).toBe('60');
        a.unmount();
        localStorage.setItem(CHAVE, '500');
        render(<Jukebox />);
        expect(slider().value).toBe('100');
    });

    it('mudar o slider atualiza o % mostrado e o localStorage', () => {
        render(<Jukebox />);
        fireEvent.change(slider(), { target: { value: '80' } });
        expect(screen.getByText('80%')).toBeTruthy();
        expect(localStorage.getItem(CHAVE)).toBe('80');
    });

    it('botao de mudo zera e restaura para 60', () => {
        localStorage.setItem(CHAVE, '30');
        render(<Jukebox />);
        fireEvent.click(screen.getByLabelText('Silenciar a música'));
        expect(slider().value).toBe('0');
        expect(screen.getByText('0%')).toBeTruthy();
        expect(localStorage.getItem(CHAVE)).toBe('0');
        fireEvent.click(screen.getByLabelText('Ativar o som da música'));
        expect(slider().value).toBe('60');
        expect(localStorage.getItem(CHAVE)).toBe('60');
    });

    it('nao envia o volume para o Firebase (so o listener e registrado)', () => {
        render(<Jukebox />);
        fireEvent.change(slider(), { target: { value: '10' } });
        expect(iniciarListenerJukebox).toHaveBeenCalledTimes(1);
    });

    it('chama o unsubscribe do listener no unmount', () => {
        const unsub = vi.fn();
        iniciarListenerJukebox.mockReturnValueOnce(unsub);
        const { unmount } = render(<Jukebox />);
        unmount();
        expect(unsub).toHaveBeenCalled();
    });

    it('com player do YT (via onReady) aplica setVolume com o valor do slider', async () => {
        const jogador = { setVolume: vi.fn(), destroy: vi.fn(), getPlayerState: vi.fn(() => 2), playVideo: vi.fn(), pauseVideo: vi.fn() };
        let opcoes;
        window.YT = {
            PlayerState: { PLAYING: 1, PAUSED: 2 },
            Player: vi.fn(function (id, o) { opcoes = o; return jogador; })
        };
        let callbackRemoto;
        iniciarListenerJukebox.mockImplementationOnce((cb) => { callbackRemoto = cb; return () => {}; });
        localStorage.setItem(CHAVE, '40');
        render(<Jukebox />);

        await act(async () => { callbackRemoto({ videoId: 'dQw4w9WgXcQ', playing: false, inputUrl: '' }); });
        await act(async () => { await Promise.resolve(); });
        expect(window.YT.Player).toHaveBeenCalled();

        // onReady aplica o volume atual
        opcoes.events.onReady({ target: jogador });
        expect(jogador.setVolume).toHaveBeenLastCalledWith(40);

        fireEvent.change(slider(), { target: { value: '75' } });
        expect(jogador.setVolume).toHaveBeenLastCalledWith(75);
    });

    it('mudar o slider para um volume > 0 tambem chama unMute (player nasceu mudo por autoplay)', async () => {
        const jogador = { setVolume: vi.fn(), unMute: vi.fn(), destroy: vi.fn(), getPlayerState: vi.fn(() => 2), playVideo: vi.fn(), pauseVideo: vi.fn() };
        let opcoes;
        window.YT = {
            PlayerState: { PLAYING: 1, PAUSED: 2 },
            Player: vi.fn(function (id, o) { opcoes = o; return jogador; })
        };
        let callbackRemoto;
        iniciarListenerJukebox.mockImplementationOnce((cb) => { callbackRemoto = cb; return () => {}; });
        localStorage.setItem(CHAVE, '40');
        render(<Jukebox />);

        await act(async () => { callbackRemoto({ videoId: 'dQw4w9WgXcQ', playing: false, inputUrl: '' }); });
        await act(async () => { await Promise.resolve(); });
        expect(window.YT.Player).toHaveBeenCalled();

        fireEvent.change(slider(), { target: { value: '75' } });
        expect(jogador.setVolume).toHaveBeenLastCalledWith(75);
        expect(jogador.unMute).toHaveBeenCalled();
    });

    it('mudar o slider para 0 (mudo) nao chama unMute', async () => {
        const jogador = { setVolume: vi.fn(), unMute: vi.fn(), destroy: vi.fn(), getPlayerState: vi.fn(() => 2), playVideo: vi.fn(), pauseVideo: vi.fn() };
        let opcoes;
        window.YT = {
            PlayerState: { PLAYING: 1, PAUSED: 2 },
            Player: vi.fn(function (id, o) { opcoes = o; return jogador; })
        };
        let callbackRemoto;
        iniciarListenerJukebox.mockImplementationOnce((cb) => { callbackRemoto = cb; return () => {}; });
        localStorage.setItem(CHAVE, '40');
        render(<Jukebox />);

        await act(async () => { callbackRemoto({ videoId: 'dQw4w9WgXcQ', playing: false, inputUrl: '' }); });
        await act(async () => { await Promise.resolve(); });
        expect(window.YT.Player).toHaveBeenCalled();

        fireEvent.change(slider(), { target: { value: '0' } });
        expect(jogador.setVolume).toHaveBeenLastCalledWith(0);
        expect(jogador.unMute).not.toHaveBeenCalled();
    });

    it('onReady chama unMute quando o volume atual (guardado) e maior que zero', async () => {
        const jogador = { setVolume: vi.fn(), unMute: vi.fn(), destroy: vi.fn(), getPlayerState: vi.fn(() => 2), playVideo: vi.fn(), pauseVideo: vi.fn() };
        let opcoes;
        window.YT = {
            PlayerState: { PLAYING: 1, PAUSED: 2 },
            Player: vi.fn(function (id, o) { opcoes = o; return jogador; })
        };
        let callbackRemoto;
        iniciarListenerJukebox.mockImplementationOnce((cb) => { callbackRemoto = cb; return () => {}; });
        localStorage.setItem(CHAVE, '40');
        render(<Jukebox />);

        await act(async () => { callbackRemoto({ videoId: 'dQw4w9WgXcQ', playing: false, inputUrl: '' }); });
        await act(async () => { await Promise.resolve(); });
        expect(window.YT.Player).toHaveBeenCalled();

        opcoes.events.onReady({ target: jogador });
        expect(jogador.setVolume).toHaveBeenLastCalledWith(40);
        expect(jogador.unMute).toHaveBeenCalled();
    });

    it('onReady nao chama unMute quando o volume atual (guardado) e zero', async () => {
        const jogador = { setVolume: vi.fn(), unMute: vi.fn(), destroy: vi.fn(), getPlayerState: vi.fn(() => 2), playVideo: vi.fn(), pauseVideo: vi.fn() };
        let opcoes;
        window.YT = {
            PlayerState: { PLAYING: 1, PAUSED: 2 },
            Player: vi.fn(function (id, o) { opcoes = o; return jogador; })
        };
        let callbackRemoto;
        iniciarListenerJukebox.mockImplementationOnce((cb) => { callbackRemoto = cb; return () => {}; });
        localStorage.setItem(CHAVE, '0');
        render(<Jukebox />);

        await act(async () => { callbackRemoto({ videoId: 'dQw4w9WgXcQ', playing: false, inputUrl: '' }); });
        await act(async () => { await Promise.resolve(); });
        expect(window.YT.Player).toHaveBeenCalled();

        opcoes.events.onReady({ target: jogador });
        expect(jogador.setVolume).toHaveBeenLastCalledWith(0);
        expect(jogador.unMute).not.toHaveBeenCalled();
    });

    it('nao lanca erro quando o player nao tem unMute (compatibilidade com players antigos/limitados)', async () => {
        const jogador = { setVolume: vi.fn(), destroy: vi.fn(), getPlayerState: vi.fn(() => 2), playVideo: vi.fn(), pauseVideo: vi.fn() };
        let opcoes;
        window.YT = {
            PlayerState: { PLAYING: 1, PAUSED: 2 },
            Player: vi.fn(function (id, o) { opcoes = o; return jogador; })
        };
        let callbackRemoto;
        iniciarListenerJukebox.mockImplementationOnce((cb) => { callbackRemoto = cb; return () => {}; });
        localStorage.setItem(CHAVE, '40');
        render(<Jukebox />);

        await act(async () => { callbackRemoto({ videoId: 'dQw4w9WgXcQ', playing: false, inputUrl: '' }); });
        await act(async () => { await Promise.resolve(); });
        expect(window.YT.Player).toHaveBeenCalled();

        expect(() => opcoes.events.onReady({ target: jogador })).not.toThrow();
        expect(jogador.setVolume).toHaveBeenLastCalledWith(40);

        expect(() => fireEvent.change(slider(), { target: { value: '75' } })).not.toThrow();
        expect(jogador.setVolume).toHaveBeenLastCalledWith(75);
    });
});
