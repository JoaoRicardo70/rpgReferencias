import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaMundi from './MapaMundi';
import useStore from '../../stores/useStore';

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarCenarioCompleto: vi.fn(),
    uploadImagem: vi.fn(),
}));

let mockCtx = null;
vi.mock('./MapaFormContext', () => ({
    useMapaForm: () => mockCtx,
    urlSeguraParaCss: (u) => (u ? `url("${u}")` : ''),
}));

function mockUseStore(state) {
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
}

const AGORA = new Date('2026-06-15T12:00:00Z').getTime();
const DIA = 24 * 3600 * 1000;

function montar({ lista, ativa = 'default', isMestre = false }) {
    mockUseStore({ cenario: { ativa, lista }, meuNome: 'Ana', mesaId: 'mesa1' });
    mockCtx = {
        isMestre, souCriador: isMestre, jogadores: { Ana: {} },
        setCenaVisualizadaId: vi.fn(), definirAcessoCena: vi.fn(),
    };
    return render(<MapaMundi><div /></MapaMundi>);
}

function avancar(ms = 1600) { act(() => { vi.advanceTimersByTime(ms); }); }

function irAteGlobo(container) {
    fireEvent.click(container.querySelector('.astro-terra0'));
    avancar();
}
function irAteMenuNoxus(container) {
    irAteGlobo(container);
    fireEvent.click(screen.getByText(/ENTRAR EM RUNETERRA/));
    avancar();
    fireEvent.click(screen.getByText('Noxus'));
    avancar();
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    vi.clearAllMocks();
    localStorage.clear();
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('MapaMundi - painel lateral de Cenas da regiao', () => {
    const idNova = `cena_${AGORA - 1 * DIA}`;
    const idVelha = `cena_${AGORA - 4 * DIA}`;
    const idLimite = `cena_${AGORA - 3 * DIA}`;
    const lista = {
        [idNova]: { nome: 'Recente', reino: 'Noxus', img: 'http://x/img.png' },
        [idVelha]: { nome: 'Antiga', reino: 'Noxus' },
        [idLimite]: { nome: 'Limite', reino: 'Noxus' },
        legado: { nome: 'Legada', reino: 'Noxus' },
        cena_abc: { nome: 'Sem numero', reino: 'Noxus' },
    };
    const cardDe = (container, nome) => [...container.querySelectorAll('.cena-card')].find((c) => c.textContent.includes(nome));

    it('renderiza cards com titulo, contagem plural e painel/overlay', () => {
        const { container } = montar({ lista });
        irAteMenuNoxus(container);
        expect(container.querySelector('.cenas-regiao-overlay')).not.toBeNull();
        expect(container.querySelector('.cenas-regiao-painel')).not.toBeNull();
        expect(container.querySelectorAll('.cena-card').length).toBe(5);
        const titulos = [...container.querySelectorAll('.cena-card-titulo')].map((t) => t.textContent);
        expect(titulos.some((t) => t.includes('Recente'))).toBe(true);
        expect(container.querySelector('.cenas-regiao-contagem').textContent).toBe('5 cenas');
    });

    it('contagem no singular para 1 cena', () => {
        const { container } = montar({ lista: { a: { nome: 'Uma', reino: 'Noxus' } } });
        irAteMenuNoxus(container);
        expect(container.querySelector('.cenas-regiao-contagem').textContent).toBe('1 cena');
    });

    it('0 cenas mostra contagem e mensagem de vazio', () => {
        const { container } = montar({ lista: {} });
        irAteMenuNoxus(container);
        expect(container.querySelector('.cenas-regiao-contagem').textContent).toBe('0 cenas');
        expect(screen.getByText('Nenhuma Cena liberada para você nesta região.')).toBeDefined();
    });

    it('selo NEW! so em ids cena_<timestamp> com menos de 3 dias', () => {
        const { container } = montar({ lista });
        irAteMenuNoxus(container);
        expect(cardDe(container, 'Recente').querySelector('.cena-card-novo').textContent).toBe('NEW!');
        expect(cardDe(container, 'Antiga').querySelector('.cena-card-novo')).toBeNull();
        expect(cardDe(container, 'Limite').querySelector('.cena-card-novo')).toBeNull();
        expect(cardDe(container, 'Legada').querySelector('.cena-card-novo')).toBeNull();
        expect(cardDe(container, 'Sem numero').querySelector('.cena-card-novo')).toBeNull();
        expect(container.querySelectorAll('.cena-card-novo').length).toBe(1);
    });

    it('selo PUBLICA aparece somente na cena ativa', () => {
        const { container } = montar({ lista, ativa: idVelha });
        irAteMenuNoxus(container);
        const selos = container.querySelectorAll('.cena-card-selo');
        expect(selos.length).toBe(1);
        expect(selos[0].textContent).toBe('🌍 PÚBLICA');
        expect(selos[0].closest('.cena-card').textContent).toContain('Antiga');
    });

    it('sem cena ativa na regiao nao ha selo PUBLICA', () => {
        const { container } = montar({ lista, ativa: 'outra' });
        irAteMenuNoxus(container);
        expect(container.querySelector('.cena-card-selo')).toBeNull();
    });

    it('miniatura usa urlSeguraParaCss; sem img vira none', () => {
        const { container } = montar({ lista });
        irAteMenuNoxus(container);
        expect(cardDe(container, 'Recente').querySelector('.cena-card-miniatura').style.backgroundImage).toContain('http://x/img.png');
        expect(cardDe(container, 'Antiga').querySelector('.cena-card-miniatura').style.backgroundImage).toBe('none');
    });

    it('botao X tem aria-label "Voltar ao mapa" e fecha o painel', () => {
        const { container } = montar({ lista });
        irAteMenuNoxus(container);
        fireEvent.click(screen.getByLabelText('Voltar ao mapa'));
        expect(container.querySelector('.cenas-regiao-painel')).toBeNull();
    });

    it('clicar no overlay fecha; clicar dentro do painel nao fecha', () => {
        const { container } = montar({ lista });
        irAteMenuNoxus(container);
        fireEvent.click(container.querySelector('.cenas-regiao-painel'));
        fireEvent.click(container.querySelector('.cenas-regiao-nome'));
        expect(container.querySelector('.cenas-regiao-painel')).not.toBeNull();
        fireEvent.click(container.querySelector('.cenas-regiao-overlay'));
        expect(container.querySelector('.cenas-regiao-painel')).toBeNull();
    });

    it('clicar numa cena chama setCenaVisualizadaId com o id', () => {
        const { container } = montar({ lista });
        irAteMenuNoxus(container);
        fireEvent.click(screen.getByText('Recente', { exact: false }));
        expect(mockCtx.setCenaVisualizadaId).toHaveBeenCalledWith(idNova);
    });
});

describe('MapaMundi - tela do Globo', () => {
    const lista = { a: { nome: 'Arena', reino: 'Noxus' } };

    it('renderiza classes globo-terra, globo-esfera e globo-textura', () => {
        const { container } = montar({ lista });
        irAteGlobo(container);
        expect(container.querySelector('.globo-terra')).not.toBeNull();
        expect(container.querySelector('.globo-terra .globo-esfera')).not.toBeNull();
        expect(container.querySelectorAll('.globo-esfera .globo-textura').length).toBe(3);
    });

    it('ENTRAR EM RUNETERRA leva ao continente (globo-terra-voando durante o voo)', () => {
        const { container } = montar({ lista });
        irAteGlobo(container);
        fireEvent.click(screen.getByText(/ENTRAR EM RUNETERRA/));
        expect(container.querySelector('.globo-terra-voando')).not.toBeNull();
        avancar();
        expect(container.querySelector('.globo-terra')).toBeNull();
        expect(screen.getByText('Noxus')).toBeDefined();
    });

    function estilos(container) {
        return [...container.querySelectorAll('.globo-textura')].map((t) => ({
            left: parseFloat(t.style.left), top: parseFloat(t.style.top),
        }));
    }
    function dentro(container) {
        for (const { left, top } of estilos(container)) {
            expect(Number.isFinite(left)).toBe(true);
            expect(left).toBeGreaterThanOrEqual(-100);
            expect(left).toBeLessThanOrEqual(0);
            expect(top).toBeGreaterThanOrEqual(-15);
            expect(top).toBeLessThanOrEqual(-1);
        }
    }

    it('estado inicial: left 0 e top -8%', () => {
        const { container } = montar({ lista });
        irAteGlobo(container);
        dentro(container);
        expect(estilos(container)[0].top).toBe(-8);
        expect(Math.abs(estilos(container)[0].left)).toBe(0);
    });

    it.each([
        ['direita enorme', 100000, 0],
        ['esquerda enorme', -100000, 0],
        ['cima enorme', 0, -100000],
        ['baixo enorme', 0, 100000],
        ['diagonal negativa', -777, -9999],
        ['diagonal positiva', 12345, 54321],
    ])('left/top ficam nos limites apos arrastar: %s', (_n, dx, dy) => {
        const { container } = montar({ lista });
        irAteGlobo(container);
        const globo = container.querySelector('.globo-terra');
        const raiz = container.querySelector('.globo-terra-area').parentElement;
        fireEvent.mouseDown(globo, { clientX: 1, clientY: 1 });
        expect(globo.className).toContain('globo-arrastando');
        fireEvent.mouseMove(raiz, { clientX: dx || 1, clientY: dy || 1 });
        dentro(container);
        fireEvent.mouseMove(raiz, { clientX: -dx - 3, clientY: -dy - 3 });
        dentro(container);
        fireEvent.mouseMove(raiz, { clientX: dx * 7 + 11, clientY: dy * 7 + 11 });
        dentro(container);
        fireEvent.mouseUp(raiz);
        expect(globo.className).not.toContain('globo-arrastando');
    });

    it('muitos movimentos sucessivos nunca saem do intervalo e a posicao muda', () => {
        const { container } = montar({ lista });
        irAteGlobo(container);
        const globo = container.querySelector('.globo-terra');
        const raiz = container.querySelector('.globo-terra-area').parentElement;
        fireEvent.mouseDown(globo, { clientX: 5, clientY: 5 });
        const vistos = new Set();
        for (let i = 1; i <= 40; i++) {
            fireEvent.mouseMove(raiz, { clientX: 5 + (i % 2 ? 900 : -1300) * i, clientY: 5 + (i % 3 ? 500 : -800) * i });
            dentro(container);
            vistos.add(estilos(container)[0].left);
        }
        expect(vistos.size).toBeGreaterThan(1);
    });

    it('mousemove sem mousedown nao altera as texturas', () => {
        const { container } = montar({ lista });
        irAteGlobo(container);
        const antes = JSON.stringify(estilos(container));
        fireEvent.mouseMove(container.querySelector('.globo-terra-area').parentElement, { clientX: 999, clientY: 999 });
        expect(JSON.stringify(estilos(container))).toBe(antes);
    });
});
