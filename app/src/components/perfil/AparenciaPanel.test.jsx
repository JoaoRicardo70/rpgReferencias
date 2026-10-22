import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import AparenciaPanel from './AparenciaPanel';
import { TEMAS_APP } from '../../core/temasApp';
import { coresPadraoDoDado } from '../../core/coresDado';
import { MODOS_NAVEGACAO } from '../../core/modoNavegacao';
import useStore from '../../stores/useStore';

const NIVEIS = ['normal', 'critico', 'fatal', 'falha'];

beforeEach(() => { localStorage.clear(); document.body.className = ''; useStore.setState({ modoNavegacao: 'orbe', abaAtiva: 'aba-Ficha Def' }); });
afterEach(() => { cleanup(); document.body.className = ''; });

const cores = () => JSON.parse(localStorage.getItem('rpg_dado_cores'));

describe('AparenciaPanel - temas', () => {
    it('renderiza 8 temas em 2 grupos', () => {
        const { container } = render(<AparenciaPanel />);
        // Os botoes de navegacao tambem usam .aparencia-tema; os de tema ficam so dentro de .aparencia-temas.
        expect(container.querySelectorAll('.aparencia-temas .aparencia-tema')).toHaveLength(8);
        expect(container.querySelectorAll('.aparencia-temas')).toHaveLength(2);
        const [g1, g2] = container.querySelectorAll('.aparencia-temas');
        expect(g1.querySelectorAll('.aparencia-tema')).toHaveLength(4);
        expect(g2.querySelectorAll('.aparencia-tema')).toHaveLength(4);
        expect(screen.getByText('Estilo visual')).toBeTruthy();
        expect(screen.getByText('Temas clássicos')).toBeTruthy();
        TEMAS_APP.forEach(t => expect(screen.getByText(t.nome)).toBeTruthy());
    });
    it('sem tema salvo marca Cyber-Neon como pressionado', () => {
        const { container } = render(<AparenciaPanel />);
        const marcados = container.querySelectorAll('.aparencia-temas [aria-pressed="true"]');
        expect(marcados).toHaveLength(1);
        expect(marcados[0].textContent).toContain('Cyber-Neon');
    });
    it('usa o tema salvo ao montar', () => {
        localStorage.setItem('rpg_tema', 'theme-mescla');
        render(<AparenciaPanel />);
        expect(screen.getByText('Mescla').closest('button').getAttribute('aria-pressed')).toBe('true');
    });
    it('clicar aplica classe no body, grava rpg_tema e marca aria-pressed', () => {
        document.body.className = 'theme-cyber manter';
        render(<AparenciaPanel />);
        const btn = screen.getByText('Medieval').closest('button');
        fireEvent.click(btn);
        expect(document.body.classList.contains('theme-medieval')).toBe(true);
        expect(document.body.classList.contains('theme-cyber')).toBe(false);
        expect(document.body.classList.contains('manter')).toBe(true);
        expect(localStorage.getItem('rpg_tema')).toBe('theme-medieval');
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        expect(btn.className).toContain('ativo');
        expect(screen.getByText('Cyber-Neon').closest('button').getAttribute('aria-pressed')).toBe('false');
    });
    it.each(TEMAS_APP.map(t => [t.nome, t.id]))('tema %s aplica %s', (nome, id) => {
        render(<AparenciaPanel />);
        fireEvent.click(screen.getByText(nome).closest('button'));
        expect(document.body.classList.contains(id)).toBe(true);
        expect(localStorage.getItem('rpg_tema')).toBe(id);
    });
});

describe('AparenciaPanel - navegacao', () => {
    const botoesNav = (container) => container.querySelectorAll('.aparencia-nav .aparencia-tema');
    it('lista os 4 modos de navegacao', () => {
        const { container } = render(<AparenciaPanel />);
        expect(botoesNav(container)).toHaveLength(4);
        MODOS_NAVEGACAO.forEach(m => expect(screen.getByText(m.nome)).toBeTruthy());
    });
    it('o modo ativo vem do store', () => {
        useStore.setState({ modoNavegacao: 'hub' });
        const { container } = render(<AparenciaPanel />);
        const marcados = container.querySelectorAll('.aparencia-nav [aria-pressed="true"]');
        expect(marcados).toHaveLength(1);
        expect(marcados[0].textContent).toContain('Hub por modos');
    });
    it('clicar chama setModoNavegacao, grava e marca aria-pressed', () => {
        render(<AparenciaPanel />);
        const btn = screen.getByText('Barra no topo').closest('button');
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(btn);
        expect(useStore.getState().modoNavegacao).toBe('barra');
        expect(localStorage.getItem('rpg_navegacao')).toBe('barra');
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        expect(btn.className).toContain('ativo');
        expect(screen.getByText('Orbe radial').closest('button').getAttribute('aria-pressed')).toBe('false');
    });
    it('escolher Hub leva a aba-hub', () => {
        render(<AparenciaPanel />);
        fireEvent.click(screen.getByText('Hub por modos').closest('button'));
        expect(useStore.getState().abaAtiva).toBe('aba-hub');
    });
    it('trocar de navegacao nao altera o tema', () => {
        render(<AparenciaPanel />);
        fireEvent.click(screen.getByText('Medieval').closest('button'));
        fireEvent.click(screen.getByText('Mesa com painéis').closest('button'));
        expect(localStorage.getItem('rpg_tema')).toBe('theme-medieval');
        expect(screen.getByText('Medieval').closest('button').getAttribute('aria-pressed')).toBe('true');
    });
});

describe('AparenciaPanel - cores do dado', () => {
    it('tem 4 seletores de cor com os valores padrao', () => {
        const { container } = render(<AparenciaPanel />);
        const inputs = container.querySelectorAll('input[type="color"]');
        expect(inputs).toHaveLength(4);
        const padrao = coresPadraoDoDado();
        expect([...inputs].map(i => i.value)).toEqual([padrao.normal, padrao.critico, padrao.fatal, padrao.falha]);
    });
    it.each([['Comum', 'normal'], ['Crítico', 'critico'], ['Crítico Fatal', 'fatal'], ['Falha Crítica', 'falha']])('mudar %s grava em rpg_dado_cores', (rotulo, nivel) => {
        render(<AparenciaPanel />);
        const input = screen.getByLabelText(`Cor do dado: ${rotulo}`);
        fireEvent.change(input, { target: { value: '#12ab34' } });
        expect(cores()[nivel]).toBe('#12ab34');
        expect(input.value).toBe('#12ab34');
        NIVEIS.filter(n => n !== nivel).forEach(n => expect(cores()[n]).toBe(coresPadraoDoDado()[n]));
    });
    it('mudancas acumulam em niveis diferentes', () => {
        render(<AparenciaPanel />);
        fireEvent.change(screen.getByLabelText('Cor do dado: Comum'), { target: { value: '#111111' } });
        fireEvent.change(screen.getByLabelText('Cor do dado: Crítico'), { target: { value: '#222222' } });
        expect(cores()).toMatchObject({ normal: '#111111', critico: '#222222' });
    });
    it('Restaurar cores volta ao padrao', () => {
        render(<AparenciaPanel />);
        const input = screen.getByLabelText('Cor do dado: Comum');
        fireEvent.change(input, { target: { value: '#111111' } });
        fireEvent.click(screen.getByText('Restaurar cores'));
        expect(cores()).toEqual(coresPadraoDoDado());
        expect(input.value).toBe(coresPadraoDoDado().normal);
    });
    it('cores salvas sao carregadas ao montar', () => {
        localStorage.setItem('rpg_dado_cores', JSON.stringify({ fatal: '#abcdef' }));
        render(<AparenciaPanel />);
        expect(screen.getByLabelText('Cor do dado: Crítico Fatal').value).toBe('#abcdef');
    });
});
