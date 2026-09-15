import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Barra de Força (getSupremas / forcaMax)
//
// Cobre a correção que troca `getBasePFor(ficha, k)` (que divide o valor bruto
// por multiplicadores de prestígio, ex: 10.000.000) por leitura direta de
// `ficha.<attr>.base`, para o cálculo de Força = média de mana/aura/chakra/corpo.
//
// getSupremas() é uma closure local do componente MarcadosPanel (não exportada),
// então a validação é feita renderizando o componente e lendo o valor máximo
// exibido na barra de Força (formatado em pt-BR pelo componente BarraVital).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaComEnergias({ mana, aura, chakra, corpo }) {
    return {
        mana: { base: mana },
        aura: { base: aura },
        chakra: { base: chakra },
        corpo: { base: corpo },
        vida: { base: 0 },
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
    };
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
}

// Busca o span do valor maximo da barra "Forca" — LabelMagico renderiza o
// texto "Força" como VALUE de um <input> (nao como texto de no), entao
// localizamos pelo display value. BarraVital renderiza
// `{Number(maximo).toLocaleString('pt-BR')}` como texto de um <span> logo em seguida.
//
// Estrutura real (Marcados.jsx): <div marginBottom> > [<div justify-between> >
// [<div label-wrapper> > <input LabelMagico>, <div>Poder:...</div>]], <BarraVital>].
// O input fica 2 níveis abaixo do container que também contém a BarraVital (irmã do
// <div justify-between>) -- por isso são necessários DOIS `.parentElement` a partir do
// div mais próximo do input, não um só.
function lerMaximoForcaExibido() {
    const labelInput = screen.getByDisplayValue('Força');
    const container = labelInput.closest('div').parentElement.parentElement;
    const spans = container.querySelectorAll('span');
    // O ultimo span do bloco e o valor maximo (apos o "/")
    return spans[spans.length - 1].textContent;
}

describe('MarcadosPanel — barra de Força (getSupremas -> forcaMax)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('media de quatro bases iguais a 260.000.000 (bruto) resulta em 260.000 exibido (nao 26)', () => {
        // Fixture NÃO escalada (base=260.000.000 já é grande o bastante que multiplicá-la por
        // 1000 cruzaria o divisor de prestígio 1e7 e geraria overflow de Ascensão, inflando
        // fatorForca) -- apenas o valor exibido esperado agora divide por FATOR_EXIBICAO_VITAIS.
        const ficha = fichaComEnergias({ mana: 260000000, aura: 260000000, chakra: 260000000, corpo: 260000000 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);

        const maximoExibido = lerMaximoForcaExibido();
        expect(maximoExibido).toBe((260000).toLocaleString('pt-BR'));
        expect(maximoExibido).not.toBe('26');
    });

    it('calcula a media correta para valores desiguais (caso misto)', () => {
        // Bruto: (100.000 + 200.000 + 300.000 + 400.000) / 4 = 250.000 -> exibido /1000 = 250
        const ficha = fichaComEnergias({ mana: 100000, aura: 200000, chakra: 300000, corpo: 400000 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);

        const maximoExibido = lerMaximoForcaExibido();
        expect(maximoExibido).toBe((250).toLocaleString('pt-BR'));
    });

    it('aplica floor quando a media nao e inteira', () => {
        // Bruto: (1000 + 1000 + 1000 + 2000) / 4 = 1250 -> exibido floor(1250/1000) = 1
        const ficha = fichaComEnergias({ mana: 1000, aura: 1000, chakra: 1000, corpo: 2000 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);

        const maximoExibido = lerMaximoForcaExibido();
        expect(maximoExibido).toBe((1).toLocaleString('pt-BR'));
    });

    it('trata campos ausentes (undefined) como 0 sem lancar erro', () => {
        const ficha = {
            mana: {}, // base ausente
            aura: { base: 400000 },
            chakra: undefined,
            corpo: { base: 200000 },
            vida: { base: 0 },
            divisores: {},
            bio: {},
            estetica: {},
            labels: {},
        };
        montarMockUseStore(ficha);

        expect(() => render(<MarcadosPanel />)).not.toThrow();

        // Bruto: (0 + 400.000 + 0 + 200.000) / 4 = 150.000 -> exibido /1000 = 150
        const maximoExibido = lerMaximoForcaExibido();
        expect(maximoExibido).toBe((150).toLocaleString('pt-BR'));
    });

    it('todas as bases zeradas resultam em Forca maxima igual a 0', () => {
        const ficha = fichaComEnergias({ mana: 0, aura: 0, chakra: 0, corpo: 0 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);

        const maximoExibido = lerMaximoForcaExibido();
        expect(maximoExibido).toBe((0).toLocaleString('pt-BR'));
    });
});
