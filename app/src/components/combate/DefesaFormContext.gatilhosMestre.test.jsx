import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';

// O Mestre aplicando dano na ficha de OUTRO jogador (FichaAlvoProvider) nao decide pelo dono: sem confirm, vale `armado`.
vi.mock('../../stores/useStore', async () => {
    const mod = { default: vi.fn(), sanitizarNome: (n) => String(n || '').replace(/[.#$[\]/]/g, '_') };
    return mod;
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFichaAlvoSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarCamposPersonagem: vi.fn(),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(), salvarFichaAlvoImediato: vi.fn(), salvarFirebaseImediato: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(), salvarDummie: vi.fn(),
}));
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularCA: vi.fn(() => 10) }));
vi.mock('../../core/disputaPoder', async (importOriginal) => ({ ...(await importOriginal()), getPoderParaDisputa: vi.fn(() => null) }));

const VIDA_BASE = 200000000;
const CINZAS = { id: 'vc0', nome: 'Cinzas 0%', modo: 'opcional', armado: true, perguntar: true, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'definirVida', percMax: 1 }] };
let probe;
function Harness() { probe = useDefesaForm(); return null; }
const fichaReal = () => ({
    vida: { base: VIDA_BASE, atual: VIDA_BASE, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' },
    mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 },
    sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
    ascensaoBase: 1, divisores: { vida: 0.0001 }, bio: {}, estetica: {}, labels: {}, statusPool: 0, afinidades: {}, inventario: [],
    poderes: [{ id: 'p1', nome: 'Volta', ativa: true, gatilhos: [CINZAS] }],
});
function montar({ mestreAbrindoOutro }) {
    const dono = fichaReal(); const minha = fichaReal();
    const state = {
        minhaFicha: mestreAbrindoOutro ? minha : dono, meuNome: mestreAbrindoOutro ? 'Mestre' : 'Fulano',
        personagens: { Fulano: dono }, dummies: {}, feedCombate: [], divisorPoderMesa: 1, cenario: { ativa: 'c1', zonas: [] },
        updateFicha: vi.fn((cb) => cb(state.minhaFicha)), updateFichaAlvo: vi.fn((n, cb) => cb(state.personagens[n])), setAbaAtiva: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<FichaAlvoProvider nome="Fulano"><DefesaFormProvider><Harness /></DefesaFormProvider></FichaAlvoProvider>);
    return dono;
}
function receber(dano) {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    act(() => { probe.sofrerDanoBruto(); });
}
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => false); });
afterEach(() => cleanup());

describe('Defesa - perguntar so no cliente do proprio dono', () => {
    it('Mestre aplicando na ficha de outro jogador: nao abre confirm e o gatilho armado dispara', () => {
        const dono = montar({ mestreAbrindoOutro: true });
        receber(999999999);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(dono.vida.atual).toBeGreaterThan(0);
    });
    it('o proprio dono recebe a pergunta (Nao: morre)', () => {
        const dono = montar({ mestreAbrindoOutro: false });
        receber(999999999);
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(dono.vida.atual).toBe(0);
    });
});
