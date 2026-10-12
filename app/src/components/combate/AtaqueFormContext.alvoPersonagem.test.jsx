import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed, aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto, aplicarElementoNivelDireto } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// Alvo-personagem ('pj:<nome>'): o golpe grava a Vida na ficha do alvo (aplicarDanoDireto), com as
// Reducoes da ficha em sequencia; Dummie continua indo por salvarDummie.

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularDano: vi.fn() }));
// Isola o que e testado aqui (reducoes + destino da gravacao): sem Disputa de Poder e sem escala proporcional a Vida.
vi.mock('../../core/disputaPoder', async (importOriginal) => ({
    ...(await importOriginal()),
    calcularDisputaPoder: vi.fn(() => ({ ativa: false })),
    aplicarDisputaAoDano: vi.fn((dano) => dano),
}));
vi.mock('../../core/danoProporcional', async (importOriginal) => ({
    ...(await importOriginal()),
    escalarDanoPelaVida: vi.fn((dano) => dano),
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

let mockState;
let probe;
function Harness() { probe = useAtaqueForm(); return null; }

const FATOR = 1000;
const stat = (atual, base) => ({ atual, base, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });

function fichaAna(extra = {}) {
    return { vida: stat(1000000, 1000000), reducoesDano: [], ...extra };
}

function montar({ alvoSelecionado, personagens = {}, dummies = {} }) {
    const minhaFicha = { poderes: [], inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {} };
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens, dummies, alvoSelecionado,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque',
        feedCombate: [],
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(),
        cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}

const ultimoFeed = () => enviarParaFeed.mock.calls[enviarParaFeed.mock.calls.length - 1][0];

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    calcularDano.mockReturnValue({ dano: 1000, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
});
afterEach(() => cleanup());

describe('AtaqueFormContext - alvo-personagem (pj:<nome>)', () => {
    const reducoes = [
        { id: 'r1', nome: 'Couraça', percentual: 20, elemento: 'todos' },
        { id: 'r2', nome: 'Pele Yin', percentual: 30, elemento: 'pol:yin' },
    ];

    it('golpe de Fogo grava a Vida reduzida em sequencia na ficha da Ana (aplicarDanoDireto), nao em salvarDummie', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna({ reducoesDano: reducoes }) } });
        act(() => { probe.setElementoAtivo('Fogo'); });
        act(() => { probe.rolarDano(); });

        expect(salvarDummie).not.toHaveBeenCalled();
        expect(aplicarDanoDireto).toHaveBeenCalledTimes(1);
        const [nome, vida] = aplicarDanoDireto.mock.calls[0];
        expect(nome).toBe('Ana');
        const feed = ultimoFeed();
        // 1000 -> -20% = 800 -> -30% = 560 (sequencial, nao 500 somado)
        expect(feed.danoAplicado).toBe(560);
        expect(vida).toBe(Math.max(0, 1000000 - 560 * FATOR));
        expect(feed.textoReducao).toBeTruthy();
        expect(feed.alvoNome).toBe('Ana');
        expect(aplicarElementoDireto).toHaveBeenCalledWith('Ana', 'Fogo');
        expect(aplicarFadigaDireta).toHaveBeenCalledTimes(1);
    });

    it('sem Reducoes na ficha: dano integral e sem textoReducao', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() } });
        act(() => { probe.rolarDano(); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1000000 - 1000 * FATOR);
        expect(ultimoFeed().textoReducao).toBeUndefined();
    });

    it('formula livre (rolarDanoCustomizado) tambem grava na ficha da Ana com reducoes', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna({ reducoesDano: reducoes }) } });
        act(() => { probe.setElementoAtivo('Fogo'); });
        act(() => { probe.rolarDanoCustomizado('1000'); });
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1000000 - 560 * FATOR);
        expect(ultimoFeed().danoAplicado).toBe(560);
    });

    it('alvo pj: apontando para si mesmo ou personagem inexistente nao grava nada', () => {
        montar({ alvoSelecionado: 'pj:Heroi', personagens: { Heroi: fichaAna() } });
        act(() => { probe.rolarDano(); });
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
        expect(salvarDummie).not.toHaveBeenCalled();
        cleanup();
        montar({ alvoSelecionado: 'pj:Fantasma', personagens: {} });
        act(() => { probe.rolarDano(); });
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
    });

    it('Dummie continua usando salvarDummie, nunca aplicarDanoDireto', () => {
        montar({ alvoSelecionado: 'g1', dummies: { g1: { nome: 'Goblin', hpAtual: 100 * FATOR, hpMax: 100 * FATOR, valorDefesa: 10 } } });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 0 }));
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
        expect(aplicarElementoNivelDireto).not.toHaveBeenCalled();
    });
});
