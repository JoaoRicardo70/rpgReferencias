import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Sidebar from './Sidebar';
import useStore from '../../stores/useStore';

// QA - Sidebar: Poderes/Inventario/Elementos sairam do menu (o Arsenal vive no Relicario).
const titulos = () => Array.from(document.querySelectorAll('button[title]')).map(b => b.getAttribute('title'));

beforeEach(() => {
    localStorage.clear();
    useStore.setState({ mesaId: 'mesaT', isMestre: false, souMestreReal: false, modoJogador: false, abaAtiva: 'aba-ficha', entidadeInspecionada: null });
});
afterEach(() => cleanup());

describe('Sidebar - sem as abas de Arsenal/Poderes/Elementos', () => {
    it.each([false, true])('isMestre=%s: nenhuma aba-poderes/aba-arsenal/aba-elementos nem o grupo "Arsenal e Oculto"', (isMestre) => {
        useStore.setState({ isMestre, souMestreReal: isMestre });
        render(<Sidebar onResetClick={() => {}} />);
        const t = titulos();
        expect(t).not.toContain('Arsenal e Oculto');
        expect(t).not.toContain('Poderes Clássicos');
        expect(t).not.toContain('Inventário');
        expect(t).not.toContain('Elementos');
        expect(document.body.innerHTML).not.toContain('aba-poderes');
        expect(document.body.innerHTML).not.toContain('aba-arsenal');
        expect(document.body.innerHTML).not.toContain('aba-elementos');
    });

    it('as demais abas continuam presentes', () => {
        render(<Sidebar onResetClick={() => {}} />);
        const t = titulos();
        expect(t).toContain('Ficha Definitiva');
        expect(t).toContain('Ataque');
        expect(t).toContain('Mapa');
    });

    it('clicar em todos os itens da barra nunca leva a aba-poderes/arsenal/elementos', () => {
        render(<Sidebar onResetClick={() => {}} />);
        document.querySelectorAll('.nav-item').forEach(b => {
            b.click();
            expect(['aba-poderes', 'aba-arsenal', 'aba-elementos']).not.toContain(useStore.getState().abaAtiva);
        });
    });
});
