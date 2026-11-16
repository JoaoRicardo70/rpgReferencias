import React from 'react';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import AtalhosMestre, { SecaoMestreAncora } from './AtalhosMestre';
import MestrePanel from './MestrePanel';
import RacasCatalogo from './RacasCatalogo';
import EquipesRelacoes from './EquipesRelacoes';
import useStore from '../../stores/useStore';

vi.mock('../../services/firebase-sync', () => ({
    salvarDummie: vi.fn(), salvarCamposPersonagem: vi.fn(), salvarFichaSilencioso: vi.fn(),
}));
vi.mock('../../services/racasMesa', () => ({ salvarRacasDaMesa: vi.fn(), definirRacaDoPersonagemDireto: vi.fn() }));

const esperar = () => act(async () => { await new Promise(r => setTimeout(r, 10)); });

function preparar(extra = {}) {
    useStore.setState({
        isMestre: true, meuNome: 'Mestre', minhaFicha: { poderes: [] }, cenario: {}, personagens: {}, dummies: {},
        resumoTurnoMapa: { ordem: [], foraDaOrdem: [], turnoAtualIndex: 0 }, acoesOrdemTurnoMapa: null,
        abaAtiva: 'aba-Ficha Def', secaoMestrePedida: null, ...extra,
    });
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); useStore.setState({ isMestre: false, secaoMestrePedida: null, abaAtiva: 'aba-Ficha Def' }); });

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

describe('AtalhosMestre', () => {
    it('lista os atalhos das seções principais, incluindo Raças', () => {
        preparar();
        render(<AtalhosMestre />);
        ['🔔 Pedidos', '⚔️ Turnos', '🛡️ Equipes e Relações', '🧬 Raças', '⏳ Segurar Ação', '👥 Jogadores', '🏗️ Forja de Vilões']
            .forEach(r => expect(screen.getByRole('button', { name: r })).toBeTruthy());
    });

    it('atalho rola até a seção e consome o pedido', async () => {
        preparar();
        const rolar = vi.fn();
        render(<><AtalhosMestre /><SecaoMestreAncora id="turnos"><p>turnos</p></SecaoMestreAncora></>);
        document.getElementById('mestre-sec-turnos').scrollIntoView = rolar;
        fireEvent.click(screen.getByRole('button', { name: '⚔️ Turnos' }));
        await esperar();
        expect(rolar).toHaveBeenCalled();
        expect(useStore.getState().secaoMestrePedida).toBeNull();
    });

    it('sem scrollIntoView (jsdom) o clique não lança erro', async () => {
        preparar();
        render(<><AtalhosMestre /><SecaoMestreAncora id="forja"><p>f</p></SecaoMestreAncora></>);
        fireEvent.click(screen.getByRole('button', { name: '🏗️ Forja de Vilões' }));
        await esperar();
        expect(useStore.getState().secaoMestrePedida).toBeNull();
    });

    it('atalho abre a seção recolhida (Equipes) e rola até ela', async () => {
        preparar();
        render(<><AtalhosMestre /><EquipesRelacoes /></>);
        const equipes = document.querySelector('#mestre-sec-equipes .equipes-titulo-btn');
        expect(equipes.getAttribute('aria-expanded')).toBe('false');
        const rolar = vi.fn();
        document.getElementById('mestre-sec-equipes').scrollIntoView = rolar;
        fireEvent.click(within(screen.getByRole('navigation', { name: 'Atalhos do Mestre' })).getByRole('button', { name: '🛡️ Equipes e Relações' }));
        await esperar();
        expect(equipes.getAttribute('aria-expanded')).toBe('true');
        expect(rolar).toHaveBeenCalled();
    });

    it('atalho de Raças abre a seção recolhida', async () => {
        preparar();
        render(<><AtalhosMestre /><RacasCatalogo /></>);
        const titulo = document.querySelector('#mestre-sec-racas .racas-titulo-btn');
        fireEvent.click(titulo);
        expect(titulo.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(within(screen.getByRole('navigation', { name: 'Atalhos do Mestre' })).getByRole('button', { name: '🧬 Raças' }));
        await esperar();
        expect(titulo.getAttribute('aria-expanded')).toBe('true');
    });
});

describe('lacunas: pedido consumido uma vez e Modo Jogador', () => {
    it('secaoMestrePedida é consumida uma vez: mudanças posteriores não rolam de novo', async () => {
        preparar();
        const rolar = vi.fn();
        render(<SecaoMestreAncora id="turnos"><p>t</p></SecaoMestreAncora>);
        document.getElementById('mestre-sec-turnos').scrollIntoView = rolar;
        act(() => { useStore.getState().pedirSecaoMestre('turnos'); });
        await esperar();
        expect(rolar).toHaveBeenCalledTimes(1);
        expect(useStore.getState().secaoMestrePedida).toBeNull();
        act(() => { useStore.setState({ abaAtiva: 'aba-x' }); });
        await esperar();
        expect(rolar).toHaveBeenCalledTimes(1);
    });
    it('pedido de outra seção não é consumido por esta', async () => {
        preparar();
        render(<SecaoMestreAncora id="turnos"><p>t</p></SecaoMestreAncora>);
        act(() => { useStore.getState().pedirSecaoMestre('forja'); });
        await esperar();
        expect(useStore.getState().secaoMestrePedida).toEqual({ id: 'forja' });
    });
    it('Modo Jogador (isMestre=false): painel do Mestre não mostra atalhos', () => {
        preparar({ isMestre: false, modoJogador: true });
        render(<MestrePanel />);
        expect(screen.queryByRole('navigation', { name: 'Atalhos do Mestre' })).toBeNull();
        useStore.setState({ modoJogador: false });
    });
});
