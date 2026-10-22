import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import OrbeNavegacao from './OrbeNavegacao';
import useStore from '../../stores/useStore';
import { listarDestinos } from '../../core/navegacao';

const pedidos = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, {
    tipo: 'poder', alvo: 'Ana', solicitante: 'Ana', em: i + 1, avisos: [], objeto: { nome: `Golpe ${i}` },
}]));
const orbe = () => document.querySelector('.orbe-botao');
const abrir = () => fireEvent.click(orbe());
const itens = () => document.querySelectorAll('.orbe-item');

beforeEach(() => {
    localStorage.clear();
    useStore.setState({ abaAtiva: 'aba-perfil', isMestre: false, souMestreReal: false, sextaFeiraPendentes: {} });
});
afterEach(() => cleanup());

describe('OrbeNavegacao', () => {
    it('botao comeca fechado com aria-expanded=false e sem menu', () => {
        render(<OrbeNavegacao />);
        expect(orbe().getAttribute('aria-expanded')).toBe('false');
        expect(document.querySelector('.orbe-menu')).toBeNull();
    });
    it('clique abre o menu (portal no body) com um item por destino', () => {
        const { container } = render(<OrbeNavegacao />);
        abrir();
        expect(orbe().getAttribute('aria-expanded')).toBe('true');
        const menu = document.querySelector('.orbe-menu');
        expect(menu).toBeTruthy();
        expect(container.contains(menu)).toBe(false);
        expect(document.body.contains(menu)).toBe(true);
        expect(itens()).toHaveLength(listarDestinos({ isMestre: false }).length);
    });
    it('segundo clique no orbe fecha', () => {
        render(<OrbeNavegacao />);
        abrir(); abrir();
        expect(document.querySelector('.orbe-menu')).toBeNull();
    });
    it('clicar item chama setAbaAtiva e fecha', () => {
        render(<OrbeNavegacao />);
        abrir();
        fireEvent.click(screen.getByLabelText('Mapa'));
        expect(useStore.getState().abaAtiva).toBe('aba-mapa');
        expect(document.querySelector('.orbe-menu')).toBeNull();
        expect(orbe().getAttribute('aria-expanded')).toBe('false');
    });
    it('Esc fecha', () => {
        render(<OrbeNavegacao />);
        abrir();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(document.querySelector('.orbe-menu')).toBeNull();
        expect(useStore.getState().abaAtiva).toBe('aba-perfil');
    });
    it('teclas 1-9 escolhem o destino correspondente', () => {
        render(<OrbeNavegacao />);
        const lista = listarDestinos({ isMestre: false });
        abrir();
        fireEvent.keyDown(window, { key: '3' });
        expect(useStore.getState().abaAtiva).toBe(lista[2].id);
        expect(document.querySelector('.orbe-menu')).toBeNull();
    });
    it('tecla 1 vai para o primeiro destino', () => {
        render(<OrbeNavegacao />);
        abrir();
        fireEvent.keyDown(window, { key: '1' });
        expect(useStore.getState().abaAtiva).toBe(listarDestinos({})[0].id);
    });
    it('numero alem da lista e 0 nao navegam', () => {
        render(<OrbeNavegacao />);
        abrir();
        fireEvent.keyDown(window, { key: '0' });
        expect(useStore.getState().abaAtiva).toBe('aba-perfil');
        expect(document.querySelector('.orbe-menu')).toBeTruthy();
    });
    it('com Ctrl pressionado o numero nao navega', () => {
        render(<OrbeNavegacao />);
        abrir();
        fireEvent.keyDown(window, { key: '2', ctrlKey: true });
        expect(useStore.getState().abaAtiva).toBe('aba-perfil');
    });
    it('numeros sem o menu aberto nao navegam', () => {
        render(<OrbeNavegacao />);
        fireEvent.keyDown(window, { key: '2' });
        expect(useStore.getState().abaAtiva).toBe('aba-perfil');
    });
    it('digitar numero em INPUT dentro do menu NAO navega', () => {
        render(<OrbeNavegacao sessao={<input data-testid="busca" />} />);
        abrir();
        fireEvent.keyDown(screen.getByTestId('busca'), { key: '2' });
        expect(useStore.getState().abaAtiva).toBe('aba-perfil');
        expect(document.querySelector('.orbe-menu')).toBeTruthy();
    });
    it('Esc dentro de um INPUT ainda fecha', () => {
        render(<OrbeNavegacao sessao={<input data-testid="busca" />} />);
        abrir();
        fireEvent.keyDown(screen.getByTestId('busca'), { key: 'Escape' });
        expect(document.querySelector('.orbe-menu')).toBeNull();
    });
    it('clique no fundo fecha, clique dentro do menu nao', () => {
        render(<OrbeNavegacao sessao={<span data-testid="dentro">x</span>} />);
        abrir();
        fireEvent.mouseDown(screen.getByTestId('dentro'));
        expect(document.querySelector('.orbe-menu')).toBeTruthy();
        fireEvent.mouseDown(document.querySelector('.orbe-anel'));
        expect(document.querySelector('.orbe-menu')).toBeTruthy();
        fireEvent.mouseDown(document.querySelector('.orbe-fundo'));
        expect(document.querySelector('.orbe-menu')).toBeNull();
    });
    it('mostra o conteudo de `sessao` e nao mostra bloco sem ela', () => {
        const { unmount } = render(<OrbeNavegacao sessao={<span>SALA: abc</span>} />);
        abrir();
        expect(screen.getByText('SALA: abc')).toBeTruthy();
        unmount();
        render(<OrbeNavegacao />);
        abrir();
        expect(document.querySelector('.orbe-sessao')).toBeNull();
    });
    it('jogador comum nao ve o Painel do Mestre', () => {
        render(<OrbeNavegacao />);
        abrir();
        expect(screen.queryByLabelText('Painel do Mestre')).toBeNull();
    });
    it('Mestre ve o item do Painel do Mestre e navega ate ele', () => {
        useStore.setState({ isMestre: true, souMestreReal: true });
        render(<OrbeNavegacao />);
        abrir();
        expect(itens()).toHaveLength(listarDestinos({ isMestre: true }).length);
        fireEvent.click(screen.getByLabelText('Painel do Mestre'));
        expect(useStore.getState().abaAtiva).toBe('aba-mestre');
    });
    it('badge de pedidos so para o Mestre; 9+ acima de 9', () => {
        useStore.setState({ sextaFeiraPendentes: pedidos(3) });
        const { unmount } = render(<OrbeNavegacao />);
        expect(document.querySelector('.sidebar-badge-pedidos')).toBeNull();
        unmount();
        useStore.setState({ isMestre: true, souMestreReal: true });
        const r2 = render(<OrbeNavegacao />);
        expect(document.querySelector('.sidebar-badge-pedidos').textContent).toBe('3');
        r2.unmount();
        useStore.setState({ sextaFeiraPendentes: pedidos(12) });
        render(<OrbeNavegacao />);
        expect(document.querySelector('.sidebar-badge-pedidos').textContent).toBe('9+');
    });
    it('Mestre sem pedidos nao tem badge', () => {
        useStore.setState({ isMestre: true, souMestreReal: true });
        render(<OrbeNavegacao />);
        expect(document.querySelector('.sidebar-badge-pedidos')).toBeNull();
    });
    it('item da aba atual vem marcado como ativa', () => {
        useStore.setState({ abaAtiva: 'aba-mapa' });
        render(<OrbeNavegacao />);
        abrir();
        expect(document.querySelectorAll('.orbe-item.ativa')).toHaveLength(1);
        expect(screen.getByLabelText('Mapa').className).toContain('ativa');
    });
});
