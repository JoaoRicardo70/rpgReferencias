import React from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import { DefesaSofrerDanoBox } from './DefesaSubComponents';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA - Dano Verdadeiro na Defesa > Receber Dano: o interruptor ignora Reducoes, Resistencias, Imunidades e Dominio,
// vale so para o proximo dano recebido (zera depois) e nao muda o dano normal.

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
}));
vi.mock('../../core/engine', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, calcularCA: vi.fn(() => 10) };
});
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn(() => null) };
});

const FATOR = 1000;
const VIDA_BASE = 200000000;
let probe;
function Harness() { probe = useDefesaForm(); return null; }

function fichaReal(extra = {}) {
    return {
        vida: { base: VIDA_BASE, atual: VIDA_BASE, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' },
        mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: { vida: 0.0001 }, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        afinidades: {}, inventario: [], poderes: [],
        ...extra,
    };
}

function montar({ ficha = fichaReal(), filho = <DefesaSofrerDanoBox /> } = {}) {
    const state = {
        minhaFicha: ficha, meuNome: 'Eu', personagens: {}, dummies: {}, feedCombate: [], divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(ficha)), setAbaAtiva: vi.fn(), cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<DefesaFormProvider><Harness />{filho}</DefesaFormProvider>);
    return ficha;
}

const checkbox = () => screen.getByLabelText(/Dano Verdadeiro/);
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];
function receber(dano, elemento) {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    if (elemento) act(() => { probe.setElementoInc(elemento); });
    act(() => { probe.sofrerDanoBruto(); });
}

const GERAL50 = { id: 'a', nome: 'Armadura', percentual: 50, elemento: 'todos' };
const blindada = () => fichaReal({
    reducoesDano: [GERAL50],
    afinidades: { resistencias: ['fogo'], imunidades: ['gelo'] },
    poderes: [{ id: 'p', nome: 'Barreira', ativa: true, efeitos: [{ atributo: 'reducao_dano', propriedade: 'base', valor: 20, nome: 'Barreira' }] }],
});

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('Defesa > interruptor Dano Verdadeiro (UI)', () => {
    it('aparece desmarcado por padrao', () => {
        montar();
        expect(checkbox().checked).toBe(false);
        expect(probe.danoVerdadeiro).toBe(false);
    });
    it('marca e desmarca, refletindo no contexto', () => {
        montar();
        fireEvent.click(checkbox());
        expect(checkbox().checked).toBe(true);
        expect(probe.danoVerdadeiro).toBe(true);
        fireEvent.click(checkbox());
        expect(checkbox().checked).toBe(false);
        expect(probe.danoVerdadeiro).toBe(false);
    });
    it('fora do provider o componente nao quebra', () => {
        cleanup();
        expect(() => render(<DefesaSofrerDanoBox />)).not.toThrow();
    });
});

describe('Defesa > sofrerDanoBruto com Dano Verdadeiro', () => {
    it('ignora reducao da lista, reducao_dano de poder e Resistencia: dano integral', () => {
        const ficha = montar({ ficha: blindada() });
        act(() => { probe.setDanoVerdadeiro(true); });
        receber(100, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 100 * FATOR);
        const texto = ultimoFeed().texto;
        expect(texto).toContain('Recebeu 100 de dano');
        expect(texto).toMatch(/Dano Verdadeiro/);
        expect(texto).not.toContain('Armadura');
    });
    it('ignora Imunidade (100%): o dano de Gelo entra inteiro', () => {
        const ficha = montar({ ficha: blindada() });
        act(() => { probe.setDanoVerdadeiro(true); });
        receber(100, 'gelo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 100 * FATOR);
    });
    it('ignora Vulnerabilidade tambem (nao multiplica)', () => {
        const ficha = montar({ ficha: fichaReal({ afinidades: { vulnerabilidades: ['fogo'] } }) });
        const normal = (() => { receber(100, 'fogo'); return VIDA_BASE - ficha.vida.atual; })();
        expect(normal).toBeGreaterThan(100 * FATOR);
        ficha.vida.atual = VIDA_BASE;
        act(() => { probe.setDanoVerdadeiro(true); });
        receber(100, 'fogo');
        expect(VIDA_BASE - ficha.vida.atual).toBe(100 * FATOR);
    });
    it('ignora o Dominio do elemento', () => {
        const ficha = montar({ ficha: fichaReal({ dominios: { Fogo: { nivel: 10 } } }) });
        act(() => { probe.setDanoVerdadeiro(true); });
        receber(100, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 100 * FATOR);
    });
    it('sem o interruptor o dano segue reduzido (50% + 20% sequencial = 40; Resistencia de Fogo 50% = 20)', () => {
        const ficha = montar({ ficha: blindada() });
        receber(100, 'fogo');
        expect(ficha.vida.atual).toBeGreaterThan(VIDA_BASE - 100 * FATOR);
        expect(ficha.vida.atual).toBeLessThan(VIDA_BASE);
        expect(ultimoFeed().texto).not.toMatch(/Dano Verdadeiro/);
    });
    it('dano normal fica igual com a flag nunca tocada e depois de marcar e desmarcar', () => {
        const a = montar({ ficha: blindada() });
        receber(100, 'fogo');
        const sem = VIDA_BASE - a.vida.atual;
        cleanup();
        vi.clearAllMocks();
        const b = montar({ ficha: blindada() });
        act(() => { probe.setDanoVerdadeiro(true); });
        act(() => { probe.setDanoVerdadeiro(false); });
        receber(100, 'fogo');
        expect(VIDA_BASE - b.vida.atual).toBe(sem);
    });
    it('reset: depois de um dano recebido o interruptor volta a desmarcado e o 2o dano e reduzido', () => {
        const ficha = montar({ ficha: blindada() });
        fireEvent.click(checkbox());
        receber(100, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 100 * FATOR);
        expect(probe.danoVerdadeiro).toBe(false);
        expect(checkbox().checked).toBe(false);
        const antes = ficha.vida.atual;
        receber(100, 'fogo');
        expect(antes - ficha.vida.atual).toBeLessThan(100 * FATOR);
    });
    it('dano invalido (0) nao consome o interruptor', () => {
        montar({ ficha: blindada() });
        fireEvent.click(checkbox());
        act(() => { probe.setDanoRecebidoInc('0'); });
        act(() => { probe.sofrerDanoBruto(); });
        expect(window.alert).toHaveBeenCalled();
        expect(probe.danoVerdadeiro).toBe(true);
    });
    it('fluxo pela UI: marcar, digitar e clicar em SUBTRAIR HP aplica dano integral', () => {
        const ficha = montar({ ficha: blindada() });
        fireEvent.click(checkbox());
        fireEvent.change(screen.getByPlaceholderText(/Valor do Dano Bruto/), { target: { value: '60' } });
        fireEvent.click(screen.getAllByRole('button').find(b => /SUBTRAIR HP/.test(b.textContent)));
        expect(ficha.vida.atual).toBe(VIDA_BASE - 60 * FATOR);
    });
    it('a string "verdadeiro" NAO e Dano Verdadeiro: so o interruptor (boolean) vale; o dano segue reduzido', () => {
        const ficha = montar({ ficha: blindada() });
        receber(100, 'verdadeiro');
        expect(VIDA_BASE - ficha.vida.atual).toBeLessThan(100 * FATOR);
    });
});
