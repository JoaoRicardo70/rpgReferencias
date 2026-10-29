import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MapaMundi from './MapaMundi';
import useStore from '../../stores/useStore';
import { salvarCenarioCompleto } from '../../services/firebase-sync';

// Região em foco: o mapa aproxima e mostra os pontos de interesse, cada um com suas Cenas.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({ salvarCenarioCompleto: vi.fn(() => Promise.resolve(true)), uploadImagem: vi.fn() }));

let mockCtx = null;
vi.mock('./MapaFormContext', () => ({
    useMapaForm: () => mockCtx,
    urlSeguraParaCss: (u) => (u ? `url("${u}")` : ''),
}));

const setCenario = vi.fn();
const avancar = (ms = 1600) => act(() => { vi.advanceTimersByTime(ms); });

const CENARIO = {
    ativa: 'default',
    pontos: {
        p1: { reino: 'Noxus', nome: 'Capital Noxiana', x: 40, y: 30, icone: 'cidade' },
        p2: { reino: 'Noxus', nome: 'Porto Vazio', x: 55, y: 40, icone: 'porto' },
        p4: { reino: 'Noxus', nome: 'Cripta Antiga', x: 30, y: 60, icone: 'masmorra', categoria: 'dungeon' },
        p3: { reino: 'Demacia', nome: 'Muralha', x: 20, y: 40, icone: 'cidade' }
    },
    lista: {
        a: { nome: 'Salão do Trono', reino: 'Noxus', ponto: 'p1' },
        b: { nome: 'Arena', reino: 'Noxus', ponto: 'p1', restrita: true, acessoNomes: ['Bia'] },
        c: { nome: 'Cena solta', reino: 'Noxus' },
        d: { nome: 'Portão', reino: 'Demacia', ponto: 'p3' }
    }
};

function abrirNoxus({ isMestre, cenario = CENARIO }) {
    mockCtx = { isMestre, souCriador: isMestre, jogadores: { Ana: {}, Bia: {} }, setCenaVisualizadaId: vi.fn(), definirAcessoCena: vi.fn() };
    useStore.mockImplementation((seletor) => {
        const estado = { cenario, meuNome: 'Ana', mesaId: 'mesa1', setCenario };
        return typeof seletor === 'function' ? seletor(estado) : estado;
    });
    const { container } = render(<MapaMundi><div /></MapaMundi>);
    fireEvent.click(container.querySelector('.astro-terra0'));
    avancar();
    fireEvent.click(screen.getByText(/ENTRAR EM RUNETERRA/));
    avancar();
    fireEvent.click(screen.getAllByText('Noxus')[0]);
    avancar();
    return container;
}

describe('MapaMundi - região em foco e pontos de interesse', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        localStorage.clear();
        vi.spyOn(window, 'alert').mockImplementation(() => {});
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 640, right: 1000, bottom: 640, x: 0, y: 0, toJSON() {} });
    });
    afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

    it('clicar na região aproxima o mapa e mostra só os pontos dela, sem abrir painel de Cenas', () => {
        const container = abrirNoxus({ isMestre: true });
        expect(screen.getByRole('button', { name: /Capital Noxiana/ })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Porto Vazio/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Muralha/ })).toBeNull();
        expect(container.querySelector('.cenas-regiao-painel')).toBeNull();
        expect(container.querySelector('.mapa-foco-escuro')).not.toBeNull();
        expect(container.querySelector('.mapa-zoom-janela > div').style.transform).toContain('scale(');
        expect(screen.getByRole('button', { name: /VOLTAR AO MAPA/ })).toBeTruthy();
    });

    it('jogador só vê os pontos que têm Cena liberada para ele, com a contagem certa', () => {
        abrirNoxus({ isMestre: false });
        expect(screen.getByRole('button', { name: 'Capital Noxiana, 1 cena' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Porto Vazio/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Editar pontos/ })).toBeNull();
    });

    it('clicar num ponto abre as Cenas dele e entrar numa Cena abre o mapa de batalha', () => {
        abrirNoxus({ isMestre: false });
        fireEvent.click(screen.getByRole('button', { name: /Capital Noxiana/ }));
        expect(screen.getByText('Salão do Trono', { exact: false })).toBeTruthy();
        expect(screen.queryByText('Arena', { exact: false })).toBeNull();
        expect(screen.queryByText('Cena solta', { exact: false })).toBeNull();
        fireEvent.click(screen.getByText('Salão do Trono', { exact: false }));
        expect(mockCtx.setCenaVisualizadaId).toHaveBeenCalledWith('a');
    });

    it('as Cenas sem ponto ficam num atalho próprio', () => {
        abrirNoxus({ isMestre: false });
        fireEvent.click(screen.getByLabelText(/Cenas sem ponto de interesse \(1\)/));
        expect(screen.getByText('Cena solta', { exact: false })).toBeTruthy();
    });

    it('voltar ao mapa sai da região', () => {
        const container = abrirNoxus({ isMestre: false });
        fireEvent.click(screen.getByRole('button', { name: /VOLTAR AO MAPA/ }));
        expect(container.querySelector('.mapa-foco-escuro')).toBeNull();
        expect(screen.queryByRole('button', { name: /Capital Noxiana/ })).toBeNull();
    });

    it('Mestre marca um ponto novo clicando no mapa e salva com a posição e a região', () => {
        abrirNoxus({ isMestre: true });
        fireEvent.click(screen.getByRole('button', { name: /Editar pontos/ }));
        fireEvent.click(screen.getByTestId('pontos-area'), { clientX: 250, clientY: 320 });
        fireEvent.change(screen.getByLabelText('Nome do ponto de interesse'), { target: { value: 'Forte Norte' } });
        fireEvent.click(screen.getByRole('button', { name: 'Montanha' }));
        fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        const novo = Object.values(salvo.pontos).find((p) => p.nome === 'Forte Norte');
        expect(novo).toEqual({ reino: 'Noxus', nome: 'Forte Norte', x: 25, y: 50, icone: 'montanha', categoria: 'local' });
        expect(Object.keys(salvo.pontos)).toHaveLength(5);
        expect(setCenario).toHaveBeenCalled();
    });

    it('ponto sem nome não é criado', () => {
        abrirNoxus({ isMestre: true });
        fireEvent.click(screen.getByRole('button', { name: /Editar pontos/ }));
        fireEvent.click(screen.getByTestId('pontos-area'), { clientX: 250, clientY: 320 });
        expect(screen.getByRole('button', { name: /Salvar/ }).disabled).toBe(true);
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });

    it('Mestre arrasta um pino para outro lugar', () => {
        abrirNoxus({ isMestre: true });
        fireEvent.click(screen.getByRole('button', { name: /Editar pontos/ }));
        const pino = screen.getByRole('button', { name: /Porto Vazio/ });
        fireEvent.pointerDown(pino, { clientX: 550, clientY: 256, button: 0 });
        fireEvent.pointerMove(pino, { clientX: 700, clientY: 320 });
        fireEvent.pointerUp(pino, { clientX: 700, clientY: 320 });
        expect(salvarCenarioCompleto.mock.calls[0][0].pontos.p2).toMatchObject({ x: 70, y: 50, nome: 'Porto Vazio' });
    });

    it('soltar um pino depois de arrastar não abre o formulário de edição', () => {
        abrirNoxus({ isMestre: true });
        fireEvent.click(screen.getByRole('button', { name: /Editar pontos/ }));
        const pino = screen.getByRole('button', { name: /Porto Vazio/ });
        fireEvent.pointerDown(pino, { clientX: 550, clientY: 256, button: 0 });
        fireEvent.pointerMove(pino, { clientX: 700, clientY: 320 });
        fireEvent.pointerUp(pino, { clientX: 700, clientY: 320 });
        fireEvent.click(pino);
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.click(pino);
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('Mestre exclui um ponto: as Cenas dele não são apagadas e passam para "sem ponto"', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        abrirNoxus({ isMestre: true });
        fireEvent.click(screen.getByRole('button', { name: /Editar pontos/ }));
        fireEvent.click(screen.getByRole('button', { name: /Capital Noxiana/ }));
        fireEvent.click(screen.getByRole('button', { name: /Excluir/ }));
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.pontos.p1).toBeUndefined();
        expect(salvo.lista.a.nome).toBe('Salão do Trono');
        expect('ponto' in salvo.lista.a).toBe(false);
    });

    it('Mestre muda uma Cena de ponto pelo seletor do cartão', () => {
        abrirNoxus({ isMestre: true });
        fireEvent.click(screen.getByLabelText(/Cenas sem ponto de interesse/));
        fireEvent.change(screen.getByLabelText('Ponto de interesse de Cena solta'), { target: { value: 'p2' } });
        expect(salvarCenarioCompleto.mock.calls[0][0].lista.c.ponto).toBe('p2');
    });

    it('criar mapa dentro de um ponto grava a Cena já ligada a ele', () => {
        abrirNoxus({ isMestre: true });
        fireEvent.click(screen.getByRole('button', { name: /Capital Noxiana/ }));
        fireEvent.click(screen.getByRole('button', { name: /CRIAR NOVO MAPA/ }));
        fireEvent.change(screen.getByPlaceholderText('Nome do mapa...'), { target: { value: 'Subsolo' } });
        fireEvent.click(screen.getByRole('button', { name: /CONFIRMAR/ }));
        const nova = Object.values(salvarCenarioCompleto.mock.calls[0][0].lista).find((c) => c.nome === 'Subsolo');
        expect(nova).toMatchObject({ reino: 'Noxus', ponto: 'p1' });
    });

    it('o filtro separa as entradas de dungeon dos outros locais', () => {
        abrirNoxus({ isMestre: true });
        expect(screen.getByRole('button', { name: /Cripta Antiga/ })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Dungeons \(1\)/ }));
        expect(screen.getByRole('button', { name: /Cripta Antiga/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Capital Noxiana/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Locais \(2\)/ }));
        expect(screen.queryByRole('button', { name: /Cripta Antiga/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Capital Noxiana/ })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Todos \(3\)/ }));
        expect(screen.getAllByRole('button', { name: /Cripta Antiga|Capital Noxiana|Porto Vazio/ })).toHaveLength(3);
    });

    it('o filtro por tipo de ícone mostra só os pontos daquele tipo e clicar de novo desfaz', () => {
        abrirNoxus({ isMestre: true });
        fireEvent.click(screen.getByRole('button', { name: 'Porto (1)' }));
        expect(screen.getByRole('button', { name: /Porto Vazio/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Capital Noxiana/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /Cripta Antiga/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Templo (0)' }));
        expect(screen.queryByRole('button', { name: /Porto Vazio/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Templo (0)' }));
        expect(screen.getAllByRole('button', { name: /Cripta Antiga|Capital Noxiana|Porto Vazio/ })).toHaveLength(3);
    });

    it('o pino de dungeon tem destaque próprio e no modo edição o filtro não esconde nada', () => {
        const container = abrirNoxus({ isMestre: true });
        expect(container.querySelectorAll('.ponto-pin-dungeon')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: /Locais/ }));
        fireEvent.click(screen.getByRole('button', { name: /Editar pontos/ }));
        expect(screen.getByRole('button', { name: /Cripta Antiga/ })).toBeTruthy();
    });

    it('Mestre marca um ponto como entrada de dungeon', () => {
        abrirNoxus({ isMestre: true });
        fireEvent.click(screen.getByRole('button', { name: /Editar pontos/ }));
        fireEvent.click(screen.getByTestId('pontos-area'), { clientX: 250, clientY: 320 });
        fireEvent.change(screen.getByLabelText('Nome do ponto de interesse'), { target: { value: 'Portal Rachado' } });
        fireEvent.click(screen.getByRole('button', { name: /Entrada de dungeon/ }));
        fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
        const salvo = Object.values(salvarCenarioCompleto.mock.calls[0][0].pontos).find((p) => p.nome === 'Portal Rachado');
        expect(salvo).toMatchObject({ categoria: 'dungeon', icone: 'masmorra' });
    });

    it('os botões aproximam e afastam, e o alvo volta ao enquadramento da região', () => {
        const container = abrirNoxus({ isMestre: false });
        const escala = () => Number(/scale\(([\d.]+)\)/.exec(container.querySelector('.mapa-zoom-janela > div').style.transform)[1]);
        const inicial = escala();
        expect(screen.getByRole('button', { name: 'Centralizar na região' }).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Aproximar o mapa' }));
        expect(escala()).toBeGreaterThan(inicial);
        fireEvent.click(screen.getByRole('button', { name: 'Aproximar o mapa' }));
        fireEvent.click(screen.getByRole('button', { name: 'Afastar o mapa' }));
        fireEvent.click(screen.getByRole('button', { name: 'Centralizar na região' }));
        expect(escala()).toBeCloseTo(inicial, 5);
    });

    it('a roda do mouse amplia dentro da região, até um limite', () => {
        const container = abrirNoxus({ isMestre: false });
        const escala = () => Number(/scale\(([\d.]+)\)/.exec(container.querySelector('.mapa-zoom-janela > div').style.transform)[1]);
        const janela = container.querySelector('.mapa-zoom-janela');
        const inicial = escala();
        fireEvent.wheel(janela, { deltaY: -100, clientX: 500, clientY: 300 });
        expect(escala()).toBeGreaterThan(inicial);
        for (let i = 0; i < 30; i++) fireEvent.wheel(janela, { deltaY: -100, clientX: 500, clientY: 300 });
        expect(escala()).toBeLessThanOrEqual(12);
    });

    it('arrastar o fundo desloca o mapa ampliado sem abrir nada', () => {
        const container = abrirNoxus({ isMestre: true });
        fireEvent.click(screen.getByRole('button', { name: 'Aproximar o mapa' }));
        fireEvent.click(screen.getByRole('button', { name: 'Aproximar o mapa' }));
        const antes = container.querySelector('.mapa-zoom-janela > div').style.transform;
        const area = screen.getByTestId('pontos-area');
        fireEvent.pointerDown(area, { clientX: 500, clientY: 300, button: 0 });
        fireEvent.pointerMove(area, { clientX: 440, clientY: 270 });
        fireEvent.pointerUp(area);
        fireEvent.click(area);
        expect(container.querySelector('.mapa-zoom-janela > div').style.transform).not.toBe(antes);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('a região em foco acompanha o território atual: conquistas mudam o enquadramento', () => {
        // Noxus (id 3) reduzida a um pedacinho no canto inferior direito: o zoom vai para lá
        const linhas = {};
        for (let y = 180; y < 200; y++) linhas['l' + y] = '0'.repeat(280) + '3'.repeat(30) + '0'.repeat(10);
        const facoes = { 3: { nome: 'Império', cor: '#e53935' } };
        const reduzida = abrirNoxus({ isMestre: false, cenario: { ...CENARIO, fronteiras: { personalizado: true, facoes, linhas } } });
        const transformReduzida = reduzida.querySelector('.mapa-zoom-janela > div').style.transform;
        cleanup();
        const padrao = abrirNoxus({ isMestre: false });
        expect(padrao.querySelector('.mapa-zoom-janela > div').style.transform).not.toBe(transformReduzida);
    });

    it('jogador não consegue marcar pontos nem pelo mapa', () => {
        abrirNoxus({ isMestre: false });
        fireEvent.click(screen.getByTestId('pontos-area'), { clientX: 250, clientY: 320 });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
