import { describe, it, expect } from 'vitest';
import { imuneAoEstado, resisteAoEstado, normalizarEscopo, ATRIBUTOS_COM_ESCOPO_ESTADO, ATRIBUTOS_COM_QUANDO } from './efeitosCondicionais';
import { resolverEstadosNoAlvo } from './estadosGolpe';
import { ATRIBUTOS_EFEITO } from './sextaFeiraCriacao';
import { getPropriedadesDoAtributo } from './efeitos-constants';

const comEfeito = (efeito, ativa = true) => ({ poderes: [{ id: 'p', nome: 'Poder', ativa, efeitos: [{ propriedade: 'base', valor: 1, ...efeito }] }] });

describe('imune_estado', () => {
    it('bloqueia o estado do escopo e só ele', () => {
        const f = comEfeito({ atributo: 'imune_estado', escopo: 'queimado' });
        expect(imuneAoEstado(f, 'queimado')).toBe(true);
        expect(imuneAoEstado(f, 'lento')).toBe(false);
        expect(imuneAoEstado(f, 'surpreso')).toBe(false);
    });
    it("'todos' bloqueia qualquer estado", () => {
        const f = comEfeito({ atributo: 'imune_estado', escopo: 'todos' });
        ['queimado', 'lento', 'surpreso', 'cegosurdo'].forEach(id => expect(imuneAoEstado(f, id)).toBe(true));
    });
    it('sem escopo, valor 0 ou poder desligado não protege', () => {
        expect(imuneAoEstado(comEfeito({ atributo: 'imune_estado' }), 'queimado')).toBe(false);
        expect(imuneAoEstado(comEfeito({ atributo: 'imune_estado', escopo: 'queimado', valor: 0 }), 'queimado')).toBe(false);
        expect(imuneAoEstado(comEfeito({ atributo: 'imune_estado', escopo: 'queimado' }, false), 'queimado')).toBe(false);
    });
    it('sem o efeito nada muda; ficha nula nunca é imune', () => {
        expect(imuneAoEstado({}, 'queimado')).toBe(false);
        expect(imuneAoEstado(null, 'queimado')).toBe(false);
    });
    it('imune_surpresa continua funcionando', () => {
        const f = comEfeito({ atributo: 'imune_surpresa' });
        expect(imuneAoEstado(f, 'surpreso')).toBe(true);
        expect(imuneAoEstado(f, 'queimado')).toBe(false);
    });
    it('golpe não aplica o estado e avisa que o alvo é imune', () => {
        const f = comEfeito({ atributo: 'imune_estado', escopo: 'queimado' });
        const r = resolverEstadosNoAlvo([{ id: 'queimado', stacks: 2 }, { id: 'lento', stacks: 1 }], f);
        expect(r.aplicados.map(a => a.id)).toEqual(['lento']);
        expect(r.imunes.map(i => i.id)).toEqual(['queimado']);
    });
    it('Dummie (sem ficha) recebe normalmente', () => {
        expect(resolverEstadosNoAlvo([{ id: 'queimado', stacks: 1 }], null).aplicados).toHaveLength(1);
    });
});

describe('resiste_estado', () => {
    it('vantagem no teste de resistência só contra o estado do escopo', () => {
        const f = comEfeito({ atributo: 'resiste_estado', escopo: 'lento' });
        expect(resisteAoEstado(f, 'lento')).toBe(true);
        expect(resisteAoEstado(f, 'queimado')).toBe(false);
        const e = { id: 'lento', stacks: 1, teste: { atributo: 'forca', cd: 15 } };
        const seq = [3, 18];
        let i = 0;
        const r = resolverEstadosNoAlvo([e], f, { rolar: () => seq[i++ % 2] });
        expect(r.resistidos).toHaveLength(1);
        i = 0;
        const g = resolverEstadosNoAlvo([{ ...e, id: 'queimado' }], f, { rolar: () => seq[i++ % 2] });
        expect(g.resistidos).toHaveLength(0);
    });
});

describe('registro do atributo', () => {
    it('importador/ATRIBUTOS_EFEITO reconhecem e só aceitam base', () => {
        expect(ATRIBUTOS_EFEITO).toContain('imune_estado');
        expect(ATRIBUTOS_EFEITO).toContain('resiste_estado');
        expect(getPropriedadesDoAtributo('imune_estado')).toEqual(['base']);
        expect(ATRIBUTOS_COM_QUANDO).toContain('imune_estado');
    });
    it('normalizarEscopo de estado: id válido, todos ou inválido (null)', () => {
        expect(ATRIBUTOS_COM_ESCOPO_ESTADO).toContain('imune_estado');
        expect(normalizarEscopo('Queimado', 'imune_estado')).toBe('queimado');
        expect(normalizarEscopo('TODOS', 'imune_estado')).toBe('todos');
        expect(normalizarEscopo('inexistente', 'imune_estado')).toBeNull();
        expect(normalizarEscopo('', 'imune_estado')).toBeNull();
        expect(normalizarEscopo('ataque')).toBe('ataque');
        expect(normalizarEscopo('queimado')).toBeNull();
    });
});

describe('editores sem campo de escopo', () => {
    it('as listas SEM_ESTADO não oferecem imune_estado/resiste_estado', async () => {
        const c = await import('./efeitos-constants');
        [c.ATRIBUTOS_AGRUPADOS_SEM_ESTADO, c.ATRIBUTOS_AGRUPADOS_ITEM_SEM_ESTADO].forEach((lista) => {
            const todos = lista.flatMap(g => g.options);
            expect(todos).not.toContain('imune_estado');
            expect(todos).not.toContain('resiste_estado');
        });
        expect(c.ATRIBUTOS_AGRUPADOS.flatMap(g => g.options)).toContain('imune_estado');
        expect(c.ATRIBUTOS_AGRUPADOS_ITEM_SEM_ESTADO.flatMap(g => g.options)).toContain('poder_direto');
    });
});
