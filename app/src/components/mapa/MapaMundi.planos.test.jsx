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

const PLANOS = [
    ['Terra 0 (Runeterra)', 'pz-terra-0-runeterra'],
    ['Plano da Ordem', 'pz-plano-da-ordem'],
    ['Plano Astral', 'pz-plano-astral'],
    ['Plano do Vento', 'pz-plano-do-vento'],
    ['Plano do Fogo', 'pz-plano-do-fogo'],
    ['Plano da Água', 'pz-plano-da-agua'],
    ['Plano da Terra', 'pz-plano-da-terra'],
    ['Céus', 'pz-ceus'],
    ['Inferno', 'pz-inferno'],
    ['Plano das Fadas', 'pz-plano-das-fadas'],
    ['Plano do Éter', 'pz-plano-do-eter'],
    ['Plano do Caos', 'pz-plano-do-caos'],
    ['Plano do Caos Inferior', 'pz-plano-do-caos-inferior'],
];

function avancar(ms = 1600) { act(() => { vi.advanceTimersByTime(ms); }); }

function abrirCosmologia() {
    useStore.mockImplementation((sel) => {
        const state = { cenario: { ativa: 'default', lista: {} }, meuNome: 'Ana', mesaId: 'mesa1' };
        return typeof sel === 'function' ? sel(state) : state;
    });
    mockCtx = { isMestre: false, souCriador: false, jogadores: {}, setCenaVisualizadaId: vi.fn(), definirAcessoCena: vi.fn() };
    const r = render(<MapaMundi><div /></MapaMundi>);
    fireEvent.click(screen.getByText(/REVELAR DIMENSÕES/));
    avancar();
    return r;
}

const zona = (c, cls) => c.querySelector(`.plano-zona.${cls}`);
const titulo = () => screen.getByRole('heading', { level: 1 }).textContent;

describe('MapaMundi - Mapa dos Planos (cosmologia)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        localStorage.clear();
        vi.spyOn(window, 'alert').mockImplementation(() => {});
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('renderiza o palco, o Caos de fundo com legenda e o reino central', () => {
        const { container } = abrirCosmologia();
        expect(container.querySelector('.planos-palco')).not.toBeNull();
        const caos = container.querySelector('.planos-caos');
        expect(caos).not.toBeNull();
        expect(caos.querySelector('.planos-legenda').textContent).toMatch(/Plano do Caos/);
        expect(container.querySelector('.planos-reino')).not.toBeNull();
        expect(container.querySelector('img[alt="Cosmologia"]')).toBeNull();
    });

    it('injeta o CSS dos planos', () => {
        const { container } = abrirCosmologia();
        const estilos = [...container.querySelectorAll('style')].map((s) => s.innerHTML).join('');
        expect(estilos).toContain('.planos-palco');
    });

    it('renderiza uma zona por plano (13) com a classe pz-<slug>', () => {
        const { container } = abrirCosmologia();
        expect(container.querySelectorAll('.plano-zona').length).toBe(13);
        for (const [, cls] of PLANOS) expect(zona(container, cls), cls).not.toBeNull();
    });

    it('rotulo da Terra 0 mantem a quebra de linha', () => {
        const { container } = abrirCosmologia();
        const rot = zona(container, 'pz-terra-0-runeterra').querySelector('.plano-rotulo');
        expect(rot.textContent).toBe('Terra 0\n(Runeterra)');
    });

    it('clicar na zona da Terra 0 leva ao globo', () => {
        const { container } = abrirCosmologia();
        fireEvent.click(zona(container, 'pz-terra-0-runeterra'));
        avancar();
        expect(screen.getByText(/Visão Orbital/)).toBeDefined();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('clicar em outro plano nao navega e avisa "Oculto pelas névoas"', () => {
        const { container } = abrirCosmologia();
        fireEvent.click(zona(container, 'pz-plano-do-fogo'));
        avancar();
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('Oculto pelas névoas');
        expect(window.alert.mock.calls[0][0]).toContain('Plano do Fogo');
        expect(screen.queryByText(/Visão Orbital/)).toBeNull();
    });

    it('clicar no fundo (Caos) tambem avisa, com o nome Plano do Caos', () => {
        const { container } = abrirCosmologia();
        fireEvent.click(container.querySelector('.planos-caos'));
        avancar();
        expect(window.alert.mock.calls[0][0]).toContain('Plano do Caos');
    });

    it('clique numa zona gera um unico alerta (nao propaga ao Caos)', () => {
        const { container } = abrirCosmologia();
        fireEvent.click(zona(container, 'pz-ceus'));
        avancar();
        expect(window.alert).toHaveBeenCalledTimes(1);
    });

    it('hover numa zona mostra o nome no titulo inferior e marca plano-ativo; sair restaura', () => {
        const { container } = abrirCosmologia();
        expect(titulo()).toBe('Atlas Multiversal');
        const z = zona(container, 'pz-plano-da-agua');
        fireEvent.mouseEnter(z);
        expect(titulo()).toBe('Plano da Água');
        expect(z.className).toContain('plano-ativo');
        fireEvent.mouseLeave(z);
        expect(titulo()).toBe('Atlas Multiversal');
        expect(z.className).not.toContain('plano-ativo');
    });

    it('hover no fundo mostra "Plano do Caos" e hover no reino limpa o titulo', () => {
        const { container } = abrirCosmologia();
        fireEvent.mouseEnter(container.querySelector('.planos-caos'));
        expect(titulo()).toBe('Plano do Caos');
        fireEvent.mouseEnter(container.querySelector('.planos-reino'));
        expect(titulo()).toBe('Atlas Multiversal');
    });

    it('modo de ajuste adiciona plano-ajuste em todas as zonas, esconde o titulo e desliga de volta', () => {
        const { container } = abrirCosmologia();
        fireEvent.click(screen.getByText(/LIGAR MODO DE AJUSTE/));
        expect(container.querySelectorAll('.plano-zona.plano-ajuste').length).toBe(13);
        expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
        fireEvent.click(screen.getByText(/DESLIGAR MODO AJUSTE/));
        expect(container.querySelectorAll('.plano-ajuste').length).toBe(0);
    });

    it('no modo de ajuste, hover nao ativa e clique nao navega', () => {
        const { container } = abrirCosmologia();
        fireEvent.click(screen.getByText(/LIGAR MODO DE AJUSTE/));
        const z = zona(container, 'pz-terra-0-runeterra');
        fireEvent.mouseEnter(z);
        expect(z.className).not.toContain('plano-ativo');
        fireEvent.click(z);
        avancar();
        expect(screen.queryByText(/Visão Orbital/)).toBeNull();
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('modo de ajuste: arrastar uma zona atualiza left/top', () => {
        const { container } = abrirCosmologia();
        fireEvent.click(screen.getByText(/LIGAR MODO DE AJUSTE/));
        const z = zona(container, 'pz-plano-da-ordem');
        const antes = z.style.left;
        const palco = container.querySelector('.planos-palco');
        palco.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 });
        fireEvent.mouseDown(z);
        fireEvent.mouseMove(palco, { clientX: 300, clientY: 200 });
        expect(z.style.left).not.toBe(antes);
    });
});
