import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useBotaoArrastavel from './useBotaoArrastavel';

let api;
function Teste({ chave = 'pos_teste', opcoes }) {
    api = useBotaoArrastavel(chave, opcoes || { largura: 64, altura: 38, topoReservado: 60 });
    return <div data-testid="b" style={{ left: api.pos.x, top: api.pos.y }} onPointerDown={api.aoPressionar} />;
}
const ev = (tipo, x, y) => { const e = new Event(tipo, { bubbles: true }); e.clientX = x; e.clientY = y; e.button = 0; return e; };
const mover = (x, y) => act(() => { window.dispatchEvent(ev('pointermove', x, y)); });
const soltar = () => act(() => { window.dispatchEvent(ev('pointerup', 0, 0)); });
const pressionar = (x, y, extra = {}) => act(() => { api.aoPressionar({ button: 0, clientX: x, clientY: y, ...extra }); });

beforeEach(() => {
    localStorage.clear();
    window.innerWidth = 1000; window.innerHeight = 800;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('useBotaoArrastavel', () => {
    it('posição inicial padrão (borda esquerda, 40% da área útil)', () => {
        render(<Teste />);
        expect(api.pos).toEqual({ x: 8, y: 60 + (800 - 60) * 0.4 });
    });
    it('usa a posição salva (com clamp)', () => {
        localStorage.setItem('pos_teste', JSON.stringify({ x: 300, y: 200 }));
        render(<Teste />);
        expect(api.pos).toEqual({ x: 300, y: 200 });
        cleanup();
        localStorage.setItem('pos_teste', JSON.stringify({ x: 99999, y: -5 }));
        render(<Teste />);
        expect(api.pos).toEqual({ x: 1000 - 64 - 8, y: 68 });
    });
    it('JSON ruim salvo cai na posição padrão', () => {
        localStorage.setItem('pos_teste', '{x');
        render(<Teste />);
        expect(api.pos.x).toBe(8);
    });
    it('arrasta além do limite e salva ao soltar', () => {
        render(<Teste />);
        const ini = { ...api.pos };
        pressionar(100, 100);
        mover(150, 130);
        expect(api.pos).toEqual({ x: ini.x + 50, y: ini.y + 30 });
        expect(localStorage.getItem('pos_teste')).toBeNull();
        soltar();
        expect(JSON.parse(localStorage.getItem('pos_teste'))).toEqual({ x: ini.x + 50, y: ini.y + 30 });
    });
    it('movimento pequeno não arrasta; clique sem mover: consumirArrasto false e nada salvo', () => {
        render(<Teste />);
        const ini = { ...api.pos };
        pressionar(100, 100);
        mover(102, 103);
        soltar();
        expect(api.pos).toEqual(ini);
        expect(localStorage.getItem('pos_teste')).toBeNull();
        expect(api.consumirArrasto()).toBe(false);
    });
    it('após arrasto consumirArrasto é true uma vez só', () => {
        render(<Teste />);
        pressionar(100, 100); mover(200, 200); soltar();
        expect(api.consumirArrasto()).toBe(true);
        expect(api.consumirArrasto()).toBe(false);
    });
    it('novo pressionar zera o estado de arrasto anterior', () => {
        render(<Teste />);
        pressionar(100, 100); mover(200, 200); soltar();
        pressionar(50, 50); soltar();
        expect(api.consumirArrasto()).toBe(false);
    });
    it('arrasto é limitado à tela e ao topo reservado', () => {
        render(<Teste />);
        pressionar(100, 100); mover(-5000, -5000);
        expect(api.pos).toEqual({ x: 8, y: 68 });
        mover(9000, 9000);
        expect(api.pos).toEqual({ x: 928, y: 754 });
        soltar();
    });
    it('botão direito do mouse não inicia arrasto', () => {
        render(<Teste />);
        const ini = { ...api.pos };
        pressionar(100, 100, { button: 2 });
        mover(300, 300);
        expect(api.pos).toEqual(ini);
    });
    it('resize puxa de volta pra dentro da tela', () => {
        localStorage.setItem('pos_teste', JSON.stringify({ x: 900, y: 700 }));
        render(<Teste />);
        expect(api.pos).toEqual({ x: 900, y: 700 });
        window.innerWidth = 500; window.innerHeight = 400;
        act(() => { window.dispatchEvent(new Event('resize')); });
        expect(api.pos).toEqual({ x: 500 - 64 - 8, y: 400 - 38 - 8 });
    });
    it('listeners removidos ao soltar e no unmount (resize)', () => {
        const add = vi.spyOn(window, 'addEventListener');
        const rem = vi.spyOn(window, 'removeEventListener');
        const { unmount } = render(<Teste />);
        pressionar(1, 1);
        expect(add.mock.calls.filter(c => c[0] === 'pointermove').length).toBe(1);
        soltar();
        ['pointermove', 'pointerup', 'pointercancel'].forEach(t => expect(rem.mock.calls.some(c => c[0] === t)).toBe(true));
        const antes = api.pos;
        mover(500, 500);
        expect(api.pos).toEqual(antes);
        unmount();
        expect(rem.mock.calls.some(c => c[0] === 'resize')).toBe(true);
    });
    it('pointercancel também encerra e salva', () => {
        render(<Teste />);
        pressionar(100, 100); mover(200, 100);
        act(() => { window.dispatchEvent(ev('pointercancel', 0, 0)); });
        expect(localStorage.getItem('pos_teste')).not.toBeNull();
    });
    it('janela pequena ao abrir não faz o botão esquecer o lugar salvo: ao crescer, ele volta', () => {
        localStorage.setItem('pos_teste', JSON.stringify({ x: 900, y: 600 }));
        window.innerWidth = 500; window.innerHeight = 400;
        render(<Teste />);
        expect(api.pos.x).toBeLessThan(900);
        act(() => { window.innerWidth = 1000; window.innerHeight = 800; window.dispatchEvent(new Event('resize')); });
        expect(api.pos).toEqual({ x: 900, y: 600 });
    });
    it('encolhe e cresce várias vezes sem perder o lugar salvo', () => {
        localStorage.setItem('pos_teste', JSON.stringify({ x: 900, y: 600 }));
        render(<Teste />);
        const redimensionar = (w, h) => act(() => { window.innerWidth = w; window.innerHeight = h; window.dispatchEvent(new Event('resize')); });
        redimensionar(500, 400);
        redimensionar(300, 300);
        expect(api.pos.x).toBe(300 - 64 - 8);
        redimensionar(1000, 800);
        expect(api.pos).toEqual({ x: 900, y: 600 });
    });
    it('arrastar com a janela encolhida passa a ser o novo lugar de verdade', () => {
        localStorage.setItem('pos_teste', JSON.stringify({ x: 900, y: 600 }));
        window.innerWidth = 500; window.innerHeight = 400;
        render(<Teste />);
        pressionar(100, 100); mover(90, 90); soltar();
        const nova = { ...api.pos };
        act(() => { window.innerWidth = 1000; window.innerHeight = 800; window.dispatchEvent(new Event('resize')); });
        expect(api.pos).toEqual(nova);
        expect(JSON.parse(localStorage.getItem('pos_teste'))).toEqual(nova);
    });
    it('sem posição salva, resize mantém o botão dentro da tela', () => {
        render(<Teste />);
        act(() => { window.innerWidth = 200; window.innerHeight = 200; window.dispatchEvent(new Event('resize')); });
        expect(api.pos.x).toBeLessThanOrEqual(200 - 64 - 8);
        expect(api.pos.y).toBeLessThanOrEqual(200 - 38 - 8);
    });
    it('soltar logo após o último movimento salva o lugar final', () => {
        render(<Teste />);
        const ini = { ...api.pos };
        pressionar(100, 100);
        mover(200, 160);
        soltar();
        expect(JSON.parse(localStorage.getItem('pos_teste'))).toEqual({ x: ini.x + 100, y: ini.y + 60 });
    });
});
