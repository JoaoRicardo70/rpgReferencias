import React from 'react';
import { render, screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import RacasCatalogo from './RacasCatalogo';
import useStore from '../../stores/useStore';
import { salvarCamposPersonagem } from '../../services/firebase-sync';
import { salvarRacasDaMesa, definirRacaDoPersonagemDireto } from '../../services/racasMesa';

vi.mock('../../services/firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(() => Promise.resolve(true)), salvarFichaSilencioso: vi.fn(),
}));

vi.mock('../../services/racasMesa', () => ({ salvarRacasDaMesa: vi.fn(), definirRacaDoPersonagemDireto: vi.fn() }));

// O catálogo grava pelo serviço (sem depender do Mapa): acoesOrdemTurnoMapa fica nulo de propósito.
const acoes = { salvarRacas: salvarRacasDaMesa, definirRacaDoPersonagem: definirRacaDoPersonagemDireto };
const SAIYAJIN = { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: ['Sayajin'], herdaDe: '' };
const HIBRIDO = { id: 'hibrido', nome: 'Híbrido', icone: '🧬', apelidos: [], herdaDe: 'saiyajin' };

function preparar(extra = {}) {
    useStore.setState({
        isMestre: true, meuNome: 'Mestre', minhaFicha: { poderes: [] }, cenario: { racas: [SAIYAJIN, HIBRIDO] },
        personagens: {
            Kai: { bio: { raca: 'Saiyajin', racaId: 'saiyajin' }, poderes: [{ id: 1, nome: 'Zenkai', categoria: 'habilidadeRaca', racasAcesso: ['saiyajin'] }] },
            Lia: { bio: { raca: 'Elfo da Lua' }, poderes: [] },
        },
        resumoTurnoMapa: { ordem: [], foraDaOrdem: [], turnoAtualIndex: 0 },
        acoesOrdemTurnoMapa: null, secaoMestrePedida: null, ...extra,
    });
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); useStore.setState({ isMestre: false, cenario: {}, acoesOrdemTurnoMapa: null, personagens: {} }); });

describe('RacasCatalogo', () => {
    it('não aparece para quem não é Mestre', () => {
        preparar({ isMestre: false });
        const { container } = render(<RacasCatalogo />);
        expect(container.innerHTML).toBe('');
    });

    it('começa ABERTA, é recolhível (aria-expanded) e lista as raças com apelidos', () => {
        preparar();
        render(<RacasCatalogo />);
        const botao = screen.getByRole('button', { name: /Raças/ });
        expect(botao.getAttribute('aria-expanded')).toBe('true');
        fireEvent.click(botao);
        expect(botao.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByLabelText('Nome da raça saiyajin')).toBeNull();
        fireEvent.click(botao);
        expect(screen.getByLabelText('Nome da raça saiyajin').value).toBe('Saiyajin');
        expect(screen.getByLabelText('Apelidos da raça Saiyajin').value).toBe('Sayajin');
    });

    it('adicionar raça grava a lista com a nova raça', () => {
        preparar();
        render(<RacasCatalogo />);
        fireEvent.click(screen.getByRole('button', { name: /Adicionar raça/ }));
        expect(acoes.salvarRacas).toHaveBeenCalledTimes(1);
        const lista = acoes.salvarRacas.mock.calls[0][0];
        expect(lista).toHaveLength(3);
        expect(lista[2].nome).toBe('Nova raça');
    });

    it('apelidos separados por vírgula só gravam ao sair do campo', () => {
        preparar();
        render(<RacasCatalogo />);
        const campo = screen.getByLabelText('Apelidos da raça Saiyajin');
        fireEvent.change(campo, { target: { value: 'Sayajin, Macaco ,  ' } });
        expect(acoes.salvarRacas).not.toHaveBeenCalled();
        fireEvent.blur(campo);
        expect(acoes.salvarRacas).toHaveBeenCalledTimes(1);
        expect(acoes.salvarRacas.mock.calls[0][0][0].apelidos).toEqual(['Sayajin', 'Macaco']);
    });

    it('nome vazio no blur volta ao nome anterior e não grava', () => {
        preparar();
        render(<RacasCatalogo />);
        const campo = screen.getByLabelText('Nome da raça saiyajin');
        fireEvent.change(campo, { target: { value: '  ' } });
        fireEvent.blur(campo);
        expect(acoes.salvarRacas).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Nome da raça saiyajin').value).toBe('Saiyajin');
    });

    it('"herda de" grava na hora', () => {
        preparar();
        render(<RacasCatalogo />);
        fireEvent.change(screen.getByLabelText('Saiyajin herda de'), { target: { value: 'hibrido' } });
        expect(acoes.salvarRacas).toHaveBeenCalledTimes(1);
        expect(acoes.salvarRacas.mock.calls[0][0].find(r => r.id === 'saiyajin').herdaDe).toBe('hibrido');
    });

    it('remover pede confirmação, cita as referências e limpa herdaDe e racasAcesso', () => {
        preparar();
        render(<RacasCatalogo />);
        fireEvent.click(screen.getByRole('button', { name: 'Remover raça Saiyajin' }));
        const aviso = screen.getByRole('alertdialog');
        expect(aviso.textContent).toMatch(/1 Habilidade\(s\) de Raça/);
        expect(aviso.textContent).toMatch(/1 raça\(s\) filha\(s\)/);
        expect(acoes.salvarRacas).not.toHaveBeenCalled();
        fireEvent.click(within(aviso).getByRole('button', { name: 'Sim, remover' }));
        const lista = acoes.salvarRacas.mock.calls[0][0];
        expect(lista.map(r => r.id)).toEqual(['hibrido']);
        expect(lista[0].herdaDe).toBe('');
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Kai', { 'poderes/0/racasAcesso': [] });
    });

    it('cancelar a remoção não grava nada', () => {
        preparar();
        render(<RacasCatalogo />);
        fireEvent.click(screen.getByRole('button', { name: 'Remover raça Híbrido' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(acoes.salvarRacas).not.toHaveBeenCalled();
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('"Quem é de qual raça": mostra a raça de cada um, troca pela ação e avisa raça não cadastrada', () => {
        preparar();
        render(<RacasCatalogo />);
        expect(screen.getByLabelText('Raça de Kai').value).toBe('saiyajin');
        expect(screen.getByText(/Raça não cadastrada: "Elfo da Lua"/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Raça de Lia'), { target: { value: 'hibrido' } });
        expect(acoes.definirRacaDoPersonagem).toHaveBeenCalledWith({ id: 'Lia', nome: 'Lia' }, 'hibrido');
    });

    it('mostra o caminho para chegar e a explicação do acesso por Raça', () => {
        preparar();
        render(<RacasCatalogo />);
        expect(screen.getByText(/menu lateral → 👑 Mestre → 🧬 Raças/)).toBeTruthy();
        expect(screen.getByText(/Cada Habilidade de Raça libera acesso por Raça/)).toBeTruthy();
    });

    it('sem Raças: estado vazio chamativo com botão que cadastra a primeira (sem o Mapa aberto)', () => {
        preparar({ cenario: {} });
        render(<RacasCatalogo />);
        expect(screen.getByText(/Nenhuma Raça cadastrada ainda. Cadastre a primeira para liberar o acesso às Habilidades de Raça./)).toBeTruthy();
        expect(screen.queryByText(/Abra o Mapa/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Cadastrar primeira Raça/ }));
        expect(acoes.salvarRacas).toHaveBeenCalledTimes(1);
        expect(acoes.salvarRacas.mock.calls[0][0]).toHaveLength(1);
    });

    it('edita sem acoesOrdemTurnoMapa: controles habilitados e sem aviso do Mapa', () => {
        preparar();
        render(<RacasCatalogo />);
        expect(useStore.getState().acoesOrdemTurnoMapa).toBeNull();
        expect(screen.getByLabelText('Nome da raça saiyajin').disabled).toBe(false);
        expect(screen.getByRole('button', { name: /Adicionar raça/ }).disabled).toBe(false);
        expect(screen.queryByText(/Abra o Mapa/)).toBeNull();
    });

    it('pedido de seção racas reabre a seção recolhida e limpa o pedido', () => {
        preparar();
        render(<RacasCatalogo />);
        const botao = screen.getByRole('button', { name: /Raças/ });
        fireEvent.click(botao);
        expect(botao.getAttribute('aria-expanded')).toBe('false');
        act(() => { useStore.getState().pedirSecaoMestre('racas'); });
        expect(botao.getAttribute('aria-expanded')).toBe('true');
        expect(useStore.getState().secaoMestrePedida).toBeNull();
        expect(useStore.getState().abaAtiva).toBe('aba-mestre');
    });
});

describe('RacasCatalogo: "Quem é de qual raça" recolhível com busca', () => {
    const muitos = () => {
        const p = {};
        ['Ágata', 'Bruno', 'Carla', 'Dênis', 'Elis', 'Fábio', 'Gael'].forEach(n => { p[n] = { bio: { nome: n }, poderes: [] }; });
        return p;
    };
    const cabecalho = () => screen.getByRole('button', { name: /Quem é de qual raça/ });

    it('aberta com até 5 personagens, com contador e campo de busca', () => {
        preparar();
        render(<RacasCatalogo />);
        expect(cabecalho().getAttribute('aria-expanded')).toBe('true');
        expect(cabecalho().textContent).toMatch(/\((3 personagens)\)/);
        expect(screen.getByLabelText('Buscar personagem')).toBeTruthy();
        expect(screen.getByLabelText('Raça de Kai')).toBeTruthy();
    });

    it('fechada com mais de 5 personagens; abre ao clicar e o catálogo segue aberto', () => {
        preparar({ personagens: muitos() });
        render(<RacasCatalogo />);
        expect(cabecalho().getAttribute('aria-expanded')).toBe('false');
        expect(cabecalho().textContent).toMatch(/\((8 personagens)\)/);
        expect(screen.queryByLabelText('Raça de Bruno')).toBeNull();
        expect(screen.getByText('Catálogo de Raças')).toBeTruthy();
        fireEvent.click(cabecalho());
        expect(cabecalho().getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByLabelText('Raça de Bruno')).toBeTruthy();
    });

    it('fechada com muitos personagens mesmo com o catálogo vazio (só abre com até 5)', () => {
        preparar({ personagens: muitos(), cenario: {} });
        render(<RacasCatalogo />);
        expect(cabecalho().getAttribute('aria-expanded')).toBe('false');
    });

    it('limite: 4 personagens + o Mestre (5 entidades) abre; 5 + o Mestre (6) fecha', () => {
        const mk = (n) => { const p = {}; for (let i = 0; i < n; i++) p[`P${i}`] = { bio: { nome: `P${i}` }, poderes: [] }; return p; };
        preparar({ personagens: mk(4) });
        const { unmount } = render(<RacasCatalogo />);
        expect(cabecalho().getAttribute('aria-expanded')).toBe('true');
        unmount();
        preparar({ personagens: mk(5) });
        render(<RacasCatalogo />);
        expect(cabecalho().getAttribute('aria-expanded')).toBe('false');
    });

    it('a busca filtra por nome sem acento nem caixa e mostra aviso quando nada bate', () => {
        preparar({ personagens: muitos() });
        render(<RacasCatalogo />);
        fireEvent.click(cabecalho());
        const campo = screen.getByLabelText('Buscar personagem');
        fireEvent.change(campo, { target: { value: 'AGATA' } });
        expect(screen.getByLabelText('Raça de Ágata')).toBeTruthy();
        expect(screen.queryByLabelText('Raça de Bruno')).toBeNull();
        fireEvent.change(campo, { target: { value: 'zzz' } });
        expect(screen.getByText(/Nenhum personagem encontrado/)).toBeTruthy();
        fireEvent.change(campo, { target: { value: '' } });
        expect(screen.getByLabelText('Raça de Bruno')).toBeTruthy();
    });

    it('Pedidos de Raça fica destacado quando há pendentes', () => {
        preparar({ personagens: { Kai: { bio: { pedidosRaca: [{ id: 'p1', racaId: 'elfo' }] }, poderes: [{ id: 1, manipulaDNA: true }] } } });
        render(<RacasCatalogo />);
        expect(screen.getByRole('region', { name: 'Pedidos de Raça' }).className).toMatch(/pedido-raca-painel--pendentes/);
    });
});
