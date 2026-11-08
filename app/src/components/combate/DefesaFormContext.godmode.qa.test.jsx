import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';

// QA - Defesa: evento por clique (eventoId unico) e God Mode (Imunidade total) ignorando Reflexo, estados do golpe, escudo; reacoes.

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularCA: vi.fn(() => 10) }));
vi.mock('../../core/disputaPoder', async (importOriginal) => ({ ...(await importOriginal()), getPoderParaDisputa: vi.fn(() => null) }));

const F = 1000;
const VIDA_BASE = 200000000;
const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const GOD = () => ({ turnosRestantes: 1, origem: 'Teste' });
const REFLEXO = { id: 'r1', nome: 'Espelho', ativa: true, reflexo: { modo: 'devolver', mult: 100, energia: 'mana', custoPercentual: 10 } };
const GOLPE = { tipo: 'dano', nome: 'Vilao', ts: 111, estadosGolpe: [{ id: 'sangrando', stacks: 2 }] };

function fichaReal(extra = {}) {
    return {
        vida: { base: VIDA_BASE, atual: VIDA_BASE, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' },
        mana: { base: 1000000, atual: 1000000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: { vida: 0.0001 }, bio: {}, estetica: {}, labels: {}, statusPool: 0, afinidades: {}, inventario: [], poderes: [],
        ...extra,
    };
}
let probe;
function montar(ficha, { feed = [], personagens = {} } = {}) {
    const Harness = () => { probe = useDefesaForm(); return null; };
    const state = { minhaFicha: ficha, meuNome: 'Eu', personagens, dummies: {}, feedCombate: feed, divisorPoderMesa: 1, updateFicha: vi.fn((cb) => cb(ficha)), setAbaAtiva: vi.fn(), cenario: { ativa: 'cena1', zonas: [] } };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<DefesaFormProvider><Harness /></DefesaFormProvider>);
    return ficha;
}
function receber(dano, { reflexo = '', verdadeiro = false, atacante } = {}) {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    if (atacante) act(() => { probe.setAtacanteInc(atacante); });
    if (reflexo) act(() => { probe.setReflexoEscolhido(reflexo); });
    act(() => { probe.setDanoVerdadeiro(verdadeiro); });
    act(() => { probe.sofrerDanoBruto(); });
}
const feed = () => fb.enviarParaFeed.mock.calls.map(c => c[0]);
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); });
afterEach(() => cleanup());

describe('Defesa - evento por clique', () => {
    const feedGolpe = [GOLPE];
    it('Negar morte SEM limite segura os dois cliques seguidos, mesmo com o mesmo golpe no feed', () => {
        const f = montar(fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [NEGAR] }] }), { feed: feedGolpe, personagens: { Vilao: fichaReal() } });
        receber(999999);
        expect(f.vida.atual).toBe(1 * F);
        f.vida.atual = 100 * F;
        receber(999999);
        expect(f.vida.atual).toBe(1 * F);
        const ids = Object.values(f.combate.gatilhos).map(g => g.ultimoEvento);
        expect(ids[0]).toMatch(/^ev_/);
    });
    it('os dois cliques geram ids diferentes (o segundo sobrescreve o registro)', () => {
        const f = montar(fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [NEGAR] }] }), { feed: feedGolpe, personagens: { Vilao: fichaReal() } });
        receber(999999);
        const a = f.combate.gatilhos['p:nm'].ultimoEvento;
        f.vida.atual = 100 * F;
        receber(999999);
        expect(f.combate.gatilhos['p:nm'].ultimoEvento).not.toBe(a);
    });
    it('com limite 1 por cena so o primeiro clique segura', () => {
        const f = montar(fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [{ ...NEGAR, limite: { max: 1, por: 'cena' } }] }] }), { feed: feedGolpe, personagens: { Vilao: fichaReal() } });
        receber(999999);
        expect(f.vida.atual).toBe(1 * F);
        f.vida.atual = 100 * F;
        receber(999999);
        expect(f.vida.atual).toBe(0);
    });
});

describe('Defesa - God Mode ignora tudo', () => {
    const montarGod = (extra = {}) => montar(fichaReal({
        combate: { imunidadeTotal: GOD() },
        escudos: [{ id: 'a', nome: 'Domo', valor: 100, tipo: 'escudo' }],
        poderes: [REFLEXO],
        ...extra,
    }), { feed: [GOLPE], personagens: { Vilao: fichaReal() } });

    it('com Reflexo escolhido: Vida, escudo e mana intactos; Reflexo nao roda e nada volta ao atacante; estados do golpe nao entram', () => {
        const f = montarGod();
        receber(5000, { reflexo: 'poder:r1', atacante: 'p:Vilao' });
        expect(f.vida.atual).toBe(VIDA_BASE);
        expect(f.escudos[0].valor).toBe(100);
        expect(f.mana.atual).toBe(1000000);
        expect(f.condicoes).toBeUndefined();
        expect((f.combate || {}).estadosDoGolpeTs).toBeUndefined();
        expect(fb.aplicarDanoDireto).not.toHaveBeenCalled();
        const t = feed().at(-1).texto;
        expect(t).toContain('Imunidade total');
        expect(t).not.toContain('Reflexo');
    });
    it('Dano Verdadeiro tambem e anulado', () => {
        const f = montarGod({ poderes: [] });
        receber(5000, { verdadeiro: true });
        expect(f.vida.atual).toBe(VIDA_BASE);
        expect(feed().at(-1).texto).toContain('Dano Verdadeiro');
        expect(feed().at(-1).texto).toContain('Imunidade total');
    });
    it('reacoes pendentes (reduzir dano) AINDA rodam: o texto mostra a reducao e a reacao e consumida, embora nao tenha havido dano', () => {
        const f = montarGod({ poderes: [], combate: { imunidadeTotal: GOD(), reacoesPendentes: [{ efeito: 'reduzir_dano', valor: 50, nome: 'Guarda', criadoEm: Date.now() }] } });
        receber(5000);
        expect(f.vida.atual).toBe(VIDA_BASE);
        expect(feed().at(-1).texto).toContain('Guarda');
        expect(f.combate.reacoesPendentes).toEqual([]);
    });
    it('NOTA: "atacar o ataque" sem dano rolado pede confirmacao mesmo em God Mode (e nao recebe se recusar)', () => {
        const f = montarGod({ poderes: [], combate: { imunidadeTotal: GOD(), reacoesPendentes: [{ efeito: 'atacar_ataque', nome: 'Contra', criadoEm: Date.now() }] } });
        window.confirm = vi.fn(() => false);
        receber(5000);
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(fb.enviarParaFeed).not.toHaveBeenCalled();
        expect(f.vida.atual).toBe(VIDA_BASE);
    });
    it('God Mode expirado (0 turnos) volta a sofrer: Reflexo cobra mana e devolve ao atacante, estados nao entram (Reflexo devolveu tudo)', () => {
        const f = montarGod({ combate: { imunidadeTotal: { turnosRestantes: 0, origem: 'x' } } });
        receber(5000, { reflexo: 'poder:r1', atacante: 'p:Vilao' });
        expect(f.mana.atual).toBeLessThan(1000000);
        expect(f.escudos[0].valor).toBe(100); // o Reflexo devolveu tudo, entao nada chegou ao escudo
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Vilao', expect.any(Number));
        expect(f.condicoes).toBeUndefined(); // regra antiga: Reflexo que devolve tudo tambem nao deixa os estados entrarem
        expect(feed().at(-1).texto).not.toContain('Imunidade total');
    });
    it('God Mode expirado sem Reflexo: dano consome escudo e os estados do golpe entram', () => {
        const f = montarGod({ poderes: [], combate: { imunidadeTotal: { turnosRestantes: 0, origem: 'x' } } });
        receber(5000);
        expect(f.escudos).toBeUndefined();
        expect(f.vida.atual).toBe(VIDA_BASE - 4900 * F);
        expect(f.condicoes.length).toBeGreaterThan(0);
    });
});
