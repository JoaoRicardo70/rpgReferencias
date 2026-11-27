import React from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { enviarParaFeed, aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto, aplicarElementoNivelDireto, salvarFichaSilencioso } from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';
import { calcularPoderAtual } from '../../core/poder';

// ---------------------------------------------------------------------------
// QA - Disputa de Poder no Mapa:
//  * aplicarDanoRapido(alvo, dano, elemento, nivelDominio, nivelAtacante, atacante)
//  * Zonas: getDanoDinamicoZona / dispararEfeitoDaZona (via avancarTurno) / processarEntradaNaZona
//    (via handleCellClick).
// O Poder de fichas vem do campo falso __poder (mock de getPoderParaDisputa).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn((ficha) => (ficha && ficha.__poder !== undefined ? ficha.__poder : null)) };
});

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function fichaVida(poder, vida = 5000000) {
    return {
        __poder: poder,
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0, cenaId: 'default' },
        vida: { base: vida, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: vida, regeneracao: 0 },
        combate: {}, dominios: {}, poderes: [], inventario: [], passivas: [],
    };
}

// Ficha COMPLETA de verdade: aplicarDanoRapido resolve o Poder de jogadores por getPoderDeEntidade
// (chamada interna do modulo, que o mock de getPoderParaDisputa nao intercepta), entao esses
// testes usam o calculo real.
const STATUS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
const statReal = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 });
function fichaReal(extra = {}) {
    const f = {
        ascensaoBase: 1,
        posicao: { x: 0, y: 0, z: 0, cenaId: 'default' },
        vida: { ...statReal(100000000), atual: 5000000 },
        mana: statReal(10000000), aura: statReal(10000000), chakra: statReal(10000000), corpo: statReal(10000000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        divisorPoder: 0, supressaoPoder: 100, limiteSupressao: 1,
        combate: {}, dominios: {}, poderes: [], inventario: [], passivas: [],
    };
    STATUS.forEach(k => { f[k] = statReal(100000); });
    return { ...f, ...extra };
}
const poderReal = (f) => calcularPoderAtual(f, 1).poderExato;

function baseState(overrides = {}) {
    const minhaFicha = overrides.minhaFicha || fichaVida(1000);
    return {
        minhaFicha, meuNome: 'Mestre', personagens: {}, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [], isMestre: true, mesaCriador: 'Mestre',
        alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1 } }, lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...overrides,
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) {
    mockUseStore(state);
    probe = undefined;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}

const jogador = (nome, ficha) => ({ id: nome, nome, ficha });
const textoFeed = () => enviarParaFeed.mock.calls.at(-1)[0].texto;
const textoMestreFeed = () => enviarParaFeed.mock.calls.at(-1)[0].textoMestre || '';

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Zonas
// ---------------------------------------------------------------------------
describe('Zona - processarEntradaNaZona (mover o token para dentro) com Disputa de Poder', () => {
    function estadoEntrada(extras = {}) {
        const zona = { id: 'z1', nome: 'Gelo', cenaId: 'default', conjurador: 'Conj', duracao: 3, danoOriginal: 100, x: 5, y: 5, z: 0, raio: 1 };
        return baseState({
            personagens: { Conj: { __poder: 1000 } },
            cenario: { ativa: 'default', combates: { default: { ativo: true, rodada: 1 } }, lista: { default: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [zona] },
            ...extras,
        });
    }

    it('o proprio jogador entra na zona: usa o Poder dele (minhaFicha) contra o do conjurador', () => {
        // posicoes[cena] e SUBSTITUIDO (nao mutado) por handleCellClick, entao oldPos continua valendo
        const minhaFicha = { ...fichaVida(500, 100000000), posicao: undefined, posicoes: { default: { x: 0, y: 0, z: 0, cenaId: 'default' } } };
        const state = estadoEntrada({ minhaFicha, isMestre: false });
        montar(state);
        act(() => { probe.handleCellClick(5, 5); });
        // conjurador 1000 vs eu 500: x2 -> 200
        expect(minhaFicha.vida.atual).toBe(100000000 - 200 * FATOR_EXIBICAO_VITAIS);
        expect(textoFeed()).toContain('Mestre pisou na área de [Gelo] e sofreu 200 de Dano');
    });
});
