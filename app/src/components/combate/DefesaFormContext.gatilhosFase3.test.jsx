import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, aplicarDanoDireto } from '../../services/firebase-sync';

// Fase 3 na Defesa > Receber Dano: modo opcional (armado / perguntar Sim-Nao), Volta das cinzas com 1d4 e "dano no atacante".
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
    salvarDummie: vi.fn(),
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
const CINZAS_0 = {
    id: 'vc0', nome: 'Cinzas 0%', modo: 'opcional', armado: true, evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' },
    acoes: [{ tipo: 'definirVida', percMax: 1 }, { tipo: 'rolarTabela', dado: '1d4', resultados: [
        { ate: 3, texto: 'cura', acoes: [{ tipo: 'curar', modo: 'percMax', valor: 50 }] },
        { ate: 4, texto: 'volta ao atacante', acoes: [{ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 100 }] },
    ] }],
};
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
const poderCom = (g) => [{ id: 'p1', nome: 'Volta', ativa: true, gatilhos: [g] }];
function montar(ficha, personagens = {}) {
    const state = {
        minhaFicha: ficha, meuNome: 'Eu', personagens, dummies: {}, feedCombate: [], divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(ficha)), setAbaAtiva: vi.fn(), cenario: { ativa: 'cena1', zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<DefesaFormProvider><Harness /></DefesaFormProvider>);
    return ficha;
}
function receber(dano, atacante) {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    if (atacante) act(() => { probe.setAtacanteInc(`p:${atacante}`); });
    act(() => { probe.sofrerDanoBruto(); });
}
const textosFeed = () => enviarParaFeed.mock.calls.map(c => c[0].texto).join(' || ');
let rngSpy;
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); rngSpy = vi.spyOn(Math, 'random').mockReturnValue(0.001); });
afterEach(() => { cleanup(); rngSpy.mockRestore(); });

describe('Defesa - gatilho opcional (Fase 3)', () => {
    it('armado dispara (sem perguntar): fica com 1% e rola a tabela', () => {
        const f = montar(fichaReal({ poderes: poderCom(CINZAS_0) }));
        receber(999999999);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(f.vida.atual).toBeGreaterThan(0);
        expect(textosFeed()).toContain('Cinzas 0% rolou 1 (d4): cura');
    });
    it('desarmado NAO dispara', () => {
        const f = montar(fichaReal({ poderes: poderCom({ ...CINZAS_0, armado: false }) }));
        receber(999999999);
        expect(f.vida.atual).toBe(0);
        expect(textosFeed()).not.toContain('rolou');
    });
    it('perguntar + Sim: dispara', () => {
        const f = montar(fichaReal({ poderes: poderCom({ ...CINZAS_0, perguntar: true }) }));
        receber(999999999);
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(window.confirm.mock.calls[0][0]).toContain('Usar Cinzas 0%');
        expect(f.vida.atual).toBeGreaterThan(0);
    });
    it('perguntar + Nao: nao dispara e NAO gasta o uso (o proximo golpe ainda pergunta)', () => {
        const f = montar(fichaReal({ poderes: poderCom({ ...CINZAS_0, perguntar: true }) }));
        window.confirm = vi.fn(() => false);
        receber(999999999);
        expect(f.vida.atual).toBe(0);
        expect(f.combate?.usosPoderes).toBeUndefined();
        f.vida.atual = 500 * FATOR;
        window.confirm = vi.fn(() => true);
        receber(999999999);
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(f.vida.atual).toBeGreaterThan(0);
    });
    it('golpe que nao zera a Vida nao pergunta nada', () => {
        montar(fichaReal({ poderes: poderCom({ ...CINZAS_0, perguntar: true }) }));
        receber(1000);
        expect(window.confirm).not.toHaveBeenCalled();
    });
    it('God Mode: nao pergunta e nada dispara', () => {
        const f = montar(fichaReal({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } }, poderes: poderCom({ ...CINZAS_0, perguntar: true }) }));
        receber(999999999);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(f.vida.atual).toBe(VIDA_BASE);
    });
});

describe('Defesa - dano no atacante (Fase 3)', () => {
    it('1d4 = 4: o dano volta ao atacante-personagem pelo ponto unico de dano dele', () => {
        rngSpy.mockReturnValue(0.99);
        const vilao = fichaReal();
        const f = montar(fichaReal({ poderes: poderCom(CINZAS_0) }), { Vilao: vilao });
        receber(999999999, 'Vilao');
        expect(f.vida.atual).toBeGreaterThan(0);
        expect(textosFeed()).toContain('Cinzas 0% rolou 4 (d4): volta ao atacante');
        expect(aplicarDanoDireto).toHaveBeenCalled();
        expect(aplicarDanoDireto.mock.calls.at(-1)[0]).toBe('Vilao');
        expect(aplicarDanoDireto.mock.calls.at(-1)[1]).toBeLessThan(VIDA_BASE);
    });
    it('sem atacante conhecido: avisa que ignorou e nao mexe em ninguem', () => {
        rngSpy.mockReturnValue(0.99);
        montar(fichaReal({ poderes: poderCom(CINZAS_0) }));
        receber(999999999);
        expect(textosFeed()).toContain('dano no atacante ignorado');
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
    });
    it('God Mode do atacante zera o dano devolvido', () => {
        rngSpy.mockReturnValue(0.99);
        const vilao = fichaReal({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } });
        montar(fichaReal({ poderes: poderCom(CINZAS_0) }), { Vilao: vilao });
        receber(999999999, 'Vilao');
        expect(textosFeed()).toContain('Imunidade total');
        expect(aplicarDanoDireto.mock.calls.filter(c => c[0] === 'Vilao').every(c => c[1] === VIDA_BASE)).toBe(true);
    });
});
