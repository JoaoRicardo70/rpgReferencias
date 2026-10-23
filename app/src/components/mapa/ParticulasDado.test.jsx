import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ParticulasDado, { criarParticulas, avancarParticula, gerarRachaduras } from './ParticulasDado';

const NIVEIS = ['fatal', 'critico', 'falha', 'normal'];
const NIVEIS_COM_PARTICULAS = ['fatal', 'critico', 'falha'];

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('criarParticulas', () => {
    it.each(NIVEIS_COM_PARTICULAS)('nivel %s: suaves tem menos particulas que intensos (e pelo menos 1)', (nivel) => {
        const intensas = criarParticulas(nivel, 'intensos', 100, 100);
        const suaves = criarParticulas(nivel, 'suaves', 100, 100);
        expect(intensas.length).toBeGreaterThan(0);
        expect(suaves.length).toBeGreaterThanOrEqual(1);
        expect(suaves.length).toBeLessThan(intensas.length);
    });
    it('quantidades por nivel (intensos): fatal 150, critico 70, falha 26+18, normal 0 (rolagem comum nao tem particulas)', () => {
        expect(criarParticulas('fatal', 'intensos', 0, 0)).toHaveLength(150);
        expect(criarParticulas('critico', 'intensos', 0, 0)).toHaveLength(70);
        expect(criarParticulas('falha', 'intensos', 0, 0)).toHaveLength(44);
        expect(criarParticulas('normal', 'intensos', 0, 0)).toHaveLength(0);
        expect(criarParticulas('normal', 'suaves', 0, 0)).toHaveLength(0);
    });
    it('nivel desconhecido ou ausente cai em fagulhas genericas (14)', () => {
        expect(criarParticulas('xyz', 'intensos', 0, 0)).toHaveLength(14);
        expect(criarParticulas(undefined, 'intensos', 0, 0)).toHaveLength(14);
    });
    it('intensidade desconhecida conta como intensos', () => {
        expect(criarParticulas('fatal', 'qualquer', 0, 0)).toHaveLength(150);
    });
    it('fatal gera brasas; critico faiscas; falha cacos e poeira', () => {
        expect(new Set(criarParticulas('fatal', 'intensos', 0, 0).map(p => p.tipo))).toEqual(new Set(['brasa']));
        expect(new Set(criarParticulas('critico', 'intensos', 0, 0).map(p => p.tipo))).toEqual(new Set(['faisca']));
        expect(new Set(criarParticulas('falha', 'intensos', 0, 0).map(p => p.tipo))).toEqual(new Set(['caco', 'poeira']));
    });
    it('todas nascem na posicao (x, y) pedida (poeira com pequena dispersao) e com campos validos', () => {
        const lista = criarParticulas('critico', 'intensos', 300, 200);
        lista.forEach(p => {
            expect(p.x).toBe(300); expect(p.y).toBe(200);
            expect(p.vida).toBeGreaterThan(0);
            expect(p.tam).toBeGreaterThan(0);
            expect(typeof p.cor).toBe('string');
            [p.vx, p.vy, p.g].forEach(v => expect(Number.isFinite(v)).toBe(true));
        });
        criarParticulas('falha', 'intensos', 300, 200).filter(p => p.tipo === 'poeira').forEach(p => {
            expect(Math.abs(p.x - 300)).toBeLessThanOrEqual(40);
        });
    });
    it('nivel desconhecido com cor nao usa a cor (so o normal usa), paleta padrao', () => {
        const cores = new Set(criarParticulas('xyz', 'intensos', 0, 0, '#123456').map(p => p.cor));
        [...cores].forEach(c => expect(['#7cc4ff', '#bfe3ff', '#ffffff']).toContain(c));
        expect(cores.has('#123456')).toBe(false);
    });
    it('cacos de falha saltam para cima (vy inicial negativo)', () => {
        criarParticulas('falha', 'intensos', 0, 0).filter(p => p.tipo === 'caco').forEach(p => expect(p.vy).toBeLessThanOrEqual(0));
    });
});

describe('avancarParticula', () => {
    const nova = (extra = {}) => ({ tipo: 'faisca', x: 0, y: 0, vx: 100, vy: -50, g: 200, vida: 1, tam: 2, cor: '#fff', ...extra });
    it('retorna true e move a particula enquanto viva', () => {
        const p = nova();
        expect(avancarParticula(p, 0.1)).toBe(true);
        expect(p.idade).toBeCloseTo(0.1, 10);
        expect(p.x).toBeGreaterThan(0);
        expect(p.vy).toBeCloseTo(-30, 8);
    });
    it('gravidade acelera para baixo', () => {
        const p = nova({ vx: 0, vy: 0 });
        avancarParticula(p, 0.1);
        expect(p.vy).toBeGreaterThan(0);
        expect(p.y).toBeGreaterThan(0);
    });
    it('retorna false ao morrer (idade >= vida), sem mover', () => {
        const p = nova({ vida: 0.5 });
        expect(avancarParticula(p, 0.3)).toBe(true);
        const x = p.x;
        expect(avancarParticula(p, 0.3)).toBe(false);
        expect(p.x).toBe(x);
    });
    it('morre exatamente quando idade == vida', () => {
        expect(avancarParticula(nova({ vida: 0.2 }), 0.2)).toBe(false);
    });
    it('caco gira; poeira perde velocidade horizontal mais rapido', () => {
        const caco = nova({ tipo: 'caco', rot: 0, vrot: 5 });
        avancarParticula(caco, 0.1);
        expect(caco.rot).toBeCloseTo(0.5, 8);
        const poeira = nova({ tipo: 'poeira', g: 0 });
        const faisca = nova({ g: 0 });
        avancarParticula(poeira, 0.1); avancarParticula(faisca, 0.1);
        expect(poeira.vx).toBeLessThan(faisca.vx);
    });
    it('uma lista sempre se esgota em tempo finito', () => {
        const lista = criarParticulas('fatal', 'intensos', 0, 0);
        for (let i = 0; i < 200 && lista.length; i++) {
            for (let k = lista.length - 1; k >= 0; k--) if (!avancarParticula(lista[k], 0.05)) lista.splice(k, 1);
        }
        expect(lista).toHaveLength(0);
    });
});

describe('gerarRachaduras', () => {
    it('retorna N polylines (padrao 8)', () => {
        expect(gerarRachaduras()).toHaveLength(8);
        expect(gerarRachaduras(5)).toHaveLength(5);
        expect(gerarRachaduras(0)).toEqual([]);
    });
    it('cada linha comeca no centro (50,50) e tem de 5 a 7 pontos "x,y" numericos', () => {
        gerarRachaduras(9).forEach(linha => {
            const pontos = linha.split(' ');
            expect(pontos[0]).toBe('50.0,50.0');
            expect(pontos.length).toBeGreaterThanOrEqual(5);
            expect(pontos.length).toBeLessThanOrEqual(7);
            pontos.forEach(pt => expect(pt).toMatch(/^-?\d+\.\d,-?\d+\.\d$/));
        });
    });
});

describe('<ParticulasDado />', () => {
    let ctx;
    beforeEach(() => {
        ctx = new Proxy({}, { get: (alvo, nome) => (nome in alvo ? alvo[nome] : vi.fn()), set: (alvo, nome, v) => { alvo[nome] = v; return true; } });
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx);
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 7));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });

    it('renderiza um canvas.dado-particulas aria-hidden', () => {
        const { container } = render(<ParticulasDado nivel="fatal" x={10} y={20} />);
        const c = container.querySelector('canvas.dado-particulas');
        expect(c).not.toBeNull();
        expect(c.getAttribute('aria-hidden')).toBe('true');
        expect(container.querySelector('svg.dado-rachaduras')).toBeNull();
    });
    it.each(['fatal', 'critico', 'normal'])('nivel %s nao tem rachaduras', (nivel) => {
        const { container } = render(<ParticulasDado nivel={nivel} x={0} y={0} />);
        expect(container.querySelector('svg.dado-rachaduras')).toBeNull();
    });
    it('falha renderiza svg.dado-rachaduras com 9 polylines (5 nas suaves) na posicao do pouso', () => {
        const { container, rerender } = render(<ParticulasDado nivel="falha" x={120} y={80} />);
        const svg = container.querySelector('svg.dado-rachaduras');
        expect(svg).not.toBeNull();
        expect(svg.querySelectorAll('polyline')).toHaveLength(9);
        expect(svg.style.left).toBe('120px');
        expect(svg.style.top).toBe('80px');
        rerender(<ParticulasDado nivel="falha" intensidade="suaves" x={120} y={80} />);
        expect(container.querySelectorAll('svg.dado-rachaduras polyline')).toHaveLength(5);
    });
    it('desenha no canvas e agenda animacao; o cleanup cancela o frame', () => {
        const { unmount } = render(<ParticulasDado nivel="critico" x={50} y={50} />);
        expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
        expect(requestAnimationFrame).toHaveBeenCalled();
        unmount();
        expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    });
    it('executa um quadro de animacao sem erro para todos os niveis', () => {
        NIVEIS.forEach(nivel => {
            const frames = [];
            requestAnimationFrame.mockImplementation((fn) => { frames.push(fn); return frames.length; });
            const { unmount } = render(<ParticulasDado nivel={nivel} x={50} y={50} cor="#00ffcc" />);
            expect(() => frames[0](performance.now() + 16)).not.toThrow();
            unmount();
        });
    });
    it('sem contexto 2D (jsdom/navegador sem canvas) nao quebra nem anima', () => {
        HTMLCanvasElement.prototype.getContext.mockImplementation(() => null);
        expect(() => render(<ParticulasDado nivel="fatal" x={1} y={1} />)).not.toThrow();
        expect(requestAnimationFrame).not.toHaveBeenCalled();
    });
});
