import React from 'react';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Sidebar from './Sidebar';
import useStore from '../../stores/useStore';
import { listarDestinos, GRUPOS_NAVEGACAO } from '../../core/navegacao';

const rotuloDe = (nome) => screen.getByRole('button', { name: nome }).querySelector('.nav-rotulo').textContent;

beforeEach(() => {
    localStorage.clear();
    useStore.setState({ mesaId: 'mesaT', isMestre: false, souMestreReal: false, modoJogador: false, abaAtiva: 'aba-perfil', sextaFeiraPendentes: {} });
});
afterEach(() => cleanup());

describe('Sidebar como barra do topo', () => {
    it('renderiza children dentro de .barra-lado-direito', () => {
        render(<Sidebar>{<span data-testid="sala">Sala X</span>}</Sidebar>);
        const lado = document.querySelector('nav .barra-lado-direito');
        expect(lado).not.toBeNull();
        expect(lado.querySelector('[data-testid="sala"]')).not.toBeNull();
    });
    it('sem children não cria .barra-lado-direito', () => {
        render(<Sidebar />);
        expect(document.querySelector('.barra-lado-direito')).toBeNull();
    });
    it('aba atual com `curto` mostra o rótulo curto (Ficha, Grimório, Comunicação)', () => {
        useStore.setState({ abaAtiva: 'aba-Ficha Def' });
        const { unmount } = render(<Sidebar />);
        expect(rotuloDe('Ficha Definitiva')).toBe('Ficha');
        unmount();
        useStore.setState({ abaAtiva: 'aba-grimorio' });
        const r2 = render(<Sidebar />);
        expect(rotuloDe('O Grimório Místico')).toBe('Grimório');
        r2.unmount();
        useStore.setState({ abaAtiva: 'aba-comunicacao' });
        render(<Sidebar />);
        expect(rotuloDe('Comunicação (Chat, Voz e Mesa de Som)')).toBe('Comunicação');
    });
    it('aba sem `curto` mostra o nome', () => {
        render(<Sidebar />);
        expect(rotuloDe('Perfil')).toBe('Perfil');
    });
    it('todas as abas têm aria-label com o nome completo', () => {
        render(<Sidebar />);
        listarDestinos().forEach(d => {
            const b = screen.getByRole('button', { name: d.nome });
            expect(b.getAttribute('aria-label')).toBe(d.nome);
        });
    });
    it('rodapé tem 🔎 e ↔ e o ↔ persiste rpgSidebarExpandida', () => {
        render(<Sidebar />);
        expect(document.querySelector('.nav-atalho .nav-icone').textContent).toBe('🔎');
        const exp = document.querySelector('.nav-expandir');
        expect(exp.querySelector('.nav-icone').textContent).toBe('↔');
        fireEvent.click(exp);
        expect(localStorage.getItem('rpgSidebarExpandida')).toBe('1');
    });
});

describe('core/navegacao campo curto', () => {
    it('curto, quando existe, é string não vazia e mais curto que o nome', () => {
        const comCurto = GRUPOS_NAVEGACAO.flatMap(g => g.abas).filter(a => a.curto !== undefined);
        expect(comCurto.length).toBeGreaterThan(0);
        comCurto.forEach(a => { expect(typeof a.curto).toBe('string'); expect(a.curto.length).toBeGreaterThan(0); expect(a.curto.length).toBeLessThan(a.nome.length); });
    });
    it('listarDestinos preserva o curto', () => {
        const d = listarDestinos().find(x => x.id === 'aba-grimorio');
        expect(d.curto).toBe('Grimório');
    });
});
