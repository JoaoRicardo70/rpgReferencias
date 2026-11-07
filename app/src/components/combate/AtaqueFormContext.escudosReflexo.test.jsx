import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// O Dano que o Reflexo do alvo devolve ao atacante passa pelo escudo do atacante antes da Vida.

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularDano: vi.fn() }));
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
    salvarCamposPersonagem: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

let mockState;
let probe;
function Harness() { probe = useAtaqueForm(); return null; }
const stat = (atual, base = 1000000) => ({ base, atual, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });

function montar(escudos) {
    const ana = { vida: stat(1000000), mana: stat(100000), reducoesDano: [], iniciativa: 10, destreza: { base: 50 }, poderes: [{ id: 'r1', nome: 'Espelho', ativa: true, reflexo: { modo: 'devolver', mult: 100, automatico: true } }] };
    const minhaFicha = { poderes: [], inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {}, iniciativa: 10, vida: stat(5000000), ...(escudos ? { escudos } : {}) };
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens: { Ana: ana }, dummies: {}, alvoSelecionado: 'pj:Ana',
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [],
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}
const ultimoFeed = () => enviarParaFeed.mock.calls[enviarParaFeed.mock.calls.length - 1][0];

beforeEach(() => {
    vi.clearAllMocks(); window.alert = vi.fn();
    calcularDano.mockReturnValue({ dano: 1000, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
});
afterEach(() => cleanup());

describe('Reflexo devolvido ao atacante com escudo', () => {
    it('escudo do atacante absorve parte e a sobra vai para a Vida', () => {
        montar([{ id: 'h', nome: 'Barreira', valor: 300, tipo: 'escudo' }]);
        act(() => { probe.rolarDano(); });
        expect(mockState.minhaFicha.escudos).toBeUndefined();
        expect(mockState.minhaFicha.vida.atual).toBe(5000000 - 700 * 1000);
        expect(ultimoFeed().textoPosGolpe.join(' ')).toContain('Heroi absorveu 300');
    });
    it('sem escudos: o dano devolvido vai inteiro para a Vida', () => {
        montar();
        act(() => { probe.rolarDano(); });
        expect(mockState.minhaFicha.vida.atual).toBe(5000000 - 1000 * 1000);
        expect('escudos' in mockState.minhaFicha).toBe(false);
    });
});
