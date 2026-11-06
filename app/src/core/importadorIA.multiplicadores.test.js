import { describe, it, expect } from 'vitest';
import {
    prepararItemImportado, contarPendentes, faltaResponder, decidirEfeitoIncerto, decidirTodosOsIncertos,
    definirTipoMultiplicador, montarPoderFinal, listarEfeitosIncertos, TIPOS_MULTIPLICADOR, ehTipoMultiplicador,
    montarPromptImportacao,
} from './importadorIA';

const prep = (bruto) => prepararItemImportado({ nome: 'Poder', ...bruto });
const mult = (extra = {}) => ({ nome: 'Rinnegan', atributo: 'dano', valor: 800, ...extra });

describe('multiplicadores - exports', () => {
    it('TIPOS_MULTIPLICADOR lista os 5 tipos e ehTipoMultiplicador valida', () => {
        expect(TIPOS_MULTIPLICADOR.map(t => t.id)).toEqual(['mbase', 'mgeral', 'mformas', 'mabs', 'munico']);
        TIPOS_MULTIPLICADOR.forEach(t => expect(ehTipoMultiplicador(t.id)).toBe(true));
        ['', 'base', 'geral', null, undefined, 5].forEach(v => expect(ehTipoMultiplicador(v)).toBe(false));
    });
});

describe('multiplicadores - conversao da IA em pendentes', () => {
    it('campo multiplicadores vira pendente com destino vazio, tipo vazio e dano -> poder_direto', () => {
        const { objeto, naoAplicado } = prep({ multiplicadores: [mult()] });
        expect(naoAplicado).toEqual([]);
        expect(objeto.efeitosIncertos).toEqual([{ nome: 'Rinnegan', atributo: 'poder_direto', propriedade: '', valor: 800, destino: '', multiplicador: true }]);
        expect(objeto.efeitos).toEqual([]);
    });

    it('dano, poder, poder_direto normalizam para poder_direto; outro atributo valido fica', () => {
        const { objeto } = prep({ multiplicadores: [mult({ atributo: 'dano' }), mult({ atributo: 'Poder' }), mult({ atributo: 'poder_direto' }), mult({ atributo: 'forca' })] });
        expect(objeto.efeitosIncertos.map(e => e.atributo)).toEqual(['poder_direto', 'poder_direto', 'poder_direto', 'forca']);
    });

    it('atributo omitido assume poder_direto', () => {
        const { objeto } = prep({ multiplicadores: [{ valor: 3 }] });
        expect(objeto.efeitosIncertos[0]).toMatchObject({ atributo: 'poder_direto', valor: 3, nome: '' });
    });

    it('tipo sugerido pela IA e reconhecido (nomes e ids)', () => {
        const tipos = ['base', 'geral', 'formas', 'forma', 'absoluto', 'unico', 'mgeral', 'munico', 'GERAL'];
        const { objeto } = prep({ multiplicadores: tipos.map(tipo => mult({ tipo })) });
        expect(objeto.efeitosIncertos.map(e => e.propriedade)).toEqual(['mbase', 'mgeral', 'mformas', 'mformas', 'mabs', 'munico', 'mgeral', 'munico', 'mgeral']);
    });

    it('tipo desconhecido ou ausente fica vazio', () => {
        const { objeto } = prep({ multiplicadores: [mult({ tipo: 'xyz' }), mult()] });
        expect(objeto.efeitosIncertos.map(e => e.propriedade)).toEqual(['', '']);
    });

    it('valor com virgula decimal e string numerica sao aceitos', () => {
        const { objeto } = prep({ multiplicadores: [mult({ valor: '2,5' }), mult({ valor: '40' })] });
        expect(objeto.efeitosIncertos.map(e => e.valor)).toEqual([2.5, 40]);
    });

    it.each([[0], [-3], ['abc'], [null], [undefined], ['x40'], [NaN], [Infinity]])('valor invalido %s vai para naoAplicado', (valor) => {
        const { objeto, naoAplicado } = prep({ multiplicadores: [mult({ valor })] });
        expect(objeto.efeitosIncertos).toBeUndefined();
        expect(naoAplicado).toHaveLength(1);
        expect(naoAplicado[0]).toMatch(/Multiplicador não importado/);
    });

    it('atributo inexistente vai para naoAplicado', () => {
        const { objeto, naoAplicado } = prep({ multiplicadores: [mult({ atributo: 'velocidade_da_luz' })] });
        expect(objeto.efeitosIncertos).toBeUndefined();
        expect(naoAplicado[0]).toMatch(/velocidade_da_luz/);
    });

    it('itens nulos, nao-objeto e multiplicadores nao-array nao quebram', () => {
        expect(() => prep({ multiplicadores: [null, 5, 'x', mult()] })).not.toThrow();
        expect(prep({ multiplicadores: [null, 5, 'x', mult()] }).objeto.efeitosIncertos).toHaveLength(1);
        expect(prep({ multiplicadores: 'oi' }).objeto.efeitosIncertos).toBeUndefined();
        expect(prep({ multiplicadores: null }).objeto.efeitosIncertos).toBeUndefined();
    });

    it('multiplicador em efeitos entra como pendente com destino ativo', () => {
        const { objeto, naoAplicado } = prep({ efeitos: [{ nome: 'M', atributo: 'dano', propriedade: 'mgeral', valor: 40 }, { atributo: 'acerto', propriedade: 'base', valor: 5 }] });
        expect(naoAplicado).toEqual([]);
        expect(objeto.efeitos).toHaveLength(1);
        expect(objeto.efeitosIncertos).toEqual([expect.objectContaining({ multiplicador: true, atributo: 'poder_direto', propriedade: 'mgeral', valor: 40, destino: 'ativo' })]);
    });

    it('multiplicador em efeitosPassivos entra com destino passivo; em efeitosIncertos com destino vazio', () => {
        const { objeto } = prep({
            efeitosPassivos: [{ atributo: 'forca', propriedade: 'mbase', valor: 10 }],
            efeitosIncertos: [{ atributo: 'forca', propriedade: 'mabs', valor: 7 }, { atributo: 'acerto', propriedade: 'base', valor: 2 }],
        });
        const mults = objeto.efeitosIncertos.filter(e => e.multiplicador);
        expect(mults.map(e => e.destino).sort()).toEqual(['', 'passivo']);
        expect(objeto.efeitosPassivos).toEqual([]);
        expect(objeto.efeitosIncertos.filter(e => !e.multiplicador)).toEqual([expect.objectContaining({ atributo: 'acerto', destino: '' })]);
    });

    it('multiplicador via efeitos com valor invalido ou atributo inexistente vai para naoAplicado', () => {
        const { objeto, naoAplicado } = prep({ efeitos: [{ atributo: 'dano', propriedade: 'mgeral', valor: 0 }, { atributo: 'zzz', propriedade: 'mbase', valor: 5 }] });
        expect(objeto.efeitosIncertos).toBeUndefined();
        expect(naoAplicado).toHaveLength(2);
    });

    it('sub-habilidade: multiplicadores e efeitosIncertos com multiplicador entram nos incertos da sub', () => {
        const { objeto } = prep({ subHabilidades: [{ nome: 'Limbo', multiplicadores: [mult({ tipo: 'geral' })], efeitosIncertos: [{ atributo: 'dano', propriedade: 'mbase', valor: 5 }] }] });
        const inc = objeto.formas[0].configs[0].efeitosIncertos;
        expect(inc).toHaveLength(2);
        expect(inc[0]).toMatchObject({ multiplicador: true, propriedade: 'mgeral', destino: '' });
        expect(inc[1]).toMatchObject({ multiplicador: true, propriedade: 'mbase', destino: '' });
        expect(contarPendentes(objeto)).toBe(2);
    });

    it('sub-habilidade: multiplicador invalido vai para naoAplicado da sub', () => {
        const { objeto } = prep({ subHabilidades: [{ nome: 'Limbo', multiplicadores: [mult({ valor: -1 })] }] });
        expect(objeto.formas[0].naoAplicado).toHaveLength(1);
        expect(objeto.formas[0].configs[0].efeitosIncertos).toEqual([]);
    });
});

describe('multiplicadores - pendencias', () => {
    const efeito = (o) => ({ multiplicador: true, atributo: 'poder_direto', valor: 5, nome: '', ...o });

    it('faltaResponder: destino ausente falta', () => {
        expect(faltaResponder(efeito({ propriedade: 'mgeral', destino: '' }))).toBe(true);
        expect(faltaResponder(efeito({ propriedade: 'mgeral' }))).toBe(true);
        expect(faltaResponder(null)).toBe(true);
    });
    it('faltaResponder: multiplicador com destino mas sem tipo valido falta', () => {
        expect(faltaResponder(efeito({ propriedade: '', destino: 'ativo' }))).toBe(true);
        expect(faltaResponder(efeito({ propriedade: 'base', destino: 'passivo' }))).toBe(true);
    });
    it('faltaResponder: destino + tipo valido = respondido', () => {
        expect(faltaResponder(efeito({ propriedade: 'mformas', destino: 'ativo' }))).toBe(false);
        expect(faltaResponder(efeito({ propriedade: 'munico', destino: 'passivo' }))).toBe(false);
    });
    it('faltaResponder: efeito comum so precisa de destino', () => {
        expect(faltaResponder({ atributo: 'acerto', propriedade: 'base', valor: 1, destino: 'ativo' })).toBe(false);
        expect(faltaResponder({ atributo: 'acerto', propriedade: 'base', valor: 1, destino: '' })).toBe(true);
    });

    it('contarPendentes: multiplicador com destino mas sem tipo pende; com tipo nao', () => {
        const { objeto } = prep({ efeitos: [{ atributo: 'dano', propriedade: 'mgeral', valor: 40 }], multiplicadores: [mult()] });
        // o de efeitos ja tem destino e tipo; o do campo multiplicadores nao tem nada
        expect(contarPendentes(objeto)).toBe(1);
        const r = decidirTodosOsIncertos(objeto, 'ativo');
        expect(contarPendentes(r)).toBe(1); // falta o tipo
        const idx = listarEfeitosIncertos(r).find(i => i.efeito.propriedade === '').indice;
        expect(contarPendentes(definirTipoMultiplicador(r, 'pai', idx, 'mbase'))).toBe(0);
    });

    it('definirTipoMultiplicador e imutavel e grava o tipo; tipo invalido limpa', () => {
        const { objeto } = prep({ multiplicadores: [mult()] });
        const novo = definirTipoMultiplicador(objeto, 'pai', 0, 'mabs');
        expect(novo).not.toBe(objeto);
        expect(objeto.efeitosIncertos[0].propriedade).toBe('');
        expect(novo.efeitosIncertos[0].propriedade).toBe('mabs');
        expect(definirTipoMultiplicador(novo, 'pai', 0, 'lixo').efeitosIncertos[0].propriedade).toBe('');
        expect(definirTipoMultiplicador(novo, 'pai', 0, undefined).efeitosIncertos[0].propriedade).toBe('');
    });

    it('definirTipoMultiplicador ignora efeito comum, indices e formas inexistentes', () => {
        const { objeto } = prep({ efeitosIncertos: [{ atributo: 'acerto', propriedade: 'base', valor: 3 }] });
        expect(definirTipoMultiplicador(objeto, 'pai', 0, 'mgeral').efeitosIncertos[0].propriedade).toBe('base');
        expect(() => definirTipoMultiplicador(objeto, 'pai', 9, 'mgeral')).not.toThrow();
        expect(() => definirTipoMultiplicador(objeto, 3, 0, 'mgeral')).not.toThrow();
        expect(() => definirTipoMultiplicador(null, 'pai', 0, 'mgeral')).not.toThrow();
    });

    it('definirTipoMultiplicador funciona na sub-habilidade', () => {
        const { objeto } = prep({ subHabilidades: [{ nome: 'S', multiplicadores: [mult()] }] });
        const novo = definirTipoMultiplicador(objeto, 0, 0, 'mformas');
        expect(novo.formas[0].configs[0].efeitosIncertos[0].propriedade).toBe('mformas');
        expect(objeto.formas[0].configs[0].efeitosIncertos[0].propriedade).toBe('');
        expect(listarEfeitosIncertos(novo)[0]).toMatchObject({ onde: 0, indice: 0 });
    });

    it('decidirEfeitoIncerto no multiplicador nao mexe no tipo', () => {
        const { objeto } = prep({ multiplicadores: [mult({ tipo: 'geral' })] });
        const r = decidirEfeitoIncerto(objeto, 'pai', 0, 'passivo');
        expect(r.efeitosIncertos[0]).toMatchObject({ destino: 'passivo', propriedade: 'mgeral' });
        expect(contarPendentes(r)).toBe(0);
    });
});

describe('multiplicadores - montarPoderFinal', () => {
    const final = (bruto, destino = 'ativo', tipo) => {
        let { objeto } = prep(bruto);
        objeto = decidirTodosOsIncertos(objeto, destino);
        if (tipo) objeto = definirTipoMultiplicador(objeto, 'pai', 0, tipo);
        return montarPoderFinal(objeto, 7);
    };

    it.each([['mbase'], ['mgeral'], ['mformas'], ['mabs']])('aditivo %s: x800 grava 799', (tipo) => {
        const f = final({ multiplicadores: [mult()] }, 'ativo', tipo);
        expect(f.efeitos).toEqual([{ nome: 'Rinnegan', atributo: 'poder_direto', propriedade: tipo, valor: 799 }]);
        expect(f).not.toHaveProperty('efeitosIncertos');
    });

    it('munico grava N sem subtrair', () => {
        const f = final({ multiplicadores: [mult()] }, 'ativo', 'munico');
        expect(f.efeitos[0]).toMatchObject({ propriedade: 'munico', valor: 800 });
    });

    it('munico com N=1 e aplicado (fator puro)', () => {
        const f = final({ multiplicadores: [mult({ valor: 1 })] }, 'ativo', 'munico');
        expect(f.efeitos[0]).toMatchObject({ propriedade: 'munico', valor: 1 });
    });

    it.each([[1], [0.5]])('aditivo com N=%s nao e aplicado e gera nota', (valor) => {
        const f = final({ multiplicadores: [mult({ valor })] }, 'ativo', 'mgeral');
        expect(f.efeitos).toEqual([]);
        expect(f.notasIA).toMatch(/não muda nada/);
    });

    it('decimal: x2.5 aditivo grava 1.5', () => {
        const f = final({ multiplicadores: [mult({ valor: 2.5 })] }, 'ativo', 'mbase');
        expect(f.efeitos[0].valor).toBeCloseTo(1.5);
    });

    it('destino passivo vai para efeitosPassivos; ativo para efeitos; flags removidas', () => {
        const p = final({ multiplicadores: [mult({ tipo: 'geral' })] }, 'passivo');
        expect(p.efeitosPassivos).toEqual([{ nome: 'Rinnegan', atributo: 'poder_direto', propriedade: 'mgeral', valor: 799 }]);
        expect(p.efeitos).toEqual([]);
        const a = final({ multiplicadores: [mult({ tipo: 'geral' })] }, 'ativo');
        expect(a.efeitos).toHaveLength(1);
        [p.efeitosPassivos[0], a.efeitos[0]].forEach(e => { expect(e).not.toHaveProperty('multiplicador'); expect(e).not.toHaveProperty('destino'); });
    });

    it('sem tipo nao e aplicado e vira linha em notasIA do pai', () => {
        const f = final({ multiplicadores: [mult()], notasIA: 'nota previa' }, 'ativo');
        expect(f.efeitos).toEqual([]);
        expect(f.efeitosPassivos).toEqual([]);
        expect(f.notasIA).toContain('nota previa');
        expect(f.notasIA).toMatch(/Multiplicador sem tipo escolhido, não aplicado \(Rinnegan: poder_direto x800\)/);
    });

    it('atalho sem previa: com tipo sugerido e sem decisao cai em efeitos', () => {
        const { objeto } = prep({ multiplicadores: [mult({ tipo: 'unico' })] });
        const f = montarPoderFinal(objeto, 1);
        expect(f.efeitos).toEqual([expect.objectContaining({ propriedade: 'munico', valor: 800 })]);
    });

    it('sub-habilidade: aplicado na config e sem tipo vai para a descricao da Forma', () => {
        let { objeto } = prep({ subHabilidades: [
            { nome: 'Limbo', descricao: 'Cria ilusao', multiplicadores: [mult({ tipo: 'forma' })] },
            { nome: 'Izanagi', multiplicadores: [mult({ nome: 'X', valor: 3 })] },
        ] });
        objeto = decidirTodosOsIncertos(objeto, 'passivo');
        const f = montarPoderFinal(objeto, 5);
        expect(f.formas[0].configs[0].efeitosPassivos).toEqual([{ nome: 'Rinnegan', atributo: 'poder_direto', propriedade: 'mformas', valor: 799 }]);
        expect(f.formas[0].configs[0]).not.toHaveProperty('efeitosIncertos');
        expect(f.formas[1].configs[0].efeitosPassivos ?? []).toEqual([]);
        expect(f.formas[1].descricao).toMatch(/Multiplicador sem tipo escolhido.*X: poder_direto x3/);
        expect(f.formas[0].descricao).not.toMatch(/sem tipo/);
        expect(f.notasIA ?? '').not.toMatch(/sem tipo/);
    });

    it('nao muta o objeto da previa', () => {
        const { objeto } = prep({ multiplicadores: [mult({ tipo: 'geral' })] });
        const antes = JSON.stringify(objeto);
        montarPoderFinal(objeto, 1);
        expect(JSON.stringify(objeto)).toBe(antes);
    });
});

describe('multiplicadores - prompt', () => {
    it('instrui a usar multiplicadores com tipo e normalizacao de dano', () => {
        const p = montarPromptImportacao('x', 'poder');
        expect(p).toContain('MULTIPLICADORES (');
        expect(p).toContain('x800 = 800');
        expect(p).toContain('"base" | "geral" | "formas" | "absoluto" | "unico"');
        expect(p).toContain('"multiplicadores": []');
    });
});
