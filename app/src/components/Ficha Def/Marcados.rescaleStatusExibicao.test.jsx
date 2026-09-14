import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Reformulação de Status: LinhaAtributoCru (Marcados.jsx) agora divide o
// valor exibido/editado dos 8 atributos físicos (Força/Destreza/Inteligência/
// Sabedoria/Energia Espiritual/Carisma/Stamina/Constituição) por
// FATOR_EXIBICAO_STATUS = 1000, tanto na linha "Base" (desfocada e focada)
// quanto na linha "Atual" — sem mudar em nada o valor bruto salvo em
// ficha[attrKey].base, que continua alimentando o Poder Calculado e todo o
// resto da Ficha pelo mesmo caminho de sempre (core/attributes.js).
//
// Mesmo harness dos testes irmãos (Marcados.multiplicadorForca.test.jsx /
// Marcados.scouterFormulaAscensao.test.jsx): renderiza o MarcadosPanel real,
// navega para a Página 2 ("Análise de Poder") e lê o input/span de Força
// pela estrutura [label, coluna-de-valor] usada em LinhaAtributoCru.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

function fichaComAtributoFisico({ forcaBase = 0, ascensaoBase = 1, multiplicadorForcaPrestigio = 1, multiplicadorForcaAscensao = 1 } = {}) {
    return {
        vida: { base: 0 },
        mana: { base: 0 },
        aura: { base: 0 },
        chakra: { base: 0 },
        corpo: { base: 0 },
        forca: { base: forcaBase },
        destreza: { base: 0 },
        inteligencia: { base: 0 },
        sabedoria: { base: 0 },
        energiaEsp: { base: 0 },
        carisma: { base: 0 },
        stamina: { base: 0 },
        constituicao: { base: 0 },
        ascensaoBase,
        multiplicadorForcaPrestigio,
        multiplicadorForcaAscensao,
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
    return mockState;
}

function irParaPaginaAnalise() {
    const botaoProxima = screen.getByRole('button', { name: /Próxima/ });
    fireEvent.click(botaoProxima);
}

// Estrutura real de LinhaAtributoCru: <div outer> [ <div inner>[LabelMagico, span
// "Poder: ..."]</div>, <valueContainer> ] </div> — LabelMagico.parentElement é o
// <div inner> (label + badge de Poder), e o container do VALOR em si (input
// CampoMagico na linha Base, ou <span> na linha Atual) é o IRMÃO seguinte desse
// <div inner> (nextElementSibling), não seu children[1] (que é o badge "Poder: ...").
function inputBaseForca() {
    const labelInput = screen.getAllByDisplayValue('Força')[0];
    const valueContainer = labelInput.parentElement.nextElementSibling;
    return valueContainer.querySelector('input');
}

function spanAtualForca() {
    const labelInput = screen.getAllByDisplayValue('Força')[1];
    return labelInput.parentElement.nextElementSibling;
}

describe('Marcados — LinhaAtributoCru: reformulação de exibição de Status (/ FATOR_EXIBICAO_STATUS = 1000)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('base: 50000, fatorSeguro efetivamente 1 (sem Ascensão/Prestígio extra) exibe "50" desfocado, não "50.000" nem "50000"', () => {
        const ficha = fichaComAtributoFisico({ forcaBase: 50000 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(inputBaseForca().value).toBe('50');
        expect(inputBaseForca().value).not.toBe('50.000');
        expect(inputBaseForca().value).not.toBe('50000');
    });

    it('base: 56000 exibe "56" desfocado', () => {
        const ficha = fichaComAtributoFisico({ forcaBase: 56000 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(inputBaseForca().value).toBe('56');
    });

    it('focar o campo Base revela o valor em escala humana (rawBase / 1000, sem arredondar), não mais o valor bruto "56000"', () => {
        const ficha = fichaComAtributoFisico({ forcaBase: 56000 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputBaseForca();
        expect(input.value).toBe('56'); // desfocado (floor((56000*1)/1000) = 56, coincide neste caso)

        fireEvent.focus(input);
        expect(input.value).toBe('56');
        expect(input.value).not.toBe('56000');
    });

    it('digitar um novo valor no campo Base focado e salvar grava rawBase = valorDigitado * 1000 em ficha.forca.base', () => {
        const ficha = fichaComAtributoFisico({ forcaBase: 56000 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputBaseForca();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '60' } });

        expect(ficha.forca.base).toBe(60000);
    });

    it('limpar o campo (string vazia) não força para 0 — preserva o comportamento antigo de campo vazio', () => {
        const ficha = fichaComAtributoFisico({ forcaBase: 56000 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputBaseForca();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '' } });

        expect(ficha.forca.base).toBe('');
        expect(ficha.forca.base).not.toBe(0);
    });

    it('a linha "Atual" (isAtual=true) também reflete a escala /1000', () => {
        const ficha = fichaComAtributoFisico({ forcaBase: 56000 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(spanAtualForca().textContent).toBe('56');
        expect(spanAtualForca().textContent).not.toBe('56.000');
    });

    it('base não-redonda (12345) faz round-trip sem perda de precisão ao focar: mostra "12.345", não um valor arredondado', () => {
        const ficha = fichaComAtributoFisico({ forcaBase: 12345 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputBaseForca();
        // Desfocado: floor(12345*1/1000) = 12 (arredondamento esperado só na exibição fechada).
        expect(input.value).toBe('12');

        fireEvent.focus(input);
        expect(input.value).toBe('12.345');
    });

    it('ficha[attrKey].base continua no mesmo formato bruto de sempre — não é o componente quem deve rescalar o valor salvo, só sua própria exibição/edição', () => {
        const ficha = fichaComAtributoFisico({ forcaBase: 56000 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        // Sem nenhuma edição, o valor bruto no objeto de estado não deve ter sido tocado.
        expect(ficha.forca.base).toBe(56000);
    });
});
