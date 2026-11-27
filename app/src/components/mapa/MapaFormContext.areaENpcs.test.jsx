import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarCamposPersonagem } from '../../services/firebase-sync';

// Golpe em área do Mapa atinge os NPCs vizinhos; o Mestre mexe nas Ações de um NPC.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../core/engine', async (importOriginal) => ({
    ...(await importOriginal()),
    calcularAcerto: vi.fn(() => ({ acertoTotal: 50, rolagem: '1d20' })),
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
}));

function fichaBase(overrides = {}) {
    const barra = (b) => ({ base: b, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: b, regeneracao: 0 });
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0, cenaId: 'default' },
        acoes: { padrao: { max: 2, atual: 2 }, bonus: { max: 1, atual: 1 }, reacao: { max: 1, atual: 1 } },
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

function montar({ ficha, nome = 'Mestre', isMestre = true, personagens = {}, alvoSelecionado = null }) {
    const state = {
        minhaFicha: ficha, meuNome: nome, personagens,
        updateFicha: vi.fn((cb) => cb(ficha)),
        feedCombate: [], isMestre, mesaCriador: 'Mestre', alvoSelecionado, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<MapaFormProvider><Harness /></MapaFormProvider>);
}

const npc = (x, y, extra = {}) => fichaBase({ isNPC: true, posicao: { x, y, z: 0, cenaId: 'default' }, ...extra });
const acertosNoFeed = () => enviarParaFeed.mock.calls.map(c => c[0]).filter(f => f.tipo === 'acerto');
const armaArea = (areaQuad) => [{ tipo: 'arma', equipado: true, areaQuad }];

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('MapaFormContext.rolarAcertoRapido - golpe em área sobre NPCs', () => {
    it('o alvo escolhido e os NPCs dentro do raio entram; NPC longe e jogador ficam de fora', () => {
        montar({
            ficha: fichaBase({ inventario: armaArea(2) }),
            personagens: { Orc: npc(10, 10), 'Orc (2)': npc(11, 10), Longe: npc(25, 25), Ana: fichaBase({ posicao: { x: 10, y: 11, z: 0, cenaId: 'default' } }) },
            alvoSelecionado: 'pj:Orc',
        });
        act(() => { probe.rolarAcertoRapido(); });
        const nomes = acertosNoFeed()[0].alvosArea.map(a => a.nome).sort();
        expect(nomes).toEqual(['Orc', 'Orc (2)']);
        expect(acertosNoFeed()[0].alvosArea.find(a => a.nome === 'Orc (2)').alvoId).toBe('pj:Orc (2)');
    });

    it('sem área, só o alvo escolhido', () => {
        montar({
            ficha: fichaBase(),
            personagens: { Orc: npc(10, 10), 'Orc (2)': npc(11, 10) },
            alvoSelecionado: 'pj:Orc',
        });
        act(() => { probe.rolarAcertoRapido(); });
        expect(acertosNoFeed()[0].alvosArea.map(a => a.nome)).toEqual(['Orc']);
    });

    it('NPC em outra cena não entra', () => {
        montar({
            ficha: fichaBase({ inventario: armaArea(3) }),
            personagens: { Orc: npc(10, 10), Outro: fichaBase({ isNPC: true, posicao: { x: 10, y: 11, z: 0, cenaId: 'outra' } }) },
            alvoSelecionado: 'pj:Orc',
        });
        act(() => { probe.rolarAcertoRapido(); });
        expect(acertosNoFeed()[0].alvosArea.map(a => a.nome)).toEqual(['Orc']);
    });
});

describe('MapaFormContext.toggleActionDot - Mestre e NPC', () => {
    it('Mestre gasta uma Ação do NPC: grava só o campo acoes dele', () => {
        const orc = npc(1, 1);
        montar({ ficha: fichaBase(), personagens: { Orc: orc } });
        act(() => { probe.toggleActionDot('padrao', true, 'Orc'); });
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [nome, campos] = salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Orc');
        expect(Object.keys(campos)).toEqual(['acoes']);
        expect(campos.acoes.padrao.atual).toBe(1);
        expect(orc.acoes.padrao.atual).toBe(2);
    });

    it('jogador comum não mexe nas Ações de um NPC', () => {
        montar({ ficha: fichaBase(), nome: 'Joao', isMestre: false, personagens: { Orc: npc(1, 1) } });
        act(() => { probe.toggleActionDot('padrao', true, 'Orc'); });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });

    it('Mestre não grava nas Ações de um jogador (não-NPC)', () => {
        montar({ ficha: fichaBase(), personagens: { Ana: fichaBase() } });
        act(() => { probe.toggleActionDot('padrao', true, 'Ana'); });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
});
