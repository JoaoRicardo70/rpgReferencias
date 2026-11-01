import { describe, it, expect } from 'vitest';
import {
    normalizarAplicaEstados, estadoDoTipoDeArma, coletarEstadosDoGolpe, resolverEstadosNoAlvo, juntarAplicados,
    descreverResolucao, LIMITES_ESTADOS
} from './estadosGolpe';

describe('estadosGolpe - normalizarAplicaEstados', () => {
    it('nao-array devolve []', () => {
        expect(normalizarAplicaEstados(null)).toEqual([]);
        expect(normalizarAplicaEstados('x')).toEqual([]);
        expect(normalizarAplicaEstados(undefined)).toEqual([]);
    });
    it('descarta id invalido e itens nulos', () => {
        expect(normalizarAplicaEstados([null, { id: 'nada' }, { id: 'lento' }])).toEqual([{ id: 'lento', stacks: 1 }]);
    });
    it('stacks: minimo 1, maximo 6, arredonda', () => {
        const r = normalizarAplicaEstados([{ id: 'lento', stacks: 0 }, { id: 'queimado', stacks: 50 }, { id: 'sangrando', stacks: -4 }, { id: 'exausto', stacks: 2.7 }, { id: 'envenenado', stacks: 'abc' }]);
        expect(r.map(x => x.stacks)).toEqual([1, 6, 1, 2, 1]);
    });
    it('teste valido mantem atributo e limita CD a 60', () => {
        const r = normalizarAplicaEstados([{ id: 'lento', teste: { atributo: 'forca', cd: 200 } }]);
        expect(r[0].teste).toEqual({ atributo: 'forca', cd: LIMITES_ESTADOS.cdMax });
    });
    it('teste com atributo invalido ou CD invalida e removido', () => {
        const r = normalizarAplicaEstados([
            { id: 'lento', teste: { atributo: 'sorte', cd: 10 } },
            { id: 'lento', teste: { atributo: 'forca', cd: 0 } },
            { id: 'lento', teste: { atributo: 'forca', cd: 'x' } }
        ]);
        r.forEach(x => expect(x.teste).toBeUndefined());
    });
    it('apenasCritico so aparece quando verdadeiro', () => {
        const r = normalizarAplicaEstados([{ id: 'lento', apenasCritico: true }, { id: 'lento', apenasCritico: false }]);
        expect(r[0].apenasCritico).toBe(true);
        expect('apenasCritico' in r[1]).toBe(false);
    });
    it('limita a 8 por fonte', () => {
        expect(normalizarAplicaEstados(Array.from({ length: 20 }, () => ({ id: 'lento' })))).toHaveLength(8);
    });
});

describe('estadosGolpe - estadoDoTipoDeArma / coletarEstadosDoGolpe', () => {
    it('tipo de arma ignora acento e caixa', () => {
        expect(estadoDoTipoDeArma('Lança')).toEqual({ id: 'sangrando', stacks: 1, apenasCritico: true });
        expect(estadoDoTipoDeArma(' MARTELO ')).toMatchObject({ id: 'lento' });
        expect(estadoDoTipoDeArma('Arma de Fogo')).toMatchObject({ id: 'sangrando' });
        expect(estadoDoTipoDeArma('varinha')).toBeNull();
        expect(estadoDoTipoDeArma(undefined)).toBeNull();
    });
    it('sem nada devolve []', () => {
        expect(coletarEstadosDoGolpe()).toEqual([]);
        expect(coletarEstadosDoGolpe({})).toEqual([]);
    });
    it('fontes entram com origem', () => {
        const r = coletarEstadosDoGolpe({ fontes: [null, { nome: 'Bola de Fogo', aplicaEstados: [{ id: 'queimado', stacks: 2 }] }, { nome: 'Sem' }] });
        expect(r).toEqual([{ id: 'queimado', stacks: 2, origem: 'Bola de Fogo' }]);
    });
    it('arma por tipo so aplica em critico (apenasCritico)', () => {
        const [e] = coletarEstadosDoGolpe({ armas: [{ nome: 'Katana', armaTipo: 'espada' }] });
        expect(e).toMatchObject({ id: 'sangrando', stacks: 1, apenasCritico: true });
        expect(e.origem).toContain('Katana');
        expect(resolverEstadosNoAlvo([e], null, { critico: false }).aplicados).toEqual([]);
        expect(resolverEstadosNoAlvo([e], null, { critico: true }).aplicados).toHaveLength(1);
    });
    it('arma com estado proprio nao usa o do tipo', () => {
        const r = coletarEstadosDoGolpe({ armas: [{ nome: 'Espada Gelada', armaTipo: 'espada', aplicaEstados: [{ id: 'criogenia' }] }] });
        expect(r.map(x => x.id)).toEqual(['criogenia']);
        expect(r[0].apenasCritico).toBeUndefined();
    });
    it('arma de tipo sem estado e arma nula nao adicionam nada', () => {
        expect(coletarEstadosDoGolpe({ armas: [null, { nome: 'Varinha', armaTipo: 'varinha' }] })).toEqual([]);
    });
    it('extras viram Ataque livre', () => {
        expect(coletarEstadosDoGolpe({ extras: [{ id: 'lento' }] })).toEqual([{ id: 'lento', stacks: 1, origem: 'Ataque livre' }]);
    });
    it('ordem: fontes, armas, extras', () => {
        const r = coletarEstadosDoGolpe({ fontes: [{ nome: 'P', aplicaEstados: [{ id: 'queimado' }] }], armas: [{ nome: 'A', armaTipo: 'martelo' }], extras: [{ id: 'exausto' }] });
        expect(r.map(x => x.id)).toEqual(['queimado', 'lento', 'exausto']);
    });
});

describe('estadosGolpe - resolverEstadosNoAlvo', () => {
    const alvo = { forca: { base: 250 } }; // dezena = 25
    it('lista vazia ou indefinida', () => {
        expect(resolverEstadosNoAlvo(undefined, null)).toEqual({ aplicados: [], resistidos: [], pulados: 0 });
    });
    it('sem teste aplica direto', () => {
        expect(resolverEstadosNoAlvo([{ id: 'lento', stacks: 2, origem: 'X' }], alvo).aplicados).toEqual([{ id: 'lento', stacks: 2, origem: 'X' }]);
    });
    it('conta pulados para apenasCritico sem critico', () => {
        const r = resolverEstadosNoAlvo([{ id: 'lento', stacks: 1, apenasCritico: true }], alvo);
        expect(r.pulados).toBe(1);
        expect(r.aplicados).toEqual([]);
    });
    it('teste de resistencia: total >= CD resiste (usa dezena do atributo)', () => {
        const e = { id: 'queimado', stacks: 1, teste: { atributo: 'forca', cd: 30 } };
        const r = resolverEstadosNoAlvo([e], alvo, { rolar: () => 5 });
        expect(r.resistidos).toEqual([{ id: 'queimado', origem: '', total: 30, cd: 30, atributo: 'forca' }]);
        expect(r.aplicados).toEqual([]);
    });
    it('teste de resistencia: total < CD aplica', () => {
        const e = { id: 'queimado', stacks: 1, teste: { atributo: 'forca', cd: 30 } };
        const r = resolverEstadosNoAlvo([e], alvo, { rolar: () => 4 });
        expect(r.aplicados).toHaveLength(1);
        expect(r.resistidos).toEqual([]);
    });
    it('atributo ausente na ficha conta como 0', () => {
        const e = { id: 'queimado', stacks: 1, teste: { atributo: 'carisma', cd: 10 } };
        expect(resolverEstadosNoAlvo([e], alvo, { rolar: () => 9 }).aplicados).toHaveLength(1);
        expect(resolverEstadosNoAlvo([e], alvo, { rolar: () => 10 }).resistidos).toHaveLength(1);
    });
    it('Dummie (fichaAlvo null) nao testa: estado entra direto e rolar nao e chamado', () => {
        let chamou = 0;
        const e = { id: 'queimado', stacks: 1, teste: { atributo: 'forca', cd: 1 } };
        const r = resolverEstadosNoAlvo([e], null, { rolar: () => { chamou++; return 20; } });
        expect(r.aplicados).toHaveLength(1);
        expect(chamou).toBe(0);
    });
    it('ignora estados invalidos', () => {
        expect(resolverEstadosNoAlvo([null, { id: 'x', stacks: 1 }], null).aplicados).toEqual([]);
    });
    it('rolar padrao e um d20', () => {
        const e = { id: 'lento', stacks: 1, teste: { atributo: 'forca', cd: 46 } }; // max 20+25 = 45 < 46
        for (let i = 0; i < 20; i++) expect(resolverEstadosNoAlvo([e], alvo).aplicados).toHaveLength(1);
        const e2 = { ...e, teste: { atributo: 'forca', cd: 26 } }; // min 1+25 = 26
        for (let i = 0; i < 20; i++) expect(resolverEstadosNoAlvo([e2], alvo).resistidos).toHaveLength(1);
    });
});

describe('estadosGolpe - juntarAplicados / descreverResolucao', () => {
    it('soma stacks do mesmo estado ate 6', () => {
        expect(juntarAplicados([{ id: 'lento', stacks: 4 }, { id: 'lento', stacks: 4 }, { id: 'queimado', stacks: 1 }]))
            .toEqual([{ id: 'lento', stacks: 6 }, { id: 'queimado', stacks: 1 }]);
    });
    it('vazio/null', () => {
        expect(juntarAplicados(null)).toEqual([]);
        expect(juntarAplicados([])).toEqual([]);
    });
    it('descreverResolucao com nome do alvo e resistencias', () => {
        const t = descreverResolucao({ aplicados: [{ id: 'lento', stacks: 2 }], resistidos: [{ id: 'queimado', total: 12, cd: 15 }] }, 'Goku');
        expect(t).toContain('Goku ficou com');
        expect(t).toContain('Lento +2');
        expect(t).toContain('resistiu a');
        expect(t).toContain('CD 15');
    });
    it('descreverResolucao sem alvo usa "Aplicou"; r nulo ou vazio da ""', () => {
        expect(descreverResolucao({ aplicados: [{ id: 'lento', stacks: 1 }], resistidos: [] })).toContain('Aplicou');
        expect(descreverResolucao(null)).toBe('');
        expect(descreverResolucao({ aplicados: [], resistidos: [] })).toBe('');
    });
});
