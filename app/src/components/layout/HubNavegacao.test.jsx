import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import HubNavegacao, { BarraModoHub } from './HubNavegacao';
import useStore from '../../stores/useStore';
import { MODOS_HUB } from '../../core/modoNavegacao';

beforeEach(() => {
    useStore.setState({ abaAtiva: 'aba-hub', isMestre: false, souMestreReal: false, meuNome: 'Ana', sextaFeiraPendentes: {} });
});
afterEach(() => cleanup());

const cartoes = () => document.querySelectorAll('.hub-cartao');
const cartao = (nome) => [...cartoes()].find(c => c.querySelector('.hub-cartao-nome').textContent === nome);

describe('HubNavegacao', () => {
    it('um cartao por modo do hub e nenhum do Mestre para jogador', () => {
        render(<HubNavegacao />);
        expect(cartoes()).toHaveLength(MODOS_HUB.length);
        MODOS_HUB.forEach(m => expect(cartao(m.nome)).toBeTruthy());
        expect(cartao('Mestre')).toBeUndefined();
    });
    it('saudacao usa o nome, ou "aventureiro" sem nome', () => {
        const { unmount } = render(<HubNavegacao />);
        expect(screen.getByText(/Ana/)).toBeTruthy();
        unmount();
        useStore.setState({ meuNome: '' });
        render(<HubNavegacao />);
        expect(screen.getByText(/aventureiro/)).toBeTruthy();
    });
    it('Mestre ganha o cartao Mestre, que abre aba-mestre', () => {
        useStore.setState({ isMestre: true, souMestreReal: true });
        render(<HubNavegacao />);
        expect(cartoes()).toHaveLength(MODOS_HUB.length + 1);
        fireEvent.click(cartao('Mestre').querySelector('.hub-cartao-corpo'));
        expect(useStore.getState().abaAtiva).toBe('aba-mestre');
    });
    it('Mestre com pedidos mostra badge e texto', () => {
        useStore.setState({
            isMestre: true, souMestreReal: true,
            sextaFeiraPendentes: { a: { tipo: 'poder', alvo: 'Ana', solicitante: 'Ana', em: 1, avisos: [], objeto: { nome: 'Golpe' } } }
        });
        render(<HubNavegacao />);
        expect(document.querySelector('.sidebar-badge-pedidos').textContent).toBe('1');
        expect(screen.getByText(/1 pedido\(s\) aguardando/)).toBeTruthy();
    });
    it.each(MODOS_HUB.map(m => [m.nome, m.abas[0]]))('clicar no cartao %s abre %s', (nome, aba) => {
        render(<HubNavegacao />);
        fireEvent.click(cartao(nome).querySelector('.hub-cartao-corpo'));
        expect(useStore.getState().abaAtiva).toBe(aba);
    });
    it('chips abrem a aba especifica', () => {
        render(<HubNavegacao />);
        const chip = (c, re) => within(cartao(c)).getAllByRole('button').find(b => b.classList.contains('hub-chip') && re.test(b.textContent));
        fireEvent.click(chip('Ficha', /Grimório/));
        expect(useStore.getState().abaAtiva).toBe('aba-grimorio');
    });
    it('modos de uma aba so (Combate, Mapa) nao tem chips; Perfil tem Perfil e Configuracoes', () => {
        render(<HubNavegacao />);
        expect(cartao('Mapa').querySelector('.hub-cartao-chips')).toBeNull();
        expect(cartao('Perfil').querySelectorAll('.hub-chip')).toHaveLength(2);
        expect(cartao('Combate').querySelector('.hub-cartao-chips')).toBeNull();
        expect(cartao('Ficha').querySelectorAll('.hub-chip')).toHaveLength(2);
    });
    it('renderiza o bloco sessao quando recebido', () => {
        render(<HubNavegacao sessao={<span>SESSAO-X</span>} />);
        expect(screen.getByText('SESSAO-X')).toBeTruthy();
    });
});

describe('BarraModoHub', () => {
    it('nao renderiza na aba-hub', () => {
        const { container } = render(<BarraModoHub />);
        expect(container.firstChild).toBeNull();
    });
    it('botao Mesa leva ao hub', () => {
        useStore.setState({ abaAtiva: 'aba-combate' });
        render(<BarraModoHub />);
        fireEvent.click(screen.getByText('🏠 Mesa'));
        expect(useStore.getState().abaAtiva).toBe('aba-hub');
    });
    it('mostra as subabas do modo atual e marca a ativa', () => {
        useStore.setState({ abaAtiva: 'aba-Ficha Def' });
        render(<BarraModoHub />);
        expect(document.querySelectorAll('.hub-subaba')).toHaveLength(2);
        expect(document.querySelector('.hub-modo-nome').textContent).toContain('Ficha');
        const ativa = document.querySelector('.hub-subaba.ativa');
        expect(ativa.getAttribute('aria-current')).toBe('page');
        fireEvent.click(screen.getByText(/Grimório/));
        expect(useStore.getState().abaAtiva).toBe('aba-grimorio');
    });
    it('modo Combate (aba unica) nao tem subabas', () => {
        useStore.setState({ abaAtiva: 'aba-combate' });
        render(<BarraModoHub />);
        expect(document.querySelector('.hub-subabas')).toBeNull();
        expect(document.querySelector('.hub-modo-nome').textContent).toContain('Combate');
    });
    it('modo de aba unica (Mapa) nao tem subabas', () => {
        useStore.setState({ abaAtiva: 'aba-mapa' });
        render(<BarraModoHub />);
        expect(document.querySelector('.hub-subabas')).toBeNull();
        expect(document.querySelector('.hub-modo-nome').textContent).toContain('Mapa');
    });
    it('aba fora dos modos (mestre) mostra o nome da propria aba', () => {
        useStore.setState({ abaAtiva: 'aba-mestre', isMestre: true, souMestreReal: true });
        render(<BarraModoHub />);
        expect(document.querySelector('.hub-modo-nome').textContent).toContain('Painel do Mestre');
    });
    it('botao de busca dispara abrir-paleta-navegacao', () => {
        useStore.setState({ abaAtiva: 'aba-mapa' });
        const ouvinte = vi.fn();
        window.addEventListener('abrir-paleta-navegacao', ouvinte);
        render(<BarraModoHub />);
        fireEvent.click(document.querySelector('.hub-busca'));
        window.removeEventListener('abrir-paleta-navegacao', ouvinte);
        expect(ouvinte).toHaveBeenCalledTimes(1);
    });
});
