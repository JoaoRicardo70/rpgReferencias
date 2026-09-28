import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import MestreControleTurno, { iniciarArrastoTurno, encerrarArrastoTurno } from './MestreControleTurno';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — MestreControleTurno.jsx: mostra a ordem de iniciativa publicada pelo
// Mapa (resumoTurnoMapa) e passa o turno chamando a mesma função registrada
// pelo MapaFormProvider (acaoAvancarTurnoMapa), sem trocar de aba. Usa o
// store REAL (via useStore.setState/getState), reaproveitando os selectors
// reais do componente.
// ---------------------------------------------------------------------------

function resetStore() {
    useStore.setState({
        resumoTurnoMapa: { ordem: [], turnoAtualIndex: 0 },
        acaoAvancarTurnoMapa: null,
        acoesOrdemTurnoMapa: null,
    });
}

// Um dataTransfer mínimo, pra funcionar tanto em navegador real quanto no jsdom (que às vezes não
// implementa DataTransfer): iniciarArrastoTurno/lerArrastoTurno também mantêm o payload no módulo.
function dataTransferFake() {
    return { setData() {}, getData() { return ''; }, dropEffect: '' };
}

// jsdom não implementa o construtor `DragEvent` (createEvent.dragOver cai num Event genérico sem
// clientX/dataTransfer utilizáveis via init dict), então fireEvent.dragOver(el, { clientX }) NÃO
// propaga clientX até o handler (bug conhecido de ambiente, não do componente). Contornamos
// despachando um `MouseEvent` "dragover" de verdade (que aceita clientX no construtor) e anexando
// um dataTransfer falso via defineProperty (dataTransfer normalmente é read-only em DragEvent).
function dispararDragOverComX(elemento, clientX) {
    const evento = new MouseEvent('dragover', { clientX, bubbles: true, cancelable: true });
    Object.defineProperty(evento, 'dataTransfer', { value: dataTransferFake(), configurable: true });
    fireEvent(elemento, evento);
}

describe('MestreControleTurno — Controle de Turnos na aba Mestre', () => {
    beforeEach(() => {
        resetStore();
    });

    afterEach(() => {
        cleanup();
        resetStore();
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // Estado vazio (nenhum combate na cena exibida do Mapa)
    // -----------------------------------------------------------------------
    it('mostra a mensagem de estado vazio quando resumoTurnoMapa.ordem está vazia', () => {
        render(<MestreControleTurno />);

        expect(screen.getByText(/Nenhum combate na cena exibida do Mapa/i)).toBeDefined();
        expect(screen.queryByText(/Vez de:/i)).toBeNull();
    });

    it('botão "PASSAR TURNO" fica desabilitado quando não há ordem de iniciativa', () => {
        render(<MestreControleTurno />);

        const botao = screen.getByRole('button', { name: /PASSAR TURNO/i });
        expect(botao.disabled).toBe(true);
    });

    it('botão "PASSAR TURNO" fica desabilitado quando há ordem, mas acaoAvancarTurnoMapa ainda não foi registrada (ex.: Mapa não montado)', () => {
        useStore.setState({
            resumoTurnoMapa: { ordem: [{ id: 'a', nome: 'Heroi', iniciativa: 10, isDummie: false }], turnoAtualIndex: 0 },
            acaoAvancarTurnoMapa: null,
        });
        render(<MestreControleTurno />);

        const botao = screen.getByRole('button', { name: /PASSAR TURNO/i });
        expect(botao.disabled).toBe(true);
    });

    it('clicar no link do estado vazio chama setAbaAtiva("aba-mapa")', () => {
        const setAbaAtivaSpy = vi.fn();
        useStore.setState({ setAbaAtiva: setAbaAtivaSpy });
        render(<MestreControleTurno />);

        fireEvent.click(screen.getByRole('button', { name: /^Mapa$/i }));

        expect(setAbaAtivaSpy).toHaveBeenCalledWith('aba-mapa');
    });

    // -----------------------------------------------------------------------
    // Happy path: combate em andamento
    // -----------------------------------------------------------------------
    it('mostra "Vez de" (o ator no índice atual) e "Próximo" (o seguinte, com wraparound) com base em resumoTurnoMapa', () => {
        useStore.setState({
            resumoTurnoMapa: {
                ordem: [
                    { id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false },
                    { id: 'b', nome: 'Goblin', iniciativa: 10, isDummie: true },
                ],
                turnoAtualIndex: 0,
            },
            acaoAvancarTurnoMapa: vi.fn(),
        });
        const { container } = render(<MestreControleTurno />);

        expect(container.querySelector('.mestre-turno-davez').textContent).toBe('Heroi');
        expect(screen.getByText(/Próximo: Goblin/i)).toBeDefined();
    });

    it('wraparound: quando turnoAtualIndex aponta pro último da ordem, "Próximo" volta pro primeiro', () => {
        useStore.setState({
            resumoTurnoMapa: {
                ordem: [
                    { id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false },
                    { id: 'b', nome: 'Goblin', iniciativa: 10, isDummie: true },
                ],
                turnoAtualIndex: 1,
            },
            acaoAvancarTurnoMapa: vi.fn(),
        });
        const { container } = render(<MestreControleTurno />);

        expect(container.querySelector('.mestre-turno-davez').textContent).toBe('Goblin');
        expect(screen.getByText(/Próximo: Heroi/i)).toBeDefined();
    });

    it('renderiza um chip por combatente da ordem, incluindo a iniciativa', () => {
        useStore.setState({
            resumoTurnoMapa: {
                ordem: [
                    { id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false },
                    { id: 'b', nome: 'Goblin', iniciativa: 10, isDummie: true },
                ],
                turnoAtualIndex: 0,
            },
            acaoAvancarTurnoMapa: vi.fn(),
        });
        render(<MestreControleTurno />);

        expect(screen.getByText('(20)')).toBeDefined();
        expect(screen.getByText('(10)')).toBeDefined();
    });

    it('clicar em "PASSAR TURNO" chama a função registrada (acaoAvancarTurnoMapa) quando há combate', () => {
        const avancar = vi.fn();
        useStore.setState({
            resumoTurnoMapa: { ordem: [{ id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false }], turnoAtualIndex: 0 },
            acaoAvancarTurnoMapa: avancar,
        });
        render(<MestreControleTurno />);

        fireEvent.click(screen.getByRole('button', { name: /PASSAR TURNO/i }));

        expect(avancar).toHaveBeenCalledTimes(1);
    });

    it('botão "PASSAR TURNO" fica habilitado quando há ordem e a função está registrada', () => {
        useStore.setState({
            resumoTurnoMapa: { ordem: [{ id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false }], turnoAtualIndex: 0 },
            acaoAvancarTurnoMapa: vi.fn(),
        });
        render(<MestreControleTurno />);

        expect(screen.getByRole('button', { name: /PASSAR TURNO/i }).disabled).toBe(false);
    });

    // -----------------------------------------------------------------------
    // Reatividade: componente reflete mudanças subsequentes no store (ex.:
    // MapaFormProvider publicando um novo resumo/ação depois de montado)
    // -----------------------------------------------------------------------
    it('reage a uma atualização posterior do store: estado vazio -> combate registrado depois', () => {
        const { container } = render(<MestreControleTurno />);
        expect(screen.getByText(/Nenhum combate na cena exibida do Mapa/i)).toBeDefined();

        act(() => {
            useStore.setState({
                resumoTurnoMapa: { ordem: [{ id: 'a', nome: 'Heroi', iniciativa: 20, isDummie: false }], turnoAtualIndex: 0 },
                acaoAvancarTurnoMapa: vi.fn(),
            });
        });

        expect(screen.queryByText(/Nenhum combate na cena exibida do Mapa/i)).toBeNull();
        expect(container.querySelector('.mestre-turno-davez').textContent).toBe('Heroi');
    });

    it('não lança quando um dummie não tem "nome" definido (defensivo contra dados incompletos)', () => {
        useStore.setState({
            resumoTurnoMapa: { ordem: [{ id: 'd1', iniciativa: 5, isDummie: true }], turnoAtualIndex: 0 },
            acaoAvancarTurnoMapa: vi.fn(),
        });

        expect(() => render(<MestreControleTurno />)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// QA — Ordem manual por arrastar e soltar (acoesOrdemTurnoMapa): reordenar
// chips, adicionar (vindo do Visor ou do select "Adicionar") e remover.
// ---------------------------------------------------------------------------
describe('MestreControleTurno — ordem manual por arrastar e soltar (acoesOrdemTurnoMapa)', () => {
    beforeEach(() => {
        resetStore();
    });

    afterEach(() => {
        cleanup();
        resetStore();
        encerrarArrastoTurno();
        vi.restoreAllMocks();
    });

    function estadoComOrdem(extra = {}) {
        return {
            resumoTurnoMapa: {
                ordem: [
                    { chave: 'p:A', id: 'A', nome: 'A', iniciativa: 30, isDummie: false },
                    { chave: 'p:B', id: 'B', nome: 'B', iniciativa: 20, isDummie: false },
                    { chave: 'd:C', id: 'C', nome: 'C', iniciativa: 10, isDummie: true },
                ],
                turnoAtualIndex: 0,
                foraDaOrdem: [],
            },
            acaoAvancarTurnoMapa: vi.fn(),
            acoesOrdemTurnoMapa: { reordenar: vi.fn(), adicionar: vi.fn(), remover: vi.fn() },
            ...extra,
        };
    }

    // -----------------------------------------------------------------------
    // ✕ nos chips
    // -----------------------------------------------------------------------
    it('renderiza o botão ✕ em cada chip quando acoesOrdemTurnoMapa existe, e clicar nele chama remover com {id, isDummie}', () => {
        const acoes = { reordenar: vi.fn(), adicionar: vi.fn(), remover: vi.fn() };
        useStore.setState(estadoComOrdem({ acoesOrdemTurnoMapa: acoes }));
        const { container } = render(<MestreControleTurno />);

        const botoesRemover = container.querySelectorAll('.mestre-turno-chip-remover');
        expect(botoesRemover.length).toBe(3);

        fireEvent.click(botoesRemover[1]); // chip "B"
        expect(acoes.remover).toHaveBeenCalledWith({ id: 'B', isDummie: false });
    });

    it('sem acoesOrdemTurnoMapa (null): os chips não têm ✕ e não são arrastáveis', () => {
        useStore.setState(estadoComOrdem({ acoesOrdemTurnoMapa: null }));
        const { container } = render(<MestreControleTurno />);

        expect(container.querySelectorAll('.mestre-turno-chip-remover').length).toBe(0);
        const chips = container.querySelectorAll('.mestre-turno-chip');
        expect(chips.length).toBe(3);
        chips.forEach(chip => expect(chip.getAttribute('draggable')).toBe('false'));
    });

    // -----------------------------------------------------------------------
    // Reordenar arrastando um chip sobre outro
    // -----------------------------------------------------------------------
    it('arrastar o chip "A" (índice 0) e soltar na METADE DIREITA do chip "C" (índice 2, o último) chama reordenar movendo A para depois de C (destino ajustado -1 por sair de antes do alvo)', () => {
        const acoes = { reordenar: vi.fn(), adicionar: vi.fn(), remover: vi.fn() };
        useStore.setState(estadoComOrdem({ acoesOrdemTurnoMapa: acoes }));
        const { container } = render(<MestreControleTurno />);

        const chips = container.querySelectorAll('.mestre-turno-chip');
        const chipA = chips[0];
        const chipC = chips[2];
        chipC.getBoundingClientRect = () => ({ left: 100, right: 150, top: 0, bottom: 20, width: 50, height: 20 });

        fireEvent.dragStart(chipA, { dataTransfer: dataTransferFake() });
        // clientX na metade direita do chip C (left=100, width=50 -> metade = 125)
        dispararDragOverComX(chipC, 140);
        fireEvent.drop(chipC, { dataTransfer: dataTransferFake() });

        // origem (A) = 0, alvo (depois de C) = 3; como origem(0) < alvo(3), destino = 3 - 1 = 2.
        expect(acoes.reordenar).toHaveBeenCalledWith('p:A', 2);
    });

    it('arrastar o chip "C" (índice 2) e soltar na METADE ESQUERDA do chip "A" (índice 0) chama reordenar movendo C para antes de A (sem ajuste, pois já vinha de depois do alvo)', () => {
        const acoes = { reordenar: vi.fn(), adicionar: vi.fn(), remover: vi.fn() };
        useStore.setState(estadoComOrdem({ acoesOrdemTurnoMapa: acoes }));
        const { container } = render(<MestreControleTurno />);

        const chips = container.querySelectorAll('.mestre-turno-chip');
        const chipA = chips[0];
        const chipC = chips[2];
        chipA.getBoundingClientRect = () => ({ left: 0, right: 50, top: 0, bottom: 20, width: 50, height: 20 });

        fireEvent.dragStart(chipC, { dataTransfer: dataTransferFake() });
        // clientX na metade esquerda do chip A (left=0, width=50 -> metade = 25)
        dispararDragOverComX(chipA, 10);
        fireEvent.drop(chipA, { dataTransfer: dataTransferFake() });

        // origem (C) = 2, alvo (antes de A) = 0; como origem(2) NÃO é < alvo(0), destino = 0 (sem ajuste).
        expect(acoes.reordenar).toHaveBeenCalledWith('d:C', 0);
    });

    // -----------------------------------------------------------------------
    // Adicionar arrastando um card do Visor (payload origem: 'visor')
    // -----------------------------------------------------------------------
    it('soltar um payload do Visor (origem: "visor") na tira de ordem chama adicionar com {id, isDummie} e o índice do fim da ordem', () => {
        const acoes = { reordenar: vi.fn(), adicionar: vi.fn(), remover: vi.fn() };
        useStore.setState(estadoComOrdem({ acoesOrdemTurnoMapa: acoes }));
        const { container } = render(<MestreControleTurno />);

        const tira = container.querySelector('[data-testid="mestre-turno-ordem"]');
        // Simula o card do Visor de Entidades (MestreSubComponents.jsx) iniciando o arrasto.
        iniciarArrastoTurno({ dataTransfer: dataTransferFake() }, { origem: 'visor', id: 'Npc1', isDummie: false, nome: 'Npc1' });

        fireEvent.dragOver(tira, { dataTransfer: dataTransferFake() });
        fireEvent.drop(tira, { dataTransfer: dataTransferFake() });

        expect(acoes.adicionar).toHaveBeenCalledWith({ id: 'Npc1', isDummie: false }, 3);
    });

    it('soltar um payload do Visor de um dummie (isDummie: true) chama adicionar com isDummie: true', () => {
        const acoes = { reordenar: vi.fn(), adicionar: vi.fn(), remover: vi.fn() };
        useStore.setState(estadoComOrdem({ acoesOrdemTurnoMapa: acoes }));
        const { container } = render(<MestreControleTurno />);

        const tira = container.querySelector('[data-testid="mestre-turno-ordem"]');
        iniciarArrastoTurno({ dataTransfer: dataTransferFake() }, { origem: 'visor', id: 'Goblin1', isDummie: true, nome: 'Goblin' });

        fireEvent.dragOver(tira, { dataTransfer: dataTransferFake() });
        fireEvent.drop(tira, { dataTransfer: dataTransferFake() });

        expect(acoes.adicionar).toHaveBeenCalledWith({ id: 'Goblin1', isDummie: true }, 3);
    });

    // -----------------------------------------------------------------------
    // Select + botão "Adicionar" (fallback sem drag and drop)
    // -----------------------------------------------------------------------
    it('selecionar alguém no select e clicar em "Adicionar" chama adicionar com o id/isDummie do value selecionado ("p:<id>"/"d:<id>")', () => {
        const acoes = { reordenar: vi.fn(), adicionar: vi.fn(), remover: vi.fn() };
        useStore.setState(estadoComOrdem({
            acoesOrdemTurnoMapa: acoes,
            resumoTurnoMapa: {
                ordem: [{ chave: 'p:A', id: 'A', nome: 'A', iniciativa: 30, isDummie: false }],
                turnoAtualIndex: 0,
                foraDaOrdem: [{ id: 'Npc2', nome: 'Npc2', isDummie: false }, { id: 'Goblin2', nome: 'Goblin2', isDummie: true }],
            },
        }));
        render(<MestreControleTurno />);

        const select = screen.getByLabelText(/Personagem para adicionar à ordem de turno/i);
        fireEvent.change(select, { target: { value: 'd:Goblin2' } });
        fireEvent.click(screen.getByRole('button', { name: /^Adicionar$/i }));

        expect(acoes.adicionar).toHaveBeenCalledWith({ id: 'Goblin2', isDummie: true }, 1);
    });

    it('o botão "Adicionar" fica desabilitado sem nada selecionado no select, e não faz nada se clicado (guarda em adicionarSelecionado)', () => {
        const acoes = { reordenar: vi.fn(), adicionar: vi.fn(), remover: vi.fn() };
        useStore.setState(estadoComOrdem({
            acoesOrdemTurnoMapa: acoes,
            resumoTurnoMapa: {
                ordem: [],
                turnoAtualIndex: 0,
                foraDaOrdem: [{ id: 'Npc2', nome: 'Npc2', isDummie: false }],
            },
        }));
        render(<MestreControleTurno />);

        const botaoAdicionar = screen.getByRole('button', { name: /^Adicionar$/i });
        expect(botaoAdicionar.disabled).toBe(true);

        fireEvent.click(botaoAdicionar);
        expect(acoes.adicionar).not.toHaveBeenCalled();
    });
});
