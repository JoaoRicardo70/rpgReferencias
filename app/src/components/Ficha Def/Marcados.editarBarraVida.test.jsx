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
// que segura o RESTO, menor que 100 milhões, a PRIMEIRA do array -- a da frente) e INFLAR o total de Vida do
// personagem além do seu máximo bruto real, violando a garantia central da funcionalidade de
// Break Bars ("o total nunca é maior que o bruto"). Corrigido passando o "maxSeguro" (o max
// daquela barra específica, já fornecido pelo próprio renderTexto) em vez do mxDisplay genérico.
//
// vida.base=1.500.000.000 -> 2 barras: [0]=500.000.000 (o resto -- fica na FRENTE, é a primeira a
// levar dano/última a curar; é AQUI que o bug se manifestava, pois o max real é MENOR que
// mxDisplay), [1]=1.000.000.000 (sempre cravada em mxDisplay -- não serve pra distinguir o bug,
// já que seu próprio max SEMPRE coincide com mxDisplay). LIMIAR_BARRA_VIDA (reformulação de
// Vida/Energias) mudou de 100 milhões pra 1 bilhão -- valores escalados ×10 em relação à versão
// original deste teste pra preservar a mesma estrutura de 2 barras.
//
// divisores.vida=0.0001 neutraliza o "Multiplicador de Força" incidental (ver core/poder.js >
// calcularFatorMultiplicadorForca) -- sem isso, um "base" de 1,5 bilhão sozinho já dispara um
// bônus de Ascensão por overflow de Prestígio (o cálculo de Prestígio usa divisores.vida como
// multiplicador, mas getMaximo/getMaximoSemFormas -- que decidem a estrutura REAL das Break Bars
// -- não usam divisores nenhum), inflando o total real e contaminando este teste.
//
// Os inputs editáveis (CampoMagico dentro de BarrasVida/BarraVital) agora mostram/recebem o
// valor já dividido por FATOR_EXIBICAO_VITAIS (reformulação de Vida/Energias) -- o texto digitado
// é multiplicado de volta por 1000 antes de virar "atual" bruto, que é o que este teste lê
// diretamente em mockState.minhaFicha.vida.atual.
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
    // atual=1.200.000.000, total bruto=1.500.000.000 -> dano total=300.000.000: a barra da
    // FRENTE (índice 0, o resto de 500.000.000) leva o dano primeiro e fica PARCIALMENTE
    // danificada (200.000.000/500.000.000) -- essencial pro teste, senão editar a barra ativa
    // "pra cima" não distingue o clamp certo (no seu próprio max, 500M) do errado (no mxDisplay
    // genérico, 1 bilhão). A barra de trás (índice 1, 1 bilhão cravado) fica intacta, pois o
    // dano (300M) nem chega a transbordar pra ela.
    const ficha = fichaBase({ vida: { base: 1500000000, atual: 1200000000 }, divisores: { vida: 0.0001 } });
    return montarMockUseStoreReativo(ficha);
}

describe('Marcados — editar manualmente uma Break Bar de Vida clampa no teto REAL daquela barra, não em mxDisplay', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('editar a barra ATIVA (a da FRENTE, índice 0, que segura o resto de 500 milhões) pra um valor gigante clampa nos 500 milhões dela, NÃO no 1 bilhão de mxDisplay', () => {
        const mockState = montarFichaComBreakBars();
        const { rerender } = render(<MarcadosPanel />);

        const inputLabel = screen.getByDisplayValue('Vida (HP)');
        const wrapper = inputLabel.parentElement.parentElement.parentElement;
        const barraDiv = wrapper.children[1];
        const inputsAtual = barraDiv.querySelectorAll('input');
        // Barra 1 (de trás, 1 bilhão cravado) está intacta/cheia -- só a barra ATIVA (índice 0, a
        // da frente, que segura o resto e está parcialmente danificada) mostra seu campo editável
        // agora (as demais não mostram texto/input nenhum, pra evitar números sobrepostos
        // ilegíveis -- ver BarrasVida.jsx).
        expect(inputsAtual.length).toBe(1); // só a Break Bar ativa tem campo editável

        // Digita (na escala EXIBIDA, já dividida por FATOR_EXIBICAO_VITAIS) um valor MUITO maior
        // que o teto real da barra 0 (500.000.000 bruto = 500.000 exibido) nela mesma (índice 0).
        fireEvent.change(inputsAtual[0], { target: { value: '999999999' } });
        rerender(<MarcadosPanel />);

        // Barra 0 clampada no SEU PRÓPRIO teto (500.000.000) + barra 1 inalterada (1.000.000.000,
        // já estava cheia) = 1.500.000.000 no total (o próprio totalMax, nunca ultrapassado). Com o
        // bug antigo (clamp em mxDisplay=1.000.000.000), o total viraria 2.000.000.000 -- muito
        // além do máximo bruto real do personagem.
        expect(mockState.minhaFicha.vida.atual).toBe(1500000000);
    });

    it('editar a barra ATIVA dentro do seu próprio range continua funcionando normalmente (sem regressão no caso feliz)', () => {
        const mockState = montarFichaComBreakBars();
        const { rerender } = render(<MarcadosPanel />);

        const inputLabel = screen.getByDisplayValue('Vida (HP)');
        const wrapper = inputLabel.parentElement.parentElement.parentElement;
        const barraDiv = wrapper.children[1];
        const inputsAtual = barraDiv.querySelectorAll('input');

        // "250000" na escala EXIBIDA = 250.000.000 bruto (dentro do range 0-500M da barra 0)
        // depois de multiplicado de volta por FATOR_EXIBICAO_VITAIS.
        fireEvent.change(inputsAtual[0], { target: { value: '250000' } });
        rerender(<MarcadosPanel />);

        // Barra 0 editada pra 250.000.000 (dentro do seu range de 0-500M) + barra 1 inalterada
        // (1.000.000.000) = 1.250.000.000 no total.
        expect(mockState.minhaFicha.vida.atual).toBe(1250000000);
    });
});
