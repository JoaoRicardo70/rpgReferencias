import { describe, it, expect } from 'vitest';
import { normalizarPoder } from './sextaFeiraCriacao';
import { prepararItemImportado } from './importadorIA';

describe('normalizarPoder - aoAcertar', () => {
    it('preserva aoAcertar valido (normalizado)', () => {
        const { objeto } = normalizarPoder({ nome: 'Vampiro', categoria: 'habilidade', aoAcertar: [{ tipo: 'curarAtacante', modo: 'percMax', valor: '5,5' }] });
        expect(objeto.aoAcertar).toEqual([{ tipo: 'curarAtacante', modo: 'percMax', valor: 5.5 }]);
    });
    it('energia com energia padrao mana e apenasCritico', () => {
        const { objeto } = normalizarPoder({ nome: 'X', aoAcertar: [{ tipo: 'energiaAtacante', modo: 'fixo', valor: 200, apenasCritico: true }] });
        expect(objeto.aoAcertar).toEqual([{ tipo: 'energiaAtacante', modo: 'fixo', valor: 200, energia: 'mana', apenasCritico: true }]);
    });
    it('descarta entradas invalidas e nao cria o campo se nada sobra', () => {
        [undefined, null, 'x', [], [{ tipo: 'drenar', valor: 5 }], [{ tipo: 'curarAtacante', valor: 0 }], [{ tipo: 'curarAtacante', valor: -2 }]].forEach((aoAcertar) => {
            const { objeto } = normalizarPoder({ nome: 'X', aoAcertar });
            expect('aoAcertar' in objeto).toBe(false);
        });
    });
    it('mistura: mantem so as validas', () => {
        const { objeto } = normalizarPoder({ nome: 'X', aoAcertar: [{ tipo: 'curarAtacante', valor: 1 }, { tipo: 'zz', valor: 1 }] });
        expect(objeto.aoAcertar).toHaveLength(1);
    });
    it('limita a 6', () => {
        const aoAcertar = Array.from({ length: 9 }, () => ({ tipo: 'curarAtacante', valor: 1 }));
        expect(normalizarPoder({ nome: 'X', aoAcertar }).objeto.aoAcertar).toHaveLength(6);
    });
});

describe('prepararItemImportado - aoAcertar', () => {
    it('preserva aoAcertar valido da IA', () => {
        const r = prepararItemImportado({ nome: 'Golpe Vampirico', categoria: 'habilidade', aoAcertar: [{ tipo: 'energiaAtacante', modo: 'fixo', valor: 200, energia: 'chakra' }] });
        expect(r.objeto.aoAcertar).toEqual([{ tipo: 'energiaAtacante', modo: 'fixo', valor: 200, energia: 'chakra' }]);
    });
    it('descarta aoAcertar invalido sem quebrar o item', () => {
        const r = prepararItemImportado({ nome: 'Golpe', categoria: 'habilidade', aoAcertar: [{ tipo: 'curarAtacante', valor: 'abc' }, { tipo: 'xx', valor: 5 }] });
        expect('aoAcertar' in r.objeto).toBe(false);
        expect(r.objeto.nome).toBe('Golpe');
    });
    it('aoAcertar como texto/objeto solto e ignorado', () => {
        expect('aoAcertar' in prepararItemImportado({ nome: 'G', aoAcertar: 'cura 5%' }).objeto).toBe(false);
        expect('aoAcertar' in prepararItemImportado({ nome: 'G', aoAcertar: { tipo: 'curarAtacante', valor: 5 } }).objeto).toBe(false);
    });
});
