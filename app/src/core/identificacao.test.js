import { describe, it, expect } from 'vitest';
import { classificarAtaque, energiasDoGolpe, getIdentificacoes, montarTextoIdentificacao, rotuloEnergia } from './identificacao';
import { GRUPO_IDENTIFICACAO, getPropriedadesDoAtributo } from './efeitos-constants';
import { ATRIBUTOS_EFEITO } from './sextaFeiraCriacao';

describe('classificarAtaque', () => {
    it('elemento vira Elemental (Nome) capitalizado', () => {
        expect(classificarAtaque({ elemento: 'fogo', energias: [] })).toEqual({ categoria: 'elemental', elemento: 'Fogo', rotulo: 'Elemental (Fogo)' });
    });
    it('elemento com acento e caixa mista', () => {
        expect(classificarAtaque({ elemento: 'ÁGUA' }).rotulo).toBe('Elemental (ÁGUA)');
        expect(classificarAtaque({ elemento: 'Éter' }).categoria).toBe('elemental');
    });
    it('"fisico", "Físico", "NEUTRO" e "nenhum" nao sao elementais', () => {
        for (const e of ['fisico', 'Físico', 'FÍSICO', 'neutro', 'Neutro', 'nenhum', '  fisico  ']) {
            expect(classificarAtaque({ elemento: e }).categoria).toBe('fisico');
        }
    });
    it('elemento tem prioridade sobre energia', () => {
        expect(classificarAtaque({ elemento: 'Gelo', energias: ['mana'] }).categoria).toBe('elemental');
    });
    it('energia sem elemento e Energetico', () => {
        expect(classificarAtaque({ elemento: 'fisico', energias: ['mana'] })).toEqual({ categoria: 'energetico', elemento: '', rotulo: 'Energético' });
    });
    it('sem nada e Fisico; sem argumento, nulos e energias nao-array nao quebram', () => {
        expect(classificarAtaque().rotulo).toBe('Físico');
        expect(classificarAtaque({ elemento: null, energias: null }).rotulo).toBe('Físico');
        expect(classificarAtaque({ elemento: undefined, energias: [] }).rotulo).toBe('Físico');
        expect(classificarAtaque({ elemento: '', energias: 'mana' }).rotulo).toBe('Físico');
    });
});

describe('energiasDoGolpe', () => {
    it('junta drenos e custosPoder sem repetir', () => {
        expect(energiasDoGolpe([{ key: 'mana', valor: 10 }, { key: 'vida', valor: 3 }], [{ energia: 'mana', bruto: 5 }, { energia: 'aura', bruto: 2 }]))
            .toEqual(['mana', 'vida', 'aura']);
    });
    it('ignora valor 0, negativo, nao numerico e itens invalidos', () => {
        expect(energiasDoGolpe([{ key: 'mana', valor: 0 }, { key: 'aura', valor: -1 }, { key: 'x', valor: 'abc' }, null, {}], [{ energia: 'chakra', bruto: 0 }, null, { bruto: 5 }])).toEqual([]);
    });
    it('aceita valor numerico em string', () => {
        expect(energiasDoGolpe([{ key: 'mana', valor: '4' }], undefined)).toEqual(['mana']);
    });
    it('entradas ausentes ou nao-array', () => {
        expect(energiasDoGolpe()).toEqual([]);
        expect(energiasDoGolpe(null, 'x')).toEqual([]);
    });
});

describe('getIdentificacoes', () => {
    const ef = (atributo) => ({ atributo });
    it('ficha nula/vazia: nada identificado', () => {
        expect(getIdentificacoes(null)).toEqual({ tipo: false, energia: false });
        expect(getIdentificacoes(undefined)).toEqual({ tipo: false, energia: false });
        expect(getIdentificacoes({})).toEqual({ tipo: false, energia: false });
    });
    it('efeito passivo vale sempre, mesmo com a tecnica desligada', () => {
        const f = { poderes: [{ ativa: false, efeitosPassivos: [ef('identificar_tipo_ataque')], efeitos: [] }] };
        expect(getIdentificacoes(f)).toEqual({ tipo: true, energia: false });
    });
    it('efeito ativo so com ativa === true', () => {
        const mk = (ativa) => ({ poderes: [{ ativa, efeitosPassivos: [], efeitos: [ef('identificar_energia')] }] });
        expect(getIdentificacoes(mk(true))).toEqual({ tipo: false, energia: true });
        expect(getIdentificacoes(mk(false)).energia).toBe(false);
        expect(getIdentificacoes(mk(undefined)).energia).toBe(false);
        expect(getIdentificacoes(mk('true')).energia).toBe(false);
    });
    it('le habilidades e poderes e soma os dois', () => {
        const f = { poderes: [{ efeitosPassivos: [ef('identificar_tipo_ataque')] }], habilidades: [{ efeitosPassivos: [ef('identificar_energia')] }] };
        expect(getIdentificacoes(f)).toEqual({ tipo: true, energia: true });
        expect(getIdentificacoes({ habilidades: [{ efeitosPassivos: [ef('identificar_energia')] }] })).toEqual({ tipo: false, energia: true });
    });
    it('ignora outros atributos, nulos e campos nao-array', () => {
        const f = { poderes: [null, { efeitosPassivos: [null, ef('forca')], efeitos: 'x' }, { efeitosPassivos: 'x' }], habilidades: 'x' };
        expect(getIdentificacoes(f)).toEqual({ tipo: false, energia: false });
    });
});

describe('montarTextoIdentificacao', () => {
    it('so tipo', () => {
        expect(montarTextoIdentificacao('Vilao', 'Físico', ['mana'], { tipo: true, energia: false })).toBe('🔍 Vilao: ataque Físico');
    });
    it('so energia, com rotulos e varias energias', () => {
        expect(montarTextoIdentificacao('Vilao', 'Físico', ['mana', 'pontosVitais'], { tipo: false, energia: true })).toBe('🔍 Vilao: Energia: Mana + Pontos Vitais');
    });
    it('ambos', () => {
        expect(montarTextoIdentificacao('Vilao', 'Elemental (Fogo)', ['aura'], { tipo: true, energia: true })).toBe('🔍 Vilao: ataque Elemental (Fogo) · Energia: Aura');
    });
    it('nenhum: null', () => {
        expect(montarTextoIdentificacao('Vilao', 'Físico', ['mana'], { tipo: false, energia: false })).toBeNull();
        expect(montarTextoIdentificacao('Vilao', 'Físico', ['mana'], null)).toBeNull();
        expect(montarTextoIdentificacao('Vilao', 'Físico', ['mana'])).toBeNull();
    });
    it('energia identificada mas golpe sem energia: "sem Energia"', () => {
        expect(montarTextoIdentificacao('Vilao', 'Físico', [], { tipo: false, energia: true })).toBe('🔍 Vilao: sem Energia');
        expect(montarTextoIdentificacao('Vilao', 'Físico', undefined, { tipo: false, energia: true })).toBe('🔍 Vilao: sem Energia');
    });
    it('so tipo identificado mas tipoAtaque ausente (entrada antiga): null', () => {
        expect(montarTextoIdentificacao('Vilao', undefined, [], { tipo: true, energia: false })).toBeNull();
    });
    it('atacante ausente usa "Atacante"; chave de energia desconhecida e mantida', () => {
        expect(montarTextoIdentificacao('', 'Físico', ['xyz'], { tipo: false, energia: true })).toBe('🔍 Atacante: Energia: xyz');
        expect(rotuloEnergia('mana')).toBe('Mana');
        expect(rotuloEnergia(null)).toBe('');
    });
});

describe('efeitos-constants / sextaFeiraCriacao', () => {
    it('GRUPO_IDENTIFICACAO tem os dois atributos', () => {
        expect(GRUPO_IDENTIFICACAO.options).toEqual(['identificar_tipo_ataque', 'identificar_energia']);
    });
    it('getPropriedadesDoAtributo devolve [base] para ambos', () => {
        expect(getPropriedadesDoAtributo('identificar_tipo_ataque')).toEqual(['base']);
        expect(getPropriedadesDoAtributo('identificar_energia')).toEqual(['base']);
    });
    it('ATRIBUTOS_EFEITO da Sexta-Feira inclui os dois', () => {
        expect(ATRIBUTOS_EFEITO).toContain('identificar_tipo_ataque');
        expect(ATRIBUTOS_EFEITO).toContain('identificar_energia');
    });
});
