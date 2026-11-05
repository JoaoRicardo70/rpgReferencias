import { describe, it, expect } from 'vitest';
import { lerRespostaDaIA, montarPromptImportacao } from './importadorIA.js';

const A = { nome: 'A', custo: 1 };
const B = { nome: 'B', custo: 2 };
const json = (o) => JSON.stringify(o);

describe('lerRespostaDaIA - formatos aceitos', () => {
    it('lista na raiz', () => {
        expect(lerRespostaDaIA(json([A, B]))).toEqual({ ok: true, itens: [A, B] });
    });
    it.each(['poderes', 'habilidades', 'formas', 'itens', 'poder', 'habilidade', 'forma', 'items', 'abilities'])(
        'lista sob a chave "%s"', (chave) => {
            expect(lerRespostaDaIA(json({ [chave]: [A, B] }))).toEqual({ ok: true, itens: [A, B] });
        });
    it('objeto unico que ja e um poder vira lista de 1', () => {
        expect(lerRespostaDaIA(json(A))).toEqual({ ok: true, itens: [A] });
    });
    it('poder solto com "efeitos" NAO vira a lista de efeitos', () => {
        const p = { nome: 'Sharingan', efeitos: [{ atributo: 'Visao', propriedade: 'BASE', valor: 2 }] };
        const r = lerRespostaDaIA(json(p));
        expect(r.ok).toBe(true);
        expect(r.itens).toEqual([p]);
    });
    it('lista generica sob chave desconhecida', () => {
        const r = lerRespostaDaIA(json({ sharingan: [A, B] }));
        expect(r).toEqual({ ok: true, itens: [A, B] });
    });
    it('lista generica aceita se tiver ao menos um objeto (mistura com primitivos)', () => {
        const r = lerRespostaDaIA(json({ xyz: [1, 'a', A] }));
        expect(r).toEqual({ ok: true, itens: [A] });
    });
    it('mapa por nome vira lista dos valores', () => {
        const r = lerRespostaDaIA(json({ 'Fogo': { nome: 'Fogo', custo: 1 }, 'Gelo': { nome: 'Gelo', custo: 2 } }));
        expect(r).toEqual({ ok: true, itens: [{ nome: 'Fogo', custo: 1 }, { nome: 'Gelo', custo: 2 }] });
    });
    it('mapa por nome ignora valores sem nome', () => {
        const r = lerRespostaDaIA(json({ Fogo: { nome: 'Fogo' }, lixo: { x: 1 }, n: 3 }));
        expect(r).toEqual({ ok: true, itens: [{ nome: 'Fogo' }] });
    });
});

describe('lerRespostaDaIA - prioridade', () => {
    it('poderes vence habilidades e as demais', () => {
        const r = lerRespostaDaIA(json({ abilities: [{ nome: 'z' }], habilidades: [B], poderes: [A] }));
        expect(r.itens).toEqual([A]);
    });
    it('habilidades vence formas; formas vence itens', () => {
        expect(lerRespostaDaIA(json({ formas: [A], habilidades: [B] })).itens).toEqual([B]);
        expect(lerRespostaDaIA(json({ itens: [A], formas: [B] })).itens).toEqual([B]);
    });
    it('chave conhecida vence poder solto (objeto com nome)', () => {
        const r = lerRespostaDaIA(json({ nome: 'Raiz', poderes: [A] }));
        expect(r.itens).toEqual([A]);
    });
    it('poder solto vence lista generica (efeitos)', () => {
        const p = { nome: 'P', outros: [{ x: 1 }] };
        expect(lerRespostaDaIA(json(p)).itens).toEqual([p]);
    });
    it('lista generica vence mapa por nome', () => {
        const r = lerRespostaDaIA(json({ M: { nome: 'M' }, lista: [A] }));
        expect(r.itens).toEqual([A]);
    });
});

describe('lerRespostaDaIA - texto em volta e cercas', () => {
    it.each([
        ['cerca ```json', (s) => '```json\n' + s + '\n```'],
        ['cerca ``` simples', (s) => '```\n' + s + '\n```'],
        ['texto antes e depois', (s) => 'Aqui esta o resultado:\n' + s + '\nEspero ter ajudado!'],
        ['cerca com texto em volta', (s) => 'Claro!\n```json\n' + s + '\n```\nQualquer coisa avise.'],
    ])('%s', (_n, envolver) => {
        expect(lerRespostaDaIA(envolver(json({ poderes: [A] })))).toEqual({ ok: true, itens: [A] });
        expect(lerRespostaDaIA(envolver(json([A])))).toEqual({ ok: true, itens: [A] });
        expect(lerRespostaDaIA(envolver(json({ sharingan: [A] })))).toEqual({ ok: true, itens: [A] });
        expect(lerRespostaDaIA(envolver(json(A)))).toEqual({ ok: true, itens: [A] });
    });
    it('colchetes soltos nao parseaveis antes do JSON nao atrapalham', () => {
        expect(lerRespostaDaIA('veja [nota] abaixo: ' + json({ poderes: [A] }))).toEqual({ ok: true, itens: [A] });
    });
    it('colchetes soltos PARSEAVEIS ("veja [1]") antes do JSON nao atrapalham', () => {
        expect(lerRespostaDaIA('veja [1] abaixo: ' + json({ poderes: [A] }))).toEqual({ ok: true, itens: [A] });
    });
});

describe('lerRespostaDaIA - erros', () => {
    it('sem JSON', () => {
        const r = lerRespostaDaIA('so texto');
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/Não achei um JSON/);
    });
    it('vazio, null e undefined', () => {
        for (const v of ['', null, undefined]) expect(lerRespostaDaIA(v).ok).toBe(false);
    });
    it('JSON quebrado', () => {
        const r = lerRespostaDaIA('{"poderes": [ {"nome": "A", ] }');
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/incompleto|erro|Não achei/);
    });
    it('objeto so com valores primitivos => erro com chaves', () => {
        const r = lerRespostaDaIA(json({ a: 1, b: 'x', c: true }));
        expect(r.ok).toBe(false);
        expect(r.erro).toContain('não achei nele a lista de habilidades');
        expect(r.erro).toContain('(chaves encontradas: a, b, c)');
        expect(r.erro).toContain('{"poderes": [ ... ]}');
    });
    it('lista so de nao-objetos sob chave desconhecida => erro (nao e lista generica)', () => {
        const r = lerRespostaDaIA(json({ tags: ['a', 'b'], n: [1, 2] }));
        expect(r.ok).toBe(false);
        expect(r.erro).toContain('(chaves encontradas: tags, n)');
    });
    it('objeto vazio => erro sem trecho de chaves', () => {
        const r = lerRespostaDaIA('{}');
        expect(r.ok).toBe(false);
        expect(r.erro).toContain('não achei nele a lista de habilidades');
        expect(r.erro).not.toContain('chaves encontradas');
    });
    it('mensagem lista no maximo 8 chaves', () => {
        const o = {};
        for (let i = 1; i <= 12; i++) o['k' + i] = i;
        const r = lerRespostaDaIA(json(o));
        expect(r.erro).toContain('(chaves encontradas: k1, k2, k3, k4, k5, k6, k7, k8)');
        expect(r.erro).not.toContain('k9');
    });
    it('mapa sem nenhum valor com nome => erro', () => {
        const r = lerRespostaDaIA(json({ x: { custo: 1 }, y: { custo: 2 } }));
        expect(r.ok).toBe(false);
        expect(r.erro).toContain('(chaves encontradas: x, y)');
    });
    it('nome nao-string nao e poder solto', () => {
        const r = lerRespostaDaIA(json({ nome: 5 }));
        expect(r.ok).toBe(false);
        expect(r.erro).toContain('(chaves encontradas: nome)');
    });
    it('lista vazia na raiz => erro de lista vazia', () => {
        const r = lerRespostaDaIA('[]');
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/vazia/);
    });
    it('so chaves conhecidas vazias => erro "nao achei" com as chaves', () => {
        const r = lerRespostaDaIA('{"poderes": []}');
        expect(r.ok).toBe(false);
        expect(r.erro).toContain('(chaves encontradas: poderes)');
        const r2 = lerRespostaDaIA('{"poderes": [], "habilidades": []}');
        expect(r2.ok).toBe(false);
        expect(r2.erro).toContain('(chaves encontradas: poderes, habilidades)');
    });
    it('poder solto SEM nome mas com efeitos => erro', () => {
        const r = lerRespostaDaIA(json({ custo: 3, efeitos: [{ atributo: 'Forca', propriedade: 'BASE', valor: 1 }] }));
        expect(r.ok).toBe(false);
        expect(r.erro).toContain('(chaves encontradas: custo, efeitos)');
    });
    it('lista generica de objetos SEM nome nao e aceita', () => {
        expect(lerRespostaDaIA(json({ xyz: [{ custo: 1 }] })).ok).toBe(false);
    });
    it('chave conhecida vazia nao vence outra preenchida', () => {
        expect(lerRespostaDaIA(json({ poderes: [], habilidades: [{ nome: 'A' }] }))).toEqual({ ok: true, itens: [{ nome: 'A' }] });
    });
    it('vence a PRIMEIRA preenchida na ordem das chaves', () => {
        expect(lerRespostaDaIA(json({ poderes: [], formas: [B], itens: [A] })).itens).toEqual([B]);
    });
    it('chave conhecida vazia + poder solto com nome => poder solto', () => {
        const p = { nome: 'P', poderes: [] };
        expect(lerRespostaDaIA(json(p)).itens).toEqual([p]);
    });
    it('lista na raiz so de nao-objetos => erro (vazia apos filtro)', () => {
        const r = lerRespostaDaIA('[1, "a", null]');
        expect(r.ok).toBe(false);
    });
    it('primitivo JSON na raiz nao e lido como lista', () => {
        // "42" nao contem { ou [ => nao ha JSON
        expect(lerRespostaDaIA('42').ok).toBe(false);
    });
});

describe('lerRespostaDaIA - filtro de itens', () => {
    it('itens nao-objeto dentro da lista sao filtrados', () => {
        const r = lerRespostaDaIA(json({ poderes: [A, 1, 'x', null, [B], true, B] }));
        expect(r).toEqual({ ok: true, itens: [A, B] });
    });
    it('filtro tambem vale para a raiz e lista generica', () => {
        expect(lerRespostaDaIA(json([A, null, 3])).itens).toEqual([A]);
        expect(lerRespostaDaIA(json({ outra: [null, A, 'z'] })).itens).toEqual([A]);
    });
    it('lista com so lixo sob chave conhecida => erro de vazia', () => {
        const r = lerRespostaDaIA(json({ poderes: [1, 'a', null] }));
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/vazia/);
    });
});

describe('lerRespostaDaIA - prompt colado por engano', () => {
    it.each(['habilidade', 'poder', 'forma'])('prompt de %s => erro especifico, nunca ok', (cat) => {
        const prompt = montarPromptImportacao('Texto da ficha com Sharingan', cat);
        expect(prompt).toContain('Atue como extrator');
        const r = lerRespostaDaIA(prompt);
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/^Você colou a instrução \(o prompt\) em vez da resposta da IA/);
    });
    it('prompt dentro de cerca e com texto em volta', () => {
        const prompt = montarPromptImportacao('x');
        expect(lerRespostaDaIA('```\n' + prompt + '\n```').ok).toBe(false);
        expect(lerRespostaDaIA('Oi ' + prompt + ' tchau').erro).toMatch(/Você colou a instrução/);
    });
    it('deteccao ignora maiusculas', () => {
        const r = lerRespostaDaIA('ATUE COMO EXTRATOR ' + json({ poderes: [A] }));
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/Você colou a instrução/);
    });
    it('JSON valido junto da frase tambem e recusado (checagem vem antes da extracao)', () => {
        expect(lerRespostaDaIA('Atue como extrator ' + json([A])).ok).toBe(false);
    });
});
