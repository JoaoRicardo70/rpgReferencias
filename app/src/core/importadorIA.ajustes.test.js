import { describe, it, expect } from 'vitest';
import { prepararItemImportado, prepararImportacao, juntarNotas } from './importadorIA';

describe('importador v2 - categoria, strings, dedupe, notas (ajustes)', () => {
    it.each([
        ['Habilidades', 'habilidade'], ['FORMAS', 'forma'], ['poderes', 'poder'], ['Forma', 'forma'], ['Hábilidade', 'habilidade'],
    ])('categoria %j vira %s mesmo com a aba em outra categoria', (cat, esperado) => {
        const outra = esperado === 'poder' ? 'forma' : 'poder';
        expect(prepararItemImportado({ nome: 'A', categoria: cat }, outra).objeto.categoria).toBe(esperado);
    });
    it('categoria ausente, inválida ou não-string usa a categoria padrão (aba), não habilidade', () => {
        for (const c of [undefined, null, '', 'xyz', 42, {}]) {
            expect(prepararItemImportado({ nome: 'A', categoria: c }, 'forma').objeto.categoria).toBe('forma');
        }
        expect(prepararImportacao([{ nome: 'A' }], 'poder')[0].objeto.categoria).toBe('poder');
    });
    it('efeito string não vazia vai para naoAplicado; null/objeto vazio descartados em silêncio', () => {
        const r = prepararItemImportado({ nome: 'A', efeitos: ['+5 forca', null, {}, ''] });
        expect(r.objeto.efeitos).toEqual([]);
        expect(r.naoAplicado).toContain('Efeito em formato inválido não importado (+5 forca)');
        expect(r.naoAplicado.filter(n => /inválido/.test(n))).toHaveLength(1);
    });
    it('naoAplicado repetido (qualquer caixa) aparece uma vez', () => {
        const r = prepararItemImportado({ nome: 'A', naoAplicado: ['x40 dano', 'X40 DANO', ' x40 dano ', 'outro', ''] });
        expect(r.naoAplicado).toEqual(['x40 dano', 'outro']);
        expect(r.objeto.notasIA.match(/x40 dano/gi)).toHaveLength(1);
    });
    it('juntarNotas: bloco nunca é cortado; notas da IA encolhem para caber', () => {
        const lista = ['a'.repeat(100), 'b'.repeat(100)];
        const r = juntarNotas('n'.repeat(6000), lista);
        expect(r.length).toBeLessThanOrEqual(4000);
        lista.forEach(s => expect(r).toContain(`- ${s}`));
        expect(r).toContain('Não aplicado automaticamente:');
        expect(r.endsWith(`- ${lista[1]}`)).toBe(true);
    });
    it('juntarNotas: sem lista, só notas cortadas em 4000; com espaço sobrando mantém tudo', () => {
        expect(juntarNotas('x'.repeat(5000), []).length).toBe(4000);
        expect(juntarNotas('curta', ['um'])).toBe('curta\n\nNão aplicado automaticamente:\n- um');
    });
});

describe('contrato informado: objeto vazio descartado em silêncio', () => {
    it('efeito {} não gera entrada em naoAplicado', () => {
        const r = prepararItemImportado({ nome: 'A', efeitos: [{}] });
        expect(r.objeto.efeitos).toEqual([]);
        expect(r.naoAplicado).toEqual([]);
    });
});
