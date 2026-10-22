import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtalhoAtaques } from './MapaCombate';

let ctx;
vi.mock('../combate/AtaqueFormContext', () => ({ useAtaqueForm: () => ctx }));
vi.mock('../../stores/useStore');
vi.mock('../poderes/PoderesFormContext', () => ({ usePoderesForm: () => null }));
vi.mock('../arsenal/ArsenalFormContext', () => ({ useArsenalForm: () => null }));
vi.mock('../arsenal/ElementosFormContext', () => ({ useElementosForm: () => null, emogis: {}, cores: {} }));
vi.mock('./MapaFormContext', () => ({ useMapaForm: () => null, urlSeguraParaCss: (u) => u, calcularCA: () => 10 }));

const montar = () => {
    ctx = {
        minhaFicha: { ataqueConfig: { ataquesSalvos: [{ id: 1, nome: 'Combo', config: {} }] } },
        podeRolarDano: true, ignorarTravaAcerto: false, dummieAlvo: null,
        rolarAtaqueSalvo: vi.fn(), rolarDanoCustomizado: vi.fn(),
    };
    return render(<MapaAtalhoAtaques />);
};
const btn = () => screen.getByTitle('Atalho dos Ataques Salvos');
const ptr = (tipo, x, y) => { const e = new Event(tipo, { bubbles: true }); e.clientX = x; e.clientY = y; e.button = 0; return e; };

beforeEach(() => { localStorage.clear(); window.innerWidth = 1000; window.innerHeight = 800; });
afterEach(() => cleanup());

describe('MapaAtalhoAtaques - botão arrastável', () => {
    it('wrapper tem left/top vindos do hook (posição salva)', () => {
        localStorage.setItem('rpg_livro_combate_pos', JSON.stringify({ x: 200, y: 300 }));
        montar();
        const w = document.querySelector('.atalho-ataques');
        expect(w.style.left).toBe('200px');
        expect(w.style.top).toBe('300px');
    });
    it('posição padrão fica abaixo do topo reservado', () => {
        montar();
        const w = document.querySelector('.atalho-ataques');
        expect(w.style.left).toBe('8px');
        expect(parseInt(w.style.top, 10)).toBeGreaterThanOrEqual(68);
    });
    it('clique abre e fecha o Livro', () => {
        montar();
        fireEvent.click(btn());
        expect(screen.getByText('Combo')).toBeTruthy();
        fireEvent.click(btn());
        expect(screen.queryByText('Combo')).toBeNull();
    });
    it('clique logo após arrastar NÃO abre; o seguinte abre; wrapper acompanha o arrasto', () => {
        montar();
        const w = document.querySelector('.atalho-ataques');
        const x0 = parseInt(w.style.left, 10);
        fireEvent.pointerDown(btn(), { clientX: 100, clientY: 100, button: 0 });
        act(() => { window.dispatchEvent(ptr('pointermove', 180, 100)); });
        act(() => { window.dispatchEvent(ptr('pointerup', 180, 100)); });
        expect(parseInt(w.style.left, 10)).toBe(x0 + 80);
        fireEvent.click(btn());
        expect(screen.queryByText('Combo')).toBeNull();
        fireEvent.click(btn());
        expect(screen.getByText('Combo')).toBeTruthy();
    });
    it('pressionar e soltar sem mover ainda abre', () => {
        montar();
        fireEvent.pointerDown(btn(), { clientX: 100, clientY: 100, button: 0 });
        act(() => { window.dispatchEvent(ptr('pointerup', 100, 100)); });
        fireEvent.click(btn());
        expect(screen.getByText('Combo')).toBeTruthy();
    });
});
