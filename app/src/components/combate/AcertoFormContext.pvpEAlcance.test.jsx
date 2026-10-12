import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcertoFormProvider, useAcertoForm } from './AcertoFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../core/engine', () => ({
    calcularAcerto: vi.fn(() => ({ acertoTotal: 15, rolagem: '1d20' })),
    calcularCA: vi.fn(() => 10),
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));

let probe;
function Harness() { probe = useAcertoForm(); return null; }

function montar({ ana, iniciativaEu = 10 }) {
    const minhaFicha = {
        iniciativa: iniciativaEu,
        inventario: [{ tipo: 'arma', equipado: true, alcance: 10 }],
        poderes: [], ataquesElementais: [],
        posicao: { x: 0, y: 0, z: 0, cenaId: 'cena_x' },
    };
    const state = {
        minhaFicha, meuNome: 'Heroi', personagens: { Ana: ana },
        setAbaAtiva: vi.fn(), updateFicha: vi.fn((cb) => cb(minhaFicha)),
        alvoSelecionado: 'pj:Ana', dummies: {}, isMestre: false,
        cenario: { ativa: 'cena_x', lista: { cena_x: { escala: 1.5 } }, zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<AcertoFormProvider><Harness /></AcertoFormProvider>);
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('AcertoFormContext.rolarAcerto - alvo-personagem', () => {
    it('alvo em outra cena (origemArea alvo): alerta de fora de alcance e nada no feed', () => {
        montar({ ana: { iniciativa: 5, posicao: { x: 1, y: 0, z: 0, cenaId: 'cena_y' } } });
        act(() => { probe.rolarAcerto(); });
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toMatch(/fora do seu alcance/);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('alvo na mesma cena e dentro do alcance: acerto sai', () => {
        montar({ ana: { iniciativa: 5, posicao: { x: 1, y: 0, z: 0, cenaId: 'cena_x' } } });
        act(() => { probe.rolarAcerto(); });
        expect(window.alert).not.toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });

    it('PvP sem iniciativa no alvo: alerta de combate e nada no feed', () => {
        montar({ ana: { iniciativa: 0, posicao: { x: 1, y: 0, z: 0, cenaId: 'cena_x' } } });
        act(() => { probe.rolarAcerto(); });
        expect(window.alert.mock.calls[0][0]).toMatch(/combate/);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
});
