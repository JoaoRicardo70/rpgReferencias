import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';

// Fase 2 - revisao: desligar por edicao/exclusao (semAoDesligar) nao dispara poderDesligou; o desligar normal e o ligar disparam.
vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn(() => ({ dano: 10 })) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()), uploadImagem: vi.fn(),
    enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));

const F = FATOR_EXIBICAO_VITAIS;
let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
const vital = (atual) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual });
const GATILHOS = [
    { id: 'des', nome: 'Desligou', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] },
    { id: 'lig', nome: 'Ligou', evento: { tipo: 'poderLigou' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 10 }] },
];
function montar(ativa) {
    mockState = {
        minhaFicha: {
            poderes: [{ id: 1, nome: 'P', categoria: 'habilidade', ativa, efeitos: [], efeitosPassivos: [], gatilhos: GATILHOS }],
            vida: vital(100 * F), mana: vital(100 * F), aura: vital(100 * F), chakra: vital(100 * F), corpo: vital(100 * F), combate: {},
            contadores: [{ id: 'k', nome: 'K', valor: 0, min: 0, max: 99 }],
        },
        meuNome: 'Heroi', isMestre: false, updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(), poderEditandoId: null, setPoderEditandoId: vi.fn(),
        pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn(), dummies: {}, personagens: {}, feedCombate: [], alvoSelecionado: null, abaAtiva: 'mapa', setAbaAtiva: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    return render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
const k = () => mockState.minhaFicha.contadores[0].valor;
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('togglePoder - gatilhos poderLigou / poderDesligou', () => {
    it('desligar normal dispara poderDesligou (o proprio Poder)', () => {
        montar(true);
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect(k()).toBe(1);
    });
    it('desligar por edicao/exclusao (semAoDesligar) NAO dispara gatilho', () => {
        montar(true);
        act(() => { probe.togglePoder(1, { semAoDesligar: true }); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false);
        expect(k()).toBe(0);
    });
    it('ligar dispara poderLigou', () => {
        montar(false);
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true);
        expect(k()).toBe(10);
    });
});
