import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabelaPrestigio from './TabelaPrestigio';
import useStore from '../../stores/useStore';
import { getRank } from '../../core/prestige.js';

// ---------------------------------------------------------------------------
// QA — Multiplicador de Força (aplicarMultiplicadorForca) em TabelaPrestigio
//
// aplicarMultiplicadorForca(prestigioAtual, ascensaoAtual, multiplicador) é uma
// função local, não exportada, que apenas multiplica os dois valores de entrada
// e delega inteiramente ao getRank() já testado (core/prestige.js) para o
// transbordo. Como não é exportada, validamos renderizando o componente real
// (mesmo padrão de Marcados.forca.test.jsx) e lendo o Rank/Prestígio exibidos
// no bloco "PRESTÍGIO ATUAL", comparando com chamadas diretas a getRank().
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync.js', () => ({
    salvarFichaSilencioso: vi.fn(() => Promise.resolve()),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(),
}));

const HEX_TO_RGB = {
    '#ff003c': 'rgb(255, 0, 60)',   // D
    '#ccc': 'rgb(204, 204, 204)',   // C
    '#0088ff': 'rgb(0, 136, 255)',  // B
    '#00ff88': 'rgb(0, 255, 136)',  // A
    '#ffcc00': 'rgb(255, 204, 0)',  // S
    '#f0f': 'rgb(255, 0, 255)',     // EX
};

function fichaComVida({ vidaBase = 0, ascensaoBase = 1, multiplicadorForca } = {}) {
    const ficha = {
        vida: { base: vidaBase },
        ascensaoBase,
        divisores: {},
    };
    if (multiplicadorForca !== undefined) ficha.multiplicadorForca = multiplicadorForca;
    return ficha;
}

function montarMockUseStore(minhaFicha) {
    const mockState = {
        minhaFicha,
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
}

// VITALS_KEYS = ['vida', 'mana', 'aura', 'chakra', 'corpo', 'status'] — index 0 = VIDA.
// displays[0] é a "Ascensão Efetiva (Média)"; displays[index+1] é o número do vital.
function lerVital(container, index) {
    const atualBox = container.querySelector('.tabela-prestigio.atual');
    const labelDivisors = atualBox.querySelectorAll('.label-divisor');
    const displays = atualBox.querySelectorAll('.prestige-display-atual');
    const spans = labelDivisors[index].querySelectorAll('span');
    return {
        rankTexto: spans[1].textContent,
        rankCor: spans[1].style.color,
        numero: displays[index + 1].textContent,
    };
}

describe('TabelaPrestigio — Multiplicador de Força (aplicarMultiplicadorForca)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('multiplicador=1 (padrão/ausente) reproduz exatamente getRank(prestigio, ascensao) sem multiplicador', () => {
        // vida.base = 63.000.000 -> prestígio real = 63 (regra de VIDA: /1.000.000)
        const ficha = fichaComVida({ vidaBase: 63000000, ascensaoBase: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const esperado = getRank(63, 4);
        const { rankTexto, rankCor, numero } = lerVital(container, 0);

        expect(numero).toBe(esperado.r.toLocaleString('pt-BR'));
        expect(rankTexto).toBe(`Rank ${esperado.l} [A${esperado.a}]`);
        expect(rankCor).toBe(HEX_TO_RGB[esperado.c]);
        // Regressão explícita: sem multiplicador, o resultado é idêntico ao getRank cru.
        expect(esperado.l).toBe('A');
        expect(esperado.r).toBe(63);
        expect(esperado.a).toBe(4);
    });

    it('multiplicador > 1 empurra o prestígio além de 100, convertendo o excesso em Ascensão extra', () => {
        // prestígio=45, ascensãoBase=2, multiplicador=3 -> multiplicado=135
        // ascExtra=1, resto=35, ascensão final = (2*3) + 1 = 7
        const ficha = fichaComVida({ vidaBase: 45000000, ascensaoBase: 2, multiplicadorForca: 3 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, rankCor, numero } = lerVital(container, 0);

        expect(numero).toBe('35');
        expect(rankTexto).toBe('Rank C [A7]');
        expect(rankCor).toBe(HEX_TO_RGB['#ccc']);
        // Não pode divergir: o número exibido não é o prestígio bruto (45) pré-multiplicador.
        expect(numero).not.toBe('45');
    });

    it('boundary exato em 100 após o multiplicador mantém o rank EX (resto=100), sem rolar para o próximo bloco', () => {
        // prestígio=50, ascensãoBase=1, multiplicador=2 -> multiplicado=100 exatamente
        // ascExtra bruto seria 1, mas o caso especial reduz para 0 e fixa resto=100 (EX)
        const ficha = fichaComVida({ vidaBase: 50000000, ascensaoBase: 1, multiplicadorForca: 2 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, rankCor, numero } = lerVital(container, 0);

        expect(numero).toBe('100');
        expect(rankTexto).toBe('Rank EX [A2]');
        expect(rankCor).toBe(HEX_TO_RGB['#f0f']);
    });

    it('prestígio negativo com multiplicador mantém resto travado em 0 e não altera a ascensão', () => {
        // vida.base negativo -> prestígio real = -5; multiplicador=4 -> multiplicado=-20
        // resto clampado a 0; ascensão = (3*4) + 0 = 12, não afetada pelo valor negativo
        const ficha = fichaComVida({ vidaBase: -5000000, ascensaoBase: 3, multiplicadorForca: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, rankCor, numero } = lerVital(container, 0);

        expect(numero).toBe('0');
        expect(rankTexto).toBe('Rank D [A12]');
        expect(rankCor).toBe(HEX_TO_RGB['#ff003c']);
    });

    it('badge de Rank (l, c) e número exibido (r, a) nunca divergem — vêm da mesma chamada multiplicada', () => {
        // Mesmo cenário de transbordo do teste 2: se o número exibido usasse o prestígio
        // bruto (pAtualValor=45, faixa B) enquanto o badge usasse o rank multiplicado
        // (resto=35, faixa C), o teste abaixo pegaria a divergência.
        const ficha = fichaComVida({ vidaBase: 45000000, ascensaoBase: 2, multiplicadorForca: 3 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, numero } = lerVital(container, 0);
        const numeroExibido = Number(numero.replace(/\./g, ''));

        // resto=35 está na faixa de Rank C (20-39); se número e badge divergissem,
        // o número exibido (ex: 45, faixa B) não bateria com a faixa do rank exibido (C).
        expect(rankTexto).toContain('Rank C');
        expect(numeroExibido).toBeGreaterThanOrEqual(20);
        expect(numeroExibido).toBeLessThan(40);
        expect(numeroExibido).toBe(35);
    });
});
