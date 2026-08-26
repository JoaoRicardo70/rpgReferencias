import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Pool de pontos de Status em Marcados.jsx
//
// handleTabelaChange(k='status', 'prestigio', valor): antes, mudar o Prestígio
// agregado de "status" IGUALAVA os 8 atributos físicos (Força, Destreza,
// Inteligência, Sabedoria, Energia Espiritual, Carisma, Stamina, Constituição)
// ao mesmo valor, destruindo builds diferenciadas. Agora calcula
// delta = (novaBase * 8) - somaAtualDosOito e credita esse delta em
// ficha.statusPool (nunca negativo, Math.max(0, poolAntes + delta)). Se o
// delta for negativo e maior que o pool disponível, um alert() avisa que só foi
// possível remover parte do pedido.
//
// alocarPontoStatus(attrKey, qtd): gasta pontos do pool, convertendo para base
// bruta via Math.floor((usar/divisorStatus)*1000), soma em ficha[attrKey].base,
// decrementa o pool — nunca gasta mais do que o pool disponível.
//
// Nenhuma das duas funções é exportada; validamos interagindo com a UI real
// (input de Prestígio da categoria STATUS na Página 2 "Análise de Poder", e o
// botão "+ Pool" ao lado de cada atributo na tela "Status (Rank Base)").
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

const STATS8 = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function fichaComStats({ statBase = 0, statusPool = 0, divisores = {} } = {}) {
    const ficha = {
        vida: { base: 0 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        ascensaoBase: 1, divisores, bio: {}, estetica: {}, labels: {}, statusPool,
    };
    STATS8.forEach(s => { ficha[s] = { base: statBase }; });
    return ficha;
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
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
}

// Localiza o input de Prestígio bruto (displayP) da categoria STATUS na Página 2,
// dentro do grid VIDA/MANA/AURA/CHAKRA/CORPO/STATUS (mesma estrutura de card usada
// em Marcados.multiplicadorForca.test.jsx > lerCaixaVital, mas lendo o INPUT do meio
// em vez do badge de rank final).
function inputPrestigioStatus(container) {
    const spans = Array.from(container.querySelectorAll('span'));
    const statusSpan = spans.find(s => s.textContent === 'STATUS');
    const headerRow = statusSpan.parentElement;
    const cardWrapper = headerRow.parentElement;
    const prestigioWrapper = cardWrapper.children[1];
    return prestigioWrapper.querySelector('input');
}

// Localiza a linha (row) de um atributo específico na tela "Status (Rank Base)"
// (isAtual=false -> primeira ocorrência do displayValue do label).
function linhaAtributoBase(labelText) {
    const input = screen.getAllByDisplayValue(labelText)[0];
    return input.parentElement.parentElement;
}

describe('Marcados — Pool de Status via handleTabelaChange (input de Prestígio da categoria STATUS)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('aumentar o Prestígio de status credita o delta em statusPool SEM alterar os 8 atributos individuais', () => {
        // 8 atributos com base=1000 cada (soma=8000); displayP = floor((8000/8)/1000)=1.
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputPrestigioStatus(container);
        expect(input.value).toBe('1');

        // novoP=10 -> novaBase=floor((10/1)*1000)=10000; somaAlvo=10000*8=80000;
        // somaAtual=8000; delta=72000; statusPool = max(0, 0+72000) = 72000.
        fireEvent.change(input, { target: { value: '10' } });

        expect(ficha.statusPool).toBe(72000);
        STATS8.forEach(s => expect(ficha[s].base).toBe(1000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio de status com pool SUFICIENTE reduz o pool e não mexe nos atributos, sem alerta', () => {
        // 8 atributos com base=5000 cada (soma=40000); displayP=floor((40000/8)/1000)=5.
        const ficha = fichaComStats({ statBase: 5000, statusPool: 100000 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputPrestigioStatus(container);
        expect(input.value).toBe('5');

        // novoP=2 -> novaBase=2000; somaAlvo=16000; somaAtual=40000; delta=-24000;
        // poolAntes=100000; poolAntes+delta=76000 (>=0, sem alerta).
        fireEvent.change(input, { target: { value: '2' } });

        expect(ficha.statusPool).toBe(76000);
        STATS8.forEach(s => expect(ficha[s].base).toBe(5000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio de status com pool INSUFICIENTE zera o pool (nunca negativo), NAO mexe nos atributos e dispara alert', () => {
        // 8 atributos com base=5000 cada (soma=40000); displayP=5; pool pequeno demais.
        const ficha = fichaComStats({ statBase: 5000, statusPool: 1000 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputPrestigioStatus(container);

        // novoP=2 -> novaBase=2000; somaAlvo=16000; delta=-24000; poolAntes=1000;
        // poolAntes+delta=-23000 (<0) -> statusPool clampado em 0 + alert.
        fireEvent.change(input, { target: { value: '2' } });

        expect(ficha.statusPool).toBe(0);
        STATS8.forEach(s => expect(ficha[s].base).toBe(5000));
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('Só foi possível remover 1000 dos 24000 pontos pedidos');
    });

    it('divisores.status ausente cai no fallback ||1 (mesma conta de quando divisor=1 explicito)', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0, divisores: {} });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputPrestigioStatus(container);
        fireEvent.change(input, { target: { value: '10' } });

        // Idêntico ao teste com divisor=1 explícito: statusPool=72000.
        expect(ficha.statusPool).toBe(72000);
    });

    it('ficha sem os 8 atributos populados (undefined) nao lanca erro e trata soma como 0', () => {
        const ficha = {
            vida: { base: 0 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
            ascensaoBase: 1, divisores: {}, bio: {}, estetica: {}, labels: {}, statusPool: 0,
            // nenhum dos 8 atributos físicos presente
        };
        montarMockUseStore(ficha);

        expect(() => {
            const { container } = render(<MarcadosPanel />);
            irParaPaginaAnalise();
            const input = inputPrestigioStatus(container);
            fireEvent.change(input, { target: { value: '10' } });
        }).not.toThrow();

        // somaAtual=0 (todos ausentes); novaBase=10000; somaAlvo=80000; delta=80000.
        expect(ficha.statusPool).toBe(80000);
    });
});

describe('Marcados — alocarPontoStatus (botão "+ Pool" na tela "Status (Rank Base)")', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('transfere pontos do pool para o atributo escolhido, respeitando o divisor de status', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, divisores: { status: 2 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');
        const botao = row.querySelector('button');

        expect(qtyInput).toBeTruthy();
        expect(botao.textContent).toContain('+ Pool');

        fireEvent.change(qtyInput, { target: { value: '10' } });
        fireEvent.click(botao);

        // acrescimo = floor((10/2)*1000) = 5000 -> forca.base = 1000+5000 = 6000.
        expect(ficha.forca.base).toBe(6000);
        expect(ficha.statusPool).toBe(40);
        // Nenhum outro atributo é afetado.
        expect(ficha.destreza.base).toBe(1000);
    });

    it('nunca gasta mais pontos do que o pool disponível (clampa em poolAtual via Math.min)', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, divisores: { status: 2 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');
        const botao = row.querySelector('button');

        // Pede 1000 pontos, mas só existem 50 disponíveis.
        fireEvent.change(qtyInput, { target: { value: '1000' } });
        fireEvent.click(botao);

        // usar = min(1000, 50) = 50; acrescimo = floor((50/2)*1000) = 25000.
        expect(ficha.forca.base).toBe(26000);
        expect(ficha.statusPool).toBe(0);
    });

    it('quantidade inválida (zero ou negativa) é ignorada — nenhuma mutação ocorre', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, divisores: { status: 1 } });
        const mockState = montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');
        const botao = row.querySelector('button');

        fireEvent.change(qtyInput, { target: { value: '-5' } });
        fireEvent.click(botao);

        expect(ficha.forca.base).toBe(1000);
        expect(ficha.statusPool).toBe(50);
        expect(mockState.updateFicha).not.toHaveBeenCalled();
    });

    it('divisores.status igual a zero cai no fallback ||1 (não gera Infinity/NaN)', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, divisores: { status: 0 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');
        const botao = row.querySelector('button');

        fireEvent.change(qtyInput, { target: { value: '10' } });
        fireEvent.click(botao);

        // divStatus fallback = 1 -> acrescimo = floor((10/1)*1000) = 10000.
        expect(ficha.forca.base).toBe(11000);
        expect(ficha.statusPool).toBe(40);
    });

    it('quando statusPool é 0, o botão "+ Pool" não é renderizado para nenhum atributo', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        expect(row.querySelector('button')).toBeNull();
        expect(screen.queryByTitle(/Distribuir pontos do pool de Status/)).toBeNull();
    });

    it('exibe o banner "⭐ Pontos de Status Disponíveis" apenas quando statusPool > 0', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 30 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        expect(screen.getByText(/Pontos de Status Disponíveis: 30/)).toBeTruthy();
    });
});
