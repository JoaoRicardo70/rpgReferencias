import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// QA - sofrerDanoBruto aplica as Reacoes pendentes (atacar_ataque, reduzir_dano), ignora vencidas e limpa a lista.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn() }));
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
function montar(ficha) {
    const state = {
        minhaFicha: ficha, meuNome: 'Eu', personagens: {}, dummies: {}, feedCombate: [], divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(ficha)), setAbaAtiva: vi.fn(), cenario: { zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<DefesaFormProvider><Harness /></DefesaFormProvider>);
    return ficha;
}
function receber(dano) {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    act(() => { probe.sofrerDanoBruto(); });
}
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];
const atacar = (danoReacao, over = {}) => ({ id: 'universal', nome: 'Atacar o ataque', efeito: 'atacar_ataque', valor: 0, criadoEm: Date.now(), ...(danoReacao === undefined ? {} : { danoReacao }), ...over });
const reduzir = (valor, over = {}) => ({ id: 'poder:3', nome: 'Assassin', efeito: 'reduzir_dano', valor, criadoEm: Date.now(), ...over });
const comPend = (lista) => fichaReal({ combate: { reacoesPendentes: lista } });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); });
afterEach(() => cleanup());

describe('DefesaFormContext.sofrerDanoBruto - Reacoes', () => {
    it('atacar_ataque 100 de Dano contra 60 recebido: nao toma nada, limpa pendencias', () => {
        const ficha = montar(comPend([atacar(100)]));
        receber(60);
        expect(ficha.vida.atual).toBe(VIDA_BASE);
        expect(ultimoFeed().texto).toContain('Recebeu 0 de dano');
        expect(ficha.combate.reacoesPendentes).toEqual([]);
        expect(window.confirm).not.toHaveBeenCalled();
    });

    it('atacar_ataque 40 contra 60: toma so a diferenca (20), mostra o original e o detalhe', () => {
        const ficha = montar(comPend([atacar(40)]));
        receber(60);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 20 * FATOR);
        const t = ultimoFeed().texto;
        expect(t).toContain('Recebeu 20 de dano');
        expect(t).toContain('Original: 60');
        expect(t).toContain('↩️');
    });

    it('atacar_ataque 40 + reduzir_dano 50%: 60 -> 20 -> 10', () => {
        const ficha = montar(comPend([atacar(40), reduzir(50)]));
        receber(60);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 10 * FATOR);
    });

    it('reduzir_dano 50% sozinho: 60 -> 30', () => {
        const ficha = montar(comPend([reduzir(50)]));
        receber(60);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 30 * FATOR);
        expect(ficha.combate.reacoesPendentes).toEqual([]);
    });

    it('pendencia vencida e ignorada (dano integral) mas a lista e limpa', () => {
        const velha = reduzir(50, { criadoEm: Date.now() - 11 * 60 * 1000 });
        const ficha = montar(comPend([velha]));
        receber(60);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 60 * FATOR);
        expect(ultimoFeed().texto).not.toContain('↩️');
        expect(ficha.combate.reacoesPendentes).toEqual([]);
    });

    it('sem pendencias: nao pergunta e o dano e integral', () => {
        const ficha = montar(fichaReal());
        receber(60);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(ficha.vida.atual).toBe(VIDA_BASE - 60 * FATOR);
        expect(ficha.combate).toBeUndefined();
    });

    it('atacar_ataque sem danoReacao: pergunta; confirmar recebe o Dano inteiro (ignora a reacao) e limpa', () => {
        const ficha = montar(comPend([atacar(undefined)]));
        receber(60);
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(window.confirm.mock.calls[0][0]).toMatch(/Atacar o ataque/);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 60 * FATOR);
        expect(ficha.combate.reacoesPendentes).toEqual([]);
    });

    it('atacar_ataque sem danoReacao: cancelar NAO recebe dano e mantem as pendencias', () => {
        window.confirm = vi.fn(() => false);
        const ficha = montar(comPend([atacar(undefined)]));
        receber(60);
        expect(ficha.vida.atual).toBe(VIDA_BASE);
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(ficha.combate.reacoesPendentes).toHaveLength(1);
    });

    it('atacar_ataque sem Dano + reduzir_dano 50%: confirmar aplica so os 50% (60 -> 30)', () => {
        const ficha = montar(comPend([atacar(undefined), reduzir(50)]));
        receber(60);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 30 * FATOR);
    });

    it('dano invalido (0) alerta e nao mexe nas pendencias', () => {
        const ficha = montar(comPend([reduzir(50)]));
        act(() => { probe.setDanoRecebidoInc('0'); });
        act(() => { probe.sofrerDanoBruto(); });
        expect(window.alert).toHaveBeenCalled();
        expect(ficha.combate.reacoesPendentes).toHaveLength(1);
        expect(ficha.vida.atual).toBe(VIDA_BASE);
    });
});
