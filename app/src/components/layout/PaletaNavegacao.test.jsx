import React from 'react';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import PaletaNavegacao from './PaletaNavegacao';
import useStore from '../../stores/useStore';
import { listarDestinos } from '../../core/navegacao';

const st = () => useStore.getState();
const caixa = () => screen.queryByRole('dialog', { name: 'Ir para' });
const busca = () => screen.getByPlaceholderText(/Ir para/);
const ctrlK = (extra = {}) => fireEvent.keyDown(window, { key: 'k', ctrlKey: true, ...extra });
const nomes = () => screen.getAllByRole('option').map(o => o.querySelector('.paleta-nome').textContent);

beforeEach(() => {
    localStorage.clear();
    useStore.setState({ isMestre: false, abaAtiva: 'aba-perfil' });
});
afterEach(() => cleanup());

describe('PaletaNavegacao - abrir/fechar', () => {
    it('comeca fechada', () => {
        render(<PaletaNavegacao />);
        expect(caixa()).toBeNull();
    });
    it('Ctrl+K abre, foca o campo, e Ctrl+K de novo fecha', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        expect(caixa()).not.toBeNull();
        expect(document.activeElement).toBe(busca());
        ctrlK();
        expect(caixa()).toBeNull();
    });
    it('Cmd+K (metaKey) e maiuscula tambem abrem', () => {
        render(<PaletaNavegacao />);
        fireEvent.keyDown(window, { key: 'K', metaKey: true });
        expect(caixa()).not.toBeNull();
    });
    it('Ctrl+Shift+K e Ctrl+Alt+K nao abrem; k sozinho nao abre', () => {
        render(<PaletaNavegacao />);
        ctrlK({ shiftKey: true });
        ctrlK({ altKey: true });
        fireEvent.keyDown(window, { key: 'k' });
        expect(caixa()).toBeNull();
    });
    it('evento abrir-paleta-navegacao abre', () => {
        render(<PaletaNavegacao />);
        act(() => { window.dispatchEvent(new Event('abrir-paleta-navegacao')); });
        expect(caixa()).not.toBeNull();
    });
    it('Esc fecha', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        fireEvent.keyDown(busca(), { key: 'Escape' });
        expect(caixa()).toBeNull();
    });
    it('clicar no fundo fecha; clicar na caixa nao', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        fireEvent.mouseDown(caixa());
        expect(caixa()).not.toBeNull();
        fireEvent.mouseDown(document.querySelector('.paleta-fundo'));
        expect(caixa()).toBeNull();
    });
    it('reabrir limpa a busca anterior', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        fireEvent.change(busca(), { target: { value: 'mapa' } });
        fireEvent.keyDown(busca(), { key: 'Escape' });
        ctrlK();
        expect(busca().value).toBe('');
    });
    it('remove os listeners ao desmontar', () => {
        const { unmount } = render(<PaletaNavegacao />);
        unmount();
        ctrlK();
        act(() => { window.dispatchEvent(new Event('abrir-paleta-navegacao')); });
        expect(caixa()).toBeNull();
        fireEvent.keyDown(window, { key: '2', code: 'Digit2', altKey: true });
        expect(st().abaAtiva).toBe('aba-perfil');
    });
});

describe('PaletaNavegacao - filtro e navegacao', () => {
    it('lista todos os destinos; sem Mestre nao tem Painel do Mestre', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        expect(nomes()).toHaveLength(listarDestinos().length);
        expect(nomes()).not.toContain('Painel do Mestre');
    });
    it('Mestre ve o Painel do Mestre', () => {
        useStore.setState({ isMestre: true });
        render(<PaletaNavegacao />);
        ctrlK();
        expect(nomes()).toContain('Painel do Mestre');
    });
    it('filtra sem acento e mostra mensagem quando nada casa', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        fireEvent.change(busca(), { target: { value: 'oraculo' } });
        expect(nomes()).toEqual(['Oráculo (IA)']);
        fireEvent.change(busca(), { target: { value: 'zzzz' } });
        expect(screen.queryAllByRole('option')).toHaveLength(0);
        expect(screen.getByText('Nenhuma aba encontrada.')).toBeTruthy();
    });
    it('Enter com nada encontrado nao faz nada e nao fecha', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        fireEvent.change(busca(), { target: { value: 'zzzz' } });
        fireEvent.keyDown(busca(), { key: 'Enter' });
        expect(st().abaAtiva).toBe('aba-perfil');
        expect(caixa()).not.toBeNull();
    });
    it('setas movem a selecao (limitadas) e Enter navega e fecha', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        const sel = () => screen.getAllByRole('option').findIndex(o => o.getAttribute('aria-selected') === 'true');
        expect(sel()).toBe(0);
        fireEvent.keyDown(busca(), { key: 'ArrowUp' });
        expect(sel()).toBe(0);
        fireEvent.keyDown(busca(), { key: 'ArrowDown' });
        fireEvent.keyDown(busca(), { key: 'ArrowDown' });
        expect(sel()).toBe(2);
        const alvo = nomes()[2];
        fireEvent.keyDown(busca(), { key: 'Enter' });
        expect(listarDestinos().find(d => d.nome === alvo).id).toBe(st().abaAtiva);
        expect(caixa()).toBeNull();
    });
    it('ArrowDown nao passa do ultimo', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        for (let i = 0; i < 50; i++) fireEvent.keyDown(busca(), { key: 'ArrowDown' });
        const opts = screen.getAllByRole('option');
        expect(opts[opts.length - 1].getAttribute('aria-selected')).toBe('true');
    });
    it('digitar reseta a selecao para o primeiro', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        fireEvent.keyDown(busca(), { key: 'ArrowDown' });
        fireEvent.change(busca(), { target: { value: 'a' } });
        expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
    });
    it('clicar num item navega e fecha', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        fireEvent.click(screen.getByRole('option', { name: /Mapa/ }));
        expect(st().abaAtiva).toBe('aba-mapa');
        expect(caixa()).toBeNull();
    });
    it('faz blur do campo ativo antes de trocar de aba', () => {
        render(<PaletaNavegacao />);
        ctrlK();
        const ordem = [];
        busca().addEventListener('blur', () => ordem.push(['blur', st().abaAtiva]));
        const un = useStore.subscribe((s, p) => { if (s.abaAtiva !== p.abaAtiva) ordem.push(['troca', s.abaAtiva]); });
        fireEvent.click(screen.getByRole('option', { name: /Mapa/ }));
        un();
        expect(ordem).toEqual([['blur', 'aba-perfil'], ['troca', 'aba-mapa']]);
    });
});

describe('PaletaNavegacao - Alt+Digit', () => {
    it('Alt+Digit2 vai para o 2o destino usando e.code (key pode ser caractere do Mac)', () => {
        render(<PaletaNavegacao />);
        fireEvent.keyDown(window, { key: '™', code: 'Digit2', altKey: true });
        expect(st().abaAtiva).toBe(listarDestinos()[1].id);
    });
    it('sem Alt, com Ctrl ou com Meta nao navega', () => {
        render(<PaletaNavegacao />);
        fireEvent.keyDown(window, { key: '2', code: 'Digit2' });
        fireEvent.keyDown(window, { key: '2', code: 'Digit2', altKey: true, ctrlKey: true });
        fireEvent.keyDown(window, { key: '2', code: 'Digit2', altKey: true, metaKey: true });
        expect(st().abaAtiva).toBe('aba-perfil');
    });
    it('apenas e.key sem e.code nao navega; Digit0 nao navega', () => {
        render(<PaletaNavegacao />);
        fireEvent.keyDown(window, { key: '2', altKey: true });
        fireEvent.keyDown(window, { key: '0', code: 'Digit0', altKey: true });
        expect(st().abaAtiva).toBe('aba-perfil');
    });
    it('Mestre: Alt+1 vai pro Painel do Mestre', () => {
        useStore.setState({ isMestre: true });
        render(<PaletaNavegacao />);
        fireEvent.keyDown(window, { code: 'Digit1', altKey: true });
        expect(st().abaAtiva).toBe('aba-mestre');
    });
    it('faz blur do campo em edicao antes de trocar', () => {
        render(<><input data-testid="c" /><PaletaNavegacao /></>);
        const c = screen.getByTestId('c');
        c.focus();
        expect(document.activeElement).toBe(c);
        let focoNaTroca = c;
        const un = useStore.subscribe((s, p) => { if (s.abaAtiva !== p.abaAtiva) focoNaTroca = document.activeElement; });
        fireEvent.keyDown(window, { code: 'Digit3', altKey: true });
        un();
        expect(focoNaTroca).not.toBe(c);
    });
    it('Ctrl+K tambem tira o foco do campo ativo', () => {
        render(<><input data-testid="c" /><PaletaNavegacao /></>);
        screen.getByTestId('c').focus();
        ctrlK();
        expect(document.activeElement).not.toBe(screen.getByTestId('c'));
    });
});

describe('PaletaNavegacao - recentes', () => {
    it('persiste abas visitadas em rpgNavRecentes (mais recente primeiro, sem repetir)', () => {
        render(<PaletaNavegacao />);
        act(() => st().setAbaAtiva('aba-mapa'));
        act(() => st().setAbaAtiva('aba-log'));
        act(() => st().setAbaAtiva('aba-mapa'));
        expect(JSON.parse(localStorage.getItem('rpgNavRecentes'))).toEqual(['aba-mapa', 'aba-log', 'aba-perfil']);
    });
    it('limita a 5 no storage', () => {
        render(<PaletaNavegacao />);
        ['aba-mapa', 'aba-log', 'aba-combate', 'aba-perfil', 'aba-Ficha Def', 'aba-grimorio'].forEach(id => act(() => st().setAbaAtiva(id)));
        expect(JSON.parse(localStorage.getItem('rpgNavRecentes'))).toHaveLength(5);
    });
    it('recentes salvos vem no topo da lista, sem a aba atual', () => {
        localStorage.setItem('rpgNavRecentes', JSON.stringify(['aba-log', 'aba-perfil', 'aba-fantasma', 'aba-mapa']));
        render(<PaletaNavegacao />);
        ctrlK();
        const n = nomes();
        expect(n[0]).toBe('Feed e Log');
        expect(n[1]).toBe('Mapa');
        expect(n.filter(x => x === 'Feed e Log')).toHaveLength(1);
        expect(n).toHaveLength(listarDestinos().length);
    });
    it('JSON corrompido ou nao-array no storage nao quebra', () => {
        localStorage.setItem('rpgNavRecentes', '{nao json');
        render(<PaletaNavegacao />);
        ctrlK();
        expect(nomes()).toHaveLength(listarDestinos().length);
        cleanup();
        localStorage.setItem('rpgNavRecentes', '{"a":1}');
        render(<PaletaNavegacao />);
        ctrlK();
        expect(nomes()).toHaveLength(listarDestinos().length);
    });
});
