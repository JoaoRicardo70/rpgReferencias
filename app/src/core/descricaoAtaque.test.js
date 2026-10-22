import { describe, it, expect } from 'vitest';
import {
    novaDescricao, normalizarDescricoes, escolherDescricao, aplicarMarcadores, montarComplemento, montarNarrativa,
    MAX_DESCRICOES_POR_ITEM, MAX_CARACTERES_DESCRICAO, MAX_CARACTERES_NARRATIVA
} from './descricaoAtaque';

describe('novaDescricao', () => {
    it('ids únicos e texto limitado', () => {
        const ids = new Set(Array.from({ length: 200 }, () => novaDescricao().id));
        expect(ids.size).toBe(200);
        expect(novaDescricao('a'.repeat(900)).texto.length).toBe(MAX_CARACTERES_DESCRICAO);
        expect(novaDescricao().texto).toBe('');
    });
});

describe('normalizarDescricoes', () => {
    it('não-array → []', () => {
        [null, undefined, 'x', 5, {}].forEach(v => expect(normalizarDescricoes(v)).toEqual([]));
    });
    it('remove vazias, não-objetos e gera id', () => {
        const r = normalizarDescricoes([{ id: 'a', texto: 'oi' }, { id: 'b', texto: '   ' }, null, 'x', { texto: 'sem id' }, { id: 'c' }]);
        expect(r.map(d => d.texto)).toEqual(['oi', 'sem id']);
        expect(r[1].id).toBeTruthy();
    });
    it('manterVazias mantém textos em branco', () => {
        expect(normalizarDescricoes([{ id: 'a', texto: '' }, { id: 'b' }], true)).toEqual([{ id: 'a', texto: '' }, { id: 'b', texto: '' }]);
    });
    it('limites de 8 itens e 600 caracteres', () => {
        const lista = Array.from({ length: 12 }, (_, i) => ({ id: 'i' + i, texto: 'x'.repeat(700) }));
        const r = normalizarDescricoes(lista);
        expect(r).toHaveLength(MAX_DESCRICOES_POR_ITEM);
        expect(r[0].texto.length).toBe(600);
        expect(normalizarDescricoes(lista, true)).toHaveLength(8);
    });
});

describe('escolherDescricao', () => {
    const lista = [{ id: '1', texto: ' A ' }, { id: '2', texto: 'B' }, { id: '3', texto: 'C' }];
    it('lista vazia/sem preenchidas → null', () => {
        expect(escolherDescricao([])).toBeNull();
        expect(escolherDescricao(undefined)).toBeNull();
        expect(escolherDescricao([{ id: '1', texto: ' ' }])).toBeNull();
    });
    it('usa aleatório injetado e faz trim', () => {
        expect(escolherDescricao(lista, () => 0)).toBe('A');
        expect(escolherDescricao(lista, () => 0.4)).toBe('B');
        expect(escolherDescricao(lista, () => 0.99)).toBe('C');
    });
    it('aleatório fora da faixa não estoura índice', () => {
        expect(escolherDescricao(lista, () => 1)).toBe('C');
        expect(escolherDescricao(lista, () => -3)).toBe('A');
    });
    it('ignora vazias na escolha', () => {
        expect(escolherDescricao([{ id: '1', texto: '' }, { id: '2', texto: 'Z' }], () => 0)).toBe('Z');
    });
});

describe('aplicarMarcadores', () => {
    it('troca todos com dados, inclusive repetidos', () => {
        expect(aplicarMarcadores('{atacante} fere {alvo} com {arma} usando {tecnica} ({elemento}) {alvo}',
            { atacante: 'Ana', alvo: 'Bob', arma: 'Espada', tecnica: 'Corte', elemento: 'Fogo' }))
            .toBe('Ana fere Bob com Espada usando Corte (Fogo) Bob');
    });
    it('sem dados usa palavras neutras', () => {
        expect(aplicarMarcadores('{atacante}|{alvo}|{arma}|{tecnica}|{elemento}')).toBe('o atacante|o alvo|sua arma|a técnica|a energia');
    });
    it('texto nulo → string vazia; $ no valor é literal', () => {
        expect(aplicarMarcadores(null)).toBe('');
        expect(aplicarMarcadores('{alvo}', { alvo: '$&' })).toBe('$&');
    });
});

describe('montarComplemento', () => {
    it('vazio sem nada', () => {
        expect(montarComplemento()).toBe('');
        expect(montarComplemento({})).toBe('');
    });
    it('ativos únicos, até 5 + "e mais N"', () => {
        const ativos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A'].map(nome => ({ nome }));
        expect(montarComplemento({ ativos })).toBe('Ativos: A, B, C, D, E e mais 2');
        expect(montarComplemento({ ativos: [{ nome: 'A' }, { nome: '' }, null, {}] })).toBe('Ativos: A');
    });
    it('elemento físico/neutro omitido; outro capitalizado', () => {
        ['fisico', 'Físico', 'neutro', 'nenhum', '', null].forEach(e => expect(montarComplemento({ elemento: e })).toBe(''));
        expect(montarComplemento({ elemento: 'fogo' })).toBe('Elemento: Fogo');
    });
    it('energias em rótulo', () => {
        const c = montarComplemento({ energias: ['mana', 'aura'] });
        expect(c.startsWith('Energia: ')).toBe(true);
        expect(c).toContain(' + ');
        expect(c).not.toContain('mana');
        expect(montarComplemento({ energias: [] })).toBe('');
    });
    it('crítico e fatal; junta com " · "', () => {
        expect(montarComplemento({ critico: 'critico' })).toBe('Crítico!');
        expect(montarComplemento({ critico: 'fatal' })).toBe('Crítico Fatal!');
        expect(montarComplemento({ ativos: [{ nome: 'X' }], elemento: 'Gelo', critico: 'critico' })).toBe('Ativos: X · Elemento: Gelo · Crítico!');
    });
});

describe('montarNarrativa', () => {
    const d = (texto) => [{ id: '1', texto }];
    it('null sem descrições', () => {
        expect(montarNarrativa()).toBeNull();
        expect(montarNarrativa({ fontes: [] })).toBeNull();
        expect(montarNarrativa({ fontes: [{ nome: 'x', descricoes: [] }, null, { nome: 'y' }] })).toBeNull();
    });
    it('arma usa tipo arma para {arma}; técnica não', () => {
        const r = montarNarrativa({
            atacante: 'Ana', alvo: 'Bob',
            fontes: [{ nome: 'Katana', tipo: 'arma', descricoes: d('{atacante} saca {arma}') }, { nome: 'Corte', descricoes: d('{tecnica} em {alvo}; arma {arma}') }]
        });
        expect(r.texto).toBe('Ana saca Katana. Corte em Bob; arma sua arma.');
    });
    it('pontuação: não duplica . ! ? …', () => {
        const r = montarNarrativa({ fontes: ['a.', 'b!', 'c?', 'd…', 'e'].map((t, i) => ({ nome: 'n' + i, descricoes: d(t) })) });
        expect(r.texto).toBe('a. b! c? d… e.');
    });
    it('retorna complemento', () => {
        const r = montarNarrativa({ fontes: [{ nome: 'n', descricoes: d('oi') }], ativos: [{ nome: 'Forma' }], critico: 'fatal' });
        expect(r.complemento).toBe('Ativos: Forma · Crítico Fatal!');
    });
    it('trunca em MAX_CARACTERES_NARRATIVA', () => {
        const fontes = Array.from({ length: 5 }, (_, i) => ({ nome: 'n' + i, descricoes: d('x'.repeat(590)) }));
        const r = montarNarrativa({ fontes });
        expect(r.texto.length).toBe(MAX_CARACTERES_NARRATIVA);
        expect(r.texto.endsWith('…')).toBe(true);
    });
    it('aleatório injetado escolhe entre várias', () => {
        const fontes = [{ nome: 'n', descricoes: [{ id: '1', texto: 'um' }, { id: '2', texto: 'dois' }] }];
        expect(montarNarrativa({ fontes, aleatorio: () => 0 }).texto).toBe('um.');
        expect(montarNarrativa({ fontes, aleatorio: () => 0.9 }).texto).toBe('dois.');
    });
});
