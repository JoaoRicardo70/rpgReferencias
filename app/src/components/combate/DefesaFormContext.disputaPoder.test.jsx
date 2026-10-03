import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm, ATACANTE_AUTO, ATACANTE_NENHUM } from './DefesaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA - Disputa de Poder na Defesa: sofrerDanoBruto() e a resolucao do atacante
// ("auto" = ultimo golpe tipo 'dano' de outra pessoa SEM alvoNome; "p:nome"; "d:id"; "nenhum").
// O Poder das fichas vem do campo falso __poder (mock de getPoderParaDisputa) para o teste
// controlar os numeros sem montar uma ficha completa.
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

// vida.atual e BRUTA (x1000 do numero exibido); o dano digitado/do feed e o numero EXIBIDO.
const FATOR = 1000;
const VIDA = 1e9;

let mockState;
let probe;
function Harness() { probe = useDefesaForm(); return null; }

function montar({ meuPoder = 1000, feed = [], personagens = {}, dummies = {}, vida = VIDA } = {}) {
    const minhaFicha = { __poder: meuPoder, vida: { atual: vida }, afinidades: {}, inventario: [], poderes: [] };
    mockState = {
        minhaFicha, meuNome: 'Eu', personagens, dummies, feedCombate: feed, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        setAbaAtiva: vi.fn(),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    render(<DefesaFormProvider><Harness /></DefesaFormProvider>);
    return minhaFicha;
}

const golpe = (extra = {}) => ({ tipo: 'dano', nome: 'Rival', dano: 500, poderAtacante: 1100, ...extra });
const ultimoTexto = () => enviarParaFeed.mock.calls.at(-1)[0].texto;

function receber(dano, elemento) {
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    if (elemento) act(() => { probe.setElementoInc(elemento); });
    act(() => { probe.sofrerDanoBruto(); });
}

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('DefesaFormContext - constantes e estado inicial', () => {
    it('exporta ATACANTE_AUTO = "auto" e ATACANTE_NENHUM = "nenhum"', () => {
        expect(ATACANTE_AUTO).toBe('auto');
        expect(ATACANTE_NENHUM).toBe('nenhum');
    });
    it('o atacante comeca em "auto"', () => {
        montar();
        expect(probe.atacanteInc).toBe('auto');
    });
    it('useDefesaForm fora do provider devolve null', () => {
        let valor = 'x';
        function Fora() { valor = useDefesaForm(); return null; }
        render(<Fora />);
        expect(valor).toBeNull();
    });
});

describe('DefesaFormContext - ultimoGolpeRecebido (auto)', () => {
    it('pega o ultimo golpe tipo "dano" de outra pessoa', () => {
        montar({ feed: [golpe({ nome: 'A', dano: 1 }), golpe({ nome: 'B', dano: 2 })] });
        expect(probe.ultimoGolpeRecebido.nome).toBe('B');
    });
    it('ignora entradas com alvoNome (golpe em entidade do Mapa)', () => {
        montar({ feed: [golpe({ nome: 'A' }), golpe({ nome: 'B', alvoNome: 'Goblin' })] });
        expect(probe.ultimoGolpeRecebido.nome).toBe('A');
    });
    it('ignora meus proprios golpes', () => {
        montar({ feed: [golpe({ nome: 'A' }), golpe({ nome: 'Eu' })] });
        expect(probe.ultimoGolpeRecebido.nome).toBe('A');
    });
    it('ignora entradas de outros tipos (acerto, sistema) e sem nome', () => {
        montar({ feed: [golpe({ nome: 'A' }), { tipo: 'acerto', nome: 'B' }, { tipo: 'sistema', nome: 'SISTEMA' }, { tipo: 'dano' }] });
        expect(probe.ultimoGolpeRecebido.nome).toBe('A');
    });
    it('feed vazio, undefined ou so com golpes em entidades: null', () => {
        montar({ feed: [] });
        expect(probe.ultimoGolpeRecebido).toBeNull();
        cleanup();
        montar({ feed: undefined });
        expect(probe.ultimoGolpeRecebido).toBeNull();
        cleanup();
        montar({ feed: [golpe({ alvoNome: 'Goblin' })] });
        expect(probe.ultimoGolpeRecebido).toBeNull();
    });
    it('entradas nulas dentro do feed nao quebram', () => {
        montar({ feed: [golpe({ nome: 'A' }), null, undefined] });
        expect(probe.ultimoGolpeRecebido.nome).toBe('A');
    });
});

describe('DefesaFormContext - opcoesAtacante', () => {
    it('lista jogadores (menos eu) como p:nome e so dummies COM poder como d:id', () => {
        montar({
            personagens: { Eu: { __poder: 1 }, Rival: { __poder: 2 }, Vazio: null },
            dummies: { g1: { nome: 'Goblin', poderCalculado: 500 }, g2: { nome: 'SemPoder' }, g3: { nome: 'Zero', poderCalculado: 0 } },
        });
        expect(probe.opcoesAtacante.map(o => o.valor)).toEqual(['p:Rival', 'd:g1', 'd:g3']);
        expect(probe.opcoesAtacante.find(o => o.valor === 'd:g1').isDummie).toBe(true);
    });
    it('sem personagens e sem dummies: lista vazia', () => {
        montar({ personagens: undefined, dummies: undefined });
        expect(probe.opcoesAtacante).toEqual([]);
    });
});

describe('DefesaFormContext - sofrerDanoBruto com atacante "auto"', () => {
    it('usa o poderAtacante gravado no feed: atacante 1100 vs eu 1000 = x1,1', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: 1100 })] });
        receber(1000);
        expect(ficha.vida.atual).toBe(VIDA - (1100) * FATOR);
        expect(ultimoTexto()).toContain('de Rival');
        expect(ultimoTexto()).toContain('Recebeu 1100 de dano');
        expect(ultimoTexto()).toContain('Disputa de Poder');
    });
    it('atacante mais fraco (900 vs 1000): x0,9', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: 900 })] });
        receber(1000);
        expect(ficha.vida.atual).toBe(VIDA - (888) * FATOR); // d = 100/900, fator 0,888…
    });
    it('atacante com metade do meu Poder: dano zerado', () => {
        const ficha = montar({ meuPoder: 2000, feed: [golpe({ poderAtacante: 1000 })] });
        receber(500);
        expect(ficha.vida.atual).toBe(VIDA);
        expect(ultimoTexto()).toContain('Recebeu 0 de dano');
        expect(ultimoTexto()).toContain('o golpe não surtiu efeito');
    });
    it('golpe em entidade (alvoNome) NAO e usado: cai em sem atacante (dano x1)', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: 5000, alvoNome: 'Goblin' })] });
        receber(1000);
        expect(ficha.vida.atual).toBe(VIDA - (1000) * FATOR);
        expect(ultimoTexto()).not.toContain('Disputa de Poder');
        expect(ultimoTexto()).not.toContain(' de Rival');
    });
    it('sem golpe no feed: dano x1 e sem nome de atacante', () => {
        const ficha = montar({ feed: [] });
        receber(777);
        expect(ficha.vida.atual).toBe(VIDA - (777) * FATOR);
        expect(ultimoTexto()).toMatch(/^Recebeu 777 de dano!/);
    });
    it('golpe sem poderAtacante gravado usa o Poder ATUAL do atacante na mesa', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: undefined })], personagens: { Rival: { __poder: 2000 } } });
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA - (200) * FATOR);
    });
    it('poderAtacante invalido (texto) tambem cai no Poder atual', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: 'abc' })], personagens: { Rival: { __poder: 1500 } } });
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA - (150) * FATOR);
    });
    it('poderAtacante null e atacante sem ficha na mesa: disputa inativa (x1) mas o nome aparece', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: null })], personagens: {} });
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA - (100) * FATOR);
        expect(ultimoTexto()).toContain('de Rival');
        expect(ultimoTexto()).not.toContain('Disputa de Poder');
    });
    it('poderAtacante 0 gravado e respeitado (nao confundido com ausente)', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: 0 })], personagens: { Rival: { __poder: 5000 } } });
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA);
    });
    it('meu Poder indefinido (null): disputa inativa', () => {
        const ficha = montar({ meuPoder: null, feed: [golpe({ poderAtacante: 5000 })] });
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA - (100) * FATOR);
    });
});

describe('DefesaFormContext - escolha manual do atacante', () => {
    it('"nenhum" ignora o feed e nao aplica disputa', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: 5000 })] });
        act(() => { probe.setAtacanteInc('nenhum'); });
        expect(probe.disputaDefesa.nomeAtacante).toBeNull();
        receber(1000);
        expect(ficha.vida.atual).toBe(VIDA - (1000) * FATOR);
    });
    it('"p:nome" de OUTRO jogador usa o Poder ao vivo dele', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ nome: 'Rival', poderAtacante: 1 })], personagens: { Aliado: { __poder: 1500 } } });
        act(() => { probe.setAtacanteInc('p:Aliado'); });
        receber(1000);
        expect(ficha.vida.atual).toBe(VIDA - (1500) * FATOR);
        expect(ultimoTexto()).toContain('de Aliado');
    });
    it('"p:nome" do mesmo jogador do ultimo golpe usa o Poder gravado no feed, nao o ao vivo', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ nome: 'Rival', poderAtacante: 1100 })], personagens: { Rival: { __poder: 9999 } } });
        act(() => { probe.setAtacanteInc('p:Rival'); });
        receber(1000);
        expect(ficha.vida.atual).toBe(VIDA - (1100) * FATOR);
    });
    it('"d:id" usa o poderCalculado do dummy', () => {
        const ficha = montar({ meuPoder: 1000, dummies: { g1: { nome: 'Dragao', poderCalculado: 3000 } } });
        act(() => { probe.setAtacanteInc('d:g1'); });
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA - (300) * FATOR);
        expect(ultimoTexto()).toContain('de Dragao');
    });
    it('"d:id" de dummy removido: sem Poder (x1) com nome generico "Entidade"', () => {
        const ficha = montar({ meuPoder: 1000, dummies: {} });
        act(() => { probe.setAtacanteInc('d:fantasma'); });
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA - (100) * FATOR);
        expect(ultimoTexto()).toContain('de Entidade');
    });
    it('valor desconhecido (sem prefixo) e tratado como sem atacante', () => {
        const ficha = montar({ meuPoder: 1000 });
        act(() => { probe.setAtacanteInc('lixo'); });
        receber(100);
        expect(ficha.vida.atual).toBe(VIDA - (100) * FATOR);
        expect(probe.disputaDefesa).toEqual({ nomeAtacante: null, disputa: null });
    });
    it('apos receber o dano, atacante volta para "auto" e o campo de dano e limpo', () => {
        montar({ feed: [golpe()] });
        act(() => { probe.setAtacanteInc('nenhum'); });
        receber(50);
        expect(probe.atacanteInc).toBe('auto');
        expect(probe.danoRecebidoInc).toBe('');
        expect(mockState.setAbaAtiva).toHaveBeenCalledWith('aba-log');
    });
});

describe('DefesaFormContext - sofrerDanoBruto: combinacao com elemento e validacao', () => {
    it('disputa e aplicada ANTES do multiplicador elemental (vulneravel x2)', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: 1100 })] });
        ficha.afinidades = { vulnerabilidades: ['fogo'] };
        receber(1000, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA - (2200) * FATOR);
        expect(ultimoTexto()).toContain('VULNERÁVEL');
    });
    it('imune: dano 0 mesmo com disputa favoravel ao atacante', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: 2000 })] });
        ficha.afinidades = { imunidades: ['fogo'] };
        receber(1000, 'fogo');
        expect(ficha.vida.atual).toBe(VIDA);
    });
    it('dano zero, vazio ou invalido: alerta e nao altera vida nem feed', () => {
        const ficha = montar({ feed: [golpe()] });
        receber('');
        receber(0);
        receber('abc');
        expect(window.alert).toHaveBeenCalledTimes(3);
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(ficha.vida.atual).toBe(VIDA);
    });
    it('vida nunca fica negativa', () => {
        const ficha = montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: 100000 })], vida: 500 });
        receber(1000);
        expect(ficha.vida.atual).toBe(0);
    });
    it('o texto do feed guarda o dano digitado como "Original"', () => {
        montar({ meuPoder: 1000, feed: [golpe({ poderAtacante: 1100 })] });
        receber(1000);
        expect(ultimoTexto()).toContain('(Original: 1000 de CINÉTICO)');
    });
});
