import { describe, it, expect } from 'vitest';
import {
    CATEGORIAS_PODER, IDS_CATEGORIA_PODER, IDS_CATEGORIA_BASE, idCategoriaPoder, categoriaExiste, infoCategoriaPoder,
    categoriaDoPoderFicha, categoriasVisiveisNaFicha, categoriasNaoLiberadas, categoriaLiberadaNaFicha, poderEhCopiavel,
    usaMaestriaRequerida, ehCategoriaForma, mensagemCategoriaNaoLiberada, textoGrauSingularidade, MENSAGEM_SINGULARIDADE_NAO_COPIA,
} from './categoriasPoder';

const ficha = (h, poderes) => ({ hierarquia: h, poderes });

describe('catalogo de categorias', () => {
    it('tem as 6 categorias na ordem, com campos obrigatorios', () => {
        expect(IDS_CATEGORIA_PODER).toEqual(['habilidade', 'forma', 'poder', 'ocular', 'infinity', 'singularidade']);
        expect(IDS_CATEGORIA_BASE).toEqual(['habilidade', 'forma', 'poder']);
        CATEGORIAS_PODER.forEach((c) => {
            expect(c.id).toBeTruthy();
            expect(c.rotulo).toContain(c.icone);
            expect(c.singular).toBeTruthy();
            expect(c.nome).toBeTruthy();
            expect(typeof c.liberada).toBe('function');
            expect(typeof c.copiavel).toBe('boolean');
            expect(typeof c.maestriaRequerida).toBe('boolean');
        });
    });
    it('so Singularidade nao e copiavel; so Forma nao usa maestriaRequerida', () => {
        expect(CATEGORIAS_PODER.filter(c => !c.copiavel).map(c => c.id)).toEqual(['singularidade']);
        expect(CATEGORIAS_PODER.filter(c => !c.maestriaRequerida).map(c => c.id)).toEqual(['forma']);
    });
});

describe('idCategoriaPoder', () => {
    it.each([
        ['habilidade', 'habilidade'], ['Habilidades', 'habilidade'], ['FORMAS', 'forma'], ['poderes', 'poder'],
        ['ocular', 'ocular'], ['Oculares', 'ocular'], ['Poder Ocular', 'ocular'], ['poderes oculares', 'ocular'], ['PODERES OCULARES', 'ocular'],
        ['olho', 'ocular'], ['Olhos', 'ocular'], ['dojutsu', 'ocular'],
        ['infinity', 'infinity'], ['Infinities', 'infinity'], ['infinitys', 'infinity'], ['Infinito', 'infinity'],
        ['singularidade', 'singularidade'], ['Singularidades', 'singularidade'],
        ['  Singularidade  ', 'singularidade'],
    ])('%s -> %s', (entrada, esperado) => {
        expect(idCategoriaPoder(entrada)).toBe(esperado);
    });
    it('remove acentos', () => {
        expect(idCategoriaPoder('hábilidade')).toBe('habilidade');
        expect(idCategoriaPoder('Poderès')).toBe('poder');
    });
    it('remove caracteres zero-width', () => {
        expect(idCategoriaPoder('singularidade​')).toBe('singularidade');
        expect(idCategoriaPoder('​infinity')).toBe('infinity');
        expect(idCategoriaPoder('oc‍ular')).toBe('ocular');
        expect(idCategoriaPoder('﻿forma')).toBe('forma');
        expect(idCategoriaPoder('poder⁠')).toBe('poder');
    });
    it('NFKC: formas de largura total', () => {
        expect(idCategoriaPoder('ｓｉｎｇｕｌａｒｉｄａｄｅ')).toBe('singularidade');
        expect(idCategoriaPoder('ｏｃｕｌａｒ')).toBe('ocular');
    });
    it('null/undefined/numero/objeto/vazio/desconhecido => ""', () => {
        [null, undefined, '', '   ', 0, 42, NaN, {}, [], 'xyz', 'legado'].forEach(v => expect(idCategoriaPoder(v)).toBe(''));
    });
    it('categoriaExiste espelha idCategoriaPoder', () => {
        expect(categoriaExiste('Infinities')).toBe(true);
        expect(categoriaExiste('nada')).toBe(false);
        expect(categoriaExiste(null)).toBe(false);
    });
    it('infoCategoriaPoder: desconhecida cai em habilidade', () => {
        expect(infoCategoriaPoder('ocular').id).toBe('ocular');
        expect(infoCategoriaPoder('xx').id).toBe('habilidade');
        expect(infoCategoriaPoder(undefined).id).toBe('habilidade');
    });
});

describe('categoriaDoPoderFicha', () => {
    it('sem categoria = poder (dados antigos)', () => {
        expect(categoriaDoPoderFicha({ nome: 'a' })).toBe('poder');
        expect(categoriaDoPoderFicha({ categoria: '' })).toBe('poder');
        expect(categoriaDoPoderFicha({ categoria: '   ' })).toBe('poder');
        expect(categoriaDoPoderFicha({ categoria: null })).toBe('poder');
        expect(categoriaDoPoderFicha(null)).toBe('poder');
        expect(categoriaDoPoderFicha(undefined)).toBe('poder');
    });
    it('desconhecida = habilidade', () => {
        expect(categoriaDoPoderFicha({ categoria: 'legado' })).toBe('habilidade');
        expect(categoriaDoPoderFicha({ categoria: 7 })).toBe('habilidade');
    });
    it('conhecidas, plurais e apelidos', () => {
        expect(categoriaDoPoderFicha({ categoria: 'Infinities' })).toBe('infinity');
        expect(categoriaDoPoderFicha({ categoria: 'poderes oculares' })).toBe('ocular');
        expect(categoriaDoPoderFicha({ categoria: 'Singularidade​' })).toBe('singularidade');
        expect(categoriaDoPoderFicha({ categoria: 'forma' })).toBe('forma');
    });
});

describe('regra de liberacao', () => {
    it('habilidade/forma/poder sempre liberadas (inclusive ficha vazia/null)', () => {
        ['habilidade', 'forma', 'poder'].forEach((id) => {
            expect(categoriaLiberadaNaFicha(id, null)).toBe(true);
            expect(categoriaLiberadaNaFicha(id, {})).toBe(true);
        });
    });
    it('ocular so com hierarquia.ocular === true', () => {
        expect(categoriaLiberadaNaFicha('ocular', ficha({ ocular: true }))).toBe(true);
        [{ ocular: false }, {}, { ocular: 'true' }, { ocular: 1 }].forEach(h => expect(categoriaLiberadaNaFicha('ocular', ficha(h))).toBe(false));
        expect(categoriaLiberadaNaFicha('ocular', {})).toBe(false);
        expect(categoriaLiberadaNaFicha('ocular', null)).toBe(false);
        expect(categoriaLiberadaNaFicha('ocular', undefined)).toBe(false);
    });
    it('infinity so com hierarquia.infinity === true', () => {
        expect(categoriaLiberadaNaFicha('infinity', ficha({ infinity: true }))).toBe(true);
        expect(categoriaLiberadaNaFicha('infinity', ficha({ infinity: false }))).toBe(false);
        expect(categoriaLiberadaNaFicha('infinity', ficha({}))).toBe(false);
    });
    it('singularidade com grau nao vazio ("0" incluso)', () => {
        ['0', '1', '2', '3'].forEach(g => expect(categoriaLiberadaNaFicha('singularidade', ficha({ singularidade: g }))).toBe(true));
        expect(categoriaLiberadaNaFicha('singularidade', ficha({ singularidade: '' }))).toBe(false);
        expect(categoriaLiberadaNaFicha('singularidade', ficha({}))).toBe(false);
        expect(categoriaLiberadaNaFicha('singularidade', {})).toBe(false);
    });
    it('id invalido nunca e liberado', () => {
        expect(categoriaLiberadaNaFicha('xx', ficha({ ocular: true }))).toBe(false);
        expect(categoriaLiberadaNaFicha(null, {})).toBe(false);
    });
    it('aceita plural/apelido', () => {
        expect(categoriaLiberadaNaFicha('Oculares', ficha({ ocular: true }))).toBe(true);
    });
    it('categoriasNaoLiberadas', () => {
        expect(categoriasNaoLiberadas({}).map(c => c.id)).toEqual(['ocular', 'infinity', 'singularidade']);
        expect(categoriasNaoLiberadas(ficha({ ocular: true, infinity: true, singularidade: '1' }))).toEqual([]);
    });
});

describe('categoriasVisiveisNaFicha', () => {
    const ids = (f) => categoriasVisiveisNaFicha(f).map(c => c.id);
    it('nenhuma liberacao: so as 3 basicas (inclusive ficha vazia/null)', () => {
        expect(ids({})).toEqual(['habilidade', 'forma', 'poder']);
        expect(ids(null)).toEqual(['habilidade', 'forma', 'poder']);
        expect(ids(undefined)).toEqual(['habilidade', 'forma', 'poder']);
        expect(ids({ poderes: 'nao-lista' })).toEqual(['habilidade', 'forma', 'poder']);
    });
    it('liberada aparece, na ordem da lista', () => {
        expect(ids(ficha({ singularidade: '2', ocular: true }))).toEqual(['habilidade', 'forma', 'poder', 'ocular', 'singularidade']);
        expect(ids(ficha({ ocular: true, infinity: true, singularidade: '0' }))).toEqual(IDS_CATEGORIA_PODER);
    });
    it('com poderes na categoria sem liberacao: continua visivel', () => {
        expect(ids(ficha({}, [{ categoria: 'Infinities' }]))).toContain('infinity');
        expect(ids(ficha({}, [null, { categoria: 'ocular' }, undefined]))).toEqual(['habilidade', 'forma', 'poder', 'ocular']);
    });
    it('poderes de categoria desconhecida ou sem categoria nao criam abas', () => {
        expect(ids(ficha({}, [{ categoria: 'legado' }, { nome: 'x' }]))).toEqual(['habilidade', 'forma', 'poder']);
    });
    it('ficha sem hierarquia', () => {
        expect(() => categoriasVisiveisNaFicha({ poderes: [] })).not.toThrow();
    });
});

describe('copia, maestria e mensagens', () => {
    it('poderEhCopiavel', () => {
        expect(poderEhCopiavel({ categoria: 'singularidade' })).toBe(false);
        expect(poderEhCopiavel({ categoria: 'Singularidades' })).toBe(false);
        expect(poderEhCopiavel({ categoria: 'singularidade​' })).toBe(false);
        expect(poderEhCopiavel({ categoria: 'infinity' })).toBe(true);
        expect(poderEhCopiavel({ categoria: 'ocular' })).toBe(true);
        expect(poderEhCopiavel({})).toBe(true);
        expect(poderEhCopiavel(null)).toBe(true);
        expect(poderEhCopiavel({ categoria: 'xyz' })).toBe(true);
    });
    it('usaMaestriaRequerida / ehCategoriaForma', () => {
        ['habilidade', 'poder', 'ocular', 'infinity', 'singularidade', 'Infinities'].forEach(c => expect(usaMaestriaRequerida(c)).toBe(true));
        expect(usaMaestriaRequerida('forma')).toBe(false);
        expect(usaMaestriaRequerida('xyz')).toBe(false);
        expect(usaMaestriaRequerida(null)).toBe(false);
        expect(ehCategoriaForma('Formas')).toBe(true);
        expect(ehCategoriaForma('poder')).toBe(false);
    });
    it('mensagemCategoriaNaoLiberada', () => {
        expect(mensagemCategoriaNaoLiberada({ categoria: 'ocular' }, {})).toContain('Poderes Oculares');
        expect(mensagemCategoriaNaoLiberada({ categoria: 'infinity' }, ficha({ infinity: false }))).toContain('Infinity');
        expect(mensagemCategoriaNaoLiberada({ categoria: 'ocular' }, ficha({ ocular: true }))).toBe('');
        expect(mensagemCategoriaNaoLiberada({ categoria: 'habilidade' }, {})).toBe('');
        expect(mensagemCategoriaNaoLiberada({}, null)).toBe('');
        expect(mensagemCategoriaNaoLiberada(null, null)).toBe('');
        expect(mensagemCategoriaNaoLiberada({ categoria: 'singularidade' }, {})).toContain('Singularidade');
    });
    it('textoGrauSingularidade', () => {
        expect(textoGrauSingularidade(ficha({ singularidade: '1' }))).toBe('Grau 1 (Nascida)');
        expect(textoGrauSingularidade(ficha({ singularidade: '0' }))).toBe('Grau 0 (Marcado)');
        expect(textoGrauSingularidade(ficha({ singularidade: 3 }))).toBe('Grau 3 (Herdada)');
        expect(textoGrauSingularidade(ficha({ singularidade: '' }))).toBe('');
        expect(textoGrauSingularidade(null)).toBe('');
        expect(textoGrauSingularidade({})).toBe('');
        expect(textoGrauSingularidade(ficha({ singularidade: '9' }))).toBe('');
    });
    it('mensagem de singularidade nao copia', () => {
        expect(MENSAGEM_SINGULARIDADE_NAO_COPIA).toContain('impossível de copiar');
    });
});
