import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { calcularAcerto } from '../../core/engine';

// QA - rolarAcertoRapido: ator NPC do Mestre, regra de PvP e cena/alcance.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../core/engine', async (importOriginal) => ({
    ...(await importOriginal()),
    calcularAcerto: vi.fn(() => ({ acertoTotal: 50, rolagem: '1d20' })),
}));
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

function fichaBase(overrides = {}) {
    const barra = (b) => ({ base: b, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: b, regeneracao: 0 });
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0, cenaId: 'default' },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: barra(5000000), mana: barra(1000000), aura: barra(1000000), chakra: barra(1000000), corpo: barra(1000000),
        forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 },
        sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 }, carisma: { base: 1000000 },
        stamina: { base: 1000000 }, constituicao: { base: 1000000 },
        multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
        poderes: [], inventario: [], passivas: [], dominios: {},
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
        ...overrides,
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }

function montar({ ficha, nome = 'Joao', isMestre = false, personagens = {}, dummies = {}, alvoSelecionado = null, atorCombate = null }) {
    const state = {
        minhaFicha: ficha, meuNome: nome, personagens, atorCombate,
        updateFicha: vi.fn((cb) => cb(ficha)),
        feedCombate: [], isMestre, mesaCriador: 'Mestre', dummies, alvoSelecionado, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<MapaFormProvider><Harness /></MapaFormProvider>);
}

const acertosNoFeed = () => enviarParaFeed.mock.calls.map(c => c[0]).filter(f => f.tipo === 'acerto');
const arma = (alcance) => [{ tipo: 'arma', equipado: true, alcance }];

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('MapaFormContext.rolarAcertoRapido - ator NPC do Mestre', () => {
    it('com ator (token da Gaveta) o feed usa nomeExibido e o calculo usa a ficha do NPC', () => {
        const goblin = fichaBase({ isNPC: true });
        const mestre = fichaBase();
        montar({
            ficha: mestre, nome: 'Mestre', isMestre: true, personagens: { Goblin: goblin },
            dummies: { g2: { nome: 'Goblin #2', fichaOrigem: 'Goblin', cenaId: 'default', posicao: { x: 3, y: 3, z: 0 } } },
            atorCombate: { nome: 'Goblin', dummieId: 'g2' },
        });
        act(() => { probe.rolarAcertoRapido(); });
        expect(calcularAcerto.mock.calls[0][0].minhaFicha).toBe(goblin);
        const feeds = acertosNoFeed();
        expect(feeds).toHaveLength(1);
        expect(feeds[0].nome).toBe('Goblin #2');
    });

    it('sem ator ativo o feed usa meuNome e a ficha propria', () => {
        const mestre = fichaBase();
        montar({ ficha: mestre, nome: 'Mestre', isMestre: true, personagens: { Goblin: fichaBase({ isNPC: true }) } });
        act(() => { probe.rolarAcertoRapido(); });
        expect(calcularAcerto.mock.calls[0][0].minhaFicha).toBe(mestre);
        expect(acertosNoFeed()[0].nome).toBe('Mestre');
    });

    it('ator ignorado para jogador comum (isMestre false)', () => {
        const eu = fichaBase();
        montar({ ficha: eu, isMestre: false, personagens: { Goblin: fichaBase({ isNPC: true }) }, atorCombate: { nome: 'Goblin' } });
        act(() => { probe.rolarAcertoRapido(); });
        expect(acertosNoFeed()[0].nome).toBe('Joao');
    });
});

describe('MapaFormContext.rolarAcertoRapido - PvP', () => {
    it('jogador x jogador sem iniciativa: alert e nenhum acerto no feed', () => {
        montar({ ficha: fichaBase(), personagens: { Ana: fichaBase() }, alvoSelecionado: 'pj:Ana' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toMatch(/combate/);
        expect(acertosNoFeed()).toHaveLength(0);
    });

    it('so um dos dois com iniciativa: ainda bloqueia', () => {
        montar({ ficha: fichaBase({ iniciativa: 10 }), personagens: { Ana: fichaBase() }, alvoSelecionado: 'pj:Ana' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(window.alert).toHaveBeenCalled();
        expect(acertosNoFeed()).toHaveLength(0);
    });

    it('com iniciativa nos dois o acerto sai', () => {
        montar({ ficha: fichaBase({ iniciativa: 10 }), personagens: { Ana: fichaBase({ iniciativa: 8 }) }, alvoSelecionado: 'pj:Ana' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(window.alert).not.toHaveBeenCalled();
        expect(acertosNoFeed()).toHaveLength(1);
        expect(acertosNoFeed()[0].alvosArea[0].nome).toBe('Ana');
    });

    it('jogador contra NPC sem iniciativa: liberado', () => {
        montar({ ficha: fichaBase(), personagens: { Orc: fichaBase({ isNPC: true }) }, alvoSelecionado: 'pj:Orc' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(window.alert).not.toHaveBeenCalled();
        expect(acertosNoFeed()).toHaveLength(1);
    });
});

describe('MapaFormContext.rolarAcertoRapido - cena e alcance', () => {
    const ana = (posicao) => fichaBase({ iniciativa: 8, posicao });
    const eu = (inventario = []) => fichaBase({ iniciativa: 10, inventario });

    it('alvo em outra cena: alert "outra cena" e nada no feed', () => {
        montar({ ficha: eu(), personagens: { Ana: ana({ x: 1, y: 1, z: 0, cenaId: 'outra' }) }, alvoSelecionado: 'pj:Ana' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toMatch(/outra cena/);
        expect(acertosNoFeed()).toHaveLength(0);
    });

    it('alvo sem posicao conhecida: golpe sai normalmente', () => {
        montar({ ficha: eu(arma(2)), personagens: { Ana: ana(undefined) }, alvoSelecionado: 'pj:Ana' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(window.alert).not.toHaveBeenCalled();
        expect(acertosNoFeed()).toHaveLength(1);
    });

    it('alvo alem do alcance declarado: alert e nada no feed', () => {
        montar({ ficha: eu(arma(2)), personagens: { Ana: ana({ x: 5, y: 0, z: 0, cenaId: 'default' }) }, alvoSelecionado: 'pj:Ana' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toMatch(/fora de alcance/);
        expect(acertosNoFeed()).toHaveLength(0);
    });

    it('alvo dentro do alcance declarado: sai', () => {
        montar({ ficha: eu(arma(5)), personagens: { Ana: ana({ x: 5, y: 0, z: 0, cenaId: 'default' }) }, alvoSelecionado: 'pj:Ana' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(window.alert).not.toHaveBeenCalled();
        expect(acertosNoFeed()).toHaveLength(1);
    });

    it('sem alcance declarado: longe ainda sai (checagem pulada)', () => {
        montar({ ficha: eu(), personagens: { Ana: ana({ x: 40, y: 40, z: 0, cenaId: 'default' }) }, alvoSelecionado: 'pj:Ana' });
        act(() => { probe.rolarAcertoRapido(); });
        expect(window.alert).not.toHaveBeenCalled();
        expect(acertosNoFeed()).toHaveLength(1);
    });
});
