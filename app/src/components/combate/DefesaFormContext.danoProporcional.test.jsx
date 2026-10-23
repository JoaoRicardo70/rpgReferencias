import React from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import { DefesaSofrerDanoBox } from './DefesaSubComponents';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA - Defesa > Receber Dano: o checkbox "E o numero de uma rolagem de dado" (danoDeDado, padrao
// DESMARCADO) escala o dano digitado pela Vida MAXIMA de quem recebe (ficha REAL com Vida conhecida),
// antes da Disputa de Poder e do multiplicador elemental. Desmarcado (padrao) = dano exato; marcado escala pela Vida (so formula livre de dados puros).
// Ficha real: vida.base 200.000.000 + divisores.vida 0,0001 = Vida maxima exibida 200.000
// (mesmo padrao de Marcados.editarBarraVida.test.jsx). vida.atual e bruta (x1000).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
}));
vi.mock('../../core/engine', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, calcularCA: vi.fn(() => 10) };
});
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn((ficha) => (ficha && ficha.__poder !== undefined ? ficha.__poder : null)) };
});

const FATOR = 1000;
const VIDA_BASE = 200000000;

let mockState;
let probe;
function Harness() { probe = useDefesaForm(); return null; }

function fichaReal(extra = {}) {
    return {
        vida: { base: VIDA_BASE, atual: VIDA_BASE, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' },
        mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: { vida: 0.0001 }, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        afinidades: {}, inventario: [], poderes: [],
        ...extra,
    };
}

function montar({ ficha = fichaReal(), feed = [], cenario = { zonas: [] }, filho = null } = {}) {
    mockState = {
        minhaFicha: ficha, meuNome: 'Eu', personagens: {}, dummies: {}, feedCombate: feed, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(ficha)),
        setAbaAtiva: vi.fn(),
        cenario,
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<DefesaFormProvider><Harness />{filho}</DefesaFormProvider>);
    return ficha;
}

const ultimoFeed = () => enviarParaFeed.mock.calls.at(-1)[0];
function receberDado(dano, elemento) {
    act(() => { probe.setDanoDeDado(true); });
    receber(dano, elemento);
}
function receber(dano, elemento) {
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    if (elemento) act(() => { probe.setElementoInc(elemento); });
    act(() => { probe.sofrerDanoBruto(); });
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('DefesaFormContext - danoDeDado (estado)', () => {
    it('comeca FALSE (desmarcado): o dano digitado e exato', () => {
        montar();
        expect(probe.danoDeDado).toBe(false);
    });
    it('setDanoDeDado alterna', () => {
        montar();
        act(() => { probe.setDanoDeDado(true); });
        expect(probe.danoDeDado).toBe(true);
    });
});

describe('DefesaFormContext.sofrerDanoBruto - dano de dado proporcional a MINHA Vida', () => {
    it('true: 35 contra Vida 200.000 tira 35.000 (exibidos) = 35.000.000 brutos', () => {
        const ficha = montar();
        receberDado(35);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 35000 * FATOR);
        expect(ultimoFeed().texto).toContain('Recebeu 35000 de dano');
        expect(ultimoFeed().texto).toContain('(Original: 35 de');
    });
    it('padrao (desmarcado): dano exato, 35 contra Vida 200.000 tira 35 (sem escala pela Vida)', () => {
        const ficha = montar();
        receber(35);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 35 * FATOR);
        expect(ultimoFeed().texto).toContain('Recebeu 35 de dano');
    });
    it('true com pontosDanoVida da mesa = 100: dobra', () => {
        const ficha = montar({ cenario: { zonas: [], pontosDanoVida: 100 } });
        receberDado(35);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 70000 * FATOR);
    });
    it('true com pontosDanoVida invalido (0): usa 200', () => {
        const ficha = montar({ cenario: { zonas: [], pontosDanoVida: 0 } });
        receberDado(35);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 35000 * FATOR);
    });
    it('true, Vida menor: ficha com Vida 2.000 (base 2.000.000) leva 350', () => {
        const ficha = montar({ ficha: fichaReal({ vida: { base: 2000000, atual: 2000000, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' } }) });
        receberDado(35);
        expect(ficha.vida.atual).toBe(2000000 - 350 * FATOR);
    });
    it('true, Vida desconhecida (ficha sem Vida base): dano como digitado', () => {
        const ficha = montar({ ficha: { __poder: 1000, vida: { atual: 1e9 }, afinidades: {}, inventario: [], poderes: [] } });
        receberDado(35);
        expect(ficha.vida.atual).toBe(1e9 - 35 * FATOR);
    });
    it('true: a Vida nunca fica negativa (dano gigante)', () => {
        const ficha = montar();
        receberDado(1000); // 1000 x 1000 = 1.000.000 exibidos > 200.000
        expect(ficha.vida.atual).toBe(0);
    });
    it('true + Disputa: escala primeiro, fator depois (35 x 1000 x 1,1 = 38.500)', () => {
        const ficha = montar({
            ficha: fichaReal({ __poder: 1000 }),
            feed: [{ tipo: 'dano', nome: 'Rival', dano: 35, poderAtacante: 1100 }],
        });
        receberDado(35);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 38500 * FATOR);
        expect(ultimoFeed().texto).toContain('Recebeu 38500 de dano de Rival');
        expect(ultimoFeed().textoMestre).toContain('Disputa de Poder');
    });
    it('true + Disputa que anula (atacante 1000 vs eu 2000): 0 de dano', () => {
        const ficha = montar({
            ficha: fichaReal({ __poder: 2000 }),
            feed: [{ tipo: 'dano', nome: 'Rival', dano: 35, poderAtacante: 1000 }],
        });
        receberDado(35);
        expect(ficha.vida.atual).toBe(VIDA_BASE);
    });
    it('true + elemento vulneravel: escala, depois x2 (35 -> 35.000 -> 70.000)', () => {
        const ficha = montar({ ficha: fichaReal({ afinidades: { vulnerabilidades: ['fogo'] } }) });
        receberDado(35, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE - 70000 * FATOR);
        expect(ultimoFeed().texto).toContain('VULNERÁVEL');
    });
    it('true + elemento imune: 0 mesmo escalado', () => {
        const ficha = montar({ ficha: fichaReal({ afinidades: { imunidades: ['fogo'] } }) });
        receberDado(35, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA_BASE);
        expect(ultimoFeed().texto).toContain('IMUNE');
    });
    it('false + Disputa: so o fator de Poder (35 x 1,1 = 38)', () => {
        const ficha = montar({
            ficha: fichaReal({ __poder: 1000 }),
            feed: [{ tipo: 'dano', nome: 'Rival', dano: 35, poderAtacante: 1100 }],
        });
        act(() => { probe.setDanoDeDado(false); });
        receber(35);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 38 * FATOR);
    });
    it('dano 0 / vazio: alerta e nao mexe na Vida nem no feed', () => {
        const ficha = montar();
        receber(0);
        expect(window.alert).toHaveBeenCalled();
        expect(ficha.vida.atual).toBe(VIDA_BASE);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
    it('depois de receber dano, danoDeDado volta ao padrao (desmarcado) e o campo de dano e limpo', () => {
        montar();
        act(() => { probe.setDanoDeDado(true); });
        receber(5);
        expect(probe.danoDeDado).toBe(false);
        expect(probe.danoRecebidoInc).toBe('');
    });
});

describe('DefesaSofrerDanoBox - checkbox de dano de dado', () => {
    const checkbox = () => screen.getByLabelText(/É só o número de dados puros/);

    it('renderiza o checkbox DESMARCADO por padrao', () => {
        montar({ filho: <DefesaSofrerDanoBox /> });
        expect(checkbox().checked).toBe(false);
    });
    it('marcar atualiza o contexto', () => {
        montar({ filho: <DefesaSofrerDanoBox /> });
        fireEvent.click(checkbox());
        expect(checkbox().checked).toBe(true);
        expect(probe.danoDeDado).toBe(true);
    });
    it('fluxo pela UI: marcado, digitar 35 e receber tira 35.000', () => {
        const ficha = montar({ filho: <DefesaSofrerDanoBox /> });
        fireEvent.click(checkbox());
        fireEvent.change(screen.getByPlaceholderText(/Valor do Dano Bruto/), { target: { value: '35' } });
        const botao = screen.getAllByRole('button').find(b => /SUBTRAIR HP/.test(b.textContent));
        fireEvent.click(botao);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 35000 * FATOR);
    });
    it('fluxo pela UI: desmarcado (padrao), digitar 35 e receber tira 35', () => {
        const ficha = montar({ filho: <DefesaSofrerDanoBox /> });
        fireEvent.change(screen.getByPlaceholderText(/Valor do Dano Bruto/), { target: { value: '35' } });
        const botao = screen.getAllByRole('button').find(b => /SUBTRAIR HP/.test(b.textContent));
        fireEvent.click(botao);
        expect(ficha.vida.atual).toBe(VIDA_BASE - 35 * FATOR);
    });
    it('fora do provider o componente nao quebra (fallback)', () => {
        expect(() => render(<DefesaSofrerDanoBox />)).not.toThrow();
    });
});
