import { describe, it, expect } from 'vitest';
import { imuneAoEstado, resisteAoEstado, normalizarEscopo } from './efeitosCondicionais';
import { resolverEstadosNoAlvo } from './estadosGolpe';
import { escalarPorFator } from './estagios';
import { ATRIBUTOS_EFEITO, normalizarPoder } from './sextaFeiraCriacao';
import { prepararItemImportado, montarPromptImportacao } from './importadorIA';
import { ATRIBUTOS_AGRUPADOS, ATRIBUTOS_AGRUPADOS_SEM_ESTADO, ATRIBUTOS_AGRUPADOS_ITEM_SEM_ESTADO } from './efeitos-constants';
import { ESTADOS } from './condicoes';

const ef = (atributo, escopo, extra = {}) => ({ nome: 'E', atributo, propriedade: 'base', valor: 1, ...(escopo !== undefined ? { escopo } : {}), ...extra });

describe('imune_estado: fontes do efeito', () => {
    it('poder ATIVO (efeitos) so vale ligado; efeitosPassivos valem sempre', () => {
        const ligado = { poderes: [{ id: 1, ativa: true, efeitos: [ef('imune_estado', 'queimado')] }] };
        const desligado = { poderes: [{ id: 1, ativa: false, efeitos: [ef('imune_estado', 'queimado')] }] };
        const passivo = { poderes: [{ id: 1, ativa: false, efeitosPassivos: [ef('imune_estado', 'queimado')] }] };
        expect(imuneAoEstado(ligado, 'queimado')).toBe(true);
        expect(imuneAoEstado(desligado, 'queimado')).toBe(false);
        expect(imuneAoEstado(passivo, 'queimado')).toBe(true);
    });
    it('passiva da ficha', () => {
        expect(imuneAoEstado({ passivas: [{ id: 1, efeitos: [ef('imune_estado', 'lento')] }] }, 'lento')).toBe(true);
    });
    it('item EQUIPADO protege; item no inventario nao', () => {
        const mk = (equipado) => ({ inventario: [{ id: 'i', nome: 'Amuleto', equipado, efeitosPassivos: [ef('imune_estado', 'envenenado')] }] });
        expect(imuneAoEstado(mk(true), 'envenenado')).toBe(true);
        expect(imuneAoEstado(mk(false), 'envenenado')).toBe(false);
    });
    it('forma ativa do poder carrega a imunidade; sem forma ativa nao', () => {
        const poder = (formaAtivaId) => ({ poderes: [{ id: 1, ativa: true, efeitos: [], formaAtivaId, formas: [{ id: 'f1', nome: 'Forma', efeitos: [ef('imune_estado', 'todos')], efeitosPassivos: [] }] }] });
        expect(imuneAoEstado(poder('f1'), 'queimado')).toBe(true);
        expect(imuneAoEstado(poder(null), 'queimado')).toBe(false);
    });
    it('propriedade diferente de base, valor negativo ou vazio nao protegem', () => {
        const f = (e) => ({ passivas: [{ id: 1, efeitos: [e] }] });
        expect(imuneAoEstado(f(ef('imune_estado', 'lento', { propriedade: 'mgeral' })), 'lento')).toBe(false);
        expect(imuneAoEstado(f(ef('imune_estado', 'lento', { valor: -1 })), 'lento')).toBe(false);
        expect(imuneAoEstado(f(ef('imune_estado', 'lento', { valor: '' })), 'lento')).toBe(false);
        expect(imuneAoEstado(f(ef('imune_estado', 'lento', { valor: '1' })), 'lento')).toBe(true);
    });
    it('escopo com maiusculas/espacos ainda casa; escopo invalido ou ausente nao bloqueia nada', () => {
        const f = (esc) => ({ passivas: [{ id: 1, efeitos: [ef('imune_estado', esc)] }] });
        expect(imuneAoEstado(f(' Queimado '), 'queimado')).toBe(true);
        ESTADOS.forEach(s => expect(imuneAoEstado(f('inexistente'), s.id)).toBe(false));
        expect(imuneAoEstado(f(undefined), 'queimado')).toBe(false);
        expect(imuneAoEstado(f(null), 'queimado')).toBe(false);
    });
    it('condicao "quando" nao satisfeita desliga a imunidade (fora de combate)', () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('imune_estado', 'lento', { quando: 'em_combate' })] }] };
        expect(imuneAoEstado(f, 'lento')).toBe(false);
    });
    it('imune_estado e imune_surpresa coexistem', () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('imune_surpresa'), ef('imune_estado', 'lento')] }] };
        expect(imuneAoEstado(f, 'surpreso')).toBe(true);
        expect(imuneAoEstado(f, 'lento')).toBe(true);
        expect(imuneAoEstado(f, 'queimado')).toBe(false);
    });
    it("'todos' cobre cada estado de ESTADOS", () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('imune_estado', 'todos')] }] };
        ESTADOS.forEach(s => expect(imuneAoEstado(f, s.id)).toBe(true));
    });
    it('imune_estado nao implica resiste_estado; ficha nula/vazia nao resiste', () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('imune_estado', 'lento')] }] };
        expect(resisteAoEstado(f, 'lento')).toBe(false);
        expect(resisteAoEstado(null, 'lento')).toBe(false);
        expect(resisteAoEstado({}, 'lento')).toBe(false);
    });
});

describe('resiste_estado e resolverEstadosNoAlvo', () => {
    const teste = { atributo: 'forca', cd: 15 };
    it("'todos' da vantagem em qualquer estado", () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('resiste_estado', 'todos')] }] };
        ESTADOS.slice(0, 4).forEach(s => expect(resisteAoEstado(f, s.id)).toBe(true));
    });
    it('vantagem rola dois d20 (rolar chamado 2x); sem vantagem rola 1x', () => {
        let n = 0;
        const com = { passivas: [{ id: 1, efeitos: [ef('resiste_estado', 'lento')] }] };
        resolverEstadosNoAlvo([{ id: 'lento', stacks: 1, teste }], com, { rolar: () => { n++; return 1; } });
        expect(n).toBe(2);
        n = 0;
        resolverEstadosNoAlvo([{ id: 'lento', stacks: 1, teste }], {}, { rolar: () => { n++; return 1; } });
        expect(n).toBe(1);
    });
    it('vantagem nao muda o resultado quando os dois dados falham', () => {
        const com = { passivas: [{ id: 1, efeitos: [ef('resiste_estado', 'lento')] }] };
        const r = resolverEstadosNoAlvo([{ id: 'lento', stacks: 2, teste }], com, { rolar: () => 2 });
        expect(r.aplicados.map(a => a.id)).toEqual(['lento']);
        expect(r.resistidos).toHaveLength(0);
    });
    it('estado sem teste ignora resiste_estado e e aplicado', () => {
        const com = { passivas: [{ id: 1, efeitos: [ef('resiste_estado', 'lento')] }] };
        expect(resolverEstadosNoAlvo([{ id: 'lento', stacks: 1 }], com).aplicados).toHaveLength(1);
    });
    it('imune_estado vence o teste: nem rola dado', () => {
        let n = 0;
        const f = { passivas: [{ id: 1, efeitos: [ef('imune_estado', 'lento')] }] };
        const r = resolverEstadosNoAlvo([{ id: 'lento', stacks: 1, teste }], f, { rolar: () => { n++; return 1; } });
        expect(n).toBe(0);
        expect(r.imunes).toHaveLength(1);
        expect(r.aplicados).toHaveLength(0);
    });
    it("imune_estado 'todos' bloqueia todos os estados do golpe; sem imunes o campo nao existe", () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('imune_estado', 'todos')] }] };
        const r = resolverEstadosNoAlvo([{ id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 1 }], f);
        expect(r.aplicados).toEqual([]);
        expect(r.imunes).toHaveLength(2);
        expect(resolverEstadosNoAlvo([{ id: 'lento', stacks: 1 }], {}).imunes).toBeUndefined();
    });
    it('efeito sem escopo nao bloqueia nada num golpe', () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('imune_estado')] }] };
        expect(resolverEstadosNoAlvo([{ id: 'lento', stacks: 1 }], f).aplicados).toHaveLength(1);
    });
});

describe('registro e normalizacao', () => {
    it('os dois atributos estao no mesmo grupo e em ATRIBUTOS_EFEITO', () => {
        const g = ATRIBUTOS_AGRUPADOS.find(x => x.options.includes('imune_estado'));
        expect(g.options).toEqual(expect.arrayContaining(['imune_estado', 'resiste_estado']));
        expect(ATRIBUTOS_EFEITO).toEqual(expect.arrayContaining(['imune_estado', 'resiste_estado', 'imune_surpresa']));
    });
    it('listas SEM_ESTADO (Pactos, Itens, Formas, Combos) nao oferecem os atributos de estado, mas mantem os demais', () => {
        const planos = (l) => l.flatMap(g => g.options);
        expect(planos(ATRIBUTOS_AGRUPADOS_SEM_ESTADO)).not.toContain('imune_estado');
        expect(planos(ATRIBUTOS_AGRUPADOS_SEM_ESTADO)).not.toContain('resiste_estado');
        expect(planos(ATRIBUTOS_AGRUPADOS_ITEM_SEM_ESTADO)).not.toContain('resiste_estado');
        expect(planos(ATRIBUTOS_AGRUPADOS_ITEM_SEM_ESTADO)).toContain('poder_direto');
        expect(planos(ATRIBUTOS_AGRUPADOS_SEM_ESTADO)).toContain('imune_surpresa');
        expect(ATRIBUTOS_AGRUPADOS_SEM_ESTADO.length).toBe(ATRIBUTOS_AGRUPADOS.length - 1);
    });
    it('estagios: imune_estado/resiste_estado nao escalam com o fator', () => {
        const r = escalarPorFator([ef('imune_estado', 'lento'), ef('resiste_estado', 'lento'), { atributo: 'forca', propriedade: 'base', valor: 10 }], 2);
        expect(r[0].valor).toBe(1);
        expect(r[1].valor).toBe(1);
        expect(r[2].valor).toBe(20);
    });
    it('normalizarEscopo de estado aceita acento/caixa e rejeita lixo e tipos estranhos', () => {
        expect(normalizarEscopo(' VULNERÁVEL ', 'imune_estado')).toBe('vulneravel');
        expect(normalizarEscopo('lento', 'resiste_estado')).toBe('lento');
        [null, undefined, 0, {}, 'teste:percepcao', 'ataque', 'todos os estados'].forEach(v => expect(normalizarEscopo(v, 'imune_estado')).toBeNull());
    });
    it('normalizarEscopo de outros atributos nao aceita id de estado nem "todos"', () => {
        expect(normalizarEscopo('todos', 'vantagem')).toBeNull();
        expect(normalizarEscopo('queimado', 'vantagem')).toBeNull();
        expect(normalizarEscopo('ataque', 'vantagem')).toBe('ataque');
    });
    it('normalizarPoder mantem escopo de estado valido e descarta efeito com escopo invalido ou ausente', () => {
        const r = normalizarPoder({ nome: 'P', efeitos: [
            { nome: 'ok', atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo: 'Queimado' },
            { nome: 'todos', atributo: 'resiste_estado', propriedade: 'base', valor: 1, escopo: 'todos' },
            { nome: 'ruim', atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo: 'xyz' },
            { nome: 'sem', atributo: 'imune_estado', propriedade: 'base', valor: 1 },
        ] });
        const efs = r.objeto.efeitos;
        expect(efs.map(e => e.nome)).toEqual(['ok', 'todos']);
        expect(efs[0].escopo).toBe('queimado');
        expect(efs[1].escopo).toBe('todos');
        expect(r.avisos.join(' ')).toMatch(/precisa do escopo/);
        expect(r.avisos.filter(a => /descartado/.test(a))).toHaveLength(2);
    });
    it('imune_estado aceita "quando" (ATRIBUTOS_COM_QUANDO)', () => {
        const r = normalizarPoder({ nome: 'P', efeitos: [{ nome: 'c', atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo: 'lento', quando: 'em_combate' }] });
        expect(r.objeto.efeitos[0]).toMatchObject({ quando: 'em_combate', escopo: 'lento' });
    });
});

describe('importador: imune_estado', () => {
    it('o prompt lista os atributos novos e os ids dos estados', () => {
        const p = montarPromptImportacao('texto');
        expect(p).toContain('imune_estado');
        expect(p).toContain('resiste_estado');
        ESTADOS.forEach(s => expect(p).toContain(s.id));
    });
    it('efeito valido entra com escopo; imune_surpresa antigo segue funcionando', () => {
        const r = prepararItemImportado({ nome: 'Pele', efeitos: [
            { atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo: 'queimado' },
            { atributo: 'imune_surpresa', propriedade: 'base', valor: 1 },
        ] });
        expect(r.objeto.efeitos.map(e => e.atributo)).toEqual(['imune_estado', 'imune_surpresa']);
        expect(r.objeto.efeitos[0].escopo).toBe('queimado');
    });
    it('condicao inexistente: o efeito nao entra e o motivo aparece no resultado', () => {
        const r = prepararItemImportado({ nome: 'Pele', efeitos: [{ atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo: 'amaldicoado' }] });
        expect(r.objeto.efeitos).toHaveLength(0);
        expect(r.avisos.join(' ')).toMatch(/amaldicoado/);
    });
    it('sem valor numerico cai em naoAplicado', () => {
        const r = prepararItemImportado({ nome: 'Pele', efeitos: [{ atributo: 'imune_estado', propriedade: 'base', valor: 'sim', escopo: 'lento' }] });
        expect(r.objeto.efeitos).toHaveLength(0);
        expect(r.naoAplicado.join(' ')).toMatch(/sem valor numérico/);
    });
    it('atributo inventado (imune_condicao) cai em naoAplicado', () => {
        const r = prepararItemImportado({ nome: 'Pele', efeitos: [{ atributo: 'imune_condicao', propriedade: 'base', valor: 1, escopo: 'lento' }] });
        expect(r.objeto.efeitos).toHaveLength(0);
        expect(r.naoAplicado.join(' ')).toMatch(/imune_condicao/);
    });
});
