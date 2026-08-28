import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabelaPrestigio from './TabelaPrestigio';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Pool de pontos de Status em TabelaPrestigio.jsx (3ª iteração de design)
//
// Mesma regra de negócio do onChange de Marcados.jsx (ver
// Marcados.statusPool.test.jsx): o input STATUS na coluna "PRESTÍGIO BASE"
// edita DIRETAMENTE ficha.statusPrestigioAplicado. Só a DIFERENÇA em relação ao
// último valor aplicado credita/debita ficha.statusPool, multiplicada pela
// Ascensão ATUAL de Status (calcularAscensaoAtualStatus — mesmo cálculo do
// badge Rank exibido na coluna "PRESTÍGIO ATUAL": 8 pool/ponto em Ascensão 1,
// 16 em Ascensão 2 etc). Reduções além do pool ainda não gasto são clampadas em
// 0 (parciais, alert()); statusPrestigioAplicado avança só pelo que coube.
// Mudar a Ascensão sozinha nunca recalcula o pool já concedido.
//
// TabelaPrestigio NÃO tem alocarPontoStatus/devolverPontoStatus (exclusivos de
// Marcados.jsx "Ficha Def") — o cenário de Ascensão 2 aqui é simulado
// diretamente via a Base já alocada em Força na ficha fixture (equivalente ao
// resultado de uma alocação real feita na aba "Ficha Def").
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync.js', () => ({
    salvarFichaSilencioso: vi.fn(() => Promise.resolve()),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(),
}));

const STATS8 = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function fichaComStats({
    statBase = 0, statusPool = 0, statusPoolGasto = 0, statusPrestigioAplicado = 0,
    divisores = {}, ascensaoBase = 1, attrBases = {},
} = {}) {
    const ficha = { ascensaoBase, divisores, statusPool, statusPoolGasto, statusPrestigioAplicado };
    STATS8.forEach(s => { ficha[s] = { base: attrBases[s] !== undefined ? attrBases[s] : statBase }; });
    return ficha;
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// Localiza o input de Prestígio Base (campoEditavel) da categoria STATUS — bloco
// "PRESTÍGIO BASE" (children[1] do card).
function inputPrestigioBaseStatus(container) {
    const baseBox = container.querySelector('.tabela-prestigio:not(.atual)');
    const spans = Array.from(baseBox.querySelectorAll('span'));
    const statusSpan = spans.find(s => s.textContent === 'STATUS');
    const labelDivisorDiv = statusSpan.parentElement;
    return labelDivisorDiv.nextElementSibling;
}

describe('TabelaPrestigio — campo STATUS edita ficha.statusPrestigioAplicado diretamente', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('o campo editável mostra ficha.statusPrestigioAplicado, não a média ao vivo dos 8 atributos', () => {
        const ficha = fichaComStats({ statBase: 999999, statusPrestigioAplicado: 7 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        expect(inputPrestigioBaseStatus(container).value).toBe('7');
    });

    it('aumentar o Prestígio credita o delta * 8 * ascensaoAtual(=1) no statusPool, sem alterar os 8 atributos', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0, statusPoolGasto: 0, statusPrestigioAplicado: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);
        expect(input.value).toBe('0');

        // delta=10; ascensaoAtual=1; poolCreditoAlvo=10*8*1=80.
        fireEvent.change(input, { target: { value: '10' } });

        expect(ficha.statusPool).toBe(80);
        expect(ficha.statusPrestigioAplicado).toBe(10);
        STATS8.forEach(s => expect(ficha[s].base).toBe(1000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio com pool SUFICIENTE reduz o pool e não mexe nos atributos, sem alerta', () => {
        const ficha = fichaComStats({ statBase: 5000, statusPool: 70, statusPoolGasto: 10, statusPrestigioAplicado: 10 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);
        expect(input.value).toBe('10');

        // delta=-5; poolCreditoAlvo=-40; poolAntes=70; 70-40=30 (>=0).
        fireEvent.change(input, { target: { value: '5' } });

        expect(ficha.statusPool).toBe(30);
        expect(ficha.statusPoolGasto).toBe(10); // onChange nunca mexe no gasto
        expect(ficha.statusPrestigioAplicado).toBe(5);
        STATS8.forEach(s => expect(ficha[s].base).toBe(5000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio com pool INSUFICIENTE (parte já alocada em atributos) avança statusPrestigioAplicado só pelo que coube, zera o pool e dispara alert', () => {
        const ficha = fichaComStats({
            statBase: 0, attrBases: { forca: 56000 },
            statusPool: 24, statusPoolGasto: 56, statusPrestigioAplicado: 10, divisores: { status: 1 },
        });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);

        // deltaPrestigio=-8; poolCreditoAlvo=-64; poolAntes=24; 24-64=-40 (<0) -> clamp 0.
        // creditoRealAplicado=-24 -> statusPrestigioAplicado = 10 + (-24/8) = 7.
        fireEvent.change(input, { target: { value: '2' } });

        expect(ficha.statusPool).toBe(0);
        expect(ficha.statusPoolGasto).toBe(56);
        expect(ficha.statusPrestigioAplicado).toBe(7);
        expect(ficha.forca.base).toBe(56000);
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('Só foi possível remover 24 dos 64 pontos de pool pedidos');
    });

    it('outras categorias (ex: VIDA) continuam usando o comportamento antigo (sem pool, base = val * multiplicador)', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0, statusPoolGasto: 0 });
        ficha.vida = { base: 0 };
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const baseBox = container.querySelector('.tabela-prestigio:not(.atual)');
        const spans = Array.from(baseBox.querySelectorAll('span'));
        const vidaSpan = spans.find(s => s.textContent === 'VIDA');
        const input = vidaSpan.parentElement.nextElementSibling;

        fireEvent.change(input, { target: { value: '20' } });

        // MULTIPLICADORES.vida = 1.000.000 -> vida.base = 20*1.000.000 = 20.000.000.
        expect(ficha.vida.base).toBe(20000000);
        expect(ficha.statusPool).toBe(0);
    });

    it('BUG FIX: aumentar -> reduzir totalmente de volta -> aumentar para o MESMO valor de antes NÃO duplica o pool', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 40, statusPoolGasto: 0, statusPrestigioAplicado: 5 });
        montarMockUseStore(ficha);

        const { container, rerender } = render(<TabelaPrestigio />);
        expect(inputPrestigioBaseStatus(container).value).toBe('5');

        // N(5) -> M(10): delta=5; poolCreditoAlvo=40; poolAntes=40 -> statusPool=80.
        fireEvent.change(inputPrestigioBaseStatus(container), { target: { value: '10' } });
        expect(ficha.statusPool).toBe(80);
        expect(ficha.statusPrestigioAplicado).toBe(10);
        // 🔥 Re-renderiza para que o input controlado reflita o novo campoEditavel (mesmo efeito de
        // um re-render real disparado pelo Zustand em produção) antes do próximo fireEvent.
        rerender(<TabelaPrestigio />);

        // M(10) -> N(5) de volta: delta=-5; poolCreditoAlvo=-40; poolAntes=80; 80-40=40 (>=0).
        fireEvent.change(inputPrestigioBaseStatus(container), { target: { value: '5' } });
        expect(ficha.statusPool).toBe(40);
        expect(ficha.statusPrestigioAplicado).toBe(5);
        expect(window.alert).not.toHaveBeenCalled();
        rerender(<TabelaPrestigio />);

        // N(5) -> M(10) de novo: se houvesse double counting, o pool teria virado 120+.
        // Com a correção, é EXATAMENTE o mesmo resultado da primeira transição: 80.
        fireEvent.change(inputPrestigioBaseStatus(container), { target: { value: '10' } });
        expect(ficha.statusPool).toBe(80);
        expect(ficha.statusPrestigioAplicado).toBe(10);
    });

    it('Ascensão 2 (overflow real: Força já alocada o suficiente para elevar a média dos 8 atributos) credita 16 pool/ponto em vez de 8', () => {
        // Força já recebeu o equivalente a 800 pontos do pool (base 800.000, div=1) — resultado
        // de uma alocação feita antes na aba "Ficha Def". Média dos 8 atributos = 100.000 ->
        // displayPStatus=100 -> ascensaoFinal = 1 + floor(100/100) = 2.
        const ficha = fichaComStats({
            statBase: 0, attrBases: { forca: 800000 },
            statusPool: 0, statusPoolGasto: 800, statusPrestigioAplicado: 100, divisores: { status: 1 },
        });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);
        expect(input.value).toBe('100');

        // delta=10; ascensaoAtual=2 -> poolCreditoAlvo=10*8*2=160.
        fireEvent.change(input, { target: { value: '110' } });

        expect(ficha.statusPool).toBe(160);
        expect(ficha.statusPrestigioAplicado).toBe(110);
    });

    it('mudar a Ascensão do personagem (sem editar o campo STATUS depois) NÃO recalcula o pool já concedido — só afeta crédito de mudanças NOVAS', () => {
        const ficha = fichaComStats({ statBase: 0, statusPool: 80, statusPoolGasto: 0, statusPrestigioAplicado: 10, ascensaoBase: 1 });
        montarMockUseStore(ficha);

        const { container, rerender } = render(<TabelaPrestigio />);
        expect(inputPrestigioBaseStatus(container).value).toBe('10');

        // Muda ascensaoBase diretamente na ficha (nunca passa pelo campo STATUS).
        ficha.ascensaoBase = 5;
        rerender(<TabelaPrestigio />);
        expect(ficha.statusPool).toBe(80);
        expect(ficha.statusPrestigioAplicado).toBe(10);
        expect(inputPrestigioBaseStatus(container).value).toBe('10');

        // Só uma edição NOVA aplica a Ascensão atualizada ao crédito: ascensaoAtual agora é 5
        // (todos os atributos ainda em 0). delta=1 -> poolCreditoAlvo=1*8*5=40 (não mais 8).
        fireEvent.change(inputPrestigioBaseStatus(container), { target: { value: '11' } });
        expect(ficha.statusPool).toBe(120);
        expect(ficha.statusPrestigioAplicado).toBe(11);
    });
});

describe('TabelaPrestigio — Banner "pontos de Status aguardando distribuição"', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('exibe o banner quando ficha.statusPool > 0, com o valor truncado (Math.floor)', () => {
        const ficha = fichaComStats({ statBase: 0, statusPool: 42.9 });
        montarMockUseStore(ficha);

        render(<TabelaPrestigio />);
        expect(screen.getByText(/42 pontos de Status aguardando distribuição/)).toBeTruthy();
    });

    it('não exibe o banner quando ficha.statusPool é 0', () => {
        const ficha = fichaComStats({ statBase: 0, statusPool: 0 });
        montarMockUseStore(ficha);

        render(<TabelaPrestigio />);
        expect(screen.queryByText(/pontos de Status aguardando distribuição/)).toBeNull();
    });

    it('não exibe o banner quando ficha.statusPool é undefined (ficha antiga sem o campo)', () => {
        const ficha = fichaComStats({ statBase: 0 });
        delete ficha.statusPool;
        montarMockUseStore(ficha);

        render(<TabelaPrestigio />);
        expect(screen.queryByText(/pontos de Status aguardando distribuição/)).toBeNull();
    });
});
