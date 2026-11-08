import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// Gatilhos (Negar morte) e Imunidade total na Defesa > Receber Dano.

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
const NEGAR_MORTE = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
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
        updateFicha: vi.fn((cb) => cb(ficha)), setAbaAtiva: vi.fn(), cenario: { ativa: 'cena1', zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<DefesaFormProvider><Harness /></DefesaFormProvider>);
    return ficha;
}
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];
function receber(dano) {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    act(() => { probe.sofrerDanoBruto(); });
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('Defesa - Receber Dano com gatilhos', () => {
    it('dano que zeraria com Negar morte fica em 1 de vida e o feed diz', () => {
        const f = montar(fichaReal({ poderes: [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos: [NEGAR_MORTE] }] }));
        receber(999999);
        expect(f.vida.atual).toBe(1 * FATOR);
        expect(ultimoFeed().texto).toContain('Negar morte segurou em 1 de vida');
        expect(f.combate.usosPoderes['p1:nm']).toEqual({ n: 1, cena: 'cena1' });
    });
    it('segundo golpe fatal na mesma cena (limite 1 por cena) mata', () => {
        const f = montar(fichaReal({ poderes: [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos: [NEGAR_MORTE] }] }));
        receber(999999);
        f.vida.atual = 500 * FATOR;
        receber(999999);
        expect(f.vida.atual).toBe(0);
    });
    it('Imunidade total: dano vira 0, escudo intacto e o feed avisa', () => {
        const f = montar(fichaReal({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } }, escudos: [{ id: 'a', nome: 'Domo', valor: 100, tipo: 'escudo' }] }));
        receber(5000);
        expect(f.vida.atual).toBe(VIDA_BASE);
        expect(f.escudos[0].valor).toBe(100);
        expect(ultimoFeed().texto).toContain('Imunidade total');
    });
    it('ficha antiga (sem gatilhos): igual a antes, sem chaves novas e sem selo no feed', () => {
        const f = montar(fichaReal());
        receber(1000);
        expect(f.vida.atual).toBe(VIDA_BASE - 1000 * FATOR);
        expect('combate' in f).toBe(false);
        expect(ultimoFeed().texto).not.toContain('🔔');
    });
});

describe('Defesa - revisao 2', () => {
    it('dois Receber dano seguidos que zerariam, Negar morte SEM limite: os dois seguram (id unico por clique)', () => {
        const semLimite = { ...NEGAR_MORTE, limite: undefined };
        const f = montar(fichaReal({ poderes: [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos: [semLimite] }] }));
        receber(999999);
        expect(f.vida.atual).toBe(1 * FATOR);
        f.vida.atual = 500 * FATOR;
        receber(999999);
        expect(f.vida.atual).toBe(1 * FATOR);
        expect(ultimoFeed().texto).toContain('Negar morte segurou em 1 de vida');
    });
    it('God Mode: o texto avisa e a Vida nao muda mesmo com Reflexo escolhido', () => {
        const f = montar(fichaReal({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } }));
        receber(5000);
        expect(f.vida.atual).toBe(VIDA_BASE);
        expect(ultimoFeed().texto).toContain('Imunidade total');
    });
});
