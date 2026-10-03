import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// Regressão (lote 2): o dano em área achava o dummie por NOME (NPCs repetidos, ex.: dois "Goblin",
// só o primeiro apanhava). Agora usa alvosArea[].dummieId; entradas antigas (sem dummieId) ainda
// caem no lookup por nome, mas um dummieId que já não existe é ignorado (sem fallback por nome).

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));

let mockState;
let probe;
function Harness() { probe = useAtaqueForm(); return null; }

function montar({ dummies = {}, alvosArea, alvoSelecionado = null }) {
    const minhaFicha = { poderes: [], inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {} };
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque',
        feedCombate: [
            { tipo: 'acerto', nome: 'Outro', alvosArea: [{ nome: 'Goblin', acertou: true, dummieId: 'g1' }] },
            { tipo: 'acerto', nome: 'Heroi', alvosArea },
        ],
        alvoSelecionado, dummies,
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(),
        cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}

// hp em unidades EXIBIDAS; hpAtual do dummy fica na escala bruta (x1000).
const FATOR = 1000;
const goblin = (hp) => ({ nome: 'Goblin', hpAtual: hp * FATOR, valorDefesa: 10 });

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    calcularDano.mockReturnValue({ dano: 30, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
});
afterEach(() => cleanup());

describe('AtaqueFormContext.rolarDano - dano em área por dummieId', () => {
    it('dois dummies de mesmo nome (g1, g2) acertados: AMBOS recebem salvarDummie com hpAtual reduzido', () => {
        montar({
            dummies: { g1: goblin(100), g2: goblin(80) },
            alvosArea: [
                { nome: 'Goblin', acertou: true, dummieId: 'g1' },
                { nome: 'Goblin', acertou: true, dummieId: 'g2' },
            ],
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledTimes(2);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 70 * FATOR }));
        expect(salvarDummie).toHaveBeenCalledWith('g2', expect.objectContaining({ hpAtual: 50 * FATOR }));
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });

    it('hpAtual nunca fica negativo (piso 0)', () => {
        montar({
            dummies: { g1: goblin(10), g2: goblin(0) },
            alvosArea: [
                { nome: 'Goblin', acertou: true, dummieId: 'g1' },
                { nome: 'Goblin', acertou: true, dummieId: 'g2' },
            ],
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 0 }));
        expect(salvarDummie).toHaveBeenCalledWith('g2', expect.objectContaining({ hpAtual: 0 }));
    });

    it('apenas o dummie acertado é ferido (acertou:false é ignorado)', () => {
        montar({
            dummies: { g1: goblin(100), g2: goblin(100) },
            alvosArea: [
                { nome: 'Goblin', acertou: true, dummieId: 'g1' },
                { nome: 'Goblin', acertou: false, dummieId: 'g2' },
            ],
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 70 * FATOR }));
    });

    it('dummieId que não existe mais é PULADO e não cai no lookup por nome', () => {
        montar({
            dummies: { g2: goblin(80) }, // g1 foi removido; g2 tem o mesmo nome
            alvosArea: [{ nome: 'Goblin', acertou: true, dummieId: 'g1' }],
        });
        expect(() => act(() => { probe.rolarDano(); })).not.toThrow();
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });

    it('dummieId removido + outro válido: só o válido é salvo', () => {
        montar({
            dummies: { g2: goblin(80) },
            alvosArea: [
                { nome: 'Goblin', acertou: true, dummieId: 'g1' },
                { nome: 'Goblin', acertou: true, dummieId: 'g2' },
            ],
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        expect(salvarDummie).toHaveBeenCalledWith('g2', expect.objectContaining({ hpAtual: 50 * FATOR }));
    });

    it('entrada antiga SEM dummieId usa o lookup por nome (primeiro dummie com o nome)', () => {
        montar({
            dummies: { g1: goblin(100), orc: { nome: 'Orc', hpAtual: 60 } },
            alvosArea: [{ nome: 'Goblin', acertou: true }],
        });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).toHaveBeenCalledTimes(1);
        expect(salvarDummie).toHaveBeenCalledWith('g1', expect.objectContaining({ hpAtual: 70 * FATOR }));
    });

    it('entrada antiga sem dummieId cujo nome não existe não lança nem salva', () => {
        montar({ dummies: { g1: goblin(100) }, alvosArea: [{ nome: 'Fantasma', acertou: true }] });
        expect(() => act(() => { probe.rolarDano(); })).not.toThrow();
        expect(salvarDummie).not.toHaveBeenCalled();
    });

    it('alvo aliado (sem dummieId e sem dummie com o nome) é ignorado', () => {
        montar({ dummies: { g1: goblin(100) }, alvosArea: [{ nome: 'Aliado', acertou: true }] });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie).not.toHaveBeenCalled();
    });
});
