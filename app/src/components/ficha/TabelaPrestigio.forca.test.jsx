import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabelaPrestigio from './TabelaPrestigio';
import useStore from '../../stores/useStore';
import { getRank } from '../../core/prestige.js';

// ---------------------------------------------------------------------------
// QA — Multiplicador de Força (aplicarMultiplicadorForca) em TabelaPrestigio
//
// aplicarMultiplicadorForca(prestigioBase, ascensaoBase, multiplicadorForcaPrestigio,
// multiplicadorForcaAscensao) é uma função local, não exportada, que escala o
// Prestígio Base pelo seu próprio multiplicador e a Ascensão Base pelo dela — o
// excesso de Prestígio acima de 100 (após escalado) vira Ascensão extra (overflow),
// somada à Ascensão Base já escalada. getRank() é reusado só para o rótulo/cor
// (l, c) do badge; os números exibidos (Ascensão e Prestígio) vêm sempre de
// prestigioFinal/ascensaoFinal, não de getRank().r/.a diretamente. Como não é
// exportada, validamos renderizando o componente real (mesmo padrão de
// Marcados.multiplicadorForca.test.jsx) e lendo o Rank/Prestígio exibidos no
// bloco "PRESTÍGIO ATUAL", comparando com chamadas diretas a getRank().
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

function fichaComVida({ vidaBase = 0, ascensaoBase = 1, multiplicadorForcaPrestigio, multiplicadorForcaAscensao } = {}) {
    const ficha = {
        vida: { base: vidaBase },
        ascensaoBase,
        divisores: {},
    };
    if (multiplicadorForcaPrestigio !== undefined) ficha.multiplicadorForcaPrestigio = multiplicadorForcaPrestigio;
    if (multiplicadorForcaAscensao !== undefined) ficha.multiplicadorForcaAscensao = multiplicadorForcaAscensao;
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

describe('TabelaPrestigio — Multiplicador de Força (aplicarMultiplicadorForca, dois parâmetros)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('multiplicadores ausentes (default=1 para ambos) reproduz exatamente getRank(prestigio, ascensao) sem multiplicador', () => {
        // vida.base = 63.000.000 -> prestígio real = 63 (regra de VIDA: /1.000.000)
        // multP=1, multA=1 -> prestigioTotal=63, prestigioFinal=63, ascensaoFinal=4
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

    it('só multiplicadorForcaPrestigio > 1: escala apenas o Prestígio, overflow vira Ascensão extra, Ascensão Base não é tocada', () => {
        // prestígio=45, ascensãoBase=2, multP=3, multA=1(ausente)
        // prestigioTotal=135, bonusAscensao=1, prestigioFinal=35
        // ascensaoBaseEfetiva=2*1=2, ascensaoFinal=2+1=3
        const ficha = fichaComVida({ vidaBase: 45000000, ascensaoBase: 2, multiplicadorForcaPrestigio: 3 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, rankCor, numero } = lerVital(container, 0);

        expect(numero).toBe('35');
        expect(rankTexto).toBe('Rank C [A3]');
        expect(rankCor).toBe(HEX_TO_RGB['#ccc']);
        // Não pode divergir: o número exibido não é o prestígio bruto (45) pré-multiplicador.
        expect(numero).not.toBe('45');
    });

    it('só multiplicadorForcaAscensao > 1: escala apenas a Ascensão Base, Prestígio não é tocado', () => {
        // prestígio=25, ascensãoBase=3, multP=1(ausente), multA=4
        // prestigioTotal=25, bonusAscensao=0, prestigioFinal=25
        // ascensaoBaseEfetiva=3*4=12, ascensaoFinal=12+0=12
        const ficha = fichaComVida({ vidaBase: 25000000, ascensaoBase: 3, multiplicadorForcaAscensao: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, numero } = lerVital(container, 0);

        expect(numero).toBe('25');
        expect(rankTexto).toBe('Rank C [A12]');
    });

    it('multiplicadorForcaPrestigio e multiplicadorForcaAscensao combinados', () => {
        // prestígio=45, ascensãoBase=2, multP=3, multA=2
        // prestigioTotal=135, bonusAscensao=1, prestigioFinal=35
        // ascensaoBaseEfetiva=2*2=4, ascensaoFinal=4+1=5
        const ficha = fichaComVida({ vidaBase: 45000000, ascensaoBase: 2, multiplicadorForcaPrestigio: 3, multiplicadorForcaAscensao: 2 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, rankCor, numero } = lerVital(container, 0);

        expect(numero).toBe('35');
        expect(rankTexto).toBe('Rank C [A5]');
        expect(rankCor).toBe(HEX_TO_RGB['#ccc']);
    });

    it('overflow que ultrapassa 100 em mais de um bloco gera Ascensão extra proporcional', () => {
        // prestígio=90, ascensãoBase=1, multP=3, multA=1
        // prestigioTotal=270, bonusAscensao=2, prestigioFinal=70
        // ascensaoBaseEfetiva=1*1=1, ascensaoFinal=1+2=3 -> resto=70 cai no Rank A [60,80)
        const ficha = fichaComVida({ vidaBase: 90000000, ascensaoBase: 1, multiplicadorForcaPrestigio: 3 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, rankCor, numero } = lerVital(container, 0);

        expect(numero).toBe('70');
        expect(rankTexto).toBe('Rank A [A3]');
        expect(rankCor).toBe(HEX_TO_RGB['#00ff88']);
    });

    it('overflow exato em múltiplo de 100 (fórmula literal): prestigioFinal=0 vira Rank D, NÃO MAIS o antigo Rank EX', () => {
        // prestígio=50, ascensãoBase=1, multP=2, multA=1 -> prestigioTotal=100 exatamente
        // bonusAscensao=floor(100/100)=1, prestigioFinal = 100 % 100 = 0 (JS puro, sem caso especial)
        // ascensaoBaseEfetiva=1*1=1, ascensaoFinal=1+1=2
        // Nota: este é o comportamento aceito da fórmula literal — diferente do getRank()
        // "cru", que trataria resto=0 pós-overflow como caso especial (EX). Aqui o
        // prestigioFinal já chega em 0 ANTES de entrar no getRank(), então vira Rank D.
        const ficha = fichaComVida({ vidaBase: 50000000, ascensaoBase: 1, multiplicadorForcaPrestigio: 2 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, rankCor, numero } = lerVital(container, 0);

        expect(numero).toBe('0');
        expect(rankTexto).toBe('Rank D [A2]');
        expect(rankCor).toBe(HEX_TO_RGB['#ff003c']);
    });

    it('multiplicadores inválidos (NaN/string e 0) caem no fallback parseFloat(x)||1 = 1 para cada um independentemente', () => {
        // prestígio=25, ascensãoBase=3; multP='abc' -> NaN -> fallback 1; multA=0 -> falsy -> fallback 1
        const ficha = fichaComVida({ vidaBase: 25000000, ascensaoBase: 3, multiplicadorForcaPrestigio: 'abc', multiplicadorForcaAscensao: 0 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const esperado = getRank(25, 3);
        const { rankTexto, numero } = lerVital(container, 0);

        expect(numero).toBe(esperado.r.toLocaleString('pt-BR'));
        expect(rankTexto).toBe(`Rank ${esperado.l} [A${esperado.a}]`);
        expect(rankTexto).toBe('Rank C [A3]');
        expect(numero).toBe('25');
    });

    it('prestígio negativo com multiplicadores: resto do JS puro pode ficar negativo (não clampado) e ainda assim escora Rank D', () => {
        // vida.base negativo -> prestígio real = -5; multP=4, multA=1
        // prestigioTotal=-20, bonusAscensao=floor(-20/100)=-1, prestigioFinal = -20 % 100 = -20 (JS puro)
        // ascensaoBaseEfetiva=3*1=3, ascensaoFinal=3+(-1)=2
        // getRank(-20, 2): v<0 -> resto=0 -> Rank D; ascTotal=2 (bate com nosso ascensaoFinal)
        const ficha = fichaComVida({ vidaBase: -5000000, ascensaoBase: 3, multiplicadorForcaPrestigio: 4 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, rankCor, numero } = lerVital(container, 0);

        // O número exibido é o prestigioFinal bruto (variável própria da função), não o
        // "resto" clampado internamente pelo getRank() — por isso pode aparecer negativo.
        expect(numero).toBe('-20');
        expect(rankTexto).toBe('Rank D [A2]');
        expect(rankCor).toBe(HEX_TO_RGB['#ff003c']);
    });

    it('badge de Rank (l, c) e número exibido (prestigioFinal, ascensaoFinal) nunca divergem — vêm da mesma chamada multiplicada', () => {
        // Mesmo cenário de transbordo do teste de combinação: se o número exibido usasse o
        // prestígio bruto (pAtualValor=45, faixa B) enquanto o badge usasse o rank multiplicado
        // (resto=35, faixa C), o teste abaixo pegaria a divergência.
        const ficha = fichaComVida({ vidaBase: 45000000, ascensaoBase: 2, multiplicadorForcaPrestigio: 3, multiplicadorForcaAscensao: 2 });
        montarMockUseStore(ficha);

        const { container } = render(<TabelaPrestigio />);
        const { rankTexto, numero } = lerVital(container, 0);
        const numeroExibido = Number(numero.replace(/\./g, ''));

        // resto=35 está na faixa de Rank C (20-39); se número e badge divergissem,
        // o número exibido (ex: 45, faixa B) não bateria com a faixa do rank exibido (C).
        expect(rankTexto).toContain('Rank C');
        expect(rankTexto).toContain('[A5]');
        expect(numeroExibido).toBeGreaterThanOrEqual(20);
        expect(numeroExibido).toBeLessThan(40);
        expect(numeroExibido).toBe(35);
    });
});
