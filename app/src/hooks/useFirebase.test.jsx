import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const ordem = [];
let cbFeed;

vi.mock('../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));
vi.mock('../services/firebase-sync', () => ({
    iniciarListenerFichaPropria: vi.fn(() => () => {}),
    iniciarListenerPersonagens: vi.fn(() => () => {}),
    iniciarListenerFeed: vi.fn((cb) => { ordem.push('listenerFeed'); cbFeed = cb; return () => { ordem.push('unsubFeed'); }; }),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    resetSincronizacaoFicha: vi.fn(),
    mesclarPersonagensRemotos: vi.fn((a, b) => b),
}));

import useFirebase from './useFirebase';
import useStore from '../stores/useStore';

describe('useFirebase - feed ao trocar de personagem', () => {
    let limparOriginal;
    beforeEach(() => {
        ordem.length = 0;
        limparOriginal = useStore.getState().limparFeedStore;
        useStore.setState({
            mesaId: 'M1', meuNome: 'Ana', feedCombate: [],
            limparFeedStore: () => { ordem.push('limpar'); limparOriginal(); },
        });
    });
    afterEach(() => { cleanup(); useStore.setState({ limparFeedStore: limparOriginal, feedCombate: [] }); });

    it('limpa o feed antes de anexar o listener', () => {
        renderHook(() => useFirebase());
        expect(ordem.indexOf('limpar')).toBeGreaterThanOrEqual(0);
        expect(ordem.indexOf('limpar')).toBeLessThan(ordem.indexOf('listenerFeed'));
    });

    it('trocar meuNome limpa o feed de novo antes de re-anexar, sem duplicar entradas', () => {
        renderHook(() => useFirebase());
        act(() => { cbFeed({ id: 1, texto: 'a' }); cbFeed({ id: 2, texto: 'b' }); });
        expect(useStore.getState().feedCombate).toHaveLength(2);

        ordem.length = 0;
        act(() => { useStore.setState({ meuNome: 'Bia' }); });
        expect(ordem).toEqual(['unsubFeed', 'limpar', 'listenerFeed']);
        expect(useStore.getState().feedCombate).toHaveLength(0);

        // O novo listener reenvia as mesmas 2 entradas
        act(() => { cbFeed({ id: 1, texto: 'a' }); cbFeed({ id: 2, texto: 'b' }); });
        expect(useStore.getState().feedCombate).toHaveLength(2);
    });

    it('sem mesaId não toca no feed', () => {
        useStore.setState({ mesaId: '' });
        renderHook(() => useFirebase());
        expect(ordem).toEqual([]);
    });
});
