import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// QA - o Dano enviado ao feed leva ts, tipoAtaque e energiasUsadas (base da Identificacao do ataque).
vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));

let mockState; let probe; let ficha;
function Harness() { probe = useAtaqueForm(); return null; }
const acoes = { padrao: { max: 2, atual: 2, extra: 0 }, bonus: { max: 2, atual: 2, extra: 0 }, reacao: { max: 2, atual: 2, extra: 0 } };

function montar() {
    ficha = {
        poderes: [], inventario: [], passivas: [], hierarquia: {}, combate: {}, ataquesElementais: [],
        ataqueConfig: { armaStatusUsados: ['destreza'], armaEnergiaCombustao: 'vida', armaPercEnergia: 7 },
        acoes: JSON.parse(JSON.stringify(acoes)), vida: { atual: 100, max: 100 }, mana: { atual: 100, max: 100 },
    };
    mockState = {
        minhaFicha: ficha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(ficha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [], alvoSelecionado: null, dummies: {},
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] }, adicionarAviso: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<AtaqueFormProvider><Harness /></AtaqueFormProvider>);
}
const base = { dano: 50, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' };
const feedEnviado = () => enviarParaFeed.mock.calls.map(c => c[0]).find(f => f.tipo === 'dano');

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); });
afterEach(() => cleanup());

describe('rolarDano grava identificacao no feed', () => {
    it('golpe fisico sem energia: Físico, [] e ts recente', () => {
        calcularDano.mockReturnValue({ ...base });
        montar();
        const antes = Date.now();
        act(() => { probe.rolarDano(); });
        const f = feedEnviado();
        expect(f.tipoAtaque).toBe('Físico');
        expect(f.energiasUsadas).toEqual([]);
        expect(f.ts).toBeGreaterThanOrEqual(antes);
        expect(f.ts).toBeLessThanOrEqual(Date.now());
    });

    it('drenos e custosPoder viram Energetico com energias sem repetir', () => {
        calcularDano.mockReturnValue({ ...base, drenos: [{ key: 'mana', valor: 10 }, { key: 'vida', valor: 0 }], custosPoder: [{ energia: 'mana', bruto: 3 }, { energia: 'aura', bruto: 2 }] });
        montar();
        act(() => { probe.rolarDano(); });
        const f = feedEnviado();
        expect(f.tipoAtaque).toBe('Energético');
        expect(f.energiasUsadas).toEqual(['mana', 'aura']);
    });

    it('elemento ativo vira Elemental (Elemento)', () => {
        calcularDano.mockReturnValue({ ...base, drenos: [{ key: 'mana', valor: 5 }] });
        montar();
        act(() => { probe.setElementoAtivo('Fogo'); });
        act(() => { probe.rolarDano(); });
        const f = feedEnviado();
        expect(f.tipoAtaque).toBe('Elemental (Fogo)');
        expect(f.energiasUsadas).toEqual(['mana']);
    });
});

describe('rolarDanoCustomizado grava identificacao no feed', () => {
    it('formula livre sem energia: Físico', () => {
        montar();
        act(() => { probe.rolarDanoCustomizado('100', 0, 'nenhum', 0); });
        const f = feedEnviado();
        expect(f.tipoAtaque).toBe('Físico');
        expect(f.energiasUsadas).toEqual([]);
        expect(Number.isFinite(f.ts)).toBe(true);
    });

    it('formula livre gastando mana: Energetico com ["mana"]', () => {
        montar();
        act(() => { probe.rolarDanoCustomizado('100', 0, 'mana', 10); });
        const f = feedEnviado();
        expect(f.tipoAtaque).toBe('Energético');
        expect(f.energiasUsadas).toEqual(['mana']);
    });

    it('energia com percentual 0 nao conta', () => {
        montar();
        act(() => { probe.rolarDanoCustomizado('100', 0, 'mana', 0); });
        const f = feedEnviado();
        expect(f.energiasUsadas).toEqual([]);
        expect(f.tipoAtaque).toBe('Físico');
    });
});
