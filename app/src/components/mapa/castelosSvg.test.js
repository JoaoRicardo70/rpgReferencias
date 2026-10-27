import { describe, it, expect } from 'vitest';
import { svgCidadelaCeus, svgFortalezaInferno, encaixarSvg } from './castelosSvg';

const decodificar = (url) => decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2));

describe('castelosSvg', () => {
    it('encaixarSvg devolve um url() de data URI', () => {
        expect(encaixarSvg('<svg/>')).toBe('url("data:image/svg+xml,%3Csvg%2F%3E")');
    });

    it.each([
        ['Céus', svgCidadelaCeus, '20 0 160 150'],
        ['Inferno', svgFortalezaInferno, '0 0 200 120']
    ])('%s: SVG bem formado com o viewBox da caixa e filtros de relevo/luz', (_, gerar, viewBox) => {
        const svg = decodificar(gerar());
        expect(svg.startsWith("<svg xmlns='http://www.w3.org/2000/svg'")).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain(`viewBox='${viewBox}'`);
        expect(svg).toContain('feDiffuseLighting');
        expect(svg).toContain('feTurbulence');
        expect(svg).not.toMatch(/NaN|undefined/);
    });

    it('todo id referenciado em url(#...) está definido no próprio SVG', () => {
        [svgCidadelaCeus(), svgFortalezaInferno()].forEach((url) => {
            const svg = decodificar(url);
            const usados = new Set(Array.from(svg.matchAll(/url\(#([A-Za-z0-9_]+)\)/g), m => m[1]));
            usados.forEach(id => expect(svg, `id ${id}`).toContain(`id='${id}'`));
        });
    });

    it('os números do desenho ficam dentro do viewBox horizontal (nada sai pela lateral)', () => {
        const svg = decodificar(svgCidadelaCeus());
        const xs = Array.from(svg.matchAll(/<rect x='(-?[0-9.]+)' y='[-0-9.]+' width='([0-9.]+)'/g), m => [parseFloat(m[1]), parseFloat(m[2])]);
        xs.forEach(([x, w]) => { expect(x).toBeGreaterThanOrEqual(19); expect(x + w).toBeLessThanOrEqual(181); });
    });
});
