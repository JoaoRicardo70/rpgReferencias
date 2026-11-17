import React from 'react';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import SubAbasMestre, { SecaoMestreAncora, CHAVE_SUBABA_MESTRE } from './SubAbasMestre';
import MestrePanel from './MestrePanel';
import RacasCatalogo from './RacasCatalogo';
import MestreSegurarAcao from './MestreSegurarAcao';
import BotaoCatalogoRacas from '../shared/BotaoCatalogoRacas';
import SeletorRaca from '../shared/SeletorRaca';
import EquipesRelacoes from './EquipesRelacoes';
import { SECOES_MESTRE, subAbaDaSecaoMestre } from './useSecaoMestre';
import useStore from '../../stores/useStore';

vi.mock('../../services/firebase-sync', () => ({
    salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(), salvarFichaSilencioso: vi.fn(),
}));
vi.mock('../../services/racasMesa', () => ({ salvarRacasDaMesa: vi.fn(), definirRacaDoPersonagemDireto: vi.fn() }));

const esperar = (ms = 80) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

function preparar(extra = {}) {
    useStore.setState({
        isMestre: true, meuNome: 'Mestre', minhaFicha: { poderes: [] }, cenario: {}, personagens: {}, dummies: {},
        resumoTurnoMapa: { ordem: [], foraDaOrdem: [], turnoAtualIndex: 0 }, acoesOrdemTurnoMapa: null,
        abaAtiva: 'aba-Ficha Def', secaoMestrePedida: null, ...extra,
    });
}
const paineisDe = () => ({
    combate: <SecaoMestreAncora id="turnos"><p>conteúdo turnos</p></SecaoMestreAncora>,
    racas: <SecaoMestreAncora id="racas"><p>conteúdo raças</p></SecaoMestreAncora>,
    entidades: <SecaoMestreAncora id="jogadores"><input aria-label="rascunho entidades" /></SecaoMestreAncora>,
    forja: <SecaoMestreAncora id="forja"><p>conteúdo forja</p></SecaoMestreAncora>,
});
const aba = (nome) => screen.getByRole('tab', { name: new RegExp(nome) });

beforeEach(() => { vi.clearAllMocks(); try { window.localStorage.removeItem(CHAVE_SUBABA_MESTRE); } catch (e) { /* */ } });
afterEach(() => {
    cleanup(); vi.restoreAllMocks();
    useStore.setState({ isMestre: false, secaoMestrePedida: null, abaAtiva: 'aba-Ficha Def' });
});

describe('pedirSecaoMestre (store)', () => {
    it('Mestre: troca a aba e registra o pedido; limpar zera', () => {
        preparar();
        useStore.getState().pedirSecaoMestre('racas');
        expect(useStore.getState().abaAtiva).toBe('aba-mestre');
        expect(useStore.getState().secaoMestrePedida).toEqual({ id: 'racas' });
        useStore.getState().limparSecaoMestrePedida();
        expect(useStore.getState().secaoMestrePedida).toBeNull();
    });
    it('não-Mestre: nada acontece', () => {
        preparar({ isMestre: false });
        useStore.getState().pedirSecaoMestre('racas');
        expect(useStore.getState().abaAtiva).toBe('aba-Ficha Def');
        expect(useStore.getState().secaoMestrePedida).toBeNull();
    });
});

describe('SubAbasMestre: troca, padrão e persistência', () => {
    it('padrão é Combate e só o painel ativo fica visível (os outros ficam montados e escondidos)', () => {
        preparar();
        render(<SubAbasMestre paineis={paineisDe()} />);
        expect(aba('Combate').getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('conteúdo turnos').closest('[role="tabpanel"]').hidden).toBe(false);
        const forja = screen.getByText('conteúdo forja');
        expect(forja).toBeTruthy();
        expect(forja.closest('[role="tabpanel"]').hidden).toBe(true);
    });

    it('clicar troca de sub-aba, grava em localStorage e preserva rascunhos dos painéis escondidos', () => {
        preparar();
        render(<SubAbasMestre paineis={paineisDe()} />);
        fireEvent.click(aba('Entidades'));
        fireEvent.change(screen.getByLabelText('rascunho entidades'), { target: { value: 'meu rascunho' } });
        fireEvent.click(aba('Forja'));
        expect(window.localStorage.getItem(CHAVE_SUBABA_MESTRE)).toBe('forja');
        expect(screen.getByLabelText('rascunho entidades').closest('[role="tabpanel"]').hidden).toBe(true);
        fireEvent.click(aba('Entidades'));
        expect(screen.getByLabelText('rascunho entidades').value).toBe('meu rascunho');
    });

    it('lembra a última sub-aba ao montar de novo', () => {
        preparar();
        window.localStorage.setItem(CHAVE_SUBABA_MESTRE, 'racas');
        render(<SubAbasMestre paineis={paineisDe()} />);
        expect(aba('Raças').getAttribute('aria-selected')).toBe('true');
    });

    it('valor inválido no storage volta para Combate', () => {
        preparar();
        window.localStorage.setItem(CHAVE_SUBABA_MESTRE, 'lixo');
        render(<SubAbasMestre paineis={paineisDe()} />);
        expect(aba('Combate').getAttribute('aria-selected')).toBe('true');
    });

    it('storage bloqueado (lança erro) não quebra: padrão Combate e troca continua funcionando', () => {
        preparar();
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
        render(<SubAbasMestre paineis={paineisDe()} />);
        expect(aba('Combate').getAttribute('aria-selected')).toBe('true');
        fireEvent.click(aba('Forja'));
        expect(aba('Forja').getAttribute('aria-selected')).toBe('true');
    });
});

describe('SubAbasMestre: acessibilidade', () => {
    it('tablist, tabs, tabpanels ligados por aria-controls/aria-labelledby e tabIndex roving', () => {
        preparar();
        render(<SubAbasMestre paineis={paineisDe()} />);
        const lista = screen.getByRole('tablist', { name: 'Áreas do Painel do Mestre' });
        expect(within(lista).getAllByRole('tab')).toHaveLength(4);
        const t = aba('Raças');
        const painel = document.getElementById(t.getAttribute('aria-controls'));
        expect(painel.getAttribute('role')).toBe('tabpanel');
        expect(painel.getAttribute('aria-labelledby')).toBe(t.id);
        expect(aba('Combate').tabIndex).toBe(0);
        expect(t.tabIndex).toBe(-1);
    });

    it('setas, Home e End navegam entre as sub-abas e movem o foco', () => {
        preparar();
        render(<SubAbasMestre paineis={paineisDe()} />);
        fireEvent.keyDown(aba('Combate'), { key: 'ArrowRight' });
        expect(aba('Raças').getAttribute('aria-selected')).toBe('true');
        expect(document.activeElement).toBe(aba('Raças'));
        fireEvent.keyDown(aba('Raças'), { key: 'End' });
        expect(aba('Forja').getAttribute('aria-selected')).toBe('true');
        fireEvent.keyDown(aba('Forja'), { key: 'ArrowRight' });
        expect(aba('Combate').getAttribute('aria-selected')).toBe('true');
        fireEvent.keyDown(aba('Combate'), { key: 'ArrowLeft' });
        expect(aba('Forja').getAttribute('aria-selected')).toBe('true');
        fireEvent.keyDown(aba('Forja'), { key: 'Home' });
        expect(aba('Combate').getAttribute('aria-selected')).toBe('true');
    });
});

describe('SubAbasMestre: badge de Pedidos de Raça', () => {
    it('mostra o número de pedidos pendentes na sub-aba Raças, com aria-label', () => {
        preparar({ personagens: { Kai: { bio: { pedidosRaca: [
            { id: 'a', racaId: 'elfo' }, { id: 'b', racaId: 'anao' },
        ] }, poderes: [] } } });
        render(<SubAbasMestre paineis={paineisDe()} />);
        expect(aba('Raças').textContent).toMatch(/2/);
        expect(within(aba('Raças')).getByLabelText(/2 pedido\(s\) de Raça pendente\(s\)/)).toBeTruthy();
    });
});

describe('mapeamento seção -> sub-aba com pedirSecaoMestre', () => {
    it('cada seção está mapeada para a sub-aba certa', () => {
        expect(SECOES_MESTRE.map(s => [s.id, s.sub])).toEqual([
            ['pedidos', null], ['turnos', 'combate'], ['equipes', 'combate'], ['segurar', 'combate'],
            ['racas', 'racas'], ['biblioteca', 'racas'], ['jogadores', 'entidades'], ['forja', 'forja'],
        ]);
        expect(subAbaDaSecaoMestre('inexistente')).toBeNull();
    });

    it.each([
        ['racas', 'Raças'], ['jogadores', 'Entidades'], ['forja', 'Forja'], ['turnos', 'Combate'],
    ])('pedir "%s" ativa a sub-aba %s, rola até a seção visível e consome o pedido uma vez', async (id, nome) => {
        preparar();
        window.localStorage.setItem(CHAVE_SUBABA_MESTRE, id === 'turnos' ? 'forja' : 'combate');
        const rolar = vi.fn();
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function () { rolar(this.id, this.closest('[hidden]')); };
        try {
            render(<SubAbasMestre paineis={paineisDe()} />);
            act(() => { useStore.getState().pedirSecaoMestre(id); });
            await esperar();
            expect(aba(nome).getAttribute('aria-selected')).toBe('true');
            expect(useStore.getState().secaoMestrePedida).toBeNull();
            expect(rolar).toHaveBeenCalledTimes(1);
            expect(rolar.mock.calls[0][0]).toBe(`mestre-sec-${id}`);
            expect(rolar.mock.calls[0][1]).toBeNull(); // já visível quando rolou
            act(() => { useStore.setState({ abaAtiva: 'aba-x' }); });
            await esperar();
            expect(rolar).toHaveBeenCalledTimes(1);
        } finally { Element.prototype.scrollIntoView = original; }
    });

    it('pedir "equipes" ativa Combate, abre a seção recolhida e rola', async () => {
        preparar();
        window.localStorage.setItem(CHAVE_SUBABA_MESTRE, 'forja');
        render(<SubAbasMestre paineis={{ ...paineisDe(), combate: <EquipesRelacoes /> }} />);
        const equipes = document.querySelector('#mestre-sec-equipes .equipes-titulo-btn');
        expect(equipes.getAttribute('aria-expanded')).toBe('false');
        const rolar = vi.fn();
        document.getElementById('mestre-sec-equipes').scrollIntoView = rolar;
        act(() => { useStore.getState().pedirSecaoMestre('equipes'); });
        await esperar();
        expect(aba('Combate').getAttribute('aria-selected')).toBe('true');
        expect(equipes.getAttribute('aria-expanded')).toBe('true');
        expect(rolar).toHaveBeenCalled();
    });

    it('pedir "racas" abre o catálogo recolhido e ativa a sub-aba Raças', async () => {
        preparar();
        render(<SubAbasMestre paineis={{ ...paineisDe(), racas: <RacasCatalogo /> }} />);
        const titulo = document.querySelector('#mestre-sec-racas .racas-titulo-btn');
        fireEvent.click(titulo);
        expect(titulo.getAttribute('aria-expanded')).toBe('false');
        act(() => { useStore.getState().pedirSecaoMestre('racas'); });
        await esperar();
        expect(aba('Raças').getAttribute('aria-selected')).toBe('true');
        expect(titulo.getAttribute('aria-expanded')).toBe('true');
    });

    it('"pedidos" (acima das sub-abas) não troca de sub-aba e é consumido', async () => {
        preparar();
        render(<><SecaoMestreAncora id="pedidos"><p>ped</p></SecaoMestreAncora><SubAbasMestre paineis={paineisDe()} /></>);
        act(() => { useStore.getState().pedirSecaoMestre('pedidos'); });
        await esperar();
        expect(aba('Combate').getAttribute('aria-selected')).toBe('true');
        expect(useStore.getState().secaoMestrePedida).toBeNull();
    });

    it('pedido de outra seção não é consumido por esta', async () => {
        preparar();
        render(<SecaoMestreAncora id="turnos"><p>t</p></SecaoMestreAncora>);
        act(() => { useStore.getState().pedirSecaoMestre('forja'); });
        await esperar();
        expect(useStore.getState().secaoMestrePedida).toEqual({ id: 'forja' });
    });

    it('sem scrollIntoView (jsdom) o pedido não lança erro', async () => {
        preparar();
        render(<SubAbasMestre paineis={paineisDe()} />);
        act(() => { useStore.getState().pedirSecaoMestre('forja'); });
        await esperar();
        expect(useStore.getState().secaoMestrePedida).toBeNull();
    });
});

describe('atalhos externos e seção segurar', () => {
    it('pedir "segurar" ativa Combate (vindo de Forja) e consome o pedido', async () => {
        preparar();
        window.localStorage.setItem(CHAVE_SUBABA_MESTRE, 'forja');
        render(<SubAbasMestre paineis={{ ...paineisDe(), combate: <SecaoMestreAncora id="segurar"><MestreSegurarAcao /></SecaoMestreAncora> }} />);
        act(() => { useStore.getState().pedirSecaoMestre('segurar'); });
        await esperar();
        expect(aba('Combate').getAttribute('aria-selected')).toBe('true');
        expect(useStore.getState().secaoMestrePedida).toBeNull();
    });

    it('BotaoCatalogoRacas fora do painel leva à aba Mestre; ao montar o painel com o pedido pendente, ativa Raças', async () => {
        preparar({ abaAtiva: 'aba-Ficha Def' });
        render(<BotaoCatalogoRacas />);
        fireEvent.click(screen.getByRole('button', { name: /catálogo de Raças/ }));
        expect(useStore.getState().abaAtiva).toBe('aba-mestre');
        cleanup();
        window.localStorage.setItem(CHAVE_SUBABA_MESTRE, 'forja');
        render(<SubAbasMestre paineis={{ ...paineisDe(), racas: <RacasCatalogo /> }} />);
        await esperar();
        expect(aba('Raças').getAttribute('aria-selected')).toBe('true');
        expect(useStore.getState().secaoMestrePedida).toBeNull();
    });

    it('BotaoCatalogoRacas com painel já montado troca a sub-aba para Raças', async () => {
        preparar();
        window.localStorage.setItem(CHAVE_SUBABA_MESTRE, 'entidades');
        render(<><BotaoCatalogoRacas /><SubAbasMestre paineis={{ ...paineisDe(), racas: <RacasCatalogo /> }} /></>);
        fireEvent.click(screen.getByRole('button', { name: /Abrir catálogo de Raças/ }));
        await esperar();
        expect(aba('Raças').getAttribute('aria-selected')).toBe('true');
    });

    it('SeletorRaca (Gerenciar catálogo) leva à sub-aba Raças', async () => {
        preparar();
        window.localStorage.setItem(CHAVE_SUBABA_MESTRE, 'forja');
        render(<><SeletorRaca valor="" aoMudar={() => {}} /><SubAbasMestre paineis={{ ...paineisDe(), racas: <RacasCatalogo /> }} /></>);
        fireEvent.click(screen.getByRole('button', { name: /Gerenciar catálogo de Raças/ }));
        await esperar();
        expect(aba('Raças').getAttribute('aria-selected')).toBe('true');
        expect(useStore.getState().abaAtiva).toBe('aba-mestre');
    });
});

describe('MestrePanel', () => {
    it('Mestre: mostra as sub-abas', () => {
        preparar();
        render(<MestrePanel />);
        expect(screen.getByRole('tablist', { name: 'Áreas do Painel do Mestre' })).toBeTruthy();
    });
    it('Modo Jogador (isMestre=false): painel do Mestre não mostra sub-abas', () => {
        preparar({ isMestre: false, modoJogador: true });
        render(<MestrePanel />);
        expect(screen.queryByRole('tablist', { name: 'Áreas do Painel do Mestre' })).toBeNull();
        useStore.setState({ modoJogador: false });
    });
});
