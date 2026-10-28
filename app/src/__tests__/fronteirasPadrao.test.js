import { describe, it, expect } from 'vitest';
import { GRADE_L, GRADE_A, MAX_FACCOES, RAIO_MAX, ZOOM_MAX, VISTA_INICIAL, contarCelulas, limitarVista, zoomNoPonto, proximoIdLivre, facoesParaFirebase } from '../core/fronteiras';
import { FACCOES_PADRAO, gradePadrao, fronteirasPadrao, fronteirasDoCenario } from '../core/fronteirasPadrao';

describe('fronteiras padrão', () => {
    it('há uma facção por região, com ids e cores distintos', () => {
        expect(FACCOES_PADRAO.map((f) => f.nome)).toEqual(['Freljord', 'Demacia', 'Noxus', 'Piltover e Zaun', 'Shurima', 'Targon', 'Ixtal', 'Águas de Sentina', 'Ionia', 'Ilha das Sombras']);
        expect(new Set(FACCOES_PADRAO.map((f) => f.id)).size).toBe(10);
        expect(new Set(FACCOES_PADRAO.map((f) => f.cor)).size).toBe(10);
    });

    it('a grade padrão tem o tamanho da grade e todas as regiões têm território', () => {
        const g = gradePadrao();
        expect(g).toHaveLength(GRADE_A);
        expect(g.every((l) => l.length === GRADE_L)).toBe(true);
        const celulas = contarCelulas(g);
        FACCOES_PADRAO.forEach((f) => expect(celulas[f.id]).toBeGreaterThan(50));
        expect(Object.keys(celulas).sort()).toEqual(FACCOES_PADRAO.map((f) => f.id).sort());
    });

    it('as regiões ficam onde esperado no mapa (Freljord no noroeste, Shurima ao sul, Ionia no nordeste)', () => {
        const g = gradePadrao();
        const centro = (id) => {
            let sx = 0; let sy = 0; let n = 0;
            g.forEach((l, y) => { for (let x = 0; x < GRADE_L; x++) if (l[x] === id) { sx += x; sy += y; n++; } });
            return { x: sx / n / GRADE_L, y: sy / n / GRADE_A };
        };
        const freljord = centro('1'); const shurima = centro('5'); const ionia = centro('9');
        expect(freljord.x).toBeLessThan(0.3); expect(freljord.y).toBeLessThan(0.25);
        expect(shurima.y).toBeGreaterThan(0.5);
        expect(ionia.x).toBeGreaterThan(0.6); expect(ionia.y).toBeLessThan(0.3);
    });

    it('sem o Mestre ter editado (ou com dados antigos sem a marca), vale o padrão', () => {
        expect(fronteirasDoCenario(undefined).facoes).toHaveLength(10);
        expect(fronteirasDoCenario({ facoes: { 1: { nome: 'Teste', cor: '#ff0000' } }, linhas: {} }).facoes).toHaveLength(10);
        expect(fronteirasPadrao().grade).toBe(gradePadrao());
    });

    it('depois de editado, vale o que o Mestre salvou — inclusive tudo vazio', () => {
        const vazio = fronteirasDoCenario({ personalizado: true });
        expect(vazio.facoes).toEqual([]);
        expect(contarCelulas(vazio.grade)).toEqual({});
        const um = fronteirasDoCenario({ personalizado: true, facoes: { 2: { nome: 'Guilda', cor: '#00ff00' } }, linhas: { l5: `${'2'.repeat(10)}${'0'.repeat(GRADE_L - 10)}` } });
        expect(um.facoes).toEqual([{ id: '2', nome: 'Guilda', cor: '#00ff00' }]);
        expect(contarCelulas(um.grade)).toEqual({ 2: 10 });
    });

    it('a grade padrão sobrevive ao ciclo Firebase (ids de a-c incluídos)', () => {
        const f = facoesParaFirebase(FACCOES_PADRAO);
        expect(Object.keys(f)).toHaveLength(10);
        expect(Object.keys(f)).toContain('a');
    });

    it('cabem até 12 facções e os pincéis chegam a um raio grande', () => {
        expect(MAX_FACCOES).toBe(12);
        const todas = Array.from('123456789abc').map((id) => ({ id }));
        expect(proximoIdLivre(todas)).toBeNull();
        expect(proximoIdLivre(FACCOES_PADRAO)).toBe('b');
        expect(RAIO_MAX).toBeGreaterThanOrEqual(36);
    });
});

describe('fronteiras - zoom', () => {
    it('a vista inicial é 1× sem deslocamento', () => {
        expect(VISTA_INICIAL).toEqual({ escala: 1, x: 0, y: 0 });
    });

    it('limita a escala e não deixa a borda do mapa se afastar da janela', () => {
        expect(limitarVista({ escala: 99, x: 0, y: 0 }, 1000, 600).escala).toBe(ZOOM_MAX);
        expect(limitarVista({ escala: 0.2, x: 50, y: 50 }, 1000, 600)).toEqual({ escala: 1, x: 0, y: 0 });
        expect(limitarVista({ escala: 2, x: 300, y: 300 }, 1000, 600)).toEqual({ escala: 2, x: 0, y: 0 });
        expect(limitarVista({ escala: 2, x: -5000, y: -5000 }, 1000, 600)).toEqual({ escala: 2, x: -1000, y: -600 });
        expect(limitarVista({ escala: NaN, x: NaN, y: NaN }, 1000, 600)).toEqual({ escala: 1, x: 0, y: 0 });
    });

    it('ampliar mantém o ponto sob o cursor no mesmo lugar', () => {
        const v = zoomNoPonto(VISTA_INICIAL, 2, 500, 300, 1000, 600);
        expect(v.escala).toBe(2);
        // o ponto do mapa que estava em (500,300) continua em (500,300) na janela
        expect((500 - v.x) / v.escala).toBeCloseTo(500);
        expect((300 - v.y) / v.escala).toBeCloseTo(300);
        const mais = zoomNoPonto(v, 4, 700, 100, 1000, 600);
        expect((700 - mais.x) / mais.escala).toBeCloseTo((700 - v.x) / v.escala);
    });

    it('perto da borda o zoom é contido e voltar a 1× zera o deslocamento', () => {
        const v = zoomNoPonto(VISTA_INICIAL, 3, 0, 0, 1000, 600);
        expect(v.x).toBe(0); expect(v.y).toBe(0);
        const volta = zoomNoPonto(v, 1, 500, 300, 1000, 600);
        expect(volta).toEqual({ escala: 1, x: 0, y: 0 });
    });
});
