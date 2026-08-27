import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabelaPrestigio from './TabelaPrestigio';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Pool de pontos de Status em TabelaPrestigio.jsx
//
// Mesma regra de negócio do handleTabelaChange de Marcados.jsx (ver
// Marcados.statusPool.test.jsx), aplicada ao onChange inline do input STATUS na
// coluna "PRESTÍGIO BASE": alterar o Prestígio agregado de status NÃO iguala mais
// os 8 atributos físicos — credita a diferença em ficha.statusPool. Se reduzir
// além do que o pool comporta, um alert() avisa e o pool é clampado em 0.
//
// 🔥 ATUALIZADO (correção dos 2 bugs relatados pelo usuário):
// 1) Unidade "pontos": a conta usa `val * STATS.length` (pontos), NUNCA
//    `val * 1000 * STATS.length` (base bruta) — aplicar 2 pontos de Prestígio
//    credita 16 pontos no pool, não 16000.
// 2) O baseline da comparação (e o próprio campo editável do input) é
//    `statusPool + statusPoolGasto` (total já concedido, estável) — NUNCA a
//    média ao vivo dos 8 atributos (`calcBaseP`), que oscila conforme o pool é
//    distribuído e causaria "double counting" ao reduzir e re-aumentar o mesmo
//    valor.
//
// Também cobre o banner "pontos de Status aguardando distribuição" exibido
// quando ficha.statusPool > 0.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync.js', () => ({
    salvarFichaSilencioso: vi.fn(() => Promise.resolve()),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(),
}));

const STATS8 = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

function fichaComStats({ statBase = 0, statusPool = 0, statusPoolGasto = 0, divisores = {} } = {}) {
    const ficha = { ascensaoBase: 1, divisores, statusPool, statusPoolGasto };
    STATS8.forEach(s => { ficha[s] = { base: statBase }; });
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

// Localiza o input de Prestígio Base (campoEditavel) da categoria STATUS — mesma
// estrutura de card usada em TabelaPrestigio.forca.test.jsx > lerVital, mas lendo
// o INPUT do bloco "PRESTÍGIO BASE" (children[1] do card) em vez do texto final
// do bloco "PRESTÍGIO ATUAL".
function inputPrestigioBaseStatus(container) {
    const baseBox = container.querySelector('.tabela-prestigio:not(.atual)');
    const spans = Array.from(baseBox.querySelectorAll('span'));
    const statusSpan = spans.find(s => s.textContent === 'STATUS');
    const labelDivisorDiv = statusSpan.parentElement;
    return labelDivisorDiv.nextElementSibling;
}

describe('TabelaPrestigio — Pool de Status (onChange do input STATUS em PRESTÍGIO BASE)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.alert = vi.fn();
    });

    afterEach(() => cleanup());

    it('o campo editável mostra floor((statusPool+statusPoolGasto)/8) em PONTOS, não a média ao vivo dos 8 atributos', () => {
        // Bases dos 8 atributos propositalmente enormes (média ao vivo seria gigante) para provar
        // que o campo NÃO deriva mais de calcBaseP — só de pool+gasto.
        const ficha = fichaComStats({ statBase: 999999, statusPool: 8, statusPoolGasto: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);
        // floor((8+0)/8) = 1 — se ainda usasse a média ao vivo (calcBaseP), o valor seria ~124.
        expect(input.value).toBe('1');
    });

    it('aumentar o Prestígio de status credita o delta em PONTOS no statusPool (N*8, não N*8000) SEM alterar os 8 atributos individuais', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0, statusPoolGasto: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);
        expect(input.value).toBe('0');

        // val=10 -> somaAlvoPontos=10*8=80; concedidoAntes=0; delta=80 -> statusPool=80.
        // (Bug antigo teria gerado 80000, multiplicando por 1000 indevidamente.)
        fireEvent.change(input, { target: { value: '10' } });

        expect(ficha.statusPool).toBe(80);
        STATS8.forEach(s => expect(ficha[s].base).toBe(1000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio de status com pool SUFICIENTE reduz o pool e não mexe nos atributos, sem alerta', () => {
        const ficha = fichaComStats({ statBase: 5000, statusPool: 70, statusPoolGasto: 10 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);
        // campoEditavel = floor((70+10)/8) = 10.
        expect(input.value).toBe('10');

        // val=5 -> somaAlvoPontos=40; concedidoAntes=80; delta=-40; poolAntes=70;
        // poolAntes+delta=30 (>=0).
        fireEvent.change(input, { target: { value: '5' } });

        expect(ficha.statusPool).toBe(30);
        expect(ficha.statusPoolGasto).toBe(10); // gasto nunca é alterado por handleTabelaChange
        STATS8.forEach(s => expect(ficha[s].base).toBe(5000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio de status com pool INSUFICIENTE zera o pool (nunca negativo), NAO mexe nos atributos e dispara alert', () => {
        const ficha = fichaComStats({ statBase: 5000, statusPool: 5, statusPoolGasto: 95 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);
        // campoEditavel = floor((5+95)/8) = 12.

        // val=2 -> somaAlvoPontos=16; concedidoAntes=100; delta=-84; poolAntes=5;
        // poolAntes+delta=-79 (<0) -> clamp 0 + alert.
        fireEvent.change(input, { target: { value: '2' } });

        expect(ficha.statusPool).toBe(0);
        expect(ficha.statusPoolGasto).toBe(95);
        STATS8.forEach(s => expect(ficha[s].base).toBe(5000));
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('Só foi possível remover 5 dos 84 pontos pedidos');
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

    it('BUG FIX: reduzir o Prestígio de status a um valor N e depois re-aumentar para o mesmo M de antes NÃO duplica o pool (regressão do bug de "15984 pontos")', () => {
        // Estado inicial já representa N=5 concedido (statusPool=40, statusPoolGasto=0).
        const ficha = fichaComStats({ statBase: 1000, statusPool: 40, statusPoolGasto: 0 });
        montarMockUseStore(ficha);

        const { container, rerender } = render(<TabelaPrestigio />);
        expect(inputPrestigioBaseStatus(container).value).toBe('5');

        // N(5) -> M(10): concedidoAntes=40; somaAlvo=80; delta=40 -> statusPool=80.
        fireEvent.change(inputPrestigioBaseStatus(container), { target: { value: '10' } });
        expect(ficha.statusPool).toBe(80);
        // 🔥 Re-renderiza para que o input controlado reflita o novo campoEditavel (mesmo efeito de
        // um re-render real disparado pelo Zustand em produção) antes do próximo fireEvent — sem
        // isso, o DOM controlado não teria trocado seu valor e o próximo change não dispararia.
        rerender(<TabelaPrestigio />);

        // M(10) -> N(5) de volta: concedidoAntes=80; somaAlvo=40; delta=-40; poolAntes=80;
        // 80-40=40 (>=0, sem alerta) -> statusPool volta a 40, igual ao estado inicial.
        fireEvent.change(inputPrestigioBaseStatus(container), { target: { value: '5' } });
        expect(ficha.statusPool).toBe(40);
        expect(window.alert).not.toHaveBeenCalled();
        rerender(<TabelaPrestigio />);

        // N(5) -> M(10) de novo: se houvesse double counting, o pool teria virado 120 (ou mais).
        // Com a correção, é EXATAMENTE o mesmo resultado da primeira transição N->M: 80.
        fireEvent.change(inputPrestigioBaseStatus(container), { target: { value: '10' } });
        expect(ficha.statusPool).toBe(80);
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
