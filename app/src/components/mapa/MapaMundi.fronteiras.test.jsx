import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaMundi from './MapaMundi';
import useStore from '../../stores/useStore';
import { salvarCenarioCompleto } from '../../services/firebase-sync';

// Ajustar fronteiras: o Mestre pinta territórios no mapa da Terra 0; os jogadores só veem.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({ salvarCenarioCompleto: vi.fn(() => Promise.resolve(true)), uploadImagem: vi.fn() }));

let mockCtx = null;
vi.mock('./MapaFormContext', () => ({
    useMapaForm: () => mockCtx,
    urlSeguraParaCss: (u) => (u ? `url("${u}")` : ''),
}));

const setCenario = vi.fn();
const avancar = (ms = 1600) => act(() => { vi.advanceTimersByTime(ms); });

function abrirContinente({ isMestre, cenario }) {
    mockCtx = { isMestre, souCriador: isMestre, jogadores: {}, setCenaVisualizadaId: vi.fn(), definirAcessoCena: vi.fn() };
    useStore.mockImplementation((seletor) => {
        const estado = { cenario, meuNome: 'Ana', mesaId: 'mesa1', setCenario };
        return typeof seletor === 'function' ? seletor(estado) : estado;
    });
    const { container } = render(<MapaMundi><div /></MapaMundi>);
    fireEvent.click(container.querySelector('.astro-terra0'));
    avancar();
    fireEvent.click(screen.getByText(/ENTRAR EM RUNETERRA/));
    avancar();
    return container;
}

const CENARIO_BASE = { ativa: 'default', lista: {} };
// Mestre já editou e deixou o mapa sem território nenhum
const SEM_TERRITORIOS = { ...CENARIO_BASE, fronteiras: { personalizado: true } };
const COM_FRONTEIRAS = { ...CENARIO_BASE, fronteiras: { personalizado: true, facoes: { 1: { nome: 'Legião Noxiana', cor: '#e53935' } }, linhas: { l10: '1'.repeat(20) + '0'.repeat(140) } } };

describe('MapaMundi - fronteiras', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        localStorage.clear();
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1600, height: 1020, right: 1600, bottom: 1020, x: 0, y: 0, toJSON() {} });
    });
    afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

    it('jogador não vê o botão de editar e, sem territórios, nem o de visibilidade', () => {
        abrirContinente({ isMestre: false, cenario: SEM_TERRITORIOS });
        expect(screen.queryByRole('button', { name: /Fronteiras/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Territórios/ })).toBeNull();
    });

    it('jogador vê a legenda e pode esconder os territórios, mas não edita', () => {
        abrirContinente({ isMestre: false, cenario: COM_FRONTEIRAS });
        expect(screen.getByLabelText('Legenda dos territórios').textContent).toContain('Legião Noxiana');
        expect(screen.queryByRole('button', { name: /Fronteiras/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Territórios/ }));
        expect(screen.queryByLabelText('Legenda dos territórios')).toBeNull();
        expect(localStorage.getItem('rpg_mapa_fronteiras_visivel')).toBe('nao');
    });

    it('Mestre cria uma facção, pinta e o save sai uma vez só, com debounce', () => {
        abrirContinente({ isMestre: true, cenario: SEM_TERRITORIOS });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        fireEvent.click(screen.getByRole('button', { name: /Nova facção/ }));
        const superficie = screen.getByTestId('fronteiras-superficie');
        fireEvent.pointerDown(superficie, { clientX: 400, clientY: 300, button: 0 });
        fireEvent.pointerMove(superficie, { clientX: 500, clientY: 320 });
        fireEvent.pointerUp(superficie);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
        avancar(600);
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.fronteiras.facoes['1'].nome).toBe('Facção 1');
        expect(Object.keys(salvo.fronteiras.linhas).length).toBeGreaterThan(0);
        expect(setCenario).toHaveBeenCalledWith(expect.objectContaining({ fronteiras: expect.any(Object) }));
    });

    it('sem facção escolhida, pintar não grava nada', () => {
        abrirContinente({ isMestre: true, cenario: SEM_TERRITORIOS });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        const superficie = screen.getByTestId('fronteiras-superficie');
        fireEvent.pointerDown(superficie, { clientX: 400, clientY: 300, button: 0 });
        avancar(600);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('fechar o editor grava na hora o que estava pendente', () => {
        abrirContinente({ isMestre: true, cenario: SEM_TERRITORIOS });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        fireEvent.click(screen.getByRole('button', { name: /Nova facção/ }));
        fireEvent.change(screen.getByLabelText('Nome da facção 1'), { target: { value: 'Ordem do Norte' } });
        fireEvent.click(screen.getByRole('button', { name: 'Fechar o editor de fronteiras' }));
        expect(salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        expect(salvarCenarioCompleto.mock.calls[0][0].fronteiras.facoes['1'].nome).toBe('Ordem do Norte');
    });

    it('remover uma facção apaga o território dela e pede confirmação', () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
        abrirContinente({ isMestre: true, cenario: COM_FRONTEIRAS });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Remover Legião Noxiana' }));
        expect(confirmar).toHaveBeenCalled();
        avancar(600);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.fronteiras.facoes).toEqual({});
        expect(salvo.fronteiras.linhas).toEqual({});
    });

    it('cancelar a confirmação mantém a facção', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        abrirContinente({ isMestre: true, cenario: COM_FRONTEIRAS });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Remover Legião Noxiana' }));
        avancar(600);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('sem o Mestre ter editado, o mapa já vem com o território de cada região', () => {
        abrirContinente({ isMestre: false, cenario: CENARIO_BASE });
        const legenda = screen.getByLabelText('Legenda dos territórios').textContent;
        ['Freljord', 'Demacia', 'Noxus', 'Piltover e Zaun', 'Shurima', 'Targon', 'Ixtal', 'Águas de Sentina', 'Ionia', 'Ilha das Sombras']
            .forEach((nome) => expect(legenda).toContain(nome));
    });

    it('Mestre edita as fronteiras padrão: o que sai para o Firebase já é marcado como personalizado e traz tudo', () => {
        abrirContinente({ isMestre: true, cenario: CENARIO_BASE });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        fireEvent.change(screen.getByLabelText('Nome da facção 3'), { target: { value: 'Império de Noxus' } });
        avancar(600);
        const salvo = salvarCenarioCompleto.mock.calls[0][0].fronteiras;
        expect(salvo.personalizado).toBe(true);
        expect(salvo.facoes['3'].nome).toBe('Império de Noxus');
        expect(Object.keys(salvo.facoes)).toHaveLength(10);
        expect(Object.keys(salvo.linhas).length).toBeGreaterThan(20);
    });

    it('limpar tudo e remover facções não faz o padrão voltar sozinho', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        abrirContinente({ isMestre: true, cenario: CENARIO_BASE });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        fireEvent.click(screen.getByRole('button', { name: /Limpar tudo/ }));
        avancar(600);
        const salvo = salvarCenarioCompleto.mock.calls[0][0].fronteiras;
        expect(salvo.personalizado).toBe(true);
        expect(salvo.linhas).toEqual({});
    });

    it('restaurar as fronteiras originais devolve o desenho padrão', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        abrirContinente({ isMestre: true, cenario: COM_FRONTEIRAS });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        fireEvent.click(screen.getByRole('button', { name: /Restaurar fronteiras originais/ }));
        avancar(600);
        const salvo = salvarCenarioCompleto.mock.calls[0][0].fronteiras;
        expect(Object.keys(salvo.facoes)).toHaveLength(10);
        expect(salvo.facoes['1'].nome).toBe('Freljord');
    });

    it('o painel tem pincéis prontos e o tamanho escolhido vira o raio do pincel desenhado', () => {
        abrirContinente({ isMestre: true, cenario: CENARIO_BASE });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        const grupo = screen.getByRole('group', { name: 'Tamanho do pincel' });
        expect(grupo.querySelectorAll('button')).toHaveLength(5);
        fireEvent.click(screen.getByRole('button', { name: 'XG' }));
        expect(screen.getByRole('button', { name: 'XG' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByLabelText('Tamanho do pincel (ajuste fino)').value).toBe('36');
    });

    it('zoom: botões e roda do mouse ampliam o mapa e o reset volta ao normal', () => {
        const container = abrirContinente({ isMestre: true, cenario: CENARIO_BASE });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        const conteudo = () => container.querySelector('.mapa-zoom-janela > div');
        expect(screen.getByText(/Zoom 1,0×/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Aumentar o zoom' }));
        expect(screen.getByText(/Zoom 1,3×/)).toBeTruthy();
        expect(conteudo().style.transform).toContain('scale(1.25)');
        fireEvent.wheel(screen.getByTestId('fronteiras-superficie'), { deltaY: -100, clientX: 800, clientY: 500 });
        expect(screen.getByText(/Zoom 1,6×/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Voltar ao zoom normal' }));
        expect(screen.getByText(/Zoom 1,0×/)).toBeTruthy();
    });

    it('com zoom, a ferramenta Mover arrasta o mapa sem pintar nada', () => {
        const container = abrirContinente({ isMestre: true, cenario: CENARIO_BASE });
        fireEvent.click(screen.getByRole('button', { name: /Fronteiras/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Aumentar o zoom' }));
        fireEvent.click(screen.getByRole('button', { name: /Mover/ }));
        const superficie = screen.getByTestId('fronteiras-superficie');
        fireEvent.pointerDown(superficie, { clientX: 800, clientY: 500, button: 0 });
        fireEvent.pointerMove(superficie, { clientX: 700, clientY: 450 });
        fireEvent.pointerUp(superficie);
        expect(container.querySelector('.mapa-zoom-janela > div').style.transform).toContain('translate(-');
        avancar(600);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
});
