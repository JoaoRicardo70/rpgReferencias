import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcertoFormProvider, useAcertoForm } from './AcertoFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarCenarioCompleto } from '../../services/firebase-sync';

// Regressão (lote 2): dummies guardam a cena em d.cenaId (d.posicao = {x,y,z} sem cenaId). O acerto
// em área comparava só posicao.cenaId e perdia/misturava alvos; agora usa d.cenaId e inclui dummieId.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../core/engine', () => ({
    calcularAcerto: vi.fn(() => ({ acertoTotal: 15, rolagem: '1d20' })),
    calcularCA: vi.fn(() => 10),
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));

let storeState;
let probe;
function Harness() { probe = useAcertoForm(); return null; }

function montar({ ficha = {}, dummies = {}, ativa = 'cena_x', alvoSelecionado = null } = {}) {
    const minhaFicha = {
        inventario: [{ tipo: 'arma', equipado: true, area: 2, alcance: 10 }],
        poderes: [], ataquesElementais: [],
        posicao: { x: 0, y: 0, z: 0, cenaId: 'cena_x' },
        ...ficha,
    };
    storeState = {
        minhaFicha, meuNome: 'Heroi', personagens: {},
        setAbaAtiva: vi.fn(), updateFicha: vi.fn((cb) => cb(minhaFicha)),
        alvoSelecionado, dummies,
        cenario: { ativa, lista: { [ativa]: { escala: 1.5 } }, zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(storeState) : storeState));
    useStore.getState = () => storeState;
    render(<AcertoFormProvider><Harness /></AcertoFormProvider>);
}

function alvosDoFeed() {
    return enviarParaFeed.mock.calls[0][0].alvosArea;
}
function dummiesDoFeed() {
    return alvosDoFeed().filter(a => a.dummieId);
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('AcertoFormContext.rolarAcerto - área e cena do dummie (d.cenaId)', () => {
    it('origem livre: dummie com cenaId igual à cena ativa entra em alvosArea com o dummieId certo', () => {
        montar({ dummies: { d1: { nome: 'Goblin', valorDefesa: 10, cenaId: 'cena_x', posicao: { x: 1, y: 0, z: 0 } } } });
        act(() => { probe.setOrigemArea('livre'); });
        act(() => { probe.rolarAcerto(); });
        expect(window.alert).not.toHaveBeenCalled();
        expect(dummiesDoFeed()).toEqual([expect.objectContaining({ nome: 'Goblin', dummieId: 'd1', acertou: true, defesa: 10 })]);
    });

    it('origem self (posicao.cenaId do jogador = cena_x): dummie de cena_x entra com dummieId', () => {
        montar({ dummies: { d1: { nome: 'Goblin', valorDefesa: 10, cenaId: 'cena_x', posicao: { x: 1, y: 1, z: 0 } } } });
        act(() => { probe.setOrigemArea('self'); });
        act(() => { probe.rolarAcerto(); });
        expect(dummiesDoFeed().map(a => a.dummieId)).toEqual(['d1']);
    });

    it('dois dummies de mesmo nome na mesma cena geram duas entradas com dummieId distintos', () => {
        montar({ dummies: {
            g1: { nome: 'Goblin', valorDefesa: 10, cenaId: 'cena_x', posicao: { x: 1, y: 0, z: 0 } },
            g2: { nome: 'Goblin', valorDefesa: 10, cenaId: 'cena_x', posicao: { x: 0, y: 1, z: 0 } },
        } });
        act(() => { probe.setOrigemArea('livre'); });
        act(() => { probe.rolarAcerto(); });
        expect(dummiesDoFeed().map(a => a.dummieId).sort()).toEqual(['g1', 'g2']);
    });

    it('dummie de OUTRA cena (mesma posicao) é excluído de alvosArea', () => {
        montar({ dummies: {
            d1: { nome: 'Goblin', valorDefesa: 10, cenaId: 'cena_x', posicao: { x: 1, y: 0, z: 0 } },
            d2: { nome: 'Orc', valorDefesa: 10, cenaId: 'cena_y', posicao: { x: 1, y: 0, z: 0 } },
        } });
        act(() => { probe.setOrigemArea('livre'); });
        act(() => { probe.rolarAcerto(); });
        expect(dummiesDoFeed().map(a => a.dummieId)).toEqual(['d1']);
    });

    it('dummie antigo SEM cenaId pertence à cena default (ativa = default) e continua funcionando', () => {
        montar({
            ativa: 'default',
            ficha: { posicao: { x: 0, y: 0, z: 0 } },
            dummies: { velho: { nome: 'Slime', valorDefesa: 10, posicao: { x: 1, y: 0, z: 0 } } },
        });
        act(() => { probe.setOrigemArea('livre'); });
        act(() => { probe.rolarAcerto(); });
        expect(dummiesDoFeed()).toEqual([expect.objectContaining({ nome: 'Slime', dummieId: 'velho' })]);
    });

    it('dummie antigo sem cenaId NÃO entra quando a cena ativa é outra (cena_x)', () => {
        montar({ dummies: { velho: { nome: 'Slime', valorDefesa: 10, posicao: { x: 1, y: 0, z: 0 } } } });
        act(() => { probe.setOrigemArea('livre'); });
        act(() => { probe.rolarAcerto(); });
        expect(dummiesDoFeed()).toEqual([]);
    });

    it('dummie legado com cenaId só dentro de posicao continua sendo respeitado', () => {
        montar({ dummies: { leg: { nome: 'Legado', valorDefesa: 10, posicao: { x: 1, y: 0, z: 0, cenaId: 'cena_x' } } } });
        act(() => { probe.setOrigemArea('livre'); });
        act(() => { probe.rolarAcerto(); });
        expect(dummiesDoFeed().map(a => a.dummieId)).toEqual(['leg']);
    });

    it('dummie fora do raio da área não entra mesmo estando na mesma cena', () => {
        montar({ dummies: { longe: { nome: 'Longe', valorDefesa: 10, cenaId: 'cena_x', posicao: { x: 5, y: 0, z: 0 } } } });
        act(() => { probe.setOrigemArea('livre'); });
        act(() => { probe.rolarAcerto(); });
        expect(dummiesDoFeed()).toEqual([]);
    });

    it('acerto sem área (alvo único) registra dummieId = alvoSelecionado', () => {
        montar({
            ficha: { inventario: [{ tipo: 'arma', equipado: true, alcance: 10 }] },
            alvoSelecionado: 'd1',
            dummies: { d1: { nome: 'Goblin', valorDefesa: 30, cenaId: 'cena_x', posicao: { x: 1, y: 0, z: 0 } } },
        });
        act(() => { probe.rolarAcerto(); });
        expect(alvosDoFeed()).toEqual([expect.objectContaining({ nome: 'Goblin', dummieId: 'd1', acertou: false })]);
    });

    it('origem alvo + zona com duracaoZona > 0: zona é salva com cenaId = d.cenaId do dummie (cena_x)', () => {
        montar({
            ficha: { inventario: [], ataquesElementais: [{ equipado: true, areaQuad: 2, alcanceQuad: 10, duracaoZona: 3, elemento: 'Neutro' }] },
            alvoSelecionado: 'd1',
            dummies: { d1: { nome: 'Goblin', valorDefesa: 10, cenaId: 'cena_x', posicao: { x: 1, y: 1, z: 0 } } },
        });
        act(() => { probe.rolarAcerto(); });
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const zonas = salvarCenarioCompleto.mock.calls[0][0].zonas;
        expect(zonas).toHaveLength(1);
        expect(zonas[0]).toEqual(expect.objectContaining({ cenaId: 'cena_x', x: 1, y: 1, raio: 2, duracao: 3, conjurador: 'Heroi' }));
        expect(enviarParaFeed.mock.calls[0][0].zonaIdGerada).toBe(zonas[0].id);
    });

    it('sem duracaoZona nenhuma zona é salva', () => {
        montar({ dummies: { d1: { nome: 'Goblin', valorDefesa: 10, cenaId: 'cena_x', posicao: { x: 1, y: 0, z: 0 } } } });
        act(() => { probe.setOrigemArea('livre'); });
        act(() => { probe.rolarAcerto(); });
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
});
