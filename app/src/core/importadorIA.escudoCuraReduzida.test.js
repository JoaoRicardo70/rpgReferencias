import { describe, it, expect } from 'vitest';
import { montarPromptImportacao, prepararItemImportado } from './importadorIA';
import { normalizarPoder } from './sextaFeiraCriacao';

describe('importador: escudoAoLigar', () => {
    it('o prompt descreve o campo', () => {
        expect(montarPromptImportacao('poder')).toContain('"escudoAoLigar"');
    });
    it('normalizarPoder grava o escudo valido (normalizado) e ignora o invalido com aviso', () => {
        const ok = normalizarPoder({ nome: 'Domo', escudoAoLigar: { nome: 'Domo Gelido', valor: '1600', tipo: 'escudo' } });
        expect(ok.objeto.escudoAoLigar).toEqual({ nome: 'Domo Gelido', valor: 1600, tipo: 'escudo' });
        expect(ok.avisos).toEqual([]);
        const ruim = normalizarPoder({ nome: 'Domo', escudoAoLigar: { nome: '', valor: 10 } });
        expect('escudoAoLigar' in ruim.objeto).toBe(false);
        expect(ruim.avisos.length).toBe(1);
        const tipoRuim = normalizarPoder({ nome: 'Domo', escudoAoLigar: { nome: 'X', valor: 10, tipo: 'qualquer' } });
        expect(tipoRuim.objeto.escudoAoLigar.tipo).toBe('escudo');
    });
    it('sem o campo nao cria a chave (retrocompativel)', () => {
        const { objeto, avisos } = normalizarPoder({ nome: 'Y' });
        expect('escudoAoLigar' in objeto).toBe(false);
        expect(avisos).toEqual([]);
    });
});

describe('importador: aoAcertar reduzirCuraAlvo', () => {
    it('os prompts mencionam o tipo, fator e duracao', () => {
        const p = montarPromptImportacao('poder');
        expect(p).toContain('reduzirCuraAlvo');
        expect(p).toContain('"fator"');
    });
    it('normalizarPoder aceita fator em fracao e limita a duracao', () => {
        const { objeto } = normalizarPoder({ nome: 'EA', aoAcertar: [{ tipo: 'reduzirCuraAlvo', fator: '1/2', duracao: 50 }] });
        expect(objeto.aoAcertar).toEqual([{ tipo: 'reduzirCuraAlvo', modo: 'fixo', valor: 0.5, fator: 0.5, duracao: 20 }]);
    });
    it('fator invalido e descartado e nao cria o campo', () => {
        const { objeto } = normalizarPoder({ nome: 'EA', aoAcertar: [{ tipo: 'reduzirCuraAlvo', fator: 3, duracao: 1 }] });
        expect('aoAcertar' in objeto).toBe(false);
    });
    it('prepararItemImportado preserva o efeito', () => {
        const item = prepararItemImportado({ nome: 'EA', categoria: 'habilidade', aoAcertar: [{ tipo: 'reduzirCuraAlvo', fator: 0.33, duracao: 2 }] }, 'poder');
        const poder = item && (item.objeto || item);
        expect(JSON.stringify(poder)).toContain('reduzirCuraAlvo');
    });
});
