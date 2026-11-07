import React from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarDummie, aplicarDanoDireto } from '../../services/firebase-sync';

// QA - Dano Verdadeiro no Dano Rapido do Mestre: aplicarDanoRapido (8o parametro) e o interruptor da UI.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

const VIDA = 5000000;
const barra = (b) => ({ base: b, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: b, regeneracao: 0 });
function fichaBase(overrides = {}) {
    return {
        iniciativa: 0, posicao: { x: 0, y: 0, z: 0, cenaId: 'default' },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: barra(VIDA), mana: barra(1000000), aura: barra(1000000), chakra: barra(1000000), corpo: barra(1000000),
        forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 },
        sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 }, carisma: { base: 1000000 },
        stamina: { base: 1000000 }, constituicao: { base: 1000000 },
        multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
        poderes: [], inventario: [], passivas: [], dominios: {},
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
        ...overrides,
    };
}
const blindada = (extra = {}) => fichaBase({
    reducoesDano: [{ id: 'a', nome: 'Armadura', percentual: 50, elemento: 'todos' }],
    afinidades: { imunidades: ['gelo'] },
    dominios: { Fogo: { nivel: 10 } },
    ...extra,
});

let probe;
function Harness() { probe = useMapaForm(); return null; }

function mockStore(ficha, extra = {}) {
    const state = {
        minhaFicha: ficha, meuNome: 'Mestre', personagens: {},
        updateFicha: vi.fn((cb) => cb(ficha)),
        feedCombate: [], isMestre: true, mesaCriador: 'Mestre', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...extra,
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    return state;
}
function montar(ficha, extra) {
    mockStore(ficha, extra);
    render(<MapaFormProvider><Harness /></MapaFormProvider>);
    return ficha;
}
const alvoDe = (ficha) => ({ id: 'Mestre', nome: 'Mestre', ficha, isDummie: false });
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('MapaFormContext.aplicarDanoRapido - 8o parametro danoVerdadeiro', () => {
    it('true: dano integral mesmo com reducao 50% e Dominio 10 em Fogo', () => {
        const ficha = montar(blindada());
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, 'Fogo', null, 0, null, false, true); });
        expect(ficha.vida.atual).toBe(VIDA - 1000 * 1000);
        expect(ultimoFeed().texto).toContain('Dano Verdadeiro');
        expect(ultimoFeed().texto).not.toContain('Armadura');
    });
    it('true: atravessa Imunidade (Gelo)', () => {
        const ficha = montar(blindada());
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, 'Gelo', null, 0, null, false, true); });
        expect(ficha.vida.atual).toBe(VIDA - 1000 * 1000);
    });
    it('true: ignora o nivel de Dominio informado (override) tambem', () => {
        const ficha = montar(blindada());
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, 'Fogo', 10, 0, null, false, true); });
        expect(ficha.vida.atual).toBe(VIDA - 1000 * 1000);
    });
    it('ausente, false ou valor nao booleano ("true", 1): dano normal inalterado', () => {
        const ref = montar(blindada());
        act(() => { probe.aplicarDanoRapido(alvoDe(ref), 1000, 'Fogo'); });
        const normal = VIDA - ref.vida.atual;
        expect(normal).toBeLessThan(1000 * 1000);
        [false, undefined, 'true', 1, null].forEach((v) => {
            cleanup();
            const f = montar(blindada());
            act(() => { probe.aplicarDanoRapido(alvoDe(f), 1000, 'Fogo', null, 0, null, false, v); });
            expect(VIDA - f.vida.atual).toBe(normal);
        });
    });
    it('Dummie recebe o mesmo dano com e sem a flag', () => {
        const dummie = (hp) => ({ id: 'g1', nome: 'Goblin', isDummie: true, hpAtual: hp, hpMax: hp, valorDefesa: 10, ficha: null });
        montar(fichaBase(), { dummies: { g1: { nome: 'Goblin', cenaId: 'default', hpAtual: 5000000, hpMax: 5000000 } } });
        act(() => { probe.aplicarDanoRapido(dummie(5000000), 10, 'Fogo', null, 0, null, false, false); });
        const sem = salvarDummie.mock.calls.at(-1)[1].hpAtual;
        vi.clearAllMocks();
        act(() => { probe.aplicarDanoRapido(dummie(5000000), 10, 'Fogo', null, 0, null, false, true); });
        expect(salvarDummie.mock.calls.at(-1)[1].hpAtual).toBe(sem);
    });
    it('Mestre sem permissao (nao-Mestre) nao aplica nada', () => {
        const ficha = montar(blindada(), { isMestre: false });
        act(() => { probe.aplicarDanoRapido(alvoDe(ficha), 1000, 'Fogo', null, 0, null, false, true); });
        expect(ficha.vida.atual).toBe(VIDA);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
});

describe('MapaMestreDanoRapido - interruptor Dano Verdadeiro (UI)', () => {
    const personagens = () => ({ Vilao: { ...blindada(), vida: { ...barra(500000), atual: 500000 } } });
    const render_ = () => {
        mockStore(fichaBase(), { personagens: personagens() });
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);
        fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'Vilao' } });
    };
    const checkbox = () => screen.getByLabelText(/Dano Verdadeiro/);

    it('aparece desmarcado e alterna', () => {
        render_();
        expect(checkbox().checked).toBe(false);
        fireEvent.click(checkbox());
        expect(checkbox().checked).toBe(true);
        fireEvent.click(checkbox());
        expect(checkbox().checked).toBe(false);
    });
    it('desmarcado: o Vilao com Armadura 50% perde so 5 (exibido)', () => {
        render_();
        fireEvent.click(screen.getByText('💥 Aplicar Dano'));
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 500000 - 5 * 1000);
    });
    it('marcado: o Vilao perde os 10 inteiros e o interruptor zera depois de aplicar', () => {
        render_();
        fireEvent.click(checkbox());
        fireEvent.click(screen.getByText('💥 Aplicar Dano'));
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 500000 - 10 * 1000);
        expect(checkbox().checked).toBe(false);
    });
    it('a previa reflete o Dano Verdadeiro', () => {
        render_();
        const antes = document.body.textContent;
        fireEvent.click(checkbox());
        expect(document.body.textContent).not.toBe(antes);
        expect(document.body.textContent).toMatch(/Dano Verdadeiro/);
    });
});
