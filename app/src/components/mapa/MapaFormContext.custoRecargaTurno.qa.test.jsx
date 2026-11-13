import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as firebaseSync from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS, getTetoExibidoComFator } from '../../core/vitals';

// QA (endurecimento) - inicio de turno no Mapa: varios poderes/energias, percMax, saldo exato, dummies, outro jogador, guarda de duplo clique.
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
const F = FATOR_EXIBICAO_VITAIS;
const energia = (atual, extra = {}) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual, regeneracao: 0, ...extra });

function ficha(overrides = {}) {
    return {
        iniciativa: 10,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: energia(1),
        mana: energia(100 * F), aura: energia(100 * F), chakra: energia(100 * F), corpo: energia(100 * F),
        poderes: [], inventario: [], passivas: [],
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5 },
        ...overrides
    };
}
function estado(minha, extra = {}) {
    return {
        minhaFicha: minha, meuNome: 'Heroi', personagens: {},
        updateFicha: vi.fn((cb) => cb(minha)),
        feedCombate: [], isMestre: false, mesaCriador: '',
        dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1 } }, lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...extra
    };
}
let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) { mockUseStore(state); probe = undefined; return render(<MapaFormProvider><Harness /></MapaFormProvider>); }
const passarTurno = () => act(() => { probe.avancarTurno(); });
const textosFeed = () => firebaseSync.enviarParaFeed.mock.calls.map(c => c[0].texto);
const custo = (modo, valor, en) => ({ modo, valor, energia: en });
const pod = (id, extra = {}) => ({ id, nome: `P${id}`, ativa: true, efeitos: [], efeitosPassivos: [], ...extra });

describe('Mapa - inicio de turno com varios poderes e energias', () => {
    beforeEach(() => { vi.clearAllMocks(); vi.spyOn(Math, 'random').mockReturnValue(0); });
    afterEach(() => { cleanup(); vi.restoreAllMocks(); });

    it('varios poderes em energias diferentes pagam cada um na sua, mensagens na ordem dos poderes', () => {
        const f = ficha({ poderes: [
            pod(1, { custoPorTurno: custo('fixo', 5, 'mana') }),
            pod(2, { custoPorTurno: custo('fixo', 7, 'aura') }),
            pod(3, { custoPorTurno: custo('fixo', 11, 'chakra') }),
            pod(4, { custoPorTurno: custo('fixo', 13, 'corpo') }),
        ] });
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBe(95 * F);
        expect(f.aura.atual).toBe(93 * F);
        expect(f.chakra.atual).toBe(89 * F);
        expect(f.corpo.atual).toBe(87 * F);
        const custos = textosFeed().filter(t => t.startsWith('🔋'));
        expect(custos).toEqual(['🔋 P1 consumiu 5 de mana', '🔋 P2 consumiu 7 de aura', '🔋 P3 consumiu 11 de chakra', '🔋 P4 consumiu 13 de corpo']);
    });

    it('varios poderes na MESMA energia pagam em sequencia; o que nao couber desliga', () => {
        const f = ficha({ mana: energia(25 * F), poderes: [
            pod(1, { custoPorTurno: custo('fixo', 10, 'mana') }),
            pod(2, { custoPorTurno: custo('fixo', 10, 'mana') }),
            pod(3, { custoPorTurno: custo('fixo', 10, 'mana') }),
        ] });
        montar(estado(f));
        passarTurno();
        expect(f.poderes.map(p => p.ativa)).toEqual([true, true, false]);
        expect(f.mana.atual).toBe(5 * F);
        const t = textosFeed();
        expect(t).toContain('🔋 P3 desligou: sem mana para o custo por turno');
        expect(t.filter(x => x.includes('consumiu')).length).toBe(2);
    });

    it('energia EXATAMENTE igual ao custo: paga, fica em 0 e o poder continua LIGADO; no turno seguinte (0) desliga', () => {
        const f = ficha({ mana: energia(5 * F), poderes: [pod(1, { custoPorTurno: custo('fixo', 5, 'mana') })] });
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBe(0);
        expect(f.poderes[0].ativa).toBe(true);
        cleanup();
        montar(estado(f));
        passarTurno();
        expect(f.poderes[0].ativa).toBe(false);
        expect(f.mana.atual).toBe(0);
    });

    it('percMax acompanha a energia maxima atual: maximo maior = custo maior', () => {
        const a = ficha({ chakra: energia(1e15), poderes: [pod(1, { custoPorTurno: custo('percMax', 10, 'chakra') })] });
        const b = ficha({ chakra: energia(1e15, { base: 400000000 }), poderes: [pod(1, { custoPorTurno: custo('percMax', 10, 'chakra') })] });
        const tetoA = getTetoExibidoComFator('chakra', a);
        const tetoB = getTetoExibidoComFator('chakra', b);
        expect(tetoB).toBeGreaterThan(tetoA);
        montar(estado(a)); passarTurno(); cleanup();
        montar(estado(b)); passarTurno();
        expect(1e15 - a.chakra.atual).toBeCloseTo(tetoA * 0.1, -2);
        expect(1e15 - b.chakra.atual).toBeCloseTo(tetoB * 0.1, -2);
        expect(1e15 - b.chakra.atual).toBeGreaterThan(1e15 - a.chakra.atual);
    });

    it('percMax 100 com energia cheia paga tudo e segue ligado; abaixo do maximo desliga', () => {
        const base = ficha({ poderes: [pod(1, { custoPorTurno: custo('percMax', 100, 'mana') })] });
        const teto = getTetoExibidoComFator('mana', base);
        base.mana.atual = teto;
        montar(estado(base)); passarTurno();
        expect(base.poderes[0].ativa).toBe(true);
        expect(base.mana.atual).toBe(0);
        cleanup();
        const g = ficha({ poderes: [pod(1, { custoPorTurno: custo('percMax', 100, 'mana') })] });
        g.mana.atual = teto - F;
        montar(estado(g)); passarTurno();
        expect(g.poderes[0].ativa).toBe(false);
    });

    it('poder desligado nao paga nem cria recarga; poder LIGADO com recarga decrementa', () => {
        const f = ficha({ poderes: [
            pod(1, { ativa: false, custoPorTurno: custo('fixo', 5, 'mana') }),
            pod(2, { ativa: false, recargaTurnos: 3 }),
            pod(3, { ativa: true, recargaTurnos: 3, recargaRestante: 3 }),
        ] });
        montar(estado(f));
        passarTurno();
        expect(f.mana.atual).toBe(100 * F);
        expect('recargaRestante' in f.poderes[1]).toBe(false);
        expect(f.poderes[2].recargaRestante).toBe(2);
    });

    it('poder legado sem os campos novos nao muda, nao ganha chaves nem undefined', () => {
        const f = ficha({ poderes: [pod(1), pod(2, { ativa: false })] });
        const antes = JSON.stringify(f.poderes);
        montar(estado(f));
        passarTurno();
        expect(JSON.stringify(f.poderes)).toBe(antes);
        expect(textosFeed().some(t => t.startsWith('🔋'))).toBe(false);
    });

    it('custo e recarga no mesmo poder: sem energia desliga mas a recarga continua contando', () => {
        const f = ficha({ mana: energia(2 * F), poderes: [pod(1, { custoPorTurno: custo('fixo', 5, 'mana'), recargaTurnos: 4, recargaRestante: 4 })] });
        montar(estado(f));
        passarTurno();
        expect(f.poderes[0].ativa).toBe(false);
        expect(f.poderes[0].recargaRestante).toBe(3);
    });

    it('custos invalidos (NaN/negativo/string/enorme/texto) sao ignorados sem quebrar; so o valido ("3,5") paga', () => {
        const f = ficha({ poderes: [
            pod(1, { custoPorTurno: custo('fixo', NaN, 'mana') }),
            pod(2, { custoPorTurno: custo('fixo', -5, 'mana') }),
            pod(3, { custoPorTurno: custo('fixo', 'abc', 'mana') }),
            pod(4, { custoPorTurno: custo('fixo', 1e300, 'mana') }),
            pod(5, { custoPorTurno: 'texto' }),
            pod(6, { custoPorTurno: custo('fixo', '3,5', 'mana') }),
        ] });
        montar(estado(f));
        expect(() => passarTurno()).not.toThrow();
        expect(f.poderes.map(p => p.ativa)).toEqual([true, true, true, true, true, true]);
        expect(f.mana.atual).toBe(100 * F - 3.5 * F);
        expect(JSON.stringify(f)).not.toContain('undefined');
    });

    it('custo fixo no limite (1e12) desliga o poder sem energia, sem NaN', () => {
        const f = ficha({ poderes: [pod(1, { custoPorTurno: custo('fixo', 1e12, 'mana') })] });
        montar(estado(f));
        passarTurno();
        expect(f.poderes[0].ativa).toBe(false);
        expect(f.mana.atual).toBe(100 * F);
    });

    it('guarda de duplo clique: dois avancarTurno sincronos cobram UMA vez so', () => {
        const f = ficha({ poderes: [pod(1, { custoPorTurno: custo('fixo', 5, 'mana'), recargaTurnos: 3, recargaRestante: 3 })] });
        montar(estado(f));
        act(() => { probe.avancarTurno(); probe.avancarTurno(); });
        expect(f.mana.atual).toBe(95 * F);
        expect(f.poderes[0].recargaRestante).toBe(2);
    });

    it('turno do DUMMIE nao paga custo nem decrementa recarga do dummie nem do dono', () => {
        const f = ficha({ iniciativa: 30, poderes: [pod(1, { custoPorTurno: custo('fixo', 5, 'mana'), recargaTurnos: 2, recargaRestante: 2 })] });
        const dummy = { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 }, poderes: [pod(9, { custoPorTurno: custo('fixo', 5, 'mana'), recargaRestante: 2 })], mana: energia(100 * F) };
        montar(estado(f, { isMestre: true, dummies: { filler: dummy } }));
        passarTurno();
        expect(f.mana.atual).toBe(100 * F);
        expect(f.poderes[0].recargaRestante).toBe(2);
        const gravado = firebaseSync.salvarDummie.mock.calls[0][1];
        expect(gravado.mana.atual).toBe(100 * F);
        expect(gravado.poderes[0].recargaRestante).toBe(2);
    });

    it('outro jogador: grava energia e SO os caminhos de poderes que mudaram, sem mutar o espelho local', () => {
        const minha = ficha({ iniciativa: 10, poderes: [pod(1, { custoPorTurno: custo('fixo', 5, 'mana') })] });
        const amigo = ficha({ iniciativa: 15, mana: energia(2 * F), poderes: [
            pod(7, { nome: 'Amigao', custoPorTurno: custo('fixo', 5, 'mana'), recargaTurnos: 2, recargaRestante: 1 }),
            pod(8, { ativa: false, recargaTurnos: 2, recargaRestante: 2 }),
        ] });
        montar(estado(minha, { personagens: { Heroi: minha, Amigo: amigo } }));
        passarTurno();
        expect(minha.mana.atual).toBe(100 * F);
        const chamadas = firebaseSync.salvarCamposPersonagem.mock.calls;
        expect(chamadas.length).toBe(1);
        const [nome, campos] = chamadas[0];
        expect(nome).toBe('Amigo');
        expect(campos['mana/atual']).toBe(2 * F);
        expect('poderes' in campos).toBe(false);
        expect(campos['poderes/0/ativa']).toBe(false);
        expect(campos['poderes/0/recargaRestante']).toBeNull();
        expect(campos['poderes/1/recargaRestante']).toBe(1);
        expect('poderes/1/ativa' in campos).toBe(false);
        expect(JSON.stringify(campos)).not.toContain('undefined');
        expect(textosFeed()).toContain('🔋 Amigao desligou: sem mana para o custo por turno');
        expect(amigo.poderes[0].ativa).toBe(true);
    });

    it('outro jogador SEM mudanca em poderes nao grava nenhum caminho de poderes', () => {
        const minha = ficha();
        const amigo = ficha({ iniciativa: 15, poderes: [pod(7), pod(8, { ativa: false })] });
        montar(estado(minha, { personagens: { Heroi: minha, Amigo: amigo } }));
        passarTurno();
        const [, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(Object.keys(campos).some(k => k === 'poderes' || k.startsWith('poderes/'))).toBe(false);
    });
});
