import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm, aplicarInicioDeTurno } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarCenarioCompleto } from '../../services/firebase-sync';

// Fase 2 - revisao: um gatilho NUNCA trava a passagem de turno; ordem turnoInicio x poderDesligou.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), uploadImagem: vi.fn(),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()), zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
}));

const vital = (base, atual = base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual, regeneracao: 0 });
function ficha(extra = {}) {
    return {
        iniciativa: 20, posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: vital(1000000000), mana: vital(1000000, 0), aura: vital(1000000), chakra: vital(1000000), corpo: vital(1000000),
        poderes: [], inventario: [], passivas: [], contadores: [{ id: 'k', nome: 'K', valor: 0, min: 0, max: 99 }],
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5 },
        ...extra,
    };
}
let storeState; let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) {
    storeState = state;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(storeState) : storeState));
    useStore.getState = () => storeState;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('aplicarInicioDeTurno - ordem dos gatilhos', () => {
    it("poderDesligou (custo sem energia) com limite 'turno' gasta o uso e ele sobrevive ao turnoInicio", () => {
        const f = ficha({ poderes: [
            { id: 'p1', nome: 'Caro', ativa: true, custoPorTurno: { modo: 'fixo', valor: 10, energia: 'mana' }, gatilhos: [{ id: 'dd', nome: 'Ao desligar', evento: { tipo: 'poderDesligou' }, limite: { max: 1, por: 'turno' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] }] },
        ] });
        const r = aplicarInicioDeTurno(f, false, 'Heroi');
        expect(f.poderes[0].ativa).toBe(false);
        expect(f.contadores[0].valor).toBe(1);
        expect(f.combate.usosPoderes['p1:dd']).toMatchObject({ n: 1, turno: true });
        expect(r.gatilhos.caminhos).toContain('contadores/0/valor');
    });
    it('o uso por turno do turno anterior volta no turnoInicio', () => {
        const f = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [{ id: 'g', nome: 'G', evento: { tipo: 'turnoInicio' }, limite: { max: 1, por: 'turno' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] }] }] });
        aplicarInicioDeTurno(f, false, 'Heroi'); aplicarInicioDeTurno(f, false, 'Heroi');
        expect(f.contadores[0].valor).toBe(2);
    });
    it('gatilho que lanca excecao nao impede o inicio do turno', () => {
        const f = ficha();
        const p = { id: 'p1', nome: 'P', ativa: true };
        Object.defineProperty(p, 'gatilhos', { enumerable: true, get() { throw new Error('boom'); } });
        f.poderes.push(p);
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => aplicarInicioDeTurno(f, false, 'Heroi')).not.toThrow();
        expect(f.combate.fadigaTurnos).toBe(1);
        erro.mockRestore();
    });
    it('sem gatilhos o resultado e o de sempre (gatilhos vazios)', () => {
        const r = aplicarInicioDeTurno(ficha(), false, 'Heroi');
        expect(r.gatilhos).toEqual({ textos: [], caminhos: [] });
    });
});

describe('avancarTurno - gatilho turnoFim que quebra nao trava o turno', () => {
    it('passa o turno e grava o cenario mesmo com excecao no gatilho', () => {
        const minha = ficha({ iniciativa: 20 });
        const p = { id: 'p1', nome: 'P', ativa: true };
        Object.defineProperty(p, 'gatilhos', { enumerable: true, get() { throw new Error('boom'); } });
        minha.poderes.push(p);
        const state = {
            minhaFicha: minha, meuNome: 'Heroi', personagens: {}, updateFicha: vi.fn((cb) => cb(minha)), feedCombate: [], isMestre: false, mesaCriador: '',
            dummies: { g: { nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 } } }, alvoSelecionado: null, abaAtiva: 'mapa',
            cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1 } }, lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        };
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        montar(state);
        expect(() => act(() => { probe.avancarTurno(); })).not.toThrow();
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        erro.mockRestore();
    });
});
