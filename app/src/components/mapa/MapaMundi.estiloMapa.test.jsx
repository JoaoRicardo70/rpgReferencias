import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaMundi from './MapaMundi';
import useStore from '../../stores/useStore';

// Mapa da Terra 0: botão que alterna entre o mapa clássico e o realista (mesmas regiões, mesmos pontos).

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({ salvarCenarioCompleto: vi.fn(), uploadImagem: vi.fn() }));
vi.mock('./MapaFormContext', () => ({
    useMapaForm: () => ({ isMestre: false, souCriador: false, jogadores: {}, setCenaVisualizadaId: vi.fn(), definirAcessoCena: vi.fn() }),
    urlSeguraParaCss: (u) => (u ? `url("${u}")` : ''),
}));

const avancar = (ms = 1600) => act(() => { vi.advanceTimersByTime(ms); });

function abrirContinente() {
    useStore.mockImplementation((seletor) => {
        const estado = { cenario: { ativa: 'default', lista: {} }, meuNome: 'Ana', mesaId: 'mesa1' };
        return typeof seletor === 'function' ? seletor(estado) : estado;
    });
    const { container } = render(<MapaMundi><div /></MapaMundi>);
    fireEvent.click(container.querySelector('.astro-terra0'));
    avancar();
    fireEvent.click(screen.getByText(/ENTRAR EM RUNETERRA/));
    avancar();
    return container;
}

describe('MapaMundi - estilo do mapa da Terra 0', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it('abre no mapa clássico e mostra o botão para o realista', () => {
        abrirContinente();
        expect(screen.getByAltText('Mapa Base')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Mapa realista/ })).toBeTruthy();
    });

    it('alterna para o realista, mantém todas as regiões e lembra a escolha', () => {
        abrirContinente();
        const classico = screen.getByAltText('Mapa Base').getAttribute('src');
        fireEvent.click(screen.getByRole('button', { name: /Mapa realista/ }));
        const realista = screen.getByAltText('Mapa Base (realista)');
        expect(realista.getAttribute('src')).not.toBe(classico);
        ['Freljord', 'Demacia', 'Noxus', 'Piltover e Zaun', 'Shurima', 'Targon', 'Ixtal', 'Águas de Sentina', 'Ilha das Sombras', 'Ionia']
            .forEach((nome) => expect(screen.getAllByText(nome)[0]).toBeTruthy());
        expect(localStorage.getItem('rpg_mapa_terra0_estilo')).toBe('realista');
        expect(screen.getByRole('button', { name: /Mapa clássico/ })).toBeTruthy();
    });

    it('volta ao clássico e, ao reabrir, usa o estilo guardado', () => {
        localStorage.setItem('rpg_mapa_terra0_estilo', 'realista');
        abrirContinente();
        expect(screen.getByAltText('Mapa Base (realista)')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Mapa clássico/ }));
        expect(screen.getByAltText('Mapa Base')).toBeTruthy();
        expect(localStorage.getItem('rpg_mapa_terra0_estilo')).toBe('classico');
    });

    it('no realista, passar o mouse numa região mostra o realce novo (não o gabarito antigo)', () => {
        abrirContinente();
        fireEvent.click(screen.getByRole('button', { name: /Mapa realista/ }));
        const realces = [...document.querySelectorAll('img[alt^="Mascara "]')];
        expect(realces).toHaveLength(10);
        realces.forEach((img) => expect(img.getAttribute('src')).toMatch(/hover-/));
    });
});
