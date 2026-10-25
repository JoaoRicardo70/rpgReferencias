import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../services/firebase-sync', () => ({ salvarCenarioCompleto: vi.fn() }));
vi.mock('../components/feed/FeedCombate', () => ({ default: () => <div data-testid="feed-combate" /> }));

import useStore from '../stores/useStore';
import { AbaVoz } from '../components/comunicacao/DockComunicacao';

const CHAVE = 'rpg_sala_party_feed';

function fakeVoz(over = {}) {
    return {
        voiceStatus: 'Conectado', mutado: false, surdo: false,
        toggleMute: vi.fn(), toggleDeafen: vi.fn(), conexoes: [], selectedSpeaker: '',
        mics: [{ deviceId: 'm1abcd', label: 'Mic Um' }], speakers: [],
        selectedMic: 'm1abcd', trocarMicrofone: vi.fn(), trocarSpeaker: vi.fn(),
        setSupressorAtivo: vi.fn(), supressorAtivo: false,
        ...over,
    };
}

function montar({ voz = fakeVoz(), estouNaCall = false, compacto = false, naTaverna = [] } = {}) {
    return render(
        <AbaVoz voz={voz} estouNaCall={estouNaCall} naTaverna={naTaverna}
            alternarPresenca={vi.fn()} meuNome="Ana" compacto={compacto} />
    );
}

const feed = () => document.querySelector('.sala-party-feed');
const toggle = () => document.querySelector('.sala-party-feed-toggle');

describe('AbaVoz - Feed de Dados da Sala da Party', () => {
    beforeEach(() => {
        localStorage.clear();
        useStore.setState({ meuNome: 'Ana', minhaFicha: null, personagens: { Ana: {} } });
    });
    afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

    it('nao compacto: mostra o feed e o toggle (pressed, "Ocultar feed de dados") por padrao', () => {
        montar();
        expect(feed()).toBeTruthy();
        expect(feed().tagName).toBe('ASIDE');
        expect(feed().getAttribute('aria-label')).toBe('Feed de dados');
        expect(toggle().getAttribute('aria-pressed')).toBe('true');
        expect(toggle().textContent).toContain('Ocultar feed de dados');
        expect(document.querySelector('.sala-party-corpo').className).toContain('com-feed');
    });

    it('clicar no toggle oculta, persiste "0"; clicar de novo mostra e persiste "1"', () => {
        montar();
        fireEvent.click(toggle());
        expect(feed()).toBeNull();
        expect(toggle().textContent).toContain('Mostrar feed de dados');
        expect(toggle().getAttribute('aria-pressed')).toBe('false');
        expect(localStorage.getItem(CHAVE)).toBe('0');
        expect(document.querySelector('.sala-party-corpo').className).not.toContain('com-feed');

        fireEvent.click(toggle());
        expect(feed()).toBeTruthy();
        expect(toggle().textContent).toContain('Ocultar feed de dados');
        expect(toggle().getAttribute('aria-pressed')).toBe('true');
        expect(localStorage.getItem(CHAVE)).toBe('1');
    });

    it('comeca oculto quando localStorage tem "0"', () => {
        localStorage.setItem(CHAVE, '0');
        montar();
        expect(feed()).toBeNull();
        expect(toggle().getAttribute('aria-pressed')).toBe('false');
        expect(toggle().textContent).toContain('Mostrar feed de dados');
    });

    it('valor diferente de "0" no localStorage mantem visivel', () => {
        localStorage.setItem(CHAVE, 'qualquer');
        montar();
        expect(feed()).toBeTruthy();
    });

    it('o X dentro do feed tambem oculta e persiste "0"', () => {
        montar();
        fireEvent.click(screen.getByLabelText('Ocultar o feed de dados'));
        expect(feed()).toBeNull();
        expect(localStorage.getItem(CHAVE)).toBe('0');
        expect(toggle().getAttribute('aria-pressed')).toBe('false');
    });

    it('localStorage lancando em getItem/setItem nao quebra (comeca visivel e toggle funciona)', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio'); });
        montar();
        expect(feed()).toBeTruthy();
        fireEvent.click(toggle());
        expect(feed()).toBeNull();
        expect(toggle().getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(toggle());
        expect(feed()).toBeTruthy();
    });

    it('compacto: nunca mostra feed nem botao toggle (mesmo com estado salvo visivel)', () => {
        localStorage.setItem(CHAVE, '1');
        montar({ compacto: true });
        expect(feed()).toBeNull();
        expect(toggle()).toBeNull();
        expect(screen.queryByLabelText('Ocultar o feed de dados')).toBeNull();
        expect(document.querySelector('.sala-party-corpo').className).not.toContain('com-feed');
    });

    it('ajustes de audio: engrenagem so aparece na call', () => {
        montar({ estouNaCall: false });
        expect(screen.queryByLabelText('Ajustes de áudio')).toBeNull();
        expect(screen.queryByLabelText('Microfone')).toBeNull();
        expect(screen.queryByText(/Filtro de Eco/)).toBeNull();
    });

    it('na call: ajustes abertos por padrao e a engrenagem recolhe/mostra', () => {
        montar({ estouNaCall: true });
        const engrenagem = screen.getByLabelText('Ajustes de áudio');
        expect(engrenagem.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByLabelText('Microfone')).toBeTruthy();
        expect(screen.getByText(/Filtro de Eco/)).toBeTruthy();

        fireEvent.click(engrenagem);
        expect(engrenagem.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByLabelText('Microfone')).toBeNull();
        expect(screen.queryByText(/Filtro de Eco/)).toBeNull();

        fireEvent.click(engrenagem);
        expect(screen.getByLabelText('Microfone')).toBeTruthy();
        expect(screen.getByText(/Filtro de Eco/)).toBeTruthy();
    });

    it('mic/fone: aria-label e aria-pressed no estado normal', () => {
        const voz = fakeVoz();
        montar({ voz, estouNaCall: true });
        const mic = screen.getByLabelText('Silenciar microfone');
        const fone = screen.getByLabelText('Ensurdecer');
        expect(mic.getAttribute('aria-pressed')).toBe('false');
        expect(fone.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(mic);
        fireEvent.click(fone);
        expect(voz.toggleMute).toHaveBeenCalledTimes(1);
        expect(voz.toggleDeafen).toHaveBeenCalledTimes(1);
    });

    it('mic/fone: aria-label e aria-pressed refletem mutado/surdo', () => {
        montar({ voz: fakeVoz({ mutado: true, surdo: true }), estouNaCall: true });
        expect(screen.getByLabelText('Ativar microfone').getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByLabelText('Voltar a ouvir').getAttribute('aria-pressed')).toBe('true');
        expect(screen.queryByLabelText('Silenciar microfone')).toBeNull();
        expect(screen.queryByLabelText('Ensurdecer')).toBeNull();
    });

    it('mic/fone ficam desabilitados fora da call', () => {
        montar({ estouNaCall: false });
        expect(screen.getByLabelText('Silenciar microfone').disabled).toBe(true);
        expect(screen.getByLabelText('Ensurdecer').disabled).toBe(true);
    });
});
