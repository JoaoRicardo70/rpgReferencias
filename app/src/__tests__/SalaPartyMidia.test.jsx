import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('../services/firebase-sync', () => ({ salvarCenarioCompleto: vi.fn() }));
vi.mock('../components/feed/FeedCombate', () => ({ default: () => <div data-testid="feed-combate" /> }));
vi.mock('../components/comunicacao/PainelMidia', () => ({
    default: ({ onFechar }) => <aside className="sala-party-midia" data-testid="painel-midia"><button onClick={onFechar}>fechar-midia</button></aside>,
}));

import useStore from '../stores/useStore';
import { AbaVoz } from '../components/comunicacao/DockComunicacao';

const CH_MIDIA = 'rpg_sala_party_midia';
const CH_LADOS = 'rpg_sala_party_lados';

const voz = {
    voiceStatus: 'Conectado', mutado: false, surdo: false,
    toggleMute: vi.fn(), toggleDeafen: vi.fn(), conexoes: [], selectedSpeaker: '',
    mics: [], speakers: [], selectedMic: '', trocarMicrofone: vi.fn(), trocarSpeaker: vi.fn(),
    setSupressorAtivo: vi.fn(), supressorAtivo: false,
};
const montar = (compacto = false) => render(
    <AbaVoz voz={voz} estouNaCall={false} naTaverna={[]} alternarPresenca={vi.fn()} meuNome="Ana" compacto={compacto} />
);
const midia = () => document.querySelector('[data-testid="painel-midia"]');
const feed = () => document.querySelector('.sala-party-feed');
const palco = () => document.querySelector('.sala-party-palco');
const ordem = () => Array.from(document.querySelector('.sala-party-corpo').children).map(el =>
    el === midia() ? 'midia' : el === feed() ? 'feed' : el === palco() ? 'palco' : '?');

describe('AbaVoz - mídia e lados', () => {
    beforeEach(() => {
        localStorage.clear();
        useStore.setState({ meuNome: 'Ana', minhaFicha: null, personagens: { Ana: {} } });
    });
    afterEach(() => { cleanup(); localStorage.clear(); });

    it('por padrão mostra mídia e feed, com a mídia à esquerda (mídia, palco, feed)', () => {
        montar();
        expect(midia()).toBeTruthy();
        expect(feed()).toBeTruthy();
        expect(ordem()).toEqual(['midia', 'palco', 'feed']);
    });

    it('"⇄ Trocar lados" inverte a ordem e grava feed-esq; de novo volta e grava midia-esq', () => {
        montar();
        fireEvent.click(screen.getByText(/Trocar lados/));
        expect(ordem()).toEqual(['feed', 'palco', 'midia']);
        expect(localStorage.getItem(CH_LADOS)).toBe('feed-esq');
        fireEvent.click(screen.getByText(/Trocar lados/));
        expect(ordem()).toEqual(['midia', 'palco', 'feed']);
        expect(localStorage.getItem(CH_LADOS)).toBe('midia-esq');
    });

    it('começa trocado quando o localStorage tem feed-esq', () => {
        localStorage.setItem(CH_LADOS, 'feed-esq');
        montar();
        expect(ordem()).toEqual(['feed', 'palco', 'midia']);
    });

    it('valor desconhecido em lados cai no padrão', () => {
        localStorage.setItem(CH_LADOS, 'lixo');
        montar();
        expect(ordem()).toEqual(['midia', 'palco', 'feed']);
    });

    it('"Ocultar mídia" remove o painel e grava 0; "Mostrar mídia" volta e grava 1', () => {
        montar();
        fireEvent.click(screen.getByText(/Ocultar mídia/));
        expect(midia()).toBeNull();
        expect(localStorage.getItem(CH_MIDIA)).toBe('0');
        expect(ordem()).toEqual(['palco', 'feed']);
        fireEvent.click(screen.getByText(/Mostrar mídia/));
        expect(midia()).toBeTruthy();
        expect(localStorage.getItem(CH_MIDIA)).toBe('1');
    });

    it('o botão de fechar do próprio painel também oculta a mídia', () => {
        montar();
        fireEvent.click(screen.getByText('fechar-midia'));
        expect(midia()).toBeNull();
        expect(localStorage.getItem(CH_MIDIA)).toBe('0');
    });

    it('começa oculta quando o localStorage tem 0', () => {
        localStorage.setItem(CH_MIDIA, '0');
        montar();
        expect(midia()).toBeNull();
        expect(feed()).toBeTruthy();
    });

    it('com mídia e feed ocultos o botão de trocar lados some', () => {
        montar();
        fireEvent.click(screen.getByText(/Ocultar mídia/));
        fireEvent.click(screen.getByText(/Ocultar feed de dados/));
        expect(screen.queryByText(/Trocar lados/)).toBeNull();
    });

    it('compacto não mostra mídia, feed nem botões', () => {
        montar(true);
        expect(midia()).toBeNull();
        expect(feed()).toBeNull();
        expect(screen.queryByText(/Trocar lados/)).toBeNull();
        expect(screen.queryByText(/Ocultar mídia/)).toBeNull();
        expect(ordem()).toEqual(['palco']);
    });
});
