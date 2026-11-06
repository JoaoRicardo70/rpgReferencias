import { describe, it, expect } from 'vitest';
import {
    montarPromptImportacao, prepararItemImportado, listarEfeitosIncertos, contarPendentes,
    decidirEfeitoIncerto, decidirTodosOsIncertos, montarPoderFinal, lerRespostaDaIA,
} from './importadorIA';

const ef = (atributo, valor, extra = {}) => ({ nome: 'E', atributo, propriedade: 'base', valor, ...extra });

const bruto = () => ({
    nome: 'Rinnegan', categoria: 'poder',
    efeitosIncertos: [ef('acerto', 10), ef('forca', 3)],
    subHabilidades: [
        { nome: 'Limbo', descricao: 'Cria ilusão', tipoAcao: 'bonus', usosMax: 2, usosPor: 'cena',
          efeitos: [ef('acerto', 5)], efeitosPassivos: [ef('forca', 1)], efeitosIncertos: [ef('evasiva', 2)], naoAplicado: ['nota sub'] },
        { nome: 'Izanagi', usosMax: 1, usosPor: 'descanso' },
        { descricao: 'sem nome' },
        null,
    ],
});

describe('montarPromptImportacao', () => {
    it('menciona efeitosIncertos e subHabilidades', () => {
        const p = montarPromptImportacao('texto qualquer');
        expect(p).toContain('efeitosIncertos');
        expect(p).toContain('subHabilidades');
        expect(p).toContain('texto qualquer');
    });
});

describe('prepararItemImportado - subHabilidades e incertos', () => {
    it('converte subs em formas com configs[0]', () => {
        const { objeto, valido } = prepararItemImportado(bruto());
        expect(valido).toBe(true);
        expect(objeto.formas).toHaveLength(2);
        const [limbo, izanagi] = objeto.formas;
        expect(limbo.nome).toBe('Limbo');
        expect(limbo.descricao).toContain('Cria ilusão');
        expect(limbo.descricao).toContain('Ação: bonus');
        expect(limbo.descricao).toContain('Usos: 2 por cena');
        expect(limbo.configs[0].efeitos).toHaveLength(1);
        expect(limbo.configs[0].efeitosPassivos).toHaveLength(1);
        expect(limbo.configs[0].efeitosIncertos).toEqual([expect.objectContaining({ atributo: 'evasiva', destino: '' })]);
        expect(limbo.efeitos).toEqual([]);
        expect(izanagi.descricao).toContain('Usos: 1 por descanso');
    });

    it('efeitosIncertos do pai ganham destino vazio', () => {
        const { objeto } = prepararItemImportado(bruto());
        expect(objeto.efeitosIncertos).toHaveLength(2);
        objeto.efeitosIncertos.forEach(e => expect(e.destino).toBe(''));
        expect(objeto.efeitos).toEqual([]);
    });

    it('sub sem nome ou nula e descartada', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', subHabilidades: [{ descricao: 'a' }, null, 'str', { nome: '  ' }] });
        expect(objeto.formas).toBeUndefined();
    });

    it('efeito invalido vai para naoAplicado da sub; multiplicador na sub vira pendente da sub', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', subHabilidades: [{ nome: 'S',
            efeitos: [{ atributo: 'dano', propriedade: 'mgeral', valor: 50 }, { atributo: 'inexistente', propriedade: 'base', valor: 1 }, ef('acerto', 'abc'), ef('acerto', '7')] }] });
        const sub = objeto.formas[0];
        expect(sub.configs[0].efeitos).toHaveLength(1);
        expect(sub.configs[0].efeitos[0].valor).toBe(7);
        expect(sub.naoAplicado.length).toBe(2);
        expect(sub.configs[0].efeitosIncertos).toEqual([expect.objectContaining({ multiplicador: true, atributo: 'poder_direto', propriedade: 'mgeral', valor: 50, destino: 'ativo' })]);
        expect(contarPendentes(objeto)).toBe(0);
    });

    it('listas nao-array e nulos nao quebram', () => {
        const r = prepararItemImportado({ nome: 'X', efeitosIncertos: 'oi', subHabilidades: { nome: 'a' } });
        expect(r.objeto.formas).toBeUndefined();
        expect(r.objeto.efeitosIncertos).toBeUndefined();
        const r2 = prepararItemImportado({ nome: 'X', subHabilidades: [{ nome: 'S', efeitos: null, efeitosPassivos: 5, efeitosIncertos: 'x', naoAplicado: null }] });
        expect(r2.objeto.formas[0].configs[0].efeitosIncertos).toEqual([]);
        expect(() => prepararItemImportado(null)).not.toThrow();
        expect(() => prepararItemImportado(undefined)).not.toThrow();
    });

    it('usosPor desconhecido cai em descanso; usosMax invalido omite Usos', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', subHabilidades: [{ nome: 'A', usosMax: 3, usosPor: 'xx' }, { nome: 'B', usosMax: 'abc', usosPor: 'cena' }] });
        expect(objeto.formas[0].descricao).toContain('Usos: 3 por descanso');
        expect(objeto.formas[1].descricao).not.toContain('Usos');
    });

    it('item sem subs/incertos nao ganha campos novos', () => {
        const { objeto } = prepararItemImportado({ nome: 'Simples' });
        expect(objeto.formas).toBeUndefined();
        expect(objeto.efeitosIncertos).toBeUndefined();
    });

    it('nao muta o bruto de entrada', () => {
        const b = bruto();
        const snap = JSON.parse(JSON.stringify(b));
        prepararItemImportado(b);
        expect(b).toEqual(snap);
    });
});

describe('helpers de incertos', () => {
    it('listarEfeitosIncertos lista pai e formas', () => {
        const { objeto } = prepararItemImportado(bruto());
        const l = listarEfeitosIncertos(objeto);
        expect(l.map(i => i.onde)).toEqual(['pai', 'pai', 0]);
        expect(l.map(i => i.indice)).toEqual([0, 1, 0]);
        expect(listarEfeitosIncertos(null)).toEqual([]);
        expect(listarEfeitosIncertos({})).toEqual([]);
    });

    it('contarPendentes', () => {
        const { objeto } = prepararItemImportado(bruto());
        expect(contarPendentes(objeto)).toBe(3);
        expect(contarPendentes(null)).toBe(0);
        expect(contarPendentes(decidirEfeitoIncerto(objeto, 'pai', 0, 'ativo'))).toBe(2);
    });

    it('decidirEfeitoIncerto e imutavel e funciona em pai e forma', () => {
        const { objeto } = prepararItemImportado(bruto());
        const snap = JSON.parse(JSON.stringify(objeto));
        const a = decidirEfeitoIncerto(objeto, 'pai', 1, 'passivo');
        const b = decidirEfeitoIncerto(a, 0, 0, 'ativo');
        expect(objeto).toEqual(snap);
        expect(a).not.toBe(objeto);
        expect(a.efeitosIncertos[1].destino).toBe('passivo');
        expect(b.formas[0].configs[0].efeitosIncertos[0].destino).toBe('ativo');
        expect(a.formas[0].configs[0].efeitosIncertos[0].destino).toBe('');
    });

    it('destino invalido vira vazio; indices inexistentes sao ignorados', () => {
        const { objeto } = prepararItemImportado(bruto());
        const a = decidirEfeitoIncerto(objeto, 'pai', 0, 'ativo');
        expect(decidirEfeitoIncerto(a, 'pai', 0, 'lixo').efeitosIncertos[0].destino).toBe('');
        expect(decidirEfeitoIncerto(a, 'pai', 0, '').efeitosIncertos[0].destino).toBe('');
        expect(() => decidirEfeitoIncerto(objeto, 'pai', 99, 'ativo')).not.toThrow();
        expect(() => decidirEfeitoIncerto(objeto, 7, 0, 'ativo')).not.toThrow();
        expect(() => decidirEfeitoIncerto({}, 'pai', 0, 'ativo')).not.toThrow();
        expect(() => decidirEfeitoIncerto(null, 'pai', 0, 'ativo')).not.toThrow();
    });

    it('decidirTodosOsIncertos decide tudo sem mutar', () => {
        const { objeto } = prepararItemImportado(bruto());
        const snap = JSON.parse(JSON.stringify(objeto));
        const t = decidirTodosOsIncertos(objeto, 'passivo');
        expect(objeto).toEqual(snap);
        expect(contarPendentes(t)).toBe(0);
        listarEfeitosIncertos(t).forEach(i => expect(i.efeito.destino).toBe('passivo'));
        expect(decidirTodosOsIncertos({ nome: 'a' }, 'ativo')).toEqual({ nome: 'a' });
    });
});

describe('montarPoderFinal', () => {
    it('move incertos conforme destino e limpa campos auxiliares', () => {
        let { objeto } = prepararItemImportado(bruto());
        objeto = decidirEfeitoIncerto(objeto, 'pai', 0, 'passivo');
        objeto = decidirEfeitoIncerto(objeto, 'pai', 1, 'ativo');
        objeto = decidirEfeitoIncerto(objeto, 0, 0, 'passivo');
        const snap = JSON.parse(JSON.stringify(objeto));
        const f = montarPoderFinal(objeto, 5);
        expect(objeto).toEqual(snap);
        expect(f.id).toBe(5);
        expect(f.efeitosIncertos).toBeUndefined();
        expect(f.naoAplicado).toBeUndefined();
        expect(f.efeitosPassivos.map(e => e.atributo)).toContain('acerto');
        expect(f.efeitos.map(e => e.atributo)).toContain('forca');
        [...f.efeitos, ...f.efeitosPassivos].forEach(e => expect('destino' in e).toBe(false));
        const forma = f.formas[0];
        expect(forma.naoAplicado).toBeUndefined();
        expect(forma.configs[0].efeitosIncertos).toBeUndefined();
        expect(forma.configs[0].efeitosPassivos.map(e => e.atributo)).toEqual(['forca', 'evasiva']);
        expect(forma.configs[0].efeitos.map(e => e.atributo)).toEqual(['acerto']);
        expect(forma.efeitos).toEqual([]);
        expect(forma.efeitosPassivos).toEqual([]);
    });

    it('sem decisao vale ativo', () => {
        const { objeto } = prepararItemImportado(bruto());
        const f = montarPoderFinal(objeto, 1);
        expect(f.efeitos.map(e => e.atributo)).toEqual(['acerto', 'forca']);
        expect(f.efeitosPassivos).toEqual([]);
        expect(f.formas[0].configs[0].efeitos.map(e => e.atributo)).toEqual(['acerto', 'evasiva']);
    });

    it('ids unicos: forma = id*100+i*2+1, config = forma+1', () => {
        const { objeto } = prepararItemImportado(bruto());
        const f = montarPoderFinal(objeto, 7);
        expect(f.formas.map(x => x.id)).toEqual([701, 703]);
        expect(f.formas.map(x => x.configs[0].id)).toEqual([702, 704]);
    });

    it('id nao numerico gera ids string', () => {
        const { objeto } = prepararItemImportado(bruto());
        const f = montarPoderFinal(objeto, 'abc');
        expect(f.formas.map(x => x.id)).toEqual(['abc_f1', 'abc_f2']);
        expect(f.formas.map(x => x.configs[0].id)).toEqual(['abc_f1_m1', 'abc_f2_m1']);
    });

    it('objeto sem formas/incertos e nulo funcionam', () => {
        const f = montarPoderFinal({ nome: 'A', efeitos: [ef('acerto', 1)] }, 3);
        expect(f).toEqual({ nome: 'A', efeitos: [expect.objectContaining({ valor: 1 })], id: 3 });
        expect(montarPoderFinal(null, 2)).toEqual({ id: 2 });
    });
});

describe('JSON mal formado', () => {
    it('lerRespostaDaIA nao explode com texto invalido', () => {
        expect(() => lerRespostaDaIA('{"poderes": [ {nome: ')).not.toThrow();
        expect(() => lerRespostaDaIA('')).not.toThrow();
        expect(() => lerRespostaDaIA(null)).not.toThrow();
    });
});
