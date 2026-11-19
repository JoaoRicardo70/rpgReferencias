import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

const sync = vi.hoisted(() => ({
    salvarDummie: vi.fn(), deletarDummie: vi.fn(), enviarParaJukebox: vi.fn(), cb: null,
}));
vi.mock('../services/firebase-sync', () => ({
    salvarDummie: sync.salvarDummie, deletarDummie: sync.deletarDummie, enviarParaJukebox: sync.enviarParaJukebox,
    iniciarListenerJukebox: (cb) => { sync.cb = cb; return () => {}; },
}));

import useStore from '../stores/useStore';
import DummieToken from '../components/combat/DummieToken';
import Jukebox from '../components/jukebox/Jukebox';

const dummie = { nome: 'Boneco', hpAtual: 0, hpMax: 1000000, visibilidadeHp: 'todos', defesa: 10, tipoDefesa: 'ca' };

function montarToken(isMestre, { alvo = true } = {}) {
    useStore.setState({ isMestre, souMestreReal: true, modoJogador: !isMestre, alvoSelecionado: alvo ? 'd1' : null, entidadeInspecionada: null, personagens: {} });
    return render(<DummieToken id="d1" dummie={dummie} />);
}

describe('DummieToken: controles so para Mestre', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    it('jogador (Modo Jogador) alvo morto: sem Ressuscitar nem botoes de Mestre', () => {
        const { container } = montarToken(false);
        expect(screen.queryByText(/RESSUSCITAR/)).toBeNull();
        expect(screen.queryByText(/HP$/)).toBeNull();
        expect(container.querySelectorAll('button').length).toBe(0);
        expect(sync.salvarDummie).not.toHaveBeenCalled();
        expect(sync.deletarDummie).not.toHaveBeenCalled();
    });
    it('Mestre com alvo: 4 botoes; resetar vida grava hp cheio', () => {
        const { container } = montarToken(true);
        expect(container.querySelectorAll('button').length).toBe(4);
        fireEvent.click(screen.getByText(/HP$/));
        expect(sync.salvarDummie).toHaveBeenCalledWith('d1', expect.objectContaining({ hpAtual: 1000000 }));
    });
    it('Mestre: remover pede confirmacao e deleta; cancelar nao deleta', () => {
        const { container } = montarToken(true);
        const lixo = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('🗑'));
        const conf = vi.spyOn(window, 'confirm').mockReturnValue(false);
        fireEvent.click(lixo);
        expect(sync.deletarDummie).not.toHaveBeenCalled();
        conf.mockReturnValue(true);
        fireEvent.click(lixo);
        expect(sync.deletarDummie).toHaveBeenCalledWith('d1');
    });
    it('Mestre: editar poder grava via prompt', () => {
        const { container } = montarToken(true);
        vi.spyOn(window, 'prompt').mockReturnValue('5000');
        fireEvent.click(container.querySelector('.dummie-btn-poder'));
        expect(window.prompt).toHaveBeenCalled();
    });
    it('Mestre sem alvo selecionado: sem botoes', () => {
        const { container } = montarToken(true, { alvo: false });
        expect(container.querySelectorAll('button').length).toBe(0);
    });
    it('os 4 handlers tem guarda "if (!isMestre) return;" (estatico: nao ha caminho de UI para jogador)', () => {
        const src = fs.readFileSync(path.resolve(__dirname, '../components/combat/DummieToken.jsx'), 'utf8');
        ['resetarVida', 'atualizarDefesa', 'editarPoder', 'removerDummie'].forEach((h) => {
            const i = src.indexOf(`const ${h} = (e) => {`);
            expect(i).toBeGreaterThan(-1);
            expect(src.slice(i, i + 200)).toMatch(/if \(!isMestre\) return;/);
        });
    });
});

describe('Jukebox: controles so para Mestre', () => {
    beforeEach(() => { vi.clearAllMocks(); sync.cb = null; localStorage.clear(); });
    afterEach(() => { cleanup(); delete window.YT; });

    it('jogador: sem input nem TOCAR/PAUSAR/PARAR; volume continua', () => {
        useStore.setState({ isMestre: false, souMestreReal: false });
        const { container } = render(<Jukebox />);
        expect(container.querySelector('input[type="text"]')).toBeNull();
        expect(screen.queryByText(/TOCAR/)).toBeNull();
        expect(screen.queryByText(/PAUSAR/)).toBeNull();
        expect(screen.queryByText(/PARAR/)).toBeNull();
        expect(container.querySelector('input[type="range"]')).not.toBeNull();
    });
    it('Mestre: controles presentes; TOCAR com link valido envia estado', () => {
        useStore.setState({ isMestre: true, souMestreReal: true });
        const { container } = render(<Jukebox />);
        fireEvent.change(container.querySelector('input[type="text"]'), { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });
        fireEvent.click(screen.getByText(/TOCAR/));
        expect(sync.enviarParaJukebox).toHaveBeenCalledWith(expect.objectContaining({ videoId: 'dQw4w9WgXcQ', playing: true }));
    });
    it('Mestre: link invalido nao envia; PARAR envia', () => {
        useStore.setState({ isMestre: true, souMestreReal: true });
        const { container } = render(<Jukebox />);
        vi.spyOn(window, 'alert').mockImplementation(() => {});
        fireEvent.change(container.querySelector('input[type="text"]'), { target: { value: 'lixo' } });
        fireEvent.click(screen.getByText(/TOCAR/));
        expect(sync.enviarParaJukebox).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText(/PARAR/));
        expect(sync.enviarParaJukebox).toHaveBeenCalledTimes(1);
    });
    it('jogador: evento de estado do player (pausar/tocar) nao envia nada ao Firebase', async () => {
        let eventos = null;
        window.YT = { PlayerState: { PAUSED: 2, PLAYING: 1 }, Player: function (_id, cfg) { eventos = cfg.events; return { destroy() {}, setVolume() {}, unMute() {}, getPlayerState: () => -1, playVideo() {}, pauseVideo() {} }; } };
        useStore.setState({ isMestre: false, souMestreReal: false });
        render(<Jukebox />);
        await act(async () => { sync.cb({ videoId: 'dQw4w9WgXcQ', playing: false, inputUrl: 'x' }); });
        await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
        expect(eventos).not.toBeNull();
        eventos.onStateChange({ data: 2 });
        eventos.onStateChange({ data: 1 });
        expect(sync.enviarParaJukebox).not.toHaveBeenCalled();
    });
    it('Mestre: mesmo evento de estado do player envia', async () => {
        let eventos = null;
        window.YT = { PlayerState: { PAUSED: 2, PLAYING: 1 }, Player: function (_id, cfg) { eventos = cfg.events; return { destroy() {}, setVolume() {}, unMute() {}, getPlayerState: () => -1, playVideo() {}, pauseVideo() {} }; } };
        useStore.setState({ isMestre: true, souMestreReal: true });
        render(<Jukebox />);
        await act(async () => { sync.cb({ videoId: 'dQw4w9WgXcQ', playing: false, inputUrl: 'x' }); });
        await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
        eventos.onStateChange({ data: 2 });
        expect(sync.enviarParaJukebox).toHaveBeenCalledWith(expect.objectContaining({ playing: false }));
    });
    it('handlers tem guarda isMestre (estatico)', () => {
        const src = fs.readFileSync(path.resolve(__dirname, '../components/jukebox/Jukebox.jsx'), 'utf8');
        ['handlePlay', 'handlePause', 'handleStop'].forEach((h) => {
            const i = src.indexOf(`const ${h} = () => {`);
            expect(src.slice(i, i + 80)).toMatch(/!isMestre/);
        });
    });
});
