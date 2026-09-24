import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaAlvoProvider, useFichaAtiva, useCallSaveAtivo } from './FichaAlvoContext';
import useStore from '../../stores/useStore';
import {
    iniciarSincronizacaoFichaAlvo,
    pararSincronizacaoFichaAlvo,
    salvarFichaAlvoSilencioso,
    salvarFichaSilencioso,
} from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — FichaAlvoContext.jsx: FichaAlvoProvider/useFichaAtiva/useCallSaveAtivo
//
// Garante que:
//  1) Fora de qualquer Provider (o jogador comum, na sua própria Ficha
//     Definitiva) o comportamento é IDÊNTICO ao de sempre -- zero mudança.
//  2) Um Provider mirando o PRÓPRIO nome do jogador logado (Mestre abrindo o
//     Grimório na própria ficha) também cai no caminho de sempre (souEuMesmo),
//     sem acionar a sincronização por-entidade.
//  3) Um Provider mirando OUTRA entidade lê/grava em personagens[nome] via
//     updateFichaAlvo, nunca em minhaFicha (cross-talk safety), e liga/desliga
//     a baseline de sincronização (iniciarSincronizacaoFichaAlvo/
//     pararSincronizacaoFichaAlvo) só nesse caso.
//
// Mocka '../../services/firebase-sync' por completo (não precisa mockar
// firebase/database/firebase-config -- o módulo real nunca é carregado) e
// '../../stores/useStore' com importOriginal pra preservar sanitizarNome real,
// no mesmo padrão de MestreFormContext.toggleCoMestre.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});

vi.mock('../../services/firebase-sync', () => ({
    iniciarSincronizacaoFichaAlvo: vi.fn(),
    pararSincronizacaoFichaAlvo: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { vida: { atual: 100 } },
        meuNome: 'Kiriya',
        personagens: { 'NPC Sombrio': { vida: { atual: 500 } } },
        updateFicha: vi.fn(),
        updateFichaAlvo: vi.fn(),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = { ...useFichaAtiva(), salvar: useCallSaveAtivo() };
    return null;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); probe = undefined; });

describe('useFichaAtiva/useCallSaveAtivo FORA de qualquer FichaAlvoProvider — comportamento normal do jogador', () => {
    it('useFichaAtiva() retorna exatamente {ficha: minhaFicha, updateFicha: <ação do store>, souEuMesmo: true, nome: meuNome}', () => {
        const state = montarStore();
        render(<Harness />);

        expect(probe.ficha).toBe(state.minhaFicha);
        expect(probe.updateFicha).toBe(state.updateFicha);
        expect(probe.souEuMesmo).toBe(true);
        expect(probe.nome).toBe('Kiriya');
    });

    it('useCallSaveAtivo() aciona salvarFichaSilencioso() (o debounce normal da própria ficha), não o de entidade alvo', () => {
        montarStore();
        render(<Harness />);

        probe.salvar();

        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarFichaAlvoSilencioso).not.toHaveBeenCalled();
    });
});

describe('FichaAlvoProvider mirando o PRÓPRIO jogador logado — igual a não usar Provider nenhum', () => {
    it('useFichaAtiva() continua retornando minhaFicha/updateFicha do store, souEuMesmo true', () => {
        const state = montarStore();
        render(<FichaAlvoProvider nome="Kiriya"><Harness /></FichaAlvoProvider>);

        expect(probe.ficha).toBe(state.minhaFicha);
        expect(probe.updateFicha).toBe(state.updateFicha);
        expect(probe.souEuMesmo).toBe(true);
    });

    it('NÃO liga a sincronização por-entidade (gate `souEuMesmo` no useEffect do Provider)', () => {
        montarStore();
        render(<FichaAlvoProvider nome="Kiriya"><Harness /></FichaAlvoProvider>);

        expect(iniciarSincronizacaoFichaAlvo).not.toHaveBeenCalled();
    });
});

describe('FichaAlvoProvider mirando OUTRA entidade (Grimório da Entidade) — cross-talk safety', () => {
    it('useFichaAtiva() retorna a ficha de personagens[nome], NÃO minhaFicha, e updateFicha delega para updateFichaAlvo(nome, cb)', () => {
        const state = montarStore();
        render(<FichaAlvoProvider nome="NPC Sombrio"><Harness /></FichaAlvoProvider>);

        expect(probe.ficha).toBe(state.personagens['NPC Sombrio']);
        expect(probe.ficha).not.toBe(state.minhaFicha);
        expect(probe.souEuMesmo).toBe(false);
        expect(probe.nome).toBe('NPC Sombrio');

        const callback = (f) => { f.vida.atual = 1; };
        probe.updateFicha(callback);

        expect(state.updateFichaAlvo).toHaveBeenCalledWith('NPC Sombrio', callback);
        expect(state.updateFicha).not.toHaveBeenCalled();
    });

    it('liga a sincronização de baseline ao montar e a desliga (flush) ao desmontar (fechar o Grimório)', () => {
        montarStore();
        const { unmount } = render(<FichaAlvoProvider nome="NPC Sombrio"><Harness /></FichaAlvoProvider>);

        expect(iniciarSincronizacaoFichaAlvo).toHaveBeenCalledWith('NPC Sombrio');
        expect(pararSincronizacaoFichaAlvo).not.toHaveBeenCalled();

        unmount();

        expect(pararSincronizacaoFichaAlvo).toHaveBeenCalledWith('NPC Sombrio');
    });

    it('useCallSaveAtivo() aciona salvarFichaAlvoSilencioso(nome), não o debounce da própria ficha', () => {
        montarStore();
        render(<FichaAlvoProvider nome="NPC Sombrio"><Harness /></FichaAlvoProvider>);

        probe.salvar();

        expect(salvarFichaAlvoSilencioso).toHaveBeenCalledWith('NPC Sombrio');
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
});
