import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import { getTetoExibidoComFator, danoExibidoParaBruto } from '../../core/vitals';
import { getVidaMaxBrutaNpc } from '../../core/gavetaNpc';

// Cura passiva de ENERGIAS no avanco de turno (aplicarCuraPassivaDeEnergias): % do teto por turno.
// Mesmo cenario de MapaFormContext.inicioTurnoSuporte.test.jsx.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn()
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

const energia = (extra = {}) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 0, regeneracao: 0, ...extra });
const passivoEnergia = (energias, extra = {}) => ({ nome: 'Fonte de Mana', ativa: true, suporte: { modo: 'passivo', cura: { energias } }, ...extra });

function ficha(overrides = {}) {
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: energia({ atual: 1 }),
        mana: energia(),
        aura: energia(),
        poderes: [],
        inventario: [],
        passivas: [],
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5 },
        ...overrides
    };
}

function estado(minha, extra = {}) {
    minha.iniciativa = 10;
    return {
        minhaFicha: minha,
        meuNome: 'Heroi',
        personagens: {},
        updateFicha: vi.fn((cb) => cb(minha)),
        feedCombate: [],
        isMestre: false,
        mesaCriador: '',
        dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...extra
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) {
    mockUseStore(state);
    probe = undefined;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}
const passarTurno = () => act(() => { probe.avancarTurno(); });
const textosFeed = () => firebaseSync.enviarParaFeed.mock.calls.map(c => c[0].texto);

describe('MapaFormContext: cura passiva de energias no inicio do turno', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(Math, 'random').mockReturnValue(0);
    });
    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    it('mana recupera X% do teto por turno e o Feed cita a energia e a fonte', () => {
        const f = ficha({ poderes: [passivoEnergia({ mana: 10 })] });
        const teto = getTetoExibidoComFator('mana', f);
        expect(teto).toBeGreaterThan(0);
        f.mana.atual = teto / 2;
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBeCloseTo(teto / 2 + teto * 0.10, 5);
        const t = textosFeed().find(x => x.includes('se cura (passivo)'));
        expect(t).toBeTruthy();
        expect(t).toContain('mana +');
        expect(t).toContain('Fonte de Mana');
    });

    it('energia sem fonte passiva nao muda (aura intacta)', () => {
        const f = ficha({ poderes: [passivoEnergia({ mana: 10 })] });
        f.aura.atual = 5;
        f.mana.atual = 0;
        montar(estado(f));
        passarTurno();
        expect(f.aura.atual).toBe(5);
        expect(f.mana.atual).toBeGreaterThan(0);
    });

    it('nao passa do teto', () => {
        const f = ficha({ poderes: [passivoEnergia({ mana: 50 })] });
        const teto = getTetoExibidoComFator('mana', f);
        f.mana.atual = teto * 0.9;
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBe(teto);
    });

    it('nunca baixa energia que ja esta acima do teto e nao avisa', () => {
        const f = ficha({ poderes: [passivoEnergia({ mana: 10 })] });
        const teto = getTetoExibidoComFator('mana', f);
        f.mana.atual = teto + 777;
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBe(teto + 777);
        expect(textosFeed().some(t => t.includes('mana +'))).toBe(false);
    });

    it('energia cheia (no teto) fica igual e sem aviso', () => {
        const f = ficha({ poderes: [passivoEnergia({ mana: 10 })] });
        const teto = getTetoExibidoComFator('mana', f);
        f.mana.atual = teto;
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBe(teto);
        expect(textosFeed().some(t => t.includes('se cura'))).toBe(false);
    });

    it('varias fontes e varias energias somam por energia', () => {
        const f = ficha({ poderes: [passivoEnergia({ mana: 5, aura: 10 }), passivoEnergia({ mana: 15 }, { nome: 'Outra' })] });
        const tm = getTetoExibidoComFator('mana', f);
        const ta = getTetoExibidoComFator('aura', f);
        f.mana.atual = 0; f.aura.atual = 0;
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBeCloseTo(tm * 0.20, 5);
        expect(f.aura.atual).toBeCloseTo(ta * 0.10, 5);
        const t = textosFeed().find(x => x.includes('se cura (passivo)'));
        expect(t).toContain('mana +');
        expect(t).toContain('aura +');
        expect(t).toContain('Outra');
    });

    it('Poder desligado ou suporte nao passivo nao cura energia', () => {
        const f1 = ficha({ poderes: [passivoEnergia({ mana: 10 }, { ativa: false })] });
        montar(estado(f1));
        passarTurno();
        expect(f1.mana.atual).toBe(0);
        cleanup(); vi.clearAllMocks();
        const f2 = ficha({ poderes: [{ nome: 'Uso', ativa: true, suporte: { cura: { energias: { mana: 10 } } } }] });
        montar(estado(f2));
        passarTurno();
        expect(f2.mana.atual).toBe(0);
    });

    it('porcentagem 0, negativa ou invalida nao faz nada nem quebra', () => {
        const f = ficha({ poderes: [passivoEnergia({ mana: 0, aura: -5, chakra: 'abc' })] });
        montar(estado(f));
        expect(() => passarTurno()).not.toThrow();
        expect(f.mana.atual).toBe(0);
        expect(f.aura.atual).toBe(0);
    });

    it('energia que a ficha nao possui (chakra ausente) e pulada sem quebrar', () => {
        const f = ficha({ poderes: [passivoEnergia({ chakra: 10, mana: 10 })] });
        expect(f.chakra).toBeUndefined();
        montar(estado(f));
        expect(() => passarTurno()).not.toThrow();
        expect(f.mana.atual).toBeGreaterThan(0);
    });

    it('Sangrando corta a cura de VIDA mas NAO a de energia', () => {
        const f = ficha({
            poderes: [
                { nome: 'Aura Vital', ativa: true, suporte: { modo: 'passivo', cura: { fixo: 1000 } } },
                passivoEnergia({ mana: 10 })
            ],
            condicoes: [{ id: 'sangrando', stacks: 1 }]
        });
        const inicioVida = Math.floor(getVidaMaxBrutaNpc(f) / 2);
        f.vida.atual = inicioVida;
        const teto = getTetoExibidoComFator('mana', f);
        f.mana.atual = 0;
        montar(estado(f));
        passarTurno();
        // Vida: 1000 * 0,5 = 500 de cura, menos 5 do dano do estado (dados em 1)
        expect(f.vida.atual).toBe(inicioVida + danoExibidoParaBruto(500) - danoExibidoParaBruto(5));
        // Mana: 10% cheios, sem corte
        expect(f.mana.atual).toBeCloseTo(teto * 0.10, 5);
    });

    it('Sangrando sozinho (so energia, sem cura de Vida) nao reduz a energia', () => {
        const f = ficha({ poderes: [passivoEnergia({ mana: 10 })], condicoes: [{ id: 'sangrando', stacks: 3 }] });
        f.vida.atual = Math.floor(getVidaMaxBrutaNpc(f) / 2);
        const teto = getTetoExibidoComFator('mana', f);
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBeCloseTo(teto * 0.10, 5);
    });

    it('OUTRO jogador: os campos de energia vao por salvarCamposPersonagem e o Feed cita a energia', () => {
        const outro = ficha({ poderes: [passivoEnergia({ mana: 10 })] });
        outro.iniciativa = 10;
        const teto = getTetoExibidoComFator('mana', outro);
        outro.mana.atual = 0;
        const minha = ficha();
        const state = estado(minha, { personagens: { Vilao: outro }, dummies: {} });
        minha.iniciativa = 20;
        montar(state);
        passarTurno();
        expect(state.updateFicha).not.toHaveBeenCalled();
        const [nome, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Vilao');
        expect(campos['mana/atual']).toBeCloseTo(teto * 0.10, 5);
        expect(campos['aura/atual']).toBe(0);
        // a ficha original do outro jogador nao foi mutada (trabalha num rascunho)
        expect(outro.mana.atual).toBe(0);
        const t = textosFeed().find(x => x.includes('Vilao se cura (passivo)'));
        expect(t).toContain('mana +');
    });

    it('dummie (NPC) nao recebe cura passiva de energia', () => {
        const minha = ficha();
        minha.iniciativa = 20;
        const state = estado(minha, { isMestre: true, dummies: { gob: { nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 }, poderes: [passivoEnergia({ mana: 10 })], mana: energia(), vida: energia({ atual: 1 }) } } });
        montar(state);
        passarTurno();
        expect(textosFeed().some(t => t.includes('se cura'))).toBe(false);
    });
});
