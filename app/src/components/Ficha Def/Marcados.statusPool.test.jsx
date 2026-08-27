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
// ao mesmo valor, destruindo builds diferenciadas.
//
// 🔥 ATUALIZADO (correção dos 2 bugs relatados pelo usuário, com evidência de
// screenshot: aplicar 2 pontos de Prestígio gerava "15984" no pool e cada
// alocação de 1 ponto do pool concedia +1000 de base gastando só uma fração
// ínfima do pool):
//
// 1) Descompasso de unidades: agora `delta = (novoP * 8) - concedidoAntes` é
//    calculado inteiramente em PONTOS (a mesma unidade exibida no campo — 1
//    ponto = 1000/divisor de base) — NUNCA multiplicando por 1000 de novo, que
//    é o que causava o pool de "15984" ao digitar poucos pontos de Prestígio.
// 2) Double-crediting: `concedidoAntes` agora é `statusPool + statusPoolGasto`
//    (total já concedido, nunca diminui sozinho) em vez da soma/média AO VIVO
//    dos 8 atributos — que só refletia o que ainda não tinha sido gasto do
//    pool e fazia reduzir-a-zero-e-aumentar-de-volta gerar um pool NOVO
//    inteiro (double counting).
//
// alocarPontoStatus(attrKey, qtd): gasta pontos do pool, convertendo para base
// bruta via Math.floor((usar/divisorStatus)*1000), soma em ficha[attrKey].base,
// decrementa o pool E incrementa ficha.statusPoolGasto (novo campo, nunca gasto
// mais do que o pool disponível).
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

function fichaComStats({ statBase = 0, statusPool = 0, statusPoolGasto = 0, divisores = {} } = {}) {
    const ficha = {
        vida: { base: 0 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        ascensaoBase: 1, divisores, bio: {}, estetica: {}, labels: {}, statusPool, statusPoolGasto,
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

// Localiza o input de Prestígio bruto (displayP/campoEditavel) da categoria STATUS na
// Página 2, dentro do grid VIDA/MANA/AURA/CHAKRA/CORPO/STATUS (mesma estrutura de card
// usada em Marcados.multiplicadorForca.test.jsx > lerCaixaVital, mas lendo o INPUT do
// meio em vez do badge de rank final).
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

// A linha tem 2 botões quando há pool disponível: "Máx" (preenche o campo de
// quantidade) e "+ Pool" (confirma a alocação). Localiza especificamente o botão
// de confirmação pelo texto, para não confundir com o "Máx".
function botaoConfirmarPool(row) {
    return Array.from(row.querySelectorAll('button')).find(b => b.textContent.includes('+ Pool'));
}
function botaoMax(row) {
    return Array.from(row.querySelectorAll('button')).find(b => b.textContent.includes('Máx'));
}

describe('Marcados — Pool de Status via handleTabelaChange (input de Prestígio da categoria STATUS)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('o campo editável mostra floor((statusPool+statusPoolGasto)/8) em PONTOS, não a média ao vivo dos 8 atributos', () => {
        // Bases dos 8 atributos propositalmente enormes para provar que o campo NÃO deriva mais
        // da média ao vivo (getBasePFor) — só de pool+gasto.
        const ficha = fichaComStats({ statBase: 999999, statusPool: 8, statusPoolGasto: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputPrestigioStatus(container);
        // floor((8+0)/8) = 1 — se ainda usasse a média ao vivo, o valor seria ~124.
        expect(input.value).toBe('1');
    });

    it('aumentar o Prestígio de status credita o delta em PONTOS no statusPool (N*8, não N*8000) SEM alterar os 8 atributos individuais', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0, statusPoolGasto: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputPrestigioStatus(container);
        expect(input.value).toBe('0');

        // novoP=10 -> somaAlvoPontos=10*8=80; concedidoAntes=0; delta=80 -> statusPool=80.
        // (Bug antigo, com base bruta, teria gerado 72000/80000 em vez de 80.)
        fireEvent.change(input, { target: { value: '10' } });

        expect(ficha.statusPool).toBe(80);
        STATS8.forEach(s => expect(ficha[s].base).toBe(1000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio de status com pool SUFICIENTE reduz o pool e não mexe nos atributos, sem alerta', () => {
        const ficha = fichaComStats({ statBase: 5000, statusPool: 70, statusPoolGasto: 10 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputPrestigioStatus(container);
        // campoEditavel = floor((70+10)/8) = 10.
        expect(input.value).toBe('10');

        // novoP=5 -> somaAlvoPontos=40; concedidoAntes=80; delta=-40; poolAntes=70;
        // poolAntes+delta=30 (>=0, sem alerta).
        fireEvent.change(input, { target: { value: '5' } });

        expect(ficha.statusPool).toBe(30);
        expect(ficha.statusPoolGasto).toBe(10);
        STATS8.forEach(s => expect(ficha[s].base).toBe(5000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio de status com pool INSUFICIENTE zera o pool (nunca negativo), NAO mexe nos atributos e dispara alert', () => {
        const ficha = fichaComStats({ statBase: 5000, statusPool: 5, statusPoolGasto: 95 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputPrestigioStatus(container);

        // novoP=2 -> somaAlvoPontos=16; concedidoAntes=100; delta=-84; poolAntes=5;
        // poolAntes+delta=-79 (<0) -> statusPool clampado em 0 + alert.
        fireEvent.change(input, { target: { value: '2' } });

        expect(ficha.statusPool).toBe(0);
        expect(ficha.statusPoolGasto).toBe(95);
        STATS8.forEach(s => expect(ficha[s].base).toBe(5000));
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('Só foi possível remover 5 dos 84 pontos pedidos');
    });

    it('divisores.status ausente cai no fallback ||1 (mesma conta de quando divisor=1 explicito) — irrelevante para o delta, que é sempre em pontos', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0, statusPoolGasto: 0, divisores: {} });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const input = inputPrestigioStatus(container);
        fireEvent.change(input, { target: { value: '10' } });

        // Idêntico ao teste com divisor=1 explícito: statusPool=80.
        expect(ficha.statusPool).toBe(80);
    });

    it('ficha sem os 8 atributos populados (undefined) nao lanca erro (soma dos atributos é irrelevante para o pool agora)', () => {
        const ficha = {
            vida: { base: 0 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
            ascensaoBase: 1, divisores: {}, bio: {}, estetica: {}, labels: {}, statusPool: 0, statusPoolGasto: 0,
            // nenhum dos 8 atributos físicos presente
        };
        montarMockUseStore(ficha);

        expect(() => {
            const { container } = render(<MarcadosPanel />);
            irParaPaginaAnalise();
            const input = inputPrestigioStatus(container);
            fireEvent.change(input, { target: { value: '10' } });
        }).not.toThrow();

        // concedidoAntes=0+0=0; somaAlvoPontos=80; delta=80.
        expect(ficha.statusPool).toBe(80);
    });

    it('BUG FIX: reduzir o Prestígio de status a um valor N e depois re-aumentar para o mesmo M de antes NÃO duplica o pool (regressão do bug de "15984 pontos")', () => {
        // Estado inicial já representa N=5 concedido (statusPool=40, statusPoolGasto=0).
        const ficha = fichaComStats({ statBase: 1000, statusPool: 40, statusPoolGasto: 0 });
        montarMockUseStore(ficha);

        const { container, rerender } = render(<MarcadosPanel />);
        irParaPaginaAnalise();
        expect(inputPrestigioStatus(container).value).toBe('5');

        // N(5) -> M(10): concedidoAntes=40; somaAlvo=80; delta=40 -> statusPool=80.
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '10' } });
        expect(ficha.statusPool).toBe(80);
        rerender(<MarcadosPanel />);

        // M(10) -> N(5) de volta: concedidoAntes=80; somaAlvo=40; delta=-40; poolAntes=80;
        // 80-40=40 (>=0, sem alerta) -> statusPool volta a 40, igual ao estado inicial.
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '5' } });
        expect(ficha.statusPool).toBe(40);
        expect(window.alert).not.toHaveBeenCalled();
        rerender(<MarcadosPanel />);

        // N(5) -> M(10) de novo: se houvesse double counting, o pool teria virado 120+.
        // Com a correção, é EXATAMENTE o mesmo resultado da primeira transição N->M: 80.
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '10' } });
        expect(ficha.statusPool).toBe(80);
    });
});

describe('Marcados — alocarPontoStatus (botão "+ Pool" na tela "Status (Rank Base)")', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('transfere pontos do pool para o atributo escolhido, respeitando o divisor de status, e incrementa statusPoolGasto', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 2 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');
        const botao = botaoConfirmarPool(row);

        expect(qtyInput).toBeTruthy();
        expect(botao).toBeTruthy();
        expect(botao.textContent).toContain('+ Pool');

        fireEvent.change(qtyInput, { target: { value: '10' } });
        fireEvent.click(botao);

        // acrescimo = floor((10/2)*1000) = 5000 -> forca.base = 1000+5000 = 6000.
        expect(ficha.forca.base).toBe(6000);
        expect(ficha.statusPool).toBe(40);
        expect(ficha.statusPoolGasto).toBe(10);
        // Nenhum outro atributo é afetado.
        expect(ficha.destreza.base).toBe(1000);
    });

    it('BUG FIX: uma única alocação de 1 ponto do pool concede exatamente 1000/divisor de base e desconta exatamente 1 do pool', () => {
        const ficha = fichaComStats({ statBase: 0, statusPool: 5, statusPoolGasto: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');
        const botao = botaoConfirmarPool(row);

        fireEvent.change(qtyInput, { target: { value: '1' } });
        fireEvent.click(botao);

        // acrescimo = floor((1/1)*1000) = 1000 (não uma fração ínfima do pool, e o pool desconta
        // exatamente 1 — não 1000, nem uma fração < 1).
        expect(ficha.forca.base).toBe(1000);
        expect(ficha.statusPool).toBe(4);
        expect(ficha.statusPoolGasto).toBe(1);
    });

    it('botão "Máx" preenche o campo de quantidade com o pool disponível', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 37, statusPoolGasto: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');
        const max = botaoMax(row);

        expect(max).toBeTruthy();
        fireEvent.click(max);

        expect(qtyInput.value).toBe('37');
    });

    it('Enter no campo de quantidade confirma a alocação (sem precisar clicar no botão)', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');

        fireEvent.change(qtyInput, { target: { value: '20' } });
        fireEvent.keyDown(qtyInput, { key: 'Enter', code: 'Enter' });

        expect(ficha.forca.base).toBe(21000);
        expect(ficha.statusPool).toBe(30);
        expect(ficha.statusPoolGasto).toBe(20);
    });

    it('outras teclas no campo de quantidade NÃO confirmam a alocação', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');

        fireEvent.change(qtyInput, { target: { value: '20' } });
        fireEvent.keyDown(qtyInput, { key: 'Tab', code: 'Tab' });

        expect(ficha.forca.base).toBe(1000);
        expect(ficha.statusPool).toBe(50);
        expect(ficha.statusPoolGasto).toBe(0);
    });

    it('nunca gasta mais pontos do que o pool disponível (clampa em poolAtual via Math.min)', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 2 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');
        const botao = botaoConfirmarPool(row);

        // Pede 1000 pontos, mas só existem 50 disponíveis.
        fireEvent.change(qtyInput, { target: { value: '1000' } });
        fireEvent.click(botao);

        // usar = min(1000, 50) = 50; acrescimo = floor((50/2)*1000) = 25000.
        expect(ficha.forca.base).toBe(26000);
        expect(ficha.statusPool).toBe(0);
        expect(ficha.statusPoolGasto).toBe(50);
    });

    it('quantidade inválida (zero ou negativa) é ignorada — nenhuma mutação ocorre', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 1 } });
        const mockState = montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');
        const botao = botaoConfirmarPool(row);

        fireEvent.change(qtyInput, { target: { value: '-5' } });
        fireEvent.click(botao);

        expect(ficha.forca.base).toBe(1000);
        expect(ficha.statusPool).toBe(50);
        expect(ficha.statusPoolGasto).toBe(0);
        expect(mockState.updateFicha).not.toHaveBeenCalled();
    });

    it('divisores.status igual a zero cai no fallback ||1 (não gera Infinity/NaN)', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 0 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = row.querySelector('input[type="number"]');
        const botao = botaoConfirmarPool(row);

        fireEvent.change(qtyInput, { target: { value: '10' } });
        fireEvent.click(botao);

        // divStatus fallback = 1 -> acrescimo = floor((10/1)*1000) = 10000.
        expect(ficha.forca.base).toBe(11000);
        expect(ficha.statusPool).toBe(40);
        expect(ficha.statusPoolGasto).toBe(10);
    });

    it('quando statusPool é 0, os botões "Máx" e "+ Pool" não são renderizados para nenhum atributo', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0, statusPoolGasto: 0 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        expect(row.querySelector('button')).toBeNull();
        expect(screen.queryByTitle(/Distribuir pontos do pool de Status/)).toBeNull();
        expect(screen.queryByTitle(/Preencher com todo o pool disponível/)).toBeNull();
    });

    it('exibe o banner "⭐ Pontos de Status Disponíveis" apenas quando statusPool > 0', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 30 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        expect(screen.getByText(/Pontos de Status Disponíveis: 30/)).toBeTruthy();
    });
});
