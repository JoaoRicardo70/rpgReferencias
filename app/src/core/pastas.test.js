import { describe, it, expect } from 'vitest';
import {
    SEPARADOR_PASTA, segmentosPasta, normalizarPasta, rotuloPasta, listarCaminhosPastas,
    construirArvorePastas, contarNaPasta, renomearCaminhoPasta,
} from './pastas';

const it_ = (id, pasta, extra = {}) => ({ id, nome: `N${id}`, pasta, ...extra });

describe('segmentosPasta', () => {
    it('separador é "/"', () => expect(SEPARADOR_PASTA).toBe('/'));
    it('divide por / e tira espaços', () => expect(segmentosPasta(' Taijutsu / Portões ')).toEqual(['Taijutsu', 'Portões']));
    it.each([[null], [undefined], [''], ['   '], [' / '], ['///']])('entrada %j => []', (v) => expect(segmentosPasta(v)).toEqual([]));
    it('ignora níveis vazios (A//B)', () => expect(segmentosPasta('A//B')).toEqual(['A', 'B']));
    it('barra no fim/começo é ignorada', () => {
        expect(segmentosPasta('A/B/')).toEqual(['A', 'B']);
        expect(segmentosPasta('/A/B')).toEqual(['A', 'B']);
    });
    it('converte não-string (número) sem lançar', () => expect(segmentosPasta(42)).toEqual(['42']));
    it('preserva acentos e maiúsculas', () => expect(segmentosPasta('Ação/ÓRFÃO')).toEqual(['Ação', 'ÓRFÃO']));
    it('espaços internos do nome são preservados', () => expect(segmentosPasta('Meu  Nome/Outro Nome')).toEqual(['Meu  Nome', 'Outro Nome']));
});

describe('normalizarPasta', () => {
    it.each([
        ['Taijutsu/Portões', 'Taijutsu/Portões'],
        [' A / B ', 'A/B'],
        ['A//B', 'A/B'],
        ['A/B/', 'A/B'],
        ['/A', 'A'],
        [' / ', ''],
        ['', ''],
        [null, ''],
        [undefined, ''],
        ['Simples', 'Simples'],
    ])('%j => %j', (entrada, saida) => expect(normalizarPasta(entrada)).toBe(saida));
    it('é idempotente', () => {
        ['A//B/', ' x / y / z ', '', null, '///', 'Ação / Ç'].forEach(v => {
            const uma = normalizarPasta(v);
            expect(normalizarPasta(uma)).toBe(uma);
        });
    });
    it('é sensível a maiúsculas (não muda caixa)', () => expect(normalizarPasta('a/B')).toBe('a/B'));
});

describe('rotuloPasta', () => {
    it('último nível', () => expect(rotuloPasta('Taijutsu/Portões')).toBe('Portões'));
    it('um nível só', () => expect(rotuloPasta('Taijutsu')).toBe('Taijutsu'));
    it('vazio/nulo => ""', () => {
        expect(rotuloPasta('')).toBe('');
        expect(rotuloPasta(null)).toBe('');
        expect(rotuloPasta(' / ')).toBe('');
    });
    it('ignora barra final', () => expect(rotuloPasta('A/B/')).toBe('B'));
});

describe('listarCaminhosPastas', () => {
    it('entrada nula/vazia => []', () => {
        expect(listarCaminhosPastas(null)).toEqual([]);
        expect(listarCaminhosPastas(undefined)).toEqual([]);
        expect(listarCaminhosPastas([])).toEqual([]);
    });
    it('inclui pastas-mãe e remove duplicados', () => {
        const r = listarCaminhosPastas([it_(1, 'A/B/C'), it_(2, 'A/B'), it_(3, 'A')]);
        expect(r).toEqual(['A', 'A/B', 'A/B/C']);
    });
    it('itens sem pasta e itens null não aparecem nem quebram', () => {
        expect(listarCaminhosPastas([null, undefined, it_(1, ''), it_(2, null), { id: 3 }, it_(4, 'X')])).toEqual(['X']);
    });
    it('ordena em pt-BR (acentos)', () => {
        const r = listarCaminhosPastas([it_(1, 'Zeta'), it_(2, 'Água'), it_(3, 'Abelha'), it_(4, 'Éter')]);
        expect(r).toEqual(['Abelha', 'Água', 'Éter', 'Zeta']);
    });
    it('normaliza variações ("A / B" e "A/B/" são o mesmo caminho)', () => {
        expect(listarCaminhosPastas([it_(1, 'A / B'), it_(2, 'A/B/')])).toEqual(['A', 'A/B']);
    });
    it('maiúsculas/minúsculas são pastas diferentes', () => {
        expect(listarCaminhosPastas([it_(1, 'fogo'), it_(2, 'Fogo')]).sort()).toEqual(['Fogo', 'fogo']);
    });
    it('aceita getPasta customizado', () => {
        expect(listarCaminhosPastas([{ x: 'A/B' }], (i) => i.x)).toEqual(['A', 'A/B']);
    });
});

describe('construirArvorePastas', () => {
    it('vazio/nulo', () => {
        expect(construirArvorePastas([])).toEqual({ semPasta: [], pastas: [] });
        expect(construirArvorePastas(null)).toEqual({ semPasta: [], pastas: [] });
    });
    it('só itens soltos', () => {
        const a = it_(1, ''), b = it_(2, undefined), c = it_(3, ' / ');
        const r = construirArvorePastas([a, b, c]);
        expect(r.semPasta).toEqual([a, b, c]);
        expect(r.pastas).toEqual([]);
    });
    it('ignora itens null', () => {
        const a = it_(1, 'A');
        const r = construirArvorePastas([null, a, undefined]);
        expect(r.pastas[0].itens).toEqual([a]);
        expect(r.semPasta).toEqual([]);
    });
    it('pasta de primeiro nível: itens diretos, sem filhos, total = nº de itens', () => {
        const a = it_(1, 'Fogo'), b = it_(2, 'Fogo');
        const r = construirArvorePastas([a, b]);
        expect(r.pastas).toHaveLength(1);
        expect(r.pastas[0]).toMatchObject({ nome: 'Fogo', caminho: 'Fogo', itens: [a, b], filhos: [], total: 2 });
    });
    it('aninha: itens diretos, filhos e total incluindo subpastas', () => {
        const a = it_(1, 'Taijutsu'), b = it_(2, 'Taijutsu/Portões'), c = it_(3, 'Taijutsu/Portões'), d = it_(4, 'Taijutsu/Portões/Extra'), e = it_(5, '');
        const r = construirArvorePastas([a, b, c, d, e]);
        expect(r.semPasta).toEqual([e]);
        expect(r.pastas).toHaveLength(1);
        const t = r.pastas[0];
        expect(t.itens).toEqual([a]);
        expect(t.total).toBe(4);
        expect(t.filhos).toHaveLength(1);
        const p = t.filhos[0];
        expect(p).toMatchObject({ nome: 'Portões', caminho: 'Taijutsu/Portões', total: 3 });
        expect(p.itens).toEqual([b, c]);
        expect(p.filhos[0]).toMatchObject({ nome: 'Extra', caminho: 'Taijutsu/Portões/Extra', itens: [d], filhos: [], total: 1 });
    });
    it('pasta-mãe sem itens diretos é criada implicitamente', () => {
        const r = construirArvorePastas([it_(1, 'A/B')]);
        expect(r.pastas[0].itens).toEqual([]);
        expect(r.pastas[0].total).toBe(1);
    });
    it('ordena pastas e subpastas alfabeticamente (pt-BR)', () => {
        const r = construirArvorePastas([it_(1, 'Zeta'), it_(2, 'Água/Z'), it_(3, 'Água/Á'), it_(4, 'Abelha')]);
        expect(r.pastas.map(p => p.nome)).toEqual(['Abelha', 'Água', 'Zeta']);
        expect(r.pastas[1].filhos.map(f => f.nome)).toEqual(['Á', 'Z']);
    });
    it('"A / B" e "A/B/" caem na mesma pasta', () => {
        const r = construirArvorePastas([it_(1, 'A / B'), it_(2, 'A/B/')]);
        expect(r.pastas).toHaveLength(1);
        expect(r.pastas[0].filhos).toHaveLength(1);
        expect(r.pastas[0].filhos[0].itens).toHaveLength(2);
    });
    it('"A//B" vira A > B', () => {
        const r = construirArvorePastas([it_(1, 'A//B')]);
        expect(r.pastas[0].filhos[0].caminho).toBe('A/B');
    });
    it('caixa diferente = pastas diferentes', () => {
        const r = construirArvorePastas([it_(1, 'fogo'), it_(2, 'Fogo')]);
        expect(r.pastas).toHaveLength(2);
    });
    it('mesmo nome em ramos diferentes não se mistura', () => {
        const r = construirArvorePastas([it_(1, 'A/X'), it_(2, 'B/X')]);
        expect(r.pastas.map(p => p.filhos[0].caminho)).toEqual(['A/X', 'B/X']);
    });
    it('não muta a lista de entrada', () => {
        const lista = [it_(1, 'B'), it_(2, 'A')];
        const copia = JSON.stringify(lista);
        construirArvorePastas(lista);
        expect(JSON.stringify(lista)).toBe(copia);
    });
    it('getPasta customizado', () => {
        const r = construirArvorePastas([{ g: 'A/B' }], (i) => i.g);
        expect(r.pastas[0].filhos[0].nome).toBe('B');
    });
    it('soma dos totais da raiz + semPasta = nº de itens', () => {
        const itens = [it_(1, 'A'), it_(2, 'A/B'), it_(3, 'C/D/E'), it_(4, ''), it_(5, 'C')];
        const r = construirArvorePastas(itens);
        expect(r.pastas.reduce((s, p) => s + p.total, 0) + r.semPasta.length).toBe(5);
    });
});

describe('contarNaPasta', () => {
    const arv = construirArvorePastas([
        it_(1, 'A', { ativa: true }), it_(2, 'A', { ativa: false }),
        it_(3, 'A/B', { ativa: true }), it_(4, 'A/B/C', { ativa: true }), it_(5, 'A/B/C'),
    ]);
    it('conta ativas em toda a subárvore (padrão)', () => expect(contarNaPasta(arv.pastas[0])).toBe(3));
    it('conta na subpasta', () => expect(contarNaPasta(arv.pastas[0].filhos[0])).toBe(2));
    it('teste customizado', () => expect(contarNaPasta(arv.pastas[0], () => true)).toBe(5));
    it('teste que nunca passa => 0', () => expect(contarNaPasta(arv.pastas[0], () => false)).toBe(0));
    it('nó nulo/undefined => 0', () => {
        expect(contarNaPasta(null)).toBe(0);
        expect(contarNaPasta(undefined)).toBe(0);
    });
    it('"ativa" truthy não-booleano conta', () => {
        const a = construirArvorePastas([it_(1, 'Z', { ativa: 1 })]);
        expect(contarNaPasta(a.pastas[0])).toBe(1);
    });
});

describe('renomearCaminhoPasta', () => {
    it('renomeia pasta simples', () => expect(renomearCaminhoPasta('Portões', 'Portões', 'Gates')).toBe('Gates'));
    it('move pasta para dentro de outra (levando subpastas)', () => {
        expect(renomearCaminhoPasta('Portões', 'Portões', 'Taijutsu/Portões')).toBe('Taijutsu/Portões');
        expect(renomearCaminhoPasta('Portões/Extra', 'Portões', 'Taijutsu/Portões')).toBe('Taijutsu/Portões/Extra');
        expect(renomearCaminhoPasta('Portões/Extra/Fundo', 'Portões', 'Taijutsu/Portões')).toBe('Taijutsu/Portões/Extra/Fundo');
    });
    it('renomeia subpasta no meio do caminho', () => {
        expect(renomearCaminhoPasta('A/B/C', 'A/B', 'A/Beta')).toBe('A/Beta/C');
    });
    it('tira pasta de dentro de outra (sobe ao primeiro nível)', () => {
        expect(renomearCaminhoPasta('A/B', 'A/B', 'B')).toBe('B');
        expect(renomearCaminhoPasta('A/B/C', 'A/B', 'B')).toBe('B/C');
    });
    it('caminho não relacionado não muda', () => {
        expect(renomearCaminhoPasta('Outra', 'Portões', 'X')).toBe('Outra');
        expect(renomearCaminhoPasta('Outra/Portões', 'Portões', 'X')).toBe('Outra/Portões');
    });
    it('só prefixo de segmento inteiro: "Portões2" NÃO está sob "Portões"', () => {
        expect(renomearCaminhoPasta('Portões2', 'Portões', 'X')).toBe('Portões2');
        expect(renomearCaminhoPasta('Portões2/Sub', 'Portões', 'X')).toBe('Portões2/Sub');
    });
    it('caminho mais curto que o antigo não muda (pasta-mãe)', () => {
        expect(renomearCaminhoPasta('A', 'A/B', 'X')).toBe('A');
    });
    it('é sensível a maiúsculas e a acentos', () => {
        expect(renomearCaminhoPasta('portões', 'Portões', 'X')).toBe('portões');
        expect(renomearCaminhoPasta('Portoes', 'Portões', 'X')).toBe('Portoes');
    });
    it('novo vazio remove a pasta: itens soltam-se', () => {
        expect(renomearCaminhoPasta('Portões', 'Portões', '')).toBe('');
        expect(renomearCaminhoPasta('Portões', 'Portões', '   ')).toBe('');
        expect(renomearCaminhoPasta('Portões', 'Portões', null)).toBe('');
    });
    it('novo vazio: subpastas sobem (perdem o prefixo removido)', () => {
        expect(renomearCaminhoPasta('Portões/Extra', 'Portões', '')).toBe('Extra');
    });
    it('antigo vazio/nulo => nada muda', () => {
        expect(renomearCaminhoPasta('A/B', '', 'X')).toBe('A/B');
        expect(renomearCaminhoPasta('A/B', null, 'X')).toBe('A/B');
        expect(renomearCaminhoPasta('A/B', ' / ', 'X')).toBe('A/B');
    });
    it('pasta do item vazia/nula => "" e sem lançar', () => {
        expect(renomearCaminhoPasta('', 'A', 'B')).toBe('');
        expect(renomearCaminhoPasta(null, 'A', 'B')).toBe('');
        expect(renomearCaminhoPasta(undefined, 'A', 'B')).toBe('');
    });
    it('tolera espaços/barras duplas no caminho e no novo nome', () => {
        expect(renomearCaminhoPasta(' A // B ', 'A', ' X / Y /')).toBe('X/Y/B');
    });
    it('renomear para o mesmo nome é neutro', () => {
        expect(renomearCaminhoPasta('A/B', 'A', 'A')).toBe('A/B');
    });
    it('mover pasta para dentro de si mesma (A -> A/A) é determinístico', () => {
        expect(renomearCaminhoPasta('A/B', 'A', 'A/A')).toBe('A/A/B');
    });
    it('resultado já está normalizado (idempotente)', () => {
        const r = renomearCaminhoPasta('P/Q', 'P', 'X/Y');
        expect(normalizarPasta(r)).toBe(r);
    });
});

describe('renomearCaminhoPasta - remover subpasta sobe pra pasta-mae', () => {
    it('remover A/B leva os itens de A/B e de A/B/C para A', () => {
        expect(renomearCaminhoPasta('A/B', 'A/B', '')).toBe('A');
        expect(renomearCaminhoPasta('A/B/C', 'A/B', '')).toBe('A/C');
    });
    it('remover pasta de primeiro nivel solta os itens', () => {
        expect(renomearCaminhoPasta('A', 'A', '')).toBe('');
        expect(renomearCaminhoPasta('A/C', 'A', '')).toBe('C');
    });
});
