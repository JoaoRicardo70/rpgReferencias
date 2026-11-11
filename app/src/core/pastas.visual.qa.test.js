import { describe, it, expect } from 'vitest';
import { chavePastaAberta, chavesComPastasMae, migrarChavesPastasAbertas, NOME_SEM_PASTA, SEPARADOR_CHAVE_PASTA } from './pastas';

// QA — pastas abertas do Livro dos Poderes (chaves "categoria::caminho").

describe('chavePastaAberta', () => {
    it('junta categoria e caminho com "::"', () => {
        expect(chavePastaAberta('habilidade', 'Taijutsu/Portões')).toBe('habilidade::Taijutsu/Portões');
        expect(SEPARADOR_CHAVE_PASTA).toBe('::');
    });
    it('categorias diferentes geram chaves diferentes para o mesmo caminho', () => {
        expect(chavePastaAberta('forma', 'Combos')).not.toBe(chavePastaAberta('habilidade', 'Combos'));
    });
    it('"Sem Pasta" é uma chave comum', () => {
        expect(chavePastaAberta('forma', NOME_SEM_PASTA)).toBe('forma::Sem Pasta');
    });
});

describe('chavesComPastasMae', () => {
    it('um nível -> uma chave', () => {
        expect(chavesComPastasMae('forma', 'A')).toEqual(['forma::A']);
    });
    it('"A/B/C" traz A, A/B e A/B/C em ordem', () => {
        expect(chavesComPastasMae('poder', 'A/B/C')).toEqual(['poder::A', 'poder::A/B', 'poder::A/B/C']);
    });
    it('normaliza espaços e barras sobrando', () => {
        expect(chavesComPastasMae('forma', ' A / B ')).toEqual(['forma::A', 'forma::A/B']);
        expect(chavesComPastasMae('forma', '/A//B/')).toEqual(['forma::A', 'forma::A/B']);
    });
    it.each([[''], ['   '], ['/'], [null], [undefined]])('pasta vazia %j -> []', (v) => {
        expect(chavesComPastasMae('forma', v)).toEqual([]);
    });
});

describe('migrarChavesPastasAbertas', () => {
    it('renomear: a chave da pasta e das subpastas acompanham', () => {
        const abertas = { 'forma::A': true, 'forma::A/B': true, 'forma::C': true };
        expect(migrarChavesPastasAbertas(abertas, 'forma', 'A', 'Z')).toEqual({ 'forma::Z': true, 'forma::Z/B': true, 'forma::C': true });
    });
    it('mover para dentro de outra pasta leva as subpastas junto', () => {
        const abertas = { 'forma::Portões': true, 'forma::Portões/Extra': true };
        expect(migrarChavesPastasAbertas(abertas, 'forma', 'Portões', 'Taijutsu/Portões'))
            .toEqual({ 'forma::Taijutsu/Portões': true, 'forma::Taijutsu/Portões/Extra': true });
    });
    it('renomear uma subpasta não mexe na mãe', () => {
        const abertas = { 'forma::A': true, 'forma::A/B': true };
        expect(migrarChavesPastasAbertas(abertas, 'forma', 'A/B', 'A/X')).toEqual({ 'forma::A': true, 'forma::A/X': true });
    });
    it('pasta apagada (para vazio): some a chave dela e as subpastas sobem', () => {
        const abertas = { 'forma::A': true, 'forma::A/B': true, 'forma::A/B/C': true, 'forma::D': true };
        expect(migrarChavesPastasAbertas(abertas, 'forma', 'A', '')).toEqual({ 'forma::B': true, 'forma::B/C': true, 'forma::D': true });
    });
    it('apagar subpasta sobe os filhos para a mãe', () => {
        const abertas = { 'forma::A': true, 'forma::A/B': true, 'forma::A/B/C': true };
        expect(migrarChavesPastasAbertas(abertas, 'forma', 'A/B', '')).toEqual({ 'forma::A': true, 'forma::A/C': true });
    });
    it('categorias distintas não se misturam', () => {
        const abertas = { 'forma::A': true, 'habilidade::A': true, 'poder::A/B': true };
        expect(migrarChavesPastasAbertas(abertas, 'forma', 'A', 'Z')).toEqual({ 'forma::Z': true, 'habilidade::A': true, 'poder::A/B': true });
        expect(migrarChavesPastasAbertas(abertas, 'forma', 'A', '')).toEqual({ 'habilidade::A': true, 'poder::A/B': true });
    });
    it('prefixo de nome parecido não é confundido ("Ab" não está sob "A")', () => {
        const abertas = { 'forma::Ab': true, 'forma::A': true };
        expect(migrarChavesPastasAbertas(abertas, 'forma', 'A', 'Z')).toEqual({ 'forma::Ab': true, 'forma::Z': true });
    });
    it('categoria que é prefixo de outra ("poder" x "poderes") não vaza', () => {
        const abertas = { 'poderes::A': true };
        expect(migrarChavesPastasAbertas(abertas, 'poder', 'A', 'Z')).toEqual({ 'poderes::A': true });
    });
    it('chaves com valor falso são descartadas', () => {
        expect(migrarChavesPastasAbertas({ 'forma::A': false, 'forma::B': true }, 'forma', 'B', 'C')).toEqual({ 'forma::C': true });
    });
    it('não muta a entrada e devolve objeto novo', () => {
        const abertas = Object.freeze({ 'forma::A': true });
        const r = migrarChavesPastasAbertas(abertas, 'forma', 'A', 'B');
        expect(r).not.toBe(abertas);
        expect(abertas).toEqual({ 'forma::A': true });
    });
    it('renomear para o mesmo nome mantém tudo', () => {
        const abertas = { 'forma::A': true, 'forma::A/B': true };
        expect(migrarChavesPastasAbertas(abertas, 'forma', 'A', 'A')).toEqual(abertas);
    });
    it('entradas inválidas: abertas null/undefined -> {}', () => {
        expect(migrarChavesPastasAbertas(null, 'forma', 'A', 'B')).toEqual({});
        expect(migrarChavesPastasAbertas(undefined, 'forma', 'A', 'B')).toEqual({});
    });
    it('"de" vazio/nulo devolve cópia intacta', () => {
        const abertas = { 'forma::A': true };
        [ '', '  ', '/', null, undefined ].forEach(de => {
            const r = migrarChavesPastasAbertas(abertas, 'forma', de, 'X');
            expect(r).toEqual(abertas);
            expect(r).not.toBe(abertas);
        });
    });
    it('pasta que não existe nas abertas: nada muda', () => {
        expect(migrarChavesPastasAbertas({ 'forma::A': true }, 'forma', 'Q', 'W')).toEqual({ 'forma::A': true });
    });
    it('"para" nulo equivale a remover', () => {
        expect(migrarChavesPastasAbertas({ 'forma::A': true, 'forma::A/B': true }, 'forma', 'A', null)).toEqual({ 'forma::B': true });
    });
    it('"Sem Pasta" é preservado ao migrar outras pastas', () => {
        expect(migrarChavesPastasAbertas({ 'forma::Sem Pasta': true, 'forma::A': true }, 'forma', 'A', 'B'))
            .toEqual({ 'forma::Sem Pasta': true, 'forma::B': true });
    });
});
