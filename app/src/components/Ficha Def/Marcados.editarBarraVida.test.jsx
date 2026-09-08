import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Regressão pega em revisão de código: ao editar manualmente o valor "atual" de UMA barra
// específica de Vida (LinhaVital > BarrasVida > CampoMagico), aplicarEdicaoBarraVida(barras,
// mxDisplay, indice, novoValor) clampava o novo valor no "mxDisplay" (a constante FIXA
// LIMIAR_BARRA_VIDA de 100 milhões, ver core/vitals.js), NÃO no teto REAL daquela barra
// específica (barras[indice].max) -- isso permitia digitar um valor gigante na barra "ativa" (a
// que segura o RESTO, menor que 100 milhões, a última do array) e INFLAR o total de Vida do
// personagem além do seu máximo bruto real, violando a garantia central da funcionalidade de
// Break Bars ("o total nunca é maior que o bruto"). Corrigido passando o "maxSeguro" (o max
// daquela barra específica, já fornecido pelo próprio renderTexto) em vez do mxDisplay genérico.
//
// vida.base=150.000.000 -> 2 barras: [0]=100.000.000 (sempre cravada em mxDisplay -- não serve
// pra distinguir o bug, já que seu próprio max SEMPRE coincide com mxDisplay), [1]=50.000.000
// (resto/ativa -- é AQUI que o bug se manifestava, pois o max real é MENOR que mxDisplay).
//
// divisores.vida=0.0001 neutraliza o "Multiplicador de Força" incidental (ver core/poder.js >
// calcularFatorMultiplicadorForca) -- sem isso, um "base" de 150 milhões sozinho já dispara um
// bônus de Ascensão por overflow de Prestígio (o cálculo de Prestígio usa divisores.vida como
// multiplicador, mas getMaximo/getMaximoSemFormas -- que decidem a estrutura REAL das Break Bars
// -- não usam divisores nenhum), inflando o total real e contaminando este teste.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaBase(overrides = {}) {
    return {
        vida: { base: 0 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: {}, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        ...overrides,
    };
}

// Mock reativo: cada updateFicha gera uma NOVA referência de ficha (espelhando o Immer real),
// necessário pra re-renderizar após editar uma barra -- mesmo padrão de
// Marcados.multiplicadorForcaVitais.test.jsx.
function montarMockUseStoreReativo(fichaInicial) {
    const mockState = {
        minhaFicha: fichaInicial,
        updateFicha: null,
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    mockState.updateFicha = vi.fn((callback) => {
        const nova = { ...mockState.minhaFicha };
        callback(nova);
        mockState.minhaFicha = nova;
    });
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

function montarFichaComBreakBars() {
    // atual=40.000.000, total bruto=150.000.000 -> dano total=110.000.000: esvazia a barra 0
    // inteira (100M) e mais 10M da barra 1 -> barra 0 = 0/100.000.000, barra 1 = 40.000.000/
    // 50.000.000 (PARCIALMENTE danificada -- essencial pro teste, senão editar uma barra já cheia
    // "pra cima" não distingue o clamp certo do errado).
    const ficha = fichaBase({ vida: { base: 150000000, atual: 40000000 }, divisores: { vida: 0.0001 } });
    return montarMockUseStoreReativo(ficha);
}

describe('Marcados — editar manualmente uma Break Bar de Vida clampa no teto REAL daquela barra, não em mxDisplay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('editar a barra ATIVA (a última, que segura o resto de 50 milhões) pra um valor gigante clampa nos 50 milhões dela, NÃO nos 100 milhões de mxDisplay', () => {
        const mockState = montarFichaComBreakBars();
        const { rerender } = render(<MarcadosPanel />);

        const inputLabel = screen.getByDisplayValue('Vida (HP)');
        const wrapper = inputLabel.parentElement.parentElement.parentElement;
        const barraDiv = wrapper.children[1];
        const inputsAtual = barraDiv.querySelectorAll('input');
        expect(inputsAtual.length).toBe(2); // 2 Break Bars -> 2 campos editáveis

        // Digita um valor MUITO maior que o teto real da barra 1 (50.000.000) nela mesma (índice 1).
        fireEvent.change(inputsAtual[1], { target: { value: '999999999' } });
        rerender(<MarcadosPanel />);

        // Barra 0 continua vazia (0, não editada) + barra 1 clampada no SEU PRÓPRIO teto
        // (50.000.000) = 50.000.000 no total. Com o bug antigo (clamp em mxDisplay=100.000.000),
        // o total viraria 100.000.000 -- 2x o valor correto.
        expect(mockState.minhaFicha.vida.atual).toBe(50000000);
    });

    it('editar a barra ATIVA dentro do seu próprio range continua funcionando normalmente (sem regressão no caso feliz)', () => {
        const mockState = montarFichaComBreakBars();
        const { rerender } = render(<MarcadosPanel />);

        const inputLabel = screen.getByDisplayValue('Vida (HP)');
        const wrapper = inputLabel.parentElement.parentElement.parentElement;
        const barraDiv = wrapper.children[1];
        const inputsAtual = barraDiv.querySelectorAll('input');

        fireEvent.change(inputsAtual[1], { target: { value: '25000000' } });
        rerender(<MarcadosPanel />);

        // Barra 0 (0, inalterada) + barra 1 editada pra 25.000.000 (dentro do seu range de 0-50M).
        expect(mockState.minhaFicha.vida.atual).toBe(25000000);
    });
});
