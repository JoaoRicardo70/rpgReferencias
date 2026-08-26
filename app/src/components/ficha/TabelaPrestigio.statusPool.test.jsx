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

function fichaComStats({ statBase = 0, statusPool = 0, divisores = {} } = {}) {
    const ficha = { ascensaoBase: 1, divisores, statusPool };
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

// Localiza o input de Prestígio Base (calcBaseP) da categoria STATUS — mesma
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

    it('aumentar o Prestígio de status credita o delta em statusPool SEM alterar os 8 atributos individuais', () => {
        // 8 atributos com base=1000 cada (soma=8000); calcBaseP = floor((8000/8)/1000)=1.
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);
        expect(input.value).toBe('1');

        // val=10 -> stBaseAlvo=10*1000=10000; somaAlvo=10000*8=80000; somaAtual=8000;
        // delta=72000; statusPool = max(0, 0+72000) = 72000.
        fireEvent.change(input, { target: { value: '10' } });

        expect(ficha.statusPool).toBe(72000);
        STATS8.forEach(s => expect(ficha[s].base).toBe(1000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio de status com pool SUFICIENTE reduz o pool e não mexe nos atributos, sem alerta', () => {
        const ficha = fichaComStats({ statBase: 5000, statusPool: 100000 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);
        expect(input.value).toBe('5');

        // val=2 -> stBaseAlvo=2000; somaAlvo=16000; somaAtual=40000; delta=-24000;
        // poolAntes=100000; poolAntes+delta=76000 (>=0).
        fireEvent.change(input, { target: { value: '2' } });

        expect(ficha.statusPool).toBe(76000);
        STATS8.forEach(s => expect(ficha[s].base).toBe(5000));
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('diminuir o Prestígio de status com pool INSUFICIENTE zera o pool (nunca negativo), NAO mexe nos atributos e dispara alert', () => {
        const ficha = fichaComStats({ statBase: 5000, statusPool: 1000 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const input = inputPrestigioBaseStatus(container);

        fireEvent.change(input, { target: { value: '2' } });

        expect(ficha.statusPool).toBe(0);
        STATS8.forEach(s => expect(ficha[s].base).toBe(5000));
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('Só foi possível remover 1000 dos 24000 pontos pedidos');
    });

    it('outras categorias (ex: VIDA) continuam usando o comportamento antigo (sem pool, base = val * multiplicador)', () => {
        const ficha = fichaComStats({ statBase: 1000, statusPool: 0 });
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
