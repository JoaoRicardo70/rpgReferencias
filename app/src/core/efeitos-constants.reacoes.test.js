import { describe, it, expect } from 'vitest';
import {
    GRUPO_REACOES, PROPRIEDADES_REACAO, PROPRIEDADE_OPTIONS, getPropriedadesDoAtributo, ajustarPropriedade
} from './efeitos-constants.js';
import { EFEITOS_REACAO, GATILHOS_REACAO } from './reacoes.js';

describe('GRUPO_REACOES / PROPRIEDADES_REACAO', () => {
    it('grupo lista os 4 gatilhos como atributos reacao_*', () => {
        expect(GRUPO_REACOES.options).toEqual(['reacao_errou', 'reacao_acertou', 'reacao_sempre', 'reacao_aliado']);
        GRUPO_REACOES.options.forEach(o => expect(GATILHOS_REACAO.map(g => g.id)).toContain(o.replace('reacao_', '')));
    });
    it('propriedades de reacao coincidem com os efeitos de core/reacoes', () => {
        expect([...PROPRIEDADES_REACAO].sort()).toEqual(EFEITOS_REACAO.filter(e => e.id).map(e => e.id).sort());
    });
});

describe('getPropriedadesDoAtributo', () => {
    it('acao_reacao (e demais Acao/Reducao/Percepcao) so aceita base', () => {
        ['acao_reacao', 'acao_padrao', 'acao_bonus', 'reducao_dano', 'percepcao_poder', 'ocultacao_poder']
            .forEach(a => expect(getPropriedadesDoAtributo(a)).toEqual(['base']));
    });
    it.each(['reacao_errou', 'reacao_acertou', 'reacao_sempre', 'reacao_aliado'])('%s lista as propriedades de reacao', (a) => {
        expect(getPropriedadesDoAtributo(a)).toBe(PROPRIEDADES_REACAO);
    });
    it('atributo comum (forca) devolve PROPRIEDADE_OPTIONS', () => {
        expect(getPropriedadesDoAtributo('forca')).toBe(PROPRIEDADE_OPTIONS);
    });
    it('vazio, undefined e null devolvem PROPRIEDADE_OPTIONS', () => {
        [undefined, null, ''].forEach(a => expect(getPropriedadesDoAtributo(a)).toBe(PROPRIEDADE_OPTIONS));
    });
    it('prefixo parcial/maiusculas nao contam como reacao', () => {
        expect(getPropriedadesDoAtributo('REACAO_ERROU')).toBe(PROPRIEDADE_OPTIONS);
        expect(getPropriedadesDoAtributo('reacao')).toBe(PROPRIEDADE_OPTIONS);
    });
});

describe('ajustarPropriedade', () => {
    it('mantem a propriedade se valida para o atributo', () => {
        expect(ajustarPropriedade('forca', 'mgeral')).toBe('mgeral');
        expect(ajustarPropriedade('reacao_errou', 'reduzir_dano')).toBe('reduzir_dano');
        expect(ajustarPropriedade('acao_reacao', 'base')).toBe('base');
    });
    it('troca a invalida pela primeira opcao valida', () => {
        expect(ajustarPropriedade('acao_reacao', 'mgeral')).toBe('base');
        expect(ajustarPropriedade('reacao_errou', 'base')).toBe(PROPRIEDADES_REACAO[0]);
        expect(ajustarPropriedade('forca', 'contra_ataque')).toBe('base');
    });
    it('vazio/undefined: atributo comum cai em base; propriedade ausente tambem e trocada', () => {
        expect(ajustarPropriedade(undefined, undefined)).toBe(PROPRIEDADE_OPTIONS[0]);
        expect(ajustarPropriedade('', '')).toBe(PROPRIEDADE_OPTIONS[0]);
        expect(ajustarPropriedade('reacao_sempre', undefined)).toBe('contra_ataque');
    });
});
