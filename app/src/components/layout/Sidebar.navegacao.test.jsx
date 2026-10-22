import React from 'react';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Sidebar from './Sidebar';
import useStore from '../../stores/useStore';
import { listarDestinos } from '../../core/navegacao';

const st = () => useStore.getState();
const nav = () => document.querySelector('nav.sidebar-magica');

beforeEach(() => {
    localStorage.clear();
    useStore.setState({ mesaId: 'mesaT', isMestre: false, souMestreReal: false, modoJogador: false, abaAtiva: 'aba-perfil', sextaFeiraPendentes: {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Sidebar - todas as abas visiveis', () => {
    it('renderiza um botao por aba do jogador, sem gavetas', () => {
        render(<Sidebar onResetClick={() => {}} />);
        listarDestinos().forEach(d => expect(screen.getByRole('button', { name: d.nome })).toBeTruthy());
        expect(document.querySelector('.gaveta-container')).toBeNull();
        expect(document.querySelector('.sub-abas-wrapper')).toBeNull();
        expect(document.querySelector('.btn-micro')).toBeNull();
    });
    it('nav tem aria-label e grupos tem aria-label', () => {
        render(<Sidebar onResetClick={() => {}} />);
        expect(nav().getAttribute('aria-label')).toBe('Navegação principal');
        expect(screen.getByRole('group', { name: 'Combate' })).toBeTruthy();
    });
    it('clique troca abaAtiva de uma vez para cada aba', () => {
        render(<Sidebar onResetClick={() => {}} />);
        listarDestinos().forEach(d => {
            fireEvent.click(screen.getByRole('button', { name: d.nome }));
            expect(st().abaAtiva).toBe(d.id);
        });
    });
    it('aba ativa recebe classe ativa e aria-current=page; outras nao', () => {
        useStore.setState({ abaAtiva: 'aba-mapa' });
        render(<Sidebar onResetClick={() => {}} />);
        const mapa = screen.getByRole('button', { name: 'Mapa' });
        expect(mapa.className).toContain('ativa');
        expect(mapa.getAttribute('aria-current')).toBe('page');
        const ataque = screen.getByRole('button', { name: /Combate/ });
        expect(ataque.className).not.toContain('ativa');
        expect(ataque.getAttribute('aria-current')).toBeNull();
    });
    it('jogador comum: sem 👑 e sem 🎭', () => {
        render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.btn-macro-mestre')).toBeNull();
        expect(document.querySelector('.btn-modo-jogador')).toBeNull();
    });
    it('Mestre real: 👑 e 🎭 aparecem; 👑 abre aba-mestre', () => {
        useStore.setState({ isMestre: true, souMestreReal: true });
        render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.btn-modo-jogador').textContent).toContain('🎭');
        const m = document.querySelector('.btn-macro-mestre');
        expect(m.textContent).toContain('👑');
        fireEvent.click(m);
        expect(st().abaAtiva).toBe('aba-mestre');
    });
    it('Mestre em Modo Jogador: so 🎭', () => {
        useStore.setState({ isMestre: false, souMestreReal: true, modoJogador: true });
        render(<Sidebar onResetClick={() => {}} />);
        expect(document.querySelector('.btn-macro-mestre')).toBeNull();
        expect(document.querySelector('.btn-modo-jogador')).not.toBeNull();
    });
});

describe('Sidebar - expandir/recolher', () => {
    const botao = () => document.querySelector('.nav-expandir');
    it('padrao recolhida (sem localStorage)', () => {
        render(<Sidebar onResetClick={() => {}} />);
        expect(nav().className).not.toContain('sidebar-expandida');
        expect(botao().getAttribute('aria-pressed')).toBe('false');
    });
    it('clicar expande e grava "1"; clicar de novo recolhe e grava "0"', () => {
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(botao());
        expect(nav().className).toContain('sidebar-expandida');
        expect(localStorage.getItem('rpgSidebarExpandida')).toBe('1');
        expect(botao().getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(botao());
        expect(nav().className).not.toContain('sidebar-expandida');
        expect(localStorage.getItem('rpgSidebarExpandida')).toBe('0');
    });
    it('le estado persistido "1" ao montar', () => {
        localStorage.setItem('rpgSidebarExpandida', '1');
        render(<Sidebar onResetClick={() => {}} />);
        expect(nav().className).toContain('sidebar-expandida');
    });
    it('valor estranho no localStorage conta como recolhida', () => {
        localStorage.setItem('rpgSidebarExpandida', 'talvez');
        render(<Sidebar onResetClick={() => {}} />);
        expect(nav().className).not.toContain('sidebar-expandida');
    });
    it('localStorage lancando erro nao quebra', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(botao());
        expect(nav().className).toContain('sidebar-expandida');
    });
});

describe('Sidebar - atalho da paleta', () => {
    it('botao 🔎 dispara o evento abrir-paleta-navegacao', () => {
        const fn = vi.fn();
        window.addEventListener('abrir-paleta-navegacao', fn);
        render(<Sidebar onResetClick={() => {}} />);
        fireEvent.click(document.querySelector('.nav-atalho'));
        window.removeEventListener('abrir-paleta-navegacao', fn);
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
