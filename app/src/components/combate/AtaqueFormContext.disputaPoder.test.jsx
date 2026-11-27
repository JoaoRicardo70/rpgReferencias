import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// ---------------------------------------------------------------------------
// QA - Disputa de Poder no Ataque: rolarDano (alvo unico e em area) e rolarDanoCustomizado
// contra alvos. O feed leva poderAtacante, danoAplicado e textoDisputa (sem fator: ele entregaria o Poder do alvo).
// O Poder do atacante e controlado pelo mock de getPoderParaDisputa (campo __poder da ficha).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn((ficha) => (ficha && ficha.__poder !== undefined ? ficha.__poder : null)) };
});

let mockState;
let probe;
function Harness() { probe = useAtaqueForm(); return null; }

function montar({ meuPoder = 1000, personagens = {}, alvoSelecionado = null, alvosArea = null } = {}) {
    const minhaFicha = {
        __poder: meuPoder, poderes: [], inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {},
        mana: { base: 100000, atual: 100000 }, vida: { base: 1000000, atual: 1000000 },
    };
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque',
        feedCombate: alvosArea ? [{ tipo: 'acerto', nome: 'Heroi', alvosArea }] : [],
        alvoSelecionado,
        ignorarTravaAcerto: true, setIgnorarTravaAcerto: vi.fn(),
        cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
    return minhaFicha;
}

const feedEnviado = () => enviarParaFeed.mock.calls.at(-1)[0];

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    calcularDano.mockReturnValue({ dano: 1000, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
});
afterEach(() => cleanup());

describe('AtaqueFormContext.rolarDano - sem alvo, com Disputa de Poder', () => {
    it('sem alvo selecionado: nao grava Vida, mas o feed ainda leva poderAtacante', () => {
        montar({ meuPoder: 1234 });
        act(() => { probe.rolarDano(); });
        const feed = feedEnviado();
        expect(feed.poderAtacante).toBe(1234);
        expect('danoAplicado' in feed).toBe(false);
        expect('alvoNome' in feed).toBe(false);
    });
});

describe('AtaqueFormContext.rolarDanoCustomizado - Disputa de Poder', () => {
    it('sem alvo: feed leva poderAtacante', () => {
        montar({ meuPoder: 777 });
        act(() => { probe.rolarDanoCustomizado('1000', 0, 'mana', 0); });
        expect(feedEnviado().poderAtacante).toBe(777);
    });
    it('formula invalida alerta e nao envia nada ao feed', () => {
        montar({ meuPoder: 1000 });
        act(() => { probe.rolarDanoCustomizado('((1000', 0, 'mana', 0); });
        expect(window.alert).toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
});

describe('AtaqueFormContext - disputaAlvo (previa)', () => {
    it('sem alvo: null', () => {
        montar({ meuPoder: 1000 });
        expect(probe.disputaAlvo).toBeNull();
    });
});
