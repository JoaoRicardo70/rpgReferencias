import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./TestesPanel', () => ({ default: () => <div data-testid="p-testes" /> }));
vi.mock('./AtaquePanel', () => ({ default: () => <div data-testid="p-ataque" /> }));
vi.mock('./AcertoPanel', () => ({ default: () => <div data-testid="p-acerto" /> }));
vi.mock('./DefesaPanel', () => ({ default: () => <div data-testid="p-defesa" /> }));
vi.mock('../feed/FeedCombate', () => ({ default: () => <div data-testid="p-feed" /> }));

import PainelCombate from './PainelCombate';

const CHAVE = 'rpg_combate_secoes';
const gravado = () => JSON.parse(localStorage.getItem(CHAVE));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('PainelCombate', () => {
    it('renderiza as 5 secoes com seus paineis', () => {
        render(<PainelCombate />);
        expect(document.querySelectorAll('.combate-secao')).toHaveLength(5);
        ['acerto', 'ataque', 'defesa', 'testes', 'feed'].forEach(id => expect(screen.getByTestId(`p-${id}`)).toBeTruthy());
        expect(screen.getByText('📜 Feed ao vivo')).toBeTruthy();
    });
    it('clicar no titulo recolhe e grava; clicar de novo expande', () => {
        render(<PainelCombate />);
        const titulo = screen.getByText('🗡️ Ataque').closest('button');
        expect(titulo.getAttribute('aria-expanded')).toBe('true');
        fireEvent.click(titulo);
        expect(screen.queryByTestId('p-ataque')).toBeNull();
        expect(titulo.getAttribute('aria-expanded')).toBe('false');
        expect(titulo.closest('section').className).toContain('recolhida');
        expect(gravado().ataque).toBe(true);
        expect(screen.getByTestId('p-defesa')).toBeTruthy();
        fireEvent.click(titulo);
        expect(screen.getByTestId('p-ataque')).toBeTruthy();
        expect(gravado().ataque).toBe(false);
    });
    it('secoes sao independentes', () => {
        render(<PainelCombate />);
        fireEvent.click(screen.getByText('🎯 Acerto').closest('button'));
        fireEvent.click(screen.getByText('🎲 Testes').closest('button'));
        expect(gravado()).toMatchObject({ acerto: true, testes: true });
        expect(screen.getByTestId('p-ataque')).toBeTruthy();
        expect(screen.getByTestId('p-feed')).toBeTruthy();
    });
    it('restaura secoes recolhidas do localStorage', () => {
        localStorage.setItem(CHAVE, JSON.stringify({ feed: true }));
        render(<PainelCombate />);
        expect(screen.queryByTestId('p-feed')).toBeNull();
        expect(screen.getByTestId('p-acerto')).toBeTruthy();
    });
    it.each(['{lixo', 'null', '"texto"', '[]'])('valor salvo invalido (%s) nao quebra', (v) => {
        localStorage.setItem(CHAVE, v);
        render(<PainelCombate />);
        expect(document.querySelectorAll('.combate-secao')).toHaveLength(5);
        expect(screen.getByTestId('p-acerto')).toBeTruthy();
    });
});
