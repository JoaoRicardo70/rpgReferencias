import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Pool de pontos de Status em Marcados.jsx (3ª iteração de design)
//
// handleTabelaChange(k='status', 'prestigio', valor): o campo agregado "STATUS"
// edita DIRETAMENTE ficha.statusPrestigioAplicado (não é mais derivado de
// statusPool+statusPoolGasto). Só a DIFERENÇA entre o novo valor digitado e o
// último `statusPrestigioAplicado` credita/debita o pool, multiplicada pela
// Ascensão ATUAL de Status (calcularAscensaoAtualStatus, mesmo cálculo do badge
// Rank exibido ao lado da categoria — 8 pool/ponto em Ascensão 1, 16 em
// Ascensão 2 etc). Reduções além do pool ainda não gasto são clampadas em 0
// (parciais) e disparam alert(); statusPrestigioAplicado avança só pelo que
// realmente coube. Mudar a Ascensão (ascensaoBase, mults de Força) sozinha,
// sem editar o campo STATUS depois, NUNCA recalcula o pool já concedido.
//
// alocarPontoStatus(attrKey, qtd): gasta pontos do pool, soma
// floor((qtd/divisorStatus)*1000) de BASE BRUTA em ficha[attrKey].base, e
// registra esse mesmo valor de base bruta em statusPoolAlocado[attrKey] —
// nunca em "pontos" (evita drift se o divisor mudar antes de uma devolução).
//
// devolverPontoStatus(attrKey, qtd): devolve BASE BRUTA para o pool, nunca mais
// do que statusPoolAlocado[attrKey] (nunca statusPoolGasto GLOBAL — correção de
// um exploit de duplicação de pontos encontrado em revisão de código) nem mais
// do que a Base atual do atributo comporta.
//
// Nenhuma das funções é exportada; validamos interagindo com a UI real (input
// de Prestígio da categoria STATUS na Página 2 "Análise de Poder", e os botões
// "+ Pool"/"− Pool" ao lado de cada atributo em "Status (Rank Base)").
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
}));

const STATS8 = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function fichaComStats({
    statBase = 0, statusPool = 0, statusPoolGasto = 0, statusPoolAlocado = {}, statusPrestigioAplicado = 0,
    divisores = {}, ascensaoBase = 1, attrBases = {},
} = {}) {
    const ficha = {
        vida: { base: 0 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        ascensaoBase, divisores, bio: {}, estetica: {}, labels: {},
        statusPool, statusPoolGasto, statusPoolAlocado, statusPrestigioAplicado,
    };
    STATS8.forEach(s => { ficha[s] = { base: attrBases[s] !== undefined ? attrBases[s] : statBase }; });
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

// Localiza o input de Prestígio bruto (campoEditavel) da categoria STATUS na Página 2, dentro
// do grid VIDA/MANA/AURA/CHAKRA/CORPO/STATUS.
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

function botaoConfirmarPool(row) {
    return row.querySelector('[title*="Distribuir pontos do pool de Status"]');
}
function botaoMax(row) {
    return row.querySelector('[title*="Preencher com todo o pool disponível"]');
}
function campoQtdAlocar(row) {
    const bloco = botaoConfirmarPool(row)?.parentElement;
    return bloco ? bloco.querySelector('input[type="number"]') : null;
}
function botaoDevolver(row) {
    return row.querySelector('[title*="Devolver pontos deste atributo"]');
}
function campoQtdDevolver(row) {
    const bloco = botaoDevolver(row)?.parentElement;
    return bloco ? bloco.querySelector('input[type="number"]') : null;
}

// Localiza o botão "⚖️ Distribuir pool igualmente" (Página 2, "Status (Rank Base)"), visível só
// quando floor(statusPool) >= 8.
function botaoDistribuirIgualmente() {
    return screen.queryByTitle(/Distribui o pool disponível igualmente entre os 8 atributos/);
}

// Localiza o badge "Rank {letra} [A{ascensão}]" da categoria STATUS no grid "Mecânicas de
// Ascensão e Divisores" (mesma Página 2) — mesmo padrão de navegação de cardWrapper usado em
// inputPrestigioStatus, um nível abaixo (children[2] = bloco do badge, não o campo editável).
function badgeRankStatus(container) {
    const spans = Array.from(container.querySelectorAll('span'));
    const statusSpan = spans.find(s => s.textContent === 'STATUS');
    const headerRow = statusSpan.parentElement;
    const cardWrapper = headerRow.parentElement;
    const badgeWrapper = cardWrapper.children[2];
    return badgeWrapper.querySelector('span').textContent;
}

describe('Marcados — campo STATUS edita ficha.statusPrestigioAplicado diretamente', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('o campo editável mostra ficha.statusPrestigioAplicado, não a média ao vivo dos 8 atributos', () => {
        // Bases dos 8 atributos propositalmente enormes para provar que o campo NÃO deriva mais
        // da média ao vivo (getBasePFor).
        const ficha = fichaComStats({ statBase: 999999, statusPrestigioAplicado: 7 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(inputPrestigioStatus(container).value).toBe('7');
    });

    it('aumentar o Prestígio credita o delta * 8 * ascensaoAtual(=1) no statusPool, sem alterar os 8 atributos', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0, statusPoolGasto: 0, statusPrestigioAplicado: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();
        expect(inputPrestigioStatus(container).value).toBe('0');

        // deltaPrestigio=10; ascensaoAtual=1 (bases baixas); poolCreditoAlvo=10*8*1=80.
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '10' } });

        expect(ficha.statusPool).toBe(80);
        expect(ficha.statusPrestigioAplicado).toBe(10);
        STATS8.forEach(s => expect(ficha[s].base).toBe(1000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio com pool SUFICIENTE reduz o pool e não mexe nos atributos, sem alerta', () => {
        const ficha = fichaComStats({ statBase: 5000, statusPool: 70, statusPoolGasto: 10, statusPrestigioAplicado: 10 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();
        expect(inputPrestigioStatus(container).value).toBe('10');

        // deltaPrestigio=-5; poolCreditoAlvo=-40; poolAntes=70; 70-40=30 (>=0, sem alerta).
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '5' } });

        expect(ficha.statusPool).toBe(30);
        expect(ficha.statusPoolGasto).toBe(10); // handleTabelaChange nunca mexe no gasto
        expect(ficha.statusPrestigioAplicado).toBe(5);
        STATS8.forEach(s => expect(ficha[s].base).toBe(5000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio com pool INSUFICIENTE (parte já alocada em atributos) avança statusPrestigioAplicado só pelo que coube, zera o pool e dispara alert', () => {
        // 24 pontos ainda livres no pool + 56 já alocados em Força (base bruta 56000, div=1).
        const ficha = fichaComStats({
            statBase: 0, attrBases: { forca: 56000 },
            statusPool: 24, statusPoolGasto: 56, statusPoolAlocado: { forca: 56000 },
            statusPrestigioAplicado: 10, divisores: { status: 1 },
        });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        // ascensaoAtual continua 1 (média = 56000/8 = 7000 -> floor(7000/1000)=7 < 100).
        // deltaPrestigio=-8; poolCreditoAlvo=-64; poolAntes=24; 24-64=-40 (<0) -> clamp 0.
        // creditoRealAplicado = 0-24 = -24 -> statusPrestigioAplicado = 10 + (-24/8) = 7.
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '2' } });

        expect(ficha.statusPool).toBe(0);
        expect(ficha.statusPoolGasto).toBe(56);
        expect(ficha.statusPrestigioAplicado).toBe(7);
        expect(ficha.forca.base).toBe(56000);
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('Só foi possível remover 24 dos 64 pontos de pool pedidos');
    });

    it('BUG FIX: aumentar -> reduzir totalmente de volta -> aumentar para o MESMO valor de antes NÃO duplica o pool', () => {
        // Estado inicial já representa N=5 aplicado (statusPool=40=5*8, Ascensão 1).
        const ficha = fichaComStats({ statBase: 0, statusPool: 40, statusPoolGasto: 0, statusPrestigioAplicado: 5 });
        montarMockUseStore(ficha);

        const { container, rerender } = render(<MarcadosPanel />);
        irParaPaginaAnalise();
        expect(inputPrestigioStatus(container).value).toBe('5');

        // N(5) -> M(10): delta=5; poolCreditoAlvo=40; poolAntes=40 -> statusPool=80.
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '10' } });
        expect(ficha.statusPool).toBe(80);
        expect(ficha.statusPrestigioAplicado).toBe(10);
        rerender(<MarcadosPanel />);

        // M(10) -> N(5) de volta: delta=-5; poolCreditoAlvo=-40; poolAntes=80; 80-40=40 (>=0).
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '5' } });
        expect(ficha.statusPool).toBe(40);
        expect(ficha.statusPrestigioAplicado).toBe(5);
        expect(window.alert).not.toHaveBeenCalled();
        rerender(<MarcadosPanel />);

        // N(5) -> M(10) de novo: se houvesse double counting, o pool teria virado 120+.
        // Com a correção, é EXATAMENTE o mesmo resultado da primeira transição: 80.
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '10' } });
        expect(ficha.statusPool).toBe(80);
        expect(ficha.statusPrestigioAplicado).toBe(10);
    });

    it('Ascensão 2 (via overflow real de Prestígio: crédito + alocação nos atributos) credita 16 pool/ponto em vez de 8', () => {
        const ficha = fichaComStats({ statBase: 0, statusPool: 0, statusPoolGasto: 0, statusPrestigioAplicado: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        const { container, rerender } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        // Passo 1: concede 800 pontos de pool em Ascensão 1 (8 pool/ponto).
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '100' } });
        expect(ficha.statusPool).toBe(800);
        expect(ficha.statusPrestigioAplicado).toBe(100);
        rerender(<MarcadosPanel />);

        // Passo 2: aloca os 800 pontos inteiros em Força -> a média dos 8 atributos vira 100.000
        // (div=1), empurrando a Ascensão ATUAL de Status de 1 para 2 de verdade (overflow).
        const rowForca = linhaAtributoBase('Força');
        fireEvent.change(campoQtdAlocar(rowForca), { target: { value: '800' } });
        fireEvent.click(botaoConfirmarPool(rowForca));

        expect(ficha.forca.base).toBe(800000);
        expect(ficha.statusPool).toBe(0);
        expect(ficha.statusPoolGasto).toBe(800);
        rerender(<MarcadosPanel />);

        // Passo 3: novo aumento de Prestígio agora credita 8*2=16 pool por ponto.
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '110' } });
        expect(ficha.statusPool).toBe(160);
        expect(ficha.statusPrestigioAplicado).toBe(110);
    });

    it('mudar a Ascensão do personagem (sem editar o campo STATUS depois) NÃO recalcula o pool já concedido — só afeta crédito de mudanças NOVAS', () => {
        const ficha = fichaComStats({ statBase: 0, statusPool: 80, statusPoolGasto: 0, statusPrestigioAplicado: 10, ascensaoBase: 1 });
        montarMockUseStore(ficha);

        const { container, rerender } = render(<MarcadosPanel />);
        irParaPaginaAnalise();
        expect(inputPrestigioStatus(container).value).toBe('10');

        // Muda ascensaoBase diretamente na ficha (nunca passa pelo campo STATUS).
        ficha.ascensaoBase = 5;
        rerender(<MarcadosPanel />);
        expect(ficha.statusPool).toBe(80);
        expect(ficha.statusPrestigioAplicado).toBe(10);
        expect(inputPrestigioStatus(container).value).toBe('10');

        // Só uma edição NOVA do campo STATUS aplica a Ascensão atualizada ao crédito.
        // Com ascensaoBase=5 e todos os atributos ainda em 0: ascensaoAtual = 5.
        // delta=1 -> poolCreditoAlvo = 1*8*5 = 40 (não mais 8).
        fireEvent.change(inputPrestigioStatus(container), { target: { value: '11' } });
        expect(ficha.statusPool).toBe(120);
        expect(ficha.statusPrestigioAplicado).toBe(11);
    });
});

describe('Marcados — alocarPontoStatus (botão "+ Pool" na tela "Status (Rank Base)")', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('transfere pontos do pool para o atributo escolhido, respeitando o divisor, e registra a BASE BRUTA em statusPoolAlocado', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 2 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');

        fireEvent.change(campoQtdAlocar(row), { target: { value: '10' } });
        fireEvent.click(botaoConfirmarPool(row));

        // acrescimo = floor((10/2)*1000) = 5000.
        expect(ficha.forca.base).toBe(6000);
        expect(ficha.statusPool).toBe(40);
        expect(ficha.statusPoolGasto).toBe(10);
        // statusPoolAlocado guarda BASE BRUTA (5000), não "pontos" (10).
        expect(ficha.statusPoolAlocado.forca).toBe(5000);
        expect(ficha.destreza.base).toBe(1000);
        expect(ficha.statusPoolAlocado.destreza).toBeUndefined();
    });

    it('BUG FIX: uma única alocação de 1 ponto concede exatamente 1000/divisor de base e desconta exatamente 1 do pool', () => {
        const ficha = fichaComStats({ statBase: 0, statusPool: 5, statusPoolGasto: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');

        fireEvent.change(campoQtdAlocar(row), { target: { value: '1' } });
        fireEvent.click(botaoConfirmarPool(row));

        expect(ficha.forca.base).toBe(1000);
        expect(ficha.statusPool).toBe(4);
        expect(ficha.statusPoolGasto).toBe(1);
        expect(ficha.statusPoolAlocado.forca).toBe(1000);
    });

    it('botão "Máx" preenche o campo de quantidade com o pool disponível', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 37, statusPoolGasto: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');

        fireEvent.click(botaoMax(row));
        expect(campoQtdAlocar(row).value).toBe('37');
    });

    it('Enter no campo de quantidade confirma a alocação (sem precisar clicar no botão)', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = campoQtdAlocar(row);

        fireEvent.change(qtyInput, { target: { value: '20' } });
        fireEvent.keyDown(qtyInput, { key: 'Enter', code: 'Enter' });

        expect(ficha.forca.base).toBe(21000);
        expect(ficha.statusPool).toBe(30);
        expect(ficha.statusPoolGasto).toBe(20);
        expect(ficha.statusPoolAlocado.forca).toBe(20000);
    });

    it('outras teclas no campo de quantidade NÃO confirmam a alocação', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        const qtyInput = campoQtdAlocar(row);

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

        fireEvent.change(campoQtdAlocar(row), { target: { value: '1000' } });
        fireEvent.click(botaoConfirmarPool(row));

        // usar = min(1000, 50) = 50; acrescimo = floor((50/2)*1000) = 25000.
        expect(ficha.forca.base).toBe(26000);
        expect(ficha.statusPool).toBe(0);
        expect(ficha.statusPoolGasto).toBe(50);
        expect(ficha.statusPoolAlocado.forca).toBe(25000);
    });

    it('quantidade inválida (zero ou negativa) é ignorada — nenhuma mutação ocorre', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 1 } });
        const mockState = montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');

        fireEvent.change(campoQtdAlocar(row), { target: { value: '-5' } });
        fireEvent.click(botaoConfirmarPool(row));

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

        fireEvent.change(campoQtdAlocar(row), { target: { value: '10' } });
        fireEvent.click(botaoConfirmarPool(row));

        expect(ficha.forca.base).toBe(11000);
        expect(ficha.statusPool).toBe(40);
        expect(ficha.statusPoolGasto).toBe(10);
    });

    it('quando statusPool é 0 e nenhum atributo tem alocação, nenhum botão de pool é renderizado', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0, statusPoolGasto: 0 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        expect(row.querySelector('button')).toBeNull();
        expect(screen.queryByTitle(/Distribuir pontos do pool de Status/)).toBeNull();
        expect(screen.queryByTitle(/Devolver pontos deste atributo/)).toBeNull();
    });

    it('exibe o banner "⭐ Pontos de Status Disponíveis" apenas quando statusPool > 0', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 30 });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        expect(screen.getByText(/Pontos de Status Disponíveis: 30/)).toBeTruthy();
    });
});

describe('Marcados — devolverPontoStatus (botão "− Pool" na tela "Status (Rank Base)")', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('devolve BASE BRUTA para o pool respeitando o divisor ATUAL, é simétrico com alocarPontoStatus (aloca e devolve tudo -> volta ao estado original)', () => {
        // Força já tem 1000 de base manual + 5000 alocados pelo pool (div=2, ou seja 10 pontos).
        const ficha = fichaComStats({
            statBase: 1000, attrBases: { forca: 6000 },
            statusPool: 40, statusPoolGasto: 10, statusPoolAlocado: { forca: 5000 },
            divisores: { status: 2 },
        });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');
        expect(campoQtdDevolver(row).max).toBe('10'); // pontosAlocadosStatus('forca') = floor(5000/1000*2)=10

        fireEvent.change(campoQtdDevolver(row), { target: { value: '10' } });
        fireEvent.click(botaoDevolver(row));

        // reducaoBase = floor((10/2)*1000) = 5000; usar = floor((5000/1000)*2) = 10.
        expect(ficha.forca.base).toBe(1000); // volta exatamente ao valor manual original
        expect(ficha.statusPoolAlocado.forca).toBe(0);
        expect(ficha.statusPoolGasto).toBe(0);
        expect(ficha.statusPool).toBe(50);
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('pedido maior do que o alocado NESTE atributo é capado no alocado, com alert explicando o motivo', () => {
        const ficha = fichaComStats({
            statBase: 1000, attrBases: { forca: 4000 },
            statusPool: 0, statusPoolGasto: 3, statusPoolAlocado: { forca: 3000 },
            divisores: { status: 1 },
        });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');

        // Pede 10 pontos (reducaoBasePedida = 10000), mas só há 3000 de base alocados por este
        // pool nesse atributo.
        fireEvent.change(campoQtdDevolver(row), { target: { value: '10' } });
        fireEvent.click(botaoDevolver(row));

        expect(ficha.forca.base).toBe(1000);
        expect(ficha.statusPoolAlocado.forca).toBe(0);
        expect(ficha.statusPoolGasto).toBe(0);
        expect(ficha.statusPool).toBe(3);
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain(`Só foi possível devolver o equivalente a ${(3000).toLocaleString('pt-BR')} de base`);
    });

    it('nunca devolve mais do que a Base ATUAL do atributo comporta (edição manual reduziu a Base depois da alocação) — e este caso NÃO dispara alert (só o teto de statusPoolAlocado dispara)', () => {
        // statusPoolAlocado alega 10000 alocados, mas o jogador editou a Base manualmente para 4000
        // depois (ex.: editou o campo Base direto). A alocação registrada (10000) ainda cabe no
        // pedido, então não haveria alert pela checagem de alocado — mas a Base real (4000) é quem
        // efetivamente limita a devolução dentro do updateFicha.
        const ficha = fichaComStats({
            statBase: 1000, attrBases: { forca: 4000 },
            statusPool: 0, statusPoolGasto: 10, statusPoolAlocado: { forca: 10000 },
            divisores: { status: 1 },
        });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');

        fireEvent.change(campoQtdDevolver(row), { target: { value: '10' } });
        fireEvent.click(botaoDevolver(row));

        // reducaoBase = min(10000, 10000, 4000) = 4000 (capado pela Base atual, não negativo).
        expect(ficha.forca.base).toBe(0);
        expect(ficha.statusPoolAlocado.forca).toBe(6000); // 10000 - 4000
        expect(ficha.statusPoolGasto).toBe(6); // usar = floor(4000/1000*1) = 4; 10-4=6
        expect(ficha.statusPool).toBe(4);
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('quantidade inválida (zero ou negativa) é ignorada — nenhuma mutação ocorre', () => {
        const ficha = fichaComStats({
            statBase: 1000, attrBases: { forca: 6000 },
            statusPool: 0, statusPoolGasto: 5, statusPoolAlocado: { forca: 5000 },
            divisores: { status: 1 },
        });
        const mockState = montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const row = linhaAtributoBase('Força');

        fireEvent.change(campoQtdDevolver(row), { target: { value: '-3' } });
        fireEvent.click(botaoDevolver(row));

        expect(ficha.forca.base).toBe(6000);
        expect(ficha.statusPoolAlocado.forca).toBe(5000);
        expect(mockState.updateFicha).not.toHaveBeenCalled();
    });

    it('EXPLOIT FECHADO: um atributo que nunca recebeu nada do pool não exibe o botão "− Pool", mesmo com statusPoolGasto GLOBAL positivo por causa de outro atributo', () => {
        // Destreza recebeu 50 pontos do pool (div=1); Força nunca recebeu nada.
        const ficha = fichaComStats({
            statBase: 1000, attrBases: { destreza: 51000, forca: 1000 },
            statusPool: 0, statusPoolGasto: 50, statusPoolAlocado: { destreza: 50000 },
            divisores: { status: 1 },
        });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const rowForca = linhaAtributoBase('Força');
        const rowDestreza = linhaAtributoBase('Destreza');

        // Força: statusPoolAlocado.forca é 0/ausente -> poolGastoDisponivel=0 -> "− Pool" some,
        // mesmo com statusPoolGasto global (50) positivo por causa de Destreza.
        expect(botaoDevolver(rowForca)).toBeNull();
        // Destreza, que realmente recebeu, continua exibindo o controle normalmente.
        expect(botaoDevolver(rowDestreza)).toBeTruthy();
    });

    it('EXPLOIT FECHADO: devolução de um atributo é sempre capada pela alocação LOCAL dele (statusPoolAlocado[attrKey]), nunca pelo statusPoolGasto GLOBAL concedido a outro atributo', () => {
        // Destreza recebeu 45 pontos; Força recebeu só 5 pontos (div=1). statusPoolGasto GLOBAL=50.
        const ficha = fichaComStats({
            statBase: 1000, attrBases: { destreza: 46000, forca: 6000 },
            statusPool: 0, statusPoolGasto: 50,
            statusPoolAlocado: { destreza: 45000, forca: 5000 },
            divisores: { status: 1 },
        });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const rowForca = linhaAtributoBase('Força');

        // O input tem max=5 (pontosAlocadosStatus('forca')=floor(5000/1000*1)=5), mas HTML `max`
        // não impede digitar um valor maior — simula um pedido de 50 pontos (dentro do
        // statusPoolGasto GLOBAL, mas MUITO acima do que Força recebeu de fato).
        fireEvent.change(campoQtdDevolver(rowForca), { target: { value: '50' } });
        fireEvent.click(botaoDevolver(rowForca));

        // Capado nos 5000 de base que Força de fato recebeu — nunca nos 50000 (50 pts) que o
        // pedido implicava, mesmo esses 50000 "cabendo" dentro do statusPoolGasto GLOBAL de 50.
        expect(ficha.forca.base).toBe(1000); // 6000 - 5000
        expect(ficha.statusPoolAlocado.forca).toBe(0);
        expect(ficha.statusPoolGasto).toBe(45); // 50 - 5 (não 0, não negativo)
        expect(ficha.statusPool).toBe(5);
        // Destreza permanece intocada.
        expect(ficha.destreza.base).toBe(46000);
        expect(ficha.statusPoolAlocado.destreza).toBe(45000);
    });

    it('drift de divisor: base bruta removida corresponde ao que foi REALMENTE alocado, não a uma reconversão via o divisor NOVO', () => {
        const ficha = fichaComStats({
            statBase: 1000, statusPool: 100, statusPoolGasto: 0, statusPoolAlocado: {},
            divisores: { status: 1 },
        });
        montarMockUseStore(ficha);

        const { rerender } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        // Aloca 20 pontos em Força com divisor=1: acrescimo = floor(20/1*1000) = 20000.
        const row1 = linhaAtributoBase('Força');
        fireEvent.change(campoQtdAlocar(row1), { target: { value: '20' } });
        fireEvent.click(botaoConfirmarPool(row1));
        expect(ficha.forca.base).toBe(21000);
        expect(ficha.statusPoolAlocado.forca).toBe(20000);
        expect(ficha.statusPool).toBe(80);
        expect(ficha.statusPoolGasto).toBe(20);

        // Muda o divisor de Status de 1 para 2 SEM tocar em statusPoolAlocado (que é base bruta,
        // imune ao divisor).
        ficha.divisores.status = 2;
        rerender(<MarcadosPanel />);

        // Devolve pedindo 40 "pontos" — sob o divisor NOVO (2), isso equivale a
        // floor((40/2)*1000) = 20000 de base, que bate EXATAMENTE com o que foi alocado (20000),
        // não com uma reconversão dos "20 pontos" originalmente gastos sob o divisor antigo.
        const row2 = linhaAtributoBase('Força');
        fireEvent.change(campoQtdDevolver(row2), { target: { value: '40' } });
        fireEvent.click(botaoDevolver(row2));

        expect(ficha.forca.base).toBe(1000); // volta exatamente ao valor original pré-alocação
        expect(ficha.statusPoolAlocado.forca).toBe(0);
        // usar = floor((20000/1000)*2) = 40 pontos creditados de volta (usando o divisor NOVO).
        expect(ficha.statusPool).toBe(120); // 80 + 40
        expect(ficha.statusPoolGasto).toBe(0); // max(0, 20 - 40) — nunca fica negativo
        expect(window.alert).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// QA — Prestígio como CAUSA, nunca consequência: alocar pool não deve "inflar" o Rank/Badge de
// Status (que agora vem de statusPrestigioAplicado, não da média ao vivo dos 8 atributos) + testes
// da distribuição igualitária (distribuirPoolIgualmente / botão "⚖️ Distribuir pool igualmente").
// ---------------------------------------------------------------------------
describe('Marcados — Rank/Badge de Status não reage à alocação do pool (só ao campo STATUS editado)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('alocar pontos do pool num atributo via "+ Pool" NÃO muda o Rank/Ascensão/badge de Status exibido no grid "Mecânicas de Ascensão e Divisores"', () => {
        // statusPrestigioAplicado=5 é a única fonte do Rank/Badge de Status agora — as bases dos 8
        // atributos físicos partem de 0 e um bloco generoso de pool (800) fica disponível pra
        // alocação, propositalmente desconectado de statusPrestigioAplicado. Tanto o painel
        // "Status (Rank Base)" (com o botão "+ Pool") quanto o grid de Rank/Badge vivem na mesma
        // Página 2 ("Análise de Poder"), então não há necessidade de trocar de página entre as
        // duas leituras.
        const ficha = fichaComStats({ statBase: 0, statusPool: 800, statusPoolGasto: 0, statusPrestigioAplicado: 5, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        const { container, rerender } = render(<MarcadosPanel />);
        irParaPaginaAnalise();
        const badgeAntes = badgeRankStatus(container);

        const row = linhaAtributoBase('Força');
        fireEvent.change(campoQtdAlocar(row), { target: { value: '800' } });
        fireEvent.click(botaoConfirmarPool(row));

        // A alocação de fato aconteceu (prova de que o teste não é um falso positivo por
        // inatividade): Força ganhou toda a base bruta do pool, e o pool foi zerado.
        expect(ficha.forca.base).toBe(800000);
        expect(ficha.statusPool).toBe(0);

        rerender(<MarcadosPanel />);
        const badgeDepois = badgeRankStatus(container);

        expect(badgeDepois).toBe(badgeAntes);
        expect(ficha.statusPrestigioAplicado).toBe(5); // inalterado — só handleTabelaChange mexe nisso
    });
});

describe('Marcados — distribuirPoolIgualmente (botão "⚖️ Distribuir pool igualmente")', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('distribui floor(pool/8) para cada um dos 8 atributos, mantendo o restante (não divisível por 8) no pool', () => {
        // pool=50 -> porAtributo=floor(50/8)=6 -> acrescimo=floor((6/1)*1000)=6000 por atributo.
        // usarTotal=48; sobra 2 no pool.
        const ficha = fichaComStats({ statBase: 1000, statusPool: 50, statusPoolGasto: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        fireEvent.click(botaoDistribuirIgualmente());

        STATS8.forEach(attr => {
            expect(ficha[attr].base).toBe(7000); // 1000 + 6000
            expect(ficha.statusPoolAlocado[attr]).toBe(6000);
        });
        expect(ficha.statusPool).toBe(2); // 50 - 48
        expect(ficha.statusPoolGasto).toBe(48);
    });

    it('quando o pool disponível é menor que 8, o botão nem é renderizado (nenhuma distribuição parcial silenciosa)', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 7, statusPoolGasto: 0, divisores: { status: 1 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        // O banner de pool disponível continua visível (pool > 0)...
        expect(screen.getByText(/Pontos de Status Disponíveis: 7/)).toBeTruthy();
        // ...mas o botão de distribuição igualitária não aparece com pool < 8.
        expect(botaoDistribuirIgualmente()).toBeNull();
    });

    it('divisor grande o bastante pra floor(pool/8) virar 0 de base bruta não gasta pool nem muta nenhum atributo, mesmo com o botão visível (pool >= 8)', () => {
        // pool=8 -> porAtributo=floor(8/8)=1 -> acrescimo=floor((1/1000000)*1000)=floor(0.001)=0
        // -> guarda `if (acrescimo <= 0) return` interrompe antes de qualquer mutação.
        const ficha = fichaComStats({ statBase: 1000, statusPool: 8, statusPoolGasto: 0, divisores: { status: 1000000 } });
        montarMockUseStore(ficha);

        render(<MarcadosPanel />);
        irParaPaginaAnalise();

        expect(botaoDistribuirIgualmente()).toBeTruthy(); // pool=8 >= 8, botão aparece
        fireEvent.click(botaoDistribuirIgualmente());

        STATS8.forEach(attr => expect(ficha[attr].base).toBe(1000)); // inalterado
        expect(ficha.statusPool).toBe(8); // inalterado
        expect(ficha.statusPoolGasto).toBe(0); // inalterado
        expect(ficha.statusPoolAlocado).toEqual({}); // nenhuma alocação registrada
    });
});
