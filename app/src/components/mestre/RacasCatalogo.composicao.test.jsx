import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import RacasCatalogo from './RacasCatalogo';
import SubAbasMestre from './SubAbasMestre';
import ComposicaoRacialEditor from './ComposicaoRacialEditor';
import PedidosRacaMestre from './PedidosRacaMestre';
import useStore from '../../stores/useStore';
import { salvarRacasDaMesa } from '../../services/racasMesa';
import * as comp from '../../services/composicaoRacial';

vi.mock('../../services/firebase-sync', () => ({
    salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(() => Promise.resolve(true)), salvarFichaSilencioso: vi.fn(),
}));
vi.mock('../../services/racasMesa', () => ({ salvarRacasDaMesa: vi.fn(), definirRacaDoPersonagemDireto: vi.fn() }));
vi.mock('../../services/composicaoRacial', () => ({
    definirComposicaoRacial: vi.fn(() => ({ ok: true })), concederPraticaRacial: vi.fn(() => ({ ok: true })),
    adicionarRacaAdquirida: vi.fn(() => ({ ok: true })), removerRacaDaComposicao: vi.fn(() => ({ ok: true })),
    aprovarPedidoRaca: vi.fn(() => ({ ok: true })), recusarPedidoRaca: vi.fn(() => ({ ok: true })),
}));

const SAIYAJIN = { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: [], herdaDe: '', descendeDe: '', acessoTotalDescendentes: false };
const HUMANO = { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '', descendeDe: '', acessoTotalDescendentes: false };
const ELFO = { id: 'elfo', nome: 'Elfo', icone: '🧝', apelidos: [], herdaDe: '', descendeDe: '', acessoTotalDescendentes: false };
const KAI = { id: 'Kai', nome: 'Kai', isDummie: false };

function preparar(extra = {}, racas = [SAIYAJIN, HUMANO, ELFO]) {
    useStore.setState({
        isMestre: true, meuNome: 'Mestre', minhaFicha: { poderes: [] }, cenario: { racas },
        personagens: {
            Kai: { bio: { raca: 'Saiyajin', racaId: 'saiyajin' }, poderes: [] },
        },
        dummies: {}, resumoTurnoMapa: { ordem: [], foraDaOrdem: [], turnoAtualIndex: 0 }, acoesOrdemTurnoMapa: null, secaoMestrePedida: null, ...extra,
    });
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); useStore.setState({ isMestre: false, cenario: {}, personagens: {} }); });

describe('Catálogo: Herda habilidades de / Descende de / Raça Primordial', () => {
    it('mostra os dois selects rotulados e as dicas curtas, e grava "Descende de" na hora', () => {
        preparar();
        render(<RacasCatalogo />);
        expect(screen.getAllByText('Herda habilidades de').length).toBe(3);
        expect(screen.getAllByText('Descende de').length).toBe(3);
        expect(screen.getAllByText(/Só a árvore genealógica/).length).toBe(3);
        fireEvent.change(screen.getByLabelText('Humano descende de'), { target: { value: 'saiyajin' } });
        expect(salvarRacasDaMesa).toHaveBeenCalledTimes(1);
        const lista = salvarRacasDaMesa.mock.calls[0][0];
        expect(lista.find(r => r.id === 'humano').descendeDe).toBe('saiyajin');
        expect(lista.find(r => r.id === 'humano').herdaDe).toBe('');
    });

    it('marcar Raça Primordial grava acessoTotalDescendentes e lista as descendentes', () => {
        preparar({}, [SAIYAJIN, { ...HUMANO, descendeDe: 'saiyajin' }, { ...ELFO, descendeDe: 'humano' }]);
        render(<RacasCatalogo />);
        expect(screen.queryByText(/Descendentes:/)).toBeNull();
        fireEvent.click(screen.getByLabelText('Saiyajin é Raça Primordial'));
        expect(salvarRacasDaMesa.mock.calls[0][0].find(r => r.id === 'saiyajin').acessoTotalDescendentes).toBe(true);
    });

    it('Primordial já marcada exibe "Descendentes: A, B" (transitivo)', () => {
        preparar({}, [{ ...SAIYAJIN, acessoTotalDescendentes: true }, { ...HUMANO, descendeDe: 'saiyajin' }, { ...ELFO, descendeDe: 'humano' }]);
        render(<RacasCatalogo />);
        const nota = screen.getByText(/Descendentes:/);
        expect(nota.textContent).toMatch(/Humano/);
        expect(nota.textContent).toMatch(/Elfo/);
        expect(screen.getByLabelText('Saiyajin é Raça Primordial').checked).toBe(true);
    });

    it('remover a Raça de origem cita a raça descendente e limpa descendeDe', () => {
        preparar({}, [SAIYAJIN, { ...HUMANO, descendeDe: 'saiyajin' }]);
        render(<RacasCatalogo />);
        fireEvent.click(screen.getByRole('button', { name: 'Remover raça Saiyajin' }));
        const aviso = screen.getByRole('alertdialog');
        expect(aviso.textContent).toMatch(/1 raça\(s\) filha\(s\)/);
        fireEvent.click(within(aviso).getByRole('button', { name: 'Sim, remover' }));
        const lista = salvarRacasDaMesa.mock.calls[0][0];
        expect(lista.map(r => r.id)).toEqual(['humano']);
        expect(lista[0].descendeDe).toBe('');
    });
});

describe('Editor de Composição Racial', () => {
    const FICHA = {
        bio: {
            raca: 'Saiyajin', racaId: 'saiyajin',
            composicaoRacial: [{ racaId: 'saiyajin', percentual: 70, origem: 'nativa' }, { racaId: 'humano', percentual: 30, origem: 'adquirida' }],
            composicaoRacialHistorico: Array.from({ length: 12 }, (_, i) => ({ ts: 1700000000000 + i * 1000, racaId: 'saiyajin', de: i, para: i + 1, delta: 1, motivo: `treino ${i}`, fonte: 'pratica' })),
        },
    };
    const abrir = () => fireEvent.click(screen.getByRole('button', { name: /Composição de Kai/ }));

    it('só o Mestre vê o botão', () => {
        preparar({ isMestre: false });
        const { container } = render(<ComposicaoRacialEditor entidade={KAI} ficha={FICHA} />);
        expect(container.innerHTML).toBe('');
    });

    it('recolhível (aria-expanded) e mostra as linhas com percentual e origem', () => {
        preparar();
        render(<ComposicaoRacialEditor entidade={KAI} ficha={FICHA} />);
        const botao = screen.getByRole('button', { name: /Composição de Kai/ });
        expect(botao.getAttribute('aria-expanded')).toBe('false');
        abrir();
        expect(botao.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByLabelText('Percentual de Kai em Saiyajin').value).toBe('70');
        expect(screen.getByLabelText('Percentual de Kai em Humano').value).toBe('30');
        expect(screen.getByText('🌱 Nativa')).toBeTruthy();
        expect(screen.getByText('🧪 Adquirida')).toBeTruthy();
    });

    it('percentual só grava ao sair do campo e usa definirComposicaoRacial', () => {
        preparar();
        render(<ComposicaoRacialEditor entidade={KAI} ficha={FICHA} />);
        abrir();
        const campo = screen.getByLabelText('Percentual de Kai em Humano');
        fireEvent.change(campo, { target: { value: '45' } });
        expect(comp.definirComposicaoRacial).not.toHaveBeenCalled();
        fireEvent.blur(campo);
        expect(comp.definirComposicaoRacial).toHaveBeenCalledTimes(1);
        const [ent, lista] = comp.definirComposicaoRacial.mock.calls[0];
        expect(ent).toEqual(KAI);
        expect(lista.find(l => l.racaId === 'humano').percentual).toBe('45');
    });

    it('sair do campo sem mudar nada não grava', () => {
        preparar();
        render(<ComposicaoRacialEditor entidade={KAI} ficha={FICHA} />);
        abrir();
        fireEvent.blur(screen.getByLabelText('Percentual de Kai em Humano'));
        expect(comp.definirComposicaoRacial).not.toHaveBeenCalled();
    });

    it('prática rápida +5 e prática livre com motivo chamam concederPraticaRacial', () => {
        preparar();
        render(<ComposicaoRacialEditor entidade={KAI} ficha={FICHA} />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: /Prática em Saiyajin/ }));
        fireEvent.change(screen.getByLabelText('Motivo da prática'), { target: { value: 'Treino na gravidade' } });
        fireEvent.click(screen.getByRole('button', { name: '+5%' }));
        expect(comp.concederPraticaRacial).toHaveBeenCalledWith(KAI, 'saiyajin', 5, 'Treino na gravidade');
        fireEvent.click(screen.getByRole('button', { name: /Prática em Saiyajin/ }));
        fireEvent.click(screen.getByRole('button', { name: /Prática em Saiyajin/ }));
        fireEvent.change(screen.getByLabelText('Pontos de prática (livre)'), { target: { value: '3' } });
        fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
        expect(comp.concederPraticaRacial).toHaveBeenLastCalledWith(KAI, 'saiyajin', 3, '');
    });

    it('mostra a mensagem do serviço quando a prática falha', () => {
        preparar();
        comp.concederPraticaRacial.mockReturnValueOnce({ ok: false, mensagem: 'O percentual de Saiyajin já está em 100%.' });
        render(<ComposicaoRacialEditor entidade={KAI} ficha={FICHA} />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: /Prática em Saiyajin/ }));
        fireEvent.click(screen.getByRole('button', { name: '+1%' }));
        expect(screen.getByRole('status').textContent).toMatch(/já está em 100%/);
    });

    it('adicionar Raça adquirida usa 10% por padrão; nativa usa definirComposicaoRacial', () => {
        preparar();
        render(<ComposicaoRacialEditor entidade={KAI} ficha={FICHA} />);
        abrir();
        expect(screen.getByLabelText('Percentual inicial da nova Raça').value).toBe('10');
        fireEvent.change(screen.getByLabelText('Raça a adicionar'), { target: { value: 'elfo' } });
        fireEvent.click(screen.getByRole('button', { name: /Adicionar Raça/ }));
        expect(comp.adicionarRacaAdquirida).toHaveBeenCalledWith(KAI, 'elfo', 10, 'Concedida pelo Mestre');
        fireEvent.change(screen.getByLabelText('Raça a adicionar'), { target: { value: 'elfo' } });
        fireEvent.change(screen.getByLabelText('Origem da nova Raça'), { target: { value: 'nativa' } });
        fireEvent.click(screen.getByRole('button', { name: /Adicionar Raça/ }));
        const lista = comp.definirComposicaoRacial.mock.calls[0][1];
        expect(lista.find(l => l.racaId === 'elfo')).toEqual({ racaId: 'elfo', percentual: 100, origem: 'nativa' });
    });

    it('remover grava na hora', () => {
        preparar();
        render(<ComposicaoRacialEditor entidade={KAI} ficha={FICHA} />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: 'Remover Humano da composição' }));
        expect(comp.removerRacaDaComposicao).toHaveBeenCalledWith(KAI, 'humano');
    });

    it('histórico mostra os 10 últimos (mais novo primeiro) e "Ver mais" libera até 50', () => {
        preparar();
        render(<ComposicaoRacialEditor entidade={KAI} ficha={FICHA} />);
        abrir();
        const lista = screen.getByRole('list', { name: 'Histórico de Kai' });
        expect(within(lista).getAllByRole('listitem')).toHaveLength(10);
        expect(within(lista).getAllByRole('listitem')[0].textContent).toMatch(/treino 11/);
        fireEvent.click(screen.getByRole('button', { name: 'Ver mais' }));
        expect(within(lista).getAllByRole('listitem')).toHaveLength(12);
        expect(screen.queryByRole('button', { name: 'Ver mais' })).toBeNull();
    });

    it('aviso quando a Raça principal não está na composição explícita e "Incluir a Raça principal"', () => {
        preparar();
        const ficha = { bio: { raca: 'Elfo', racaId: 'elfo', composicaoRacial: [{ racaId: 'humano', percentual: 50, origem: 'nativa' }] } };
        render(<ComposicaoRacialEditor entidade={KAI} ficha={ficha} />);
        abrir();
        expect(screen.getByText(/A Raça principal .* não está na composição/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Incluir a Raça principal' }));
        const lista = comp.definirComposicaoRacial.mock.calls[0][1];
        expect(lista.map(l => l.racaId)).toEqual(['humano', 'elfo']);
        expect(lista[1]).toEqual({ racaId: 'elfo', percentual: 100, origem: 'nativa' });
    });

    it('sem composição explícita não mostra o aviso da Raça principal', () => {
        preparar();
        render(<ComposicaoRacialEditor entidade={KAI} ficha={{ bio: { raca: 'Elfo', racaId: 'elfo' } }} />);
        abrir();
        expect(screen.queryByText(/não está na composição/)).toBeNull();
    });

    it('no catálogo, cada personagem tem o botão 🧬 Composição', () => {
        preparar();
        render(<RacasCatalogo />);
        expect(screen.getByRole('button', { name: /Composição de Kai/ })).toBeTruthy();
    });
});

describe('Pedidos de Raça (Mestre)', () => {
    const comPedido = () => preparar({
        personagens: {
            Kai: { bio: { raca: 'Saiyajin', racaId: 'saiyajin', pedidosRaca: [{ id: 'ped1', racaId: 'elfo', motivo: 'Absorveu DNA de elfo', ts: 1700000000000 }] }, poderes: [{ id: 1, nome: 'Gene', manipulaDNA: true }] },
        },
    });
    const forjado = () => preparar({
        personagens: {
            Kai: { bio: { raca: 'Saiyajin', racaId: 'saiyajin', pedidosRaca: [{ id: 'ped1', racaId: 'elfo', motivo: 'x', ts: 1 }] }, poderes: [] },
        },
    });

    it('pedido forjado (sem poder de DNA): aviso e Aprovar desabilitado; Recusar continua', () => {
        forjado();
        render(<PedidosRacaMestre />);
        expect(screen.getByText(/sem poder de Manipulação de DNA/)).toBeTruthy();
        expect(screen.getByRole('button', { name: /Aprovar pedido de Kai/ }).disabled).toBe(true);
        expect(screen.getByRole('button', { name: /Recusar pedido de Kai/ }).disabled).toBe(false);
    });

    it('lista o pedido (jogador, raça, motivo) com percentual padrão 10 e aprova com o valor editado', () => {
        comPedido();
        render(<PedidosRacaMestre />);
        expect(screen.getByText('Kai')).toBeTruthy();
        expect(screen.getByText(/Absorveu DNA de elfo/)).toBeTruthy();
        const campo = screen.getByLabelText('Percentual inicial do pedido de Kai');
        expect(campo.value).toBe('10');
        fireEvent.change(campo, { target: { value: '15' } });
        fireEvent.click(screen.getByRole('button', { name: /Aprovar pedido de Kai/ }));
        expect(comp.aprovarPedidoRaca).toHaveBeenCalledWith({ id: 'Kai', nome: 'Kai', isDummie: false }, 'ped1', 15);
    });

    it('aprovar sem mexer no campo usa 10', () => {
        comPedido();
        render(<PedidosRacaMestre />);
        fireEvent.click(screen.getByRole('button', { name: /Aprovar pedido de Kai/ }));
        expect(comp.aprovarPedidoRaca.mock.calls[0][2]).toBe(10);
    });

    it('recusar chama recusarPedidoRaca', () => {
        comPedido();
        render(<PedidosRacaMestre />);
        fireEvent.click(screen.getByRole('button', { name: /Recusar pedido de Kai/ }));
        expect(comp.recusarPedidoRaca).toHaveBeenCalledWith({ id: 'Kai', nome: 'Kai', isDummie: false }, 'ped1');
    });

    it('sem pedidos mostra o vazio; não-Mestre não vê o painel', () => {
        preparar();
        render(<PedidosRacaMestre />);
        expect(screen.getByText('Nenhum pedido pendente.')).toBeTruthy();
        cleanup();
        comPedido();
        useStore.setState({ isMestre: false });
        const { container } = render(<PedidosRacaMestre />);
        expect(container.innerHTML).toBe('');
    });

    it('o painel aparece dentro do catálogo e a sub-aba 🧬 Raças mostra o contador', () => {
        comPedido();
        render(<SubAbasMestre paineis={{ racas: <RacasCatalogo /> }} />);
        fireEvent.click(screen.getByRole('tab', { name: /Raças/ }));
        expect(screen.getByRole('region', { name: 'Pedidos de Raça' })).toBeTruthy();
        const nav = screen.getByRole('tablist', { name: 'Áreas do Painel do Mestre' });
        expect(within(nav).getByRole('tab', { name: /Raças/ }).textContent).toMatch(/1/);
    });

    it('sem pedidos a sub-aba não mostra contador', () => {
        preparar();
        render(<SubAbasMestre />);
        expect(screen.getByRole('tab', { name: /Raças/ }).textContent).not.toMatch(/[0-9]/);
    });
});
