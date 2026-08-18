import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';
import { getRank } from '../../core/prestige.js';

// ---------------------------------------------------------------------------
// QA — Multiplicador de Força (aplicarMultiplicadorForca) em Marcados.jsx
//
// aplicarMultiplicadorForca(prestigioAtual, ascensaoAtual, multiplicador) é uma
// função local, não exportada, que apenas multiplica os dois valores de entrada
// e delega inteiramente ao getRank() já testado (core/prestige.js) para o
// transbordo. É uma cópia fiel da mesma função em TabelaPrestigio.jsx (ver
// TabelaPrestigio.forca.test.jsx), agora usada na Página 2 ("Análise de
// Poder") de Marcados.jsx, no grid VIDA/MANA/AURA/CHAKRA/CORPO/STATUS.
//
// Como não é exportada, validamos renderizando o componente real, navegando
// para a Página 2 e lendo o badge de Rank + o número de Prestígio exibidos
// na caixa de cada vital, comparando com chamadas diretas a getRank().
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
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
        mana: { base: 0 },
        aura: { base: 0 },
        chakra: { base: 0 },
        corpo: { base: 0 },
        forca: { base: 0 },
        destreza: { base: 0 },
        inteligencia: { base: 0 },
        sabedoria: { base: 0 },
        energiaEsp: { base: 0 },
        carisma: { base: 0 },
        stamina: { base: 0 },
        constituicao: { base: 0 },
        ascensaoBase,
        divisores: {},
        bio: {},
        estetica: {},
        labels: {},
    };
    if (multiplicadorForca !== undefined) ficha.multiplicadorForca = multiplicadorForca;
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
}

function irParaPaginaAnalise() {
    const botaoProxima = screen.getByRole('button', { name: /Próxima/ });
    fireEvent.click(botaoProxima);
}

// Localiza a caixa de rank (badge + número) do vital pela sua sigla exibida
// (ex: "VIDA"). Estrutura por card: [linha do header c/ sigla+divisor],
// [caixa do prestígio bruto], [caixa do rank+número] — nessa ordem.
function lerCaixaVital(container, chave) {
    const spans = Array.from(container.querySelectorAll('span'));
    const labelSpan = spans.find(s => s.textContent === chave.toUpperCase());
    const headerRow = labelSpan.parentElement;
    const cardWrapper = headerRow.parentElement;
    const rankBox = cardWrapper.children[2];
    const rankSpans = rankBox.querySelectorAll('span');
    return {
        rankTexto: rankSpans[0].textContent,
        rankCor: rankSpans[0].style.color,
        numero: rankSpans[1].textContent,
    };
}

describe('Marcados — Multiplicador de Força (aplicarMultiplicadorForca)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it('multiplicador=1 (padrão/ausente) reproduz exatamente getRank(prestigio, ascensao) sem multiplicador', () => {
        // vida.base = 63.000.000 -> prestígio real = 63 (regra de VIDA: /1.000.000)
        const ficha = fichaComVida({ vidaBase: 63000000, ascensaoBase: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const esperado = getRank(63, 4);
        const { rankTexto, rankCor, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe(esperado.r.toLocaleString('pt-BR'));
        expect(rankTexto).toBe(`Rank ${esperado.l} [A${esperado.a}]`);
        expect(rankCor).toBe(HEX_TO_RGB[esperado.c]);
        expect(esperado.l).toBe('A');
        expect(esperado.r).toBe(63);
        expect(esperado.a).toBe(4);
    });

    it('multiplicador > 1 empurra o prestígio além de 100, convertendo o excesso em Ascensão extra', () => {
        // prestígio=45, ascensãoBase=2, multiplicador=3 -> multiplicado=135
        // ascExtra=1, resto=35, ascensão final = (2*3) + 1 = 7
        const ficha = fichaComVida({ vidaBase: 45000000, ascensaoBase: 2, multiplicadorForca: 3 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, rankCor, numero } = lerCaixaVital(container, 'vida');

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

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, rankCor, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe('100');
        expect(rankTexto).toBe('Rank EX [A2]');
        expect(rankCor).toBe(HEX_TO_RGB['#f0f']);
    });

    it('multiplicador=0 cai no fallback (parseFloat(0)||1 = 1) e não altera o resultado', () => {
        // prestígio=25, ascensãoBase=3; multiplicador=0 é falsy -> tratado como 1
        const ficha = fichaComVida({ vidaBase: 25000000, ascensaoBase: 3, multiplicadorForca: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const esperado = getRank(25, 3);
        const { rankTexto, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe(esperado.r.toLocaleString('pt-BR'));
        expect(rankTexto).toBe(`Rank ${esperado.l} [A${esperado.a}]`);
        expect(rankTexto).toBe('Rank C [A3]');
        expect(numero).toBe('25');
    });

    it('multiplicador inválido (NaN/string não numérica) cai no fallback e usa 1', () => {
        // prestígio=25, ascensãoBase=3; multiplicador='abc' -> parseFloat gera NaN -> fallback 1
        const ficha = fichaComVida({ vidaBase: 25000000, ascensaoBase: 3, multiplicadorForca: 'abc' });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const esperado = getRank(25, 3);
        const { rankTexto, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe(esperado.r.toLocaleString('pt-BR'));
        expect(rankTexto).toBe(`Rank ${esperado.l} [A${esperado.a}]`);
    });

    it('prestígio negativo com multiplicador mantém resto travado em 0 e não altera a ascensão', () => {
        // vida.base negativo -> prestígio real = -5; multiplicador=4 -> multiplicado=-20
        // resto clampado a 0; ascensão = (3*4) + 0 = 12, não afetada pelo valor negativo
        const ficha = fichaComVida({ vidaBase: -5000000, ascensaoBase: 3, multiplicadorForca: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, rankCor, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe('0');
        expect(rankTexto).toBe('Rank D [A12]');
        expect(rankCor).toBe(HEX_TO_RGB['#ff003c']);
    });

    it('prestígio zero (vida.base=0) com multiplicador não gera Ascensão extra nem erro', () => {
        // prestígio=0 * multiplicador=2 = 0; ascensão = (5*2) + 0 = 10
        const ficha = fichaComVida({ vidaBase: 0, ascensaoBase: 5, multiplicadorForca: 2 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, numero } = lerCaixaVital(container, 'vida');

        expect(numero).toBe('0');
        expect(rankTexto).toBe('Rank D [A10]');
    });

    it('badge de Rank (l, c) e número exibido (r, a) nunca divergem — vêm da mesma chamada multiplicada', () => {
        const ficha = fichaComVida({ vidaBase: 45000000, ascensaoBase: 2, multiplicadorForca: 3 });
        montarMockUseStore(ficha);

        const { container } = render(<MarcadosPanel />);
        irParaPaginaAnalise();

        const { rankTexto, numero } = lerCaixaVital(container, 'vida');
        const numeroExibido = Number(numero.replace(/\./g, ''));

        expect(rankTexto).toContain('Rank C');
        expect(numeroExibido).toBeGreaterThanOrEqual(20);
        expect(numeroExibido).toBeLessThan(40);
        expect(numeroExibido).toBe(35);
    });
});
