import React from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import { AtaqueElementoSelector } from './AtaqueSubComponents';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed, aplicarDanoDireto } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// QA - Dano Verdadeiro no Ataque: o interruptor da infusao elemental e passado ao calculo (reduzirDanoNoAlvo),
// o alvo-personagem recebe o dano inteiro (ignora Reducao, Resistencia, Imunidade e Dominio), o Dummie nao muda e
// o interruptor zera depois do golpe.

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
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

let probe;
function Harness() { probe = useAtaqueForm(); return null; }

const FATOR = 1000;
const VIDA = 1000000;
const stat = (atual, base) => ({ atual, base, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
const fichaAna = (extra = {}) => ({
    vida: stat(VIDA, VIDA), iniciativa: 10,
    reducoesDano: [{ id: 'r1', nome: 'Couraca', percentual: 50, elemento: 'todos' }],
    afinidades: { imunidades: ['gelo'], resistencias: ['fogo'] },
    ...extra,
});

function montar({ alvoSelecionado, personagens = {}, dummies = {}, filho = null, poderes = [] }) {
    const minhaFicha = { poderes, inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {}, iniciativa: 10 };
    const state = {
        minhaFicha, meuNome: 'Heroi', personagens, dummies, alvoSelecionado,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [],
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<AtaqueFormProvider><Harness />{filho}</AtaqueFormProvider>);
}

const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    calcularDano.mockReturnValue({ dano: 1000, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
});
afterEach(() => cleanup());

describe('Ataque > Poder marcado com danoVerdadeiro', () => {
    const poderVerd = { id: 'p1', nome: 'Lamina Final', ativa: true, danoVerdadeiro: true };
    const poderComum = { id: 'p2', nome: 'Golpe Comum', ativa: true };

    it('poder ativo marcado atravessa Imunidade SEM ligar o interruptor e avisa no feed', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() }, poderes: [poderVerd] });
        act(() => { probe.setElementoAtivo('Gelo'); });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(1000);
        expect(ultimoFeed().textoReducao).toMatch(/Dano Verdadeiro \(do poder Lamina Final\)/);
    });
    it('poder ativo SEM a marca continua sendo reduzido (regressao)', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() }, poderes: [poderComum] });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(500);
        expect(ultimoFeed().textoReducao || '').not.toMatch(/do poder/);
    });
    it('poder marcado mas DESLIGADO nao vale', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() }, poderes: [{ ...poderVerd, ativa: false }] });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(500);
    });
    it('o interruptor manual continua funcionando junto com um poder comum', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() }, poderes: [poderComum] });
        act(() => { probe.setDanoVerdadeiro(true); });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(1000);
    });
});
