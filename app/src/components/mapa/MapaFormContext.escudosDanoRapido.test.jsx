import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, aplicarDanoDireto, salvarCamposPersonagem } from '../../services/firebase-sync';

// Escudos e Vida Temporaria no Dano Rapido do Mestre contra personagem (proprio Mestre e outro jogador).

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
    salvarCamposPersonagem: vi.fn(),
}));

const VIDA = 1000000000;
const vital = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: base, regeneracao: 0 });
function ficha(extra = {}) {
    return {
        iniciativa: 0, posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: vital(VIDA), mana: vital(1000000), aura: vital(1000000), chakra: vital(1000000), corpo: vital(1000000),
        forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 },
        sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 }, carisma: { base: 1000000 },
        stamina: { base: 1000000 }, constituicao: { base: 1000000 },
        multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
        poderes: [], inventario: [], passivas: [],
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
        ...extra,
    };
}

let storeState;
let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) {
    storeState = state;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(storeState) : storeState));
    useStore.getState = () => storeState;
    render(<MapaFormProvider><Harness /></MapaFormProvider>);
}
function estado(minhaFicha, extra = {}) {
    return {
        minhaFicha, meuNome: 'Mestre', personagens: {}, updateFicha: vi.fn((cb) => cb(minhaFicha)), feedCombate: [],
        isMestre: true, mesaCriador: 'Mestre', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...extra,
    };
}
const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('Dano Rapido do Mestre com escudos', () => {
    it('em OUTRO jogador: escudo grande absorve tudo (Vida intacta) e o feed avisa', () => {
        const vilao = ficha({ escudos: [{ id: 'a', nome: 'Domo', valor: 5000, tipo: 'escudo' }] });
        montar(estado(ficha(), { personagens: { Vilao: vilao } }));
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, 1000, 'fisico'); });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Vilao', { escudos: [expect.objectContaining({ id: 'a', valor: 4000 })] });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', VIDA);
        expect(ultimoFeed().texto).toContain('Vilao absorveu 1.000 (restam 4.000)');
    });

    it('em OUTRO jogador: escudo pequeno some e a sobra vai para a Vida', () => {
        const vilao = ficha({ escudos: [{ id: 'a', nome: 'Parede', valor: 400, tipo: 'escudo' }] });
        montar(estado(ficha(), { personagens: { Vilao: vilao } }));
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, 1000, 'fisico'); });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Vilao', { escudos: null });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', VIDA - 600 * 1000);
    });

    it('no proprio Mestre: absorve na ficha local e a sobra vai para a Vida', () => {
        const eu = ficha({ escudos: [{ id: 'v', nome: 'Vida Falsa', valor: 250, tipo: 'vidaTemporaria' }] });
        montar(estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 1000, 'fisico'); });
        expect(eu.escudos).toBeUndefined();
        expect(eu.vida.atual).toBe(VIDA - 750 * 1000);
        expect(ultimoFeed().texto).toContain('Mestre absorveu 250 (restam 0)');
    });

    it('alvo sem escudos (ficha antiga): dano integral, sem chave nova', () => {
        const vilao = ficha();
        montar(estado(ficha(), { personagens: { Vilao: vilao } }));
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, 1000, 'fisico'); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', VIDA - 1000 * 1000);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(ultimoFeed().texto).not.toContain('absorveu');
    });
});
