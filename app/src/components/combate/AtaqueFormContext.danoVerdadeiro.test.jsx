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

function montar({ alvoSelecionado, personagens = {}, dummies = {}, filho = null }) {
    const minhaFicha = { poderes: [], inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {}, iniciativa: 10 };
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
const checkbox = () => screen.getByLabelText(/Dano Verdadeiro/);

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    calcularDano.mockReturnValue({ dano: 1000, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
});
afterEach(() => cleanup());

describe('Ataque > interruptor Dano Verdadeiro (UI)', () => {
    it('aparece desmarcado; marca e desmarca atualizando o contexto', () => {
        montar({ alvoSelecionado: null, filho: <AtaqueElementoSelector /> });
        expect(checkbox().checked).toBe(false);
        fireEvent.click(checkbox());
        expect(checkbox().checked).toBe(true);
        expect(probe.danoVerdadeiro).toBe(true);
        fireEvent.click(checkbox());
        expect(probe.danoVerdadeiro).toBe(false);
    });
    it('fora do provider o seletor nao quebra', () => {
        cleanup();
        expect(() => render(<AtaqueElementoSelector />)).not.toThrow();
    });
});

describe('Ataque > rolarDano em alvo-personagem', () => {
    it('sem o interruptor: Couraca 50% e Resistencia a Fogo reduzem', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() } });
        act(() => { probe.setElementoAtivo('Fogo'); });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBeLessThan(500);
        expect(ultimoFeed().danoAplicado).toBeGreaterThan(0);
    });
    it('com o interruptor: dano integral na Vida da Ana (1000)', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() } });
        act(() => { probe.setElementoAtivo('Fogo'); });
        act(() => { probe.setDanoVerdadeiro(true); });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(1000);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', VIDA - 1000 * FATOR);
    });
    it('com o interruptor atravessa Imunidade (Gelo imune = 0 sem a flag)', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() } });
        act(() => { probe.setElementoAtivo('Gelo'); });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(0);
        act(() => { probe.setDanoVerdadeiro(true); });
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(1000);
    });
    it('o interruptor zera depois do golpe (o segundo golpe volta a ser reduzido)', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() } });
        act(() => { probe.setDanoVerdadeiro(true); });
        act(() => { probe.rolarDano(); });
        expect(probe.danoVerdadeiro).toBe(false);
        act(() => { probe.rolarDano(); });
        expect(ultimoFeed().danoAplicado).toBe(500);
    });
    it('rolarDanoCustomizado tambem respeita e zera o interruptor', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: fichaAna() } });
        act(() => { probe.setDanoVerdadeiro(true); });
        act(() => { probe.rolarDanoCustomizado('1000'); });
        expect(ultimoFeed().danoAplicado).toBe(1000);
        expect(probe.danoVerdadeiro).toBe(false);
    });
});

describe('Ataque > Dummie (alvo sem ficha) e sem alvo', () => {
    const dummies = { g1: { nome: 'Goblin', hpAtual: 100 * FATOR, hpMax: 100 * FATOR, valorDefesa: 10 } };
    it('Dummie recebe o mesmo dano com ou sem o interruptor', () => {
        montar({ alvoSelecionado: 'g1', dummies });
        act(() => { probe.rolarDano(); });
        const sem = salvarDummie.mock.calls.at(-1)[1].hpAtual;
        vi.clearAllMocks();
        act(() => { probe.setDanoVerdadeiro(true); });
        act(() => { probe.rolarDano(); });
        expect(salvarDummie.mock.calls.at(-1)[1].hpAtual).toBe(sem);
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
    });
    it('sem alvo selecionado marcar o interruptor nao quebra o golpe', () => {
        montar({ alvoSelecionado: null });
        act(() => { probe.setDanoVerdadeiro(true); });
        expect(() => act(() => { probe.rolarDano(); })).not.toThrow();
    });
});
