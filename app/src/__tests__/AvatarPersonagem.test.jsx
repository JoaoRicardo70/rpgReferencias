import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

const mockState = { meuNome: 'Eu', minhaFicha: null, personagens: {} };
vi.mock('../stores/useStore', () => ({ default: vi.fn((selector) => selector(mockState)) }));

import AvatarPersonagem from '../components/comunicacao/AvatarPersonagem';

describe('AvatarPersonagem', () => {
    beforeEach(() => { mockState.meuNome = 'Eu'; mockState.minhaFicha = null; mockState.personagens = {}; });
    afterEach(cleanup);

    it('sem imagem mostra a inicial maiuscula', () => {
        const { container } = render(<AvatarPersonagem nome="zeca" />);
        const el = container.querySelector('.avatar-com');
        expect(el.textContent).toBe('Z');
        expect(el.className).toContain('sem-imagem');
    });
    it('nome vazio mostra ?', () => {
        const { container } = render(<AvatarPersonagem nome="" />);
        expect(container.querySelector('.avatar-com').textContent).toBe('?');
    });
    it('com avatar.base https usa background-image', () => {
        mockState.personagens = { Ana: { avatar: { base: 'https://x.com/a.png' } } };
        const { container } = render(<AvatarPersonagem nome="Ana" tamanho={40} />);
        const el = container.querySelector('.avatar-com');
        expect(el.style.backgroundImage).toContain('https://x.com/a.png');
        expect(el.className).not.toContain('sem-imagem');
        expect(el.textContent).toBe('');
        expect(el.style.width).toBe('40px');
    });
    it('recusa javascript:', () => {
        mockState.personagens = { Ana: { avatar: { base: 'javascript:alert(1)' } } };
        const { container } = render(<AvatarPersonagem nome="Ana" />);
        const el = container.querySelector('.avatar-com');
        expect(el.style.backgroundImage === 'none' || el.style.backgroundImage === '').toBe(true);
        expect(el.textContent).toBe('A');
    });
    it('usa minhaFicha para o proprio nome', () => {
        mockState.minhaFicha = { avatar: { base: 'https://x.com/eu.png' } };
        mockState.personagens = { Eu: { avatar: { base: 'https://x.com/outro.png' } } };
        const { container } = render(<AvatarPersonagem nome="Eu" />);
        expect(container.querySelector('.avatar-com').style.backgroundImage).toContain('eu.png');
    });
    it('proprio nome sem minhaFicha cai para personagens', () => {
        mockState.personagens = { Eu: { avatar: { base: 'https://x.com/p.png' } } };
        const { container } = render(<AvatarPersonagem nome="Eu" />);
        expect(container.querySelector('.avatar-com').style.backgroundImage).toContain('p.png');
    });
    it('personagens undefined nao quebra', () => {
        mockState.personagens = undefined;
        const { container } = render(<AvatarPersonagem nome="X" />);
        expect(container.querySelector('.avatar-com').textContent).toBe('X');
    });
    it('forma ativa com imagem sobrescreve a base', () => {
        mockState.personagens = { Ana: { avatar: { base: 'https://x.com/a.png' }, poderes: [{ nome: 'F', ativa: true, imagemUrl: 'https://x.com/f.png' }] } };
        const { container } = render(<AvatarPersonagem nome="Ana" />);
        expect(container.querySelector('.avatar-com').style.backgroundImage).toContain('f.png');
    });
});
