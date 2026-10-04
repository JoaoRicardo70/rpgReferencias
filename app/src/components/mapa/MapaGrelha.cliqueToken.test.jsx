import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./Tabuleiro3D', () => ({ default: () => null }));
vi.mock('../combat/DummieToken', () => ({ default: () => null }));
vi.mock('./MapaMundi', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('./MapaVoz', () => ({ MapaSessaoRP: () => null }));
vi.mock('../../App', async () => {
    const R = await import('react');
    return { VoiceContext: R.createContext(null) };
});

const ctxMock = { valor: null };
vi.mock('./MapaFormContext', () => ({
    MAP_SIZE: 2,
    urlSeguraParaCss: () => '',
    useMapaForm: () => ctxMock.valor,
}));

import { MapaVisao } from './MapaGrelha';

function montar(extra = {}) {
    const inspecionar = vi.fn();
    const pedirMovimento = vi.fn();
    const tk = { nome: 'Ana', ficha: { posicao: { x: 0, y: 0 } } };
    ctxMock.valor = {
        modo3D: false, tamanhoCelula: 40, cenaAtual: { img: '' },
        cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        tokenMap: { '0,0': [tk] }, dummyMap: {},
        cenaRenderId: 'default', tokens3D: [], pedirMovimento, movimentoPendente: null,
        confirmarMovimento: vi.fn(), cancelarMovimento: vi.fn(),
        getAvatarInfo: () => ({ img: '' }), meuNome: 'Bia', corDoJogador: () => '#fff',
        overridesCompendio: {}, cenario: {}, isMestre: false, inspecionar, inspecao: null,
        alvoSelecionado: null, dummies: {},
        ...extra,
    };
    render(<MapaVisao />);
    return { inspecionar, pedirMovimento };
}

afterEach(() => cleanup());

describe('MapaGrelha - clique no token de jogador', () => {
    it('jogador comum: inspeciona e nao move', () => {
        const { inspecionar, pedirMovimento } = montar();
        fireEvent.click(document.querySelector('.player-token'));
        expect(inspecionar).toHaveBeenCalledWith('jogador', 'Ana');
        expect(pedirMovimento).not.toHaveBeenCalled();
    });
    it('Mestre com dummie selecionado: AINDA inspeciona o jogador e nao propaga para a celula', () => {
        const { inspecionar, pedirMovimento } = montar({
            isMestre: true, alvoSelecionado: 'd1', dummies: { d1: { nome: 'Boneco' } },
        });
        fireEvent.click(document.querySelector('.player-token'));
        expect(inspecionar).toHaveBeenCalledTimes(1);
        expect(inspecionar).toHaveBeenCalledWith('jogador', 'Ana');
        expect(pedirMovimento).not.toHaveBeenCalled();
    });
    it('Mestre sem alvo: inspeciona e nao move', () => {
        const { inspecionar, pedirMovimento } = montar({ isMestre: true });
        fireEvent.click(document.querySelector('.player-token'));
        expect(inspecionar).toHaveBeenCalledWith('jogador', 'Ana');
        expect(pedirMovimento).not.toHaveBeenCalled();
    });
    it('clicar numa celula vazia ainda pede movimento (Mestre com dummie selecionado)', () => {
        const { inspecionar, pedirMovimento } = montar({
            isMestre: true, alvoSelecionado: 'd1', dummies: { d1: {} },
        });
        fireEvent.click(document.querySelector('.map-cell[data-x="1"]'));
        expect(pedirMovimento).toHaveBeenCalledWith(1, 0);
        expect(inspecionar).not.toHaveBeenCalled();
    });
});
