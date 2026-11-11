import { describe, it, expect } from 'vitest';
import { montarPromptImportacao, escolherCategoriaImportada, prepararImportacao, prepararItemImportado, ROTULO_CATEGORIA, mudarCategoriaImportada } from './importadorIA';
import { DECLARACOES_CRIACAO, avaliarEquilibrio, normalizarPoder, CATEGORIAS_PODER } from './sextaFeiraCriacao';
import { abaDoPedido, categoriaDoPoder } from './grimorioLeitura';

const fh = (h) => ({ hierarquia: h, poderes: [] });
const linhaCategoria = (p) => p.split('\n').find(l => l.startsWith('- "categoria"'));

describe('montarPromptImportacao com categorias', () => {
    it('sem ficha: oferece as 6 categorias', () => {
        const l = linhaCategoria(montarPromptImportacao('texto', 'habilidade'));
        ['habilidade', 'forma', 'poder', 'ocular', 'infinity', 'singularidade'].forEach(id => expect(l).toContain(`"${id}"`));
    });
    it('ficha sem liberacao: so as 3 basicas e sem explicacao das especiais', () => {
        const l = linhaCategoria(montarPromptImportacao('texto', 'habilidade', fh({})));
        expect(l).not.toContain('"ocular"');
        expect(l).not.toContain('"infinity"');
        expect(l).not.toContain('"singularidade"');
        expect(l).not.toContain('Só use essas categorias especiais');
    });
    it('ficha com ocular liberado: inclui ocular e a explicacao, mas nao infinity', () => {
        const l = linhaCategoria(montarPromptImportacao('texto', 'habilidade', fh({ ocular: true })));
        expect(l).toContain('"ocular"');
        expect(l).toContain('Sharingan');
        expect(l).not.toContain('"infinity"');
    });
    it('aba aberta nao liberada continua oferecida (e e o padrao)', () => {
        const p = montarPromptImportacao('texto', 'infinity', fh({}));
        expect(linhaCategoria(p)).toContain('"infinity"');
        expect(p).toContain('"categoria": "infinity"');
        expect(p).toContain('Infinities'.toLowerCase());
    });
    it('categoria desconhecida cai em habilidade', () => {
        const p = montarPromptImportacao('texto', 'xyz', fh({}));
        expect(p).toContain('"categoria": "habilidade"');
    });
    it('rotulos por categoria', () => {
        expect(ROTULO_CATEGORIA.ocular).toBe('Poderes Oculares');
        expect(ROTULO_CATEGORIA.singularidade).toBe('Singularidades');
    });
    it('texto do usuario entra no prompt', () => {
        expect(montarPromptImportacao('Sharingan: copia golpes', 'ocular', fh({ ocular: true }))).toContain('Sharingan: copia golpes');
    });
});

describe('escolherCategoriaImportada', () => {
    it('inexistente -> aba aberta com aviso', () => {
        const r = escolherCategoriaImportada('legado', 'poder', null);
        expect(r.categoria).toBe('poder');
        expect(r.avisos[0]).toContain('legado');
    });
    it('inexistente + aba aberta infinity nao liberada: mantem infinity com 2 avisos', () => {
        const r = escolherCategoriaImportada('xx', 'infinity', fh({}));
        expect(r.categoria).toBe('infinity');
        expect(r.avisos).toHaveLength(2);
    });
    it('vazia/null/undefined: sem aviso e usa a aba aberta', () => {
        [undefined, null, '', '  '].forEach((v) => {
            const r = escolherCategoriaImportada(v, 'forma', null);
            expect(r).toEqual({ categoria: 'forma', avisos: [] });
        });
    });
    it('padrao invalido -> habilidade', () => {
        expect(escolherCategoriaImportada(undefined, 'zzz', null).categoria).toBe('habilidade');
    });
    it('plural/apelido normalizados', () => {
        expect(escolherCategoriaImportada('Infinities', 'habilidade', null).categoria).toBe('infinity');
        expect(escolherCategoriaImportada('olhos', 'habilidade', null).categoria).toBe('ocular');
    });
    it('nao liberada e diferente da aba aberta -> habilidade com aviso', () => {
        const r = escolherCategoriaImportada('ocular', 'poder', fh({}));
        expect(r.categoria).toBe('habilidade');
        expect(r.avisos.join(' ')).toContain('não liberada');
    });
    it('nao liberada mas e a aba aberta -> fica, com aviso', () => {
        const r = escolherCategoriaImportada('singularidade', 'singularidade', fh({}));
        expect(r.categoria).toBe('singularidade');
        expect(r.avisos).toHaveLength(1);
    });
    it('liberada: sem aviso', () => {
        expect(escolherCategoriaImportada('ocular', 'poder', fh({ ocular: true }))).toEqual({ categoria: 'ocular', avisos: [] });
        expect(escolherCategoriaImportada('singularidade', 'poder', fh({ singularidade: '0' }))).toEqual({ categoria: 'singularidade', avisos: [] });
    });
    it('sem ficha, categoria especial passa sem aviso', () => {
        expect(escolherCategoriaImportada('infinity', 'habilidade')).toEqual({ categoria: 'infinity', avisos: [] });
    });
    it('zero-width na categoria da IA', () => {
        expect(escolherCategoriaImportada('ocular​', 'poder', null).categoria).toBe('ocular');
    });
});

describe('prepararImportacao com ficha', () => {
    it('item ocular com ficha liberada grava maestria + maestriaRequerida', () => {
        const [it1] = prepararImportacao([{ nome: 'Sharingan', descricao: 'd', categoria: 'ocular' }], 'habilidade', 1, fh({ ocular: true }));
        expect(it1.objeto.categoria).toBe('ocular');
        expect(it1.objeto).toHaveProperty('maestria');
        expect(it1.objeto).toHaveProperty('maestriaRequerida');
        expect(it1.objeto.fadigaPorUso).toBeUndefined();
        expect(it1.avisos).toEqual([]);
    });
    it('item nao liberado cai em habilidade com aviso', () => {
        const [it1] = prepararImportacao([{ nome: 'Rin', categoria: 'infinity' }], 'poder', 1, fh({}));
        expect(it1.objeto.categoria).toBe('habilidade');
        expect(it1.avisos.some(a => a.includes('não liberada'))).toBe(true);
    });
    it('sem ficha (compat): categoria preservada', () => {
        const r = prepararItemImportado({ nome: 'S', categoria: 'singularidade' }, 'habilidade');
        expect(r.objeto.categoria).toBe('singularidade');
    });
    it('mudarCategoriaImportada aceita as novas', () => {
        const novo = mudarCategoriaImportada({ nome: 'x', categoria: 'forma', fadigaPorUso: 5 }, 'ocular');
        expect(novo.categoria).toBe('ocular');
        expect(novo.fadigaPorUso).toBeUndefined();
        expect(novo.maestriaRequerida).toBe(0);
        const obj = { nome: 'x', categoria: 'poder' };
        expect(mudarCategoriaImportada(obj, 'xyz')).toBe(obj);
    });
});

describe('Sexta-Feira (schema e avisos)', () => {
    it('enum de categoria do schema tem as 6 ids', () => {
        const enumCat = DECLARACOES_CRIACAO[0].parameters.properties.categoria.enum;
        expect(enumCat).toEqual(['habilidade', 'forma', 'poder', 'ocular', 'infinity', 'singularidade']);
        expect(CATEGORIAS_PODER).toEqual(enumCat);
    });
    it('normalizarPoder aceita as novas e grava maestria/maestriaRequerida', () => {
        ['ocular', 'infinity', 'singularidade'].forEach((c) => {
            const r = normalizarPoder({ nome: 'N', categoria: c, maestria: 30, maestriaRequerida: 20 });
            expect(r.objeto.categoria).toBe(c);
            expect(r.objeto.maestria).toBe(30);
            expect(r.objeto.maestriaRequerida).toBe(20);
            expect(r.objeto.fadigaPorUso).toBeUndefined();
        });
    });
    it('avaliarEquilibrio avisa categoria nao liberada, sem bloquear', () => {
        const av = avaliarEquilibrio('poder', { categoria: 'ocular', dadosQtd: 0 }, fh({}));
        expect(av.some(a => a.includes('não liberada'))).toBe(true);
    });
    it('avaliarEquilibrio nao avisa quando liberada ou categoria base', () => {
        expect(avaliarEquilibrio('poder', { categoria: 'ocular', dadosQtd: 0 }, fh({ ocular: true })).some(a => a.includes('não liberada'))).toBe(false);
        expect(avaliarEquilibrio('poder', { categoria: 'habilidade', dadosQtd: 0 }, fh({})).some(a => a.includes('não liberada'))).toBe(false);
    });
    it('avaliarEquilibrio so avisa para tipo poder', () => {
        expect(avaliarEquilibrio('magia', { categoria: 'ocular' }, fh({}))).not.toContain(expect.stringContaining('não liberada'));
    });
});

describe('grimorioLeitura', () => {
    it('abaDoPedido usa categoriaDoPoderFicha', () => {
        expect(abaDoPedido({ tipo: 'poder', objeto: { categoria: 'ocular' } })).toBe('ocular');
        expect(abaDoPedido({ tipo: 'poder', objeto: { categoria: 'Infinities' } })).toBe('infinity');
        expect(abaDoPedido({ tipo: 'poder', objeto: { categoria: 'singularidade' } })).toBe('singularidade');
        expect(abaDoPedido({ tipo: 'poder', objeto: {} })).toBe('poder');
        expect(abaDoPedido({ tipo: 'poder', objeto: { categoria: 'legado' } })).toBe('habilidade');
        expect(abaDoPedido({ tipo: 'poder', objeto: null })).toBe('poder');
        expect(abaDoPedido(null)).toBeNull();
        expect(abaDoPedido({ tipo: 'magia' })).toBe('magias');
        expect(abaDoPedido({ tipo: 'item' })).toBe('inventario');
        expect(abaDoPedido({ tipo: 'combo' })).toBe('combos');
        expect(abaDoPedido({ tipo: 'xx' })).toBeNull();
    });
    it('categoriaDoPoder: dados antigos sem categoria = poder', () => {
        expect(categoriaDoPoder({ nome: 'velho' })).toBe('poder');
        expect(categoriaDoPoder(undefined)).toBe('poder');
    });
});
