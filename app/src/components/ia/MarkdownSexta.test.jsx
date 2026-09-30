import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import MarkdownSexta from './MarkdownSexta';

afterEach(() => cleanup());

describe('MarkdownSexta', () => {
    it('renderiza negrito, italico e codigo inline', () => {
        const { container } = render(<MarkdownSexta texto={'**x** e *y* e `z`'} />);
        expect(container.querySelector('strong').textContent).toBe('x');
        expect(container.querySelector('em').textContent).toBe('y');
        expect(container.querySelector('code.sexta-md-code').textContent).toBe('z');
    });
    it('titulo # vira h3 e ###### vira h6 (nivel+2, min 3, max 6)', () => {
        const { container } = render(<MarkdownSexta texto={'# A\n\n## B\n\n###### F'} />);
        const hs = [...container.querySelectorAll('.sexta-md-titulo')].map(h => h.tagName);
        expect(hs).toEqual(['H3', 'H4', 'H6']);
    });
    it('listas ul e ol', () => {
        const { container } = render(<MarkdownSexta texto={'- a\n- b\n\n1. c\n2. d'} />);
        expect(container.querySelectorAll('ul li')).toHaveLength(2);
        expect(container.querySelectorAll('ol li')).toHaveLength(2);
    });
    it('tabela com thead e tbody', () => {
        const { container } = render(<MarkdownSexta texto={'| A | B |\n|---|---|\n| 1 | 2 |'} />);
        expect(container.querySelectorAll('thead th')).toHaveLength(2);
        expect(container.querySelectorAll('tbody td')).toHaveLength(2);
    });
    it('bloco de codigo, citacao e regua', () => {
        const { container } = render(<MarkdownSexta texto={'```\nx < y\n```\n\n> cita\n\n---'} />);
        expect(container.querySelector('pre code').textContent).toBe('x < y');
        expect(container.querySelector('blockquote').textContent).toBe('cita');
        expect(container.querySelector('hr')).toBeTruthy();
    });
    it('paragrafo com varias linhas usa <br>', () => {
        const { container } = render(<MarkdownSexta texto={'a\nb\nc'} />);
        expect(container.querySelectorAll('p br')).toHaveLength(2);
    });
    it('texto vazio/nulo renderiza container vazio sem quebrar', () => {
        const { container } = render(<MarkdownSexta texto="" />);
        expect(container.querySelector('.sexta-md').children).toHaveLength(0);
        cleanup();
        const r2 = render(<MarkdownSexta texto={null} />);
        expect(r2.container.querySelector('.sexta-md').children).toHaveLength(0);
    });
    it('atualiza ao trocar o texto (streaming)', () => {
        const { container, rerender } = render(<MarkdownSexta texto="**ol" />);
        expect(container.querySelector('strong')).toBeNull();
        rerender(<MarkdownSexta texto="**ola**" />);
        expect(container.querySelector('strong').textContent).toBe('ola');
    });

    describe('seguranca: HTML da IA nunca vira elemento', () => {
        const ataques = [
            '<img src=x onerror=alert(1)>',
            '<script>alert(1)</script>',
            '<iframe src="javascript:alert(1)"></iframe>',
            '<a href="javascript:alert(1)">clique</a>',
            '<svg onload=alert(1)>',
            '</p><img src=x onerror=alert(1)>',
        ];
        it.each(ataques)('paragrafo: %s', (ataque) => {
            const { container } = render(<MarkdownSexta texto={`ola ${ataque} fim`} />);
            expect(container.querySelector('img,script,iframe,a,svg')).toBeNull();
            expect(container.textContent).toContain(ataque);
        });
        it.each(ataques)('titulo, lista, tabela, citacao, negrito, codigo: %s', (ataque) => {
            const md = `# ${ataque}\n\n- ${ataque}\n\n| ${ataque} |\n|---|\n| ${ataque} |\n\n> ${ataque}\n\n**${ataque}**\n\n\`\`\`\n${ataque}\n\`\`\``;
            const { container } = render(<MarkdownSexta texto={md} />);
            expect(container.querySelector('img,script,iframe,a,svg')).toBeNull();
            expect(container.textContent).toContain(ataque);
        });
        it('link markdown nao vira <a>', () => {
            const { container } = render(<MarkdownSexta texto="[clique](javascript:alert(1))" />);
            expect(container.querySelector('a')).toBeNull();
        });
        it('innerHTML nao contem tags perigosas ativas', () => {
            const { container } = render(<MarkdownSexta texto={'<img src=x onerror=alert(1)>'} />);
            expect(container.innerHTML).toContain('&lt;img');
            expect(container.innerHTML).not.toMatch(/<img/i);
        });
    });
});
