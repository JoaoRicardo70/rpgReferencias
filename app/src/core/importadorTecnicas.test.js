import { describe, it, expect } from 'vitest';
import {
    montarPromptTecnicas, lerRespostaTecnicas, prepararTecnicaImportada, prepararImportacaoTecnicas,
    trocarElementoDaPrevia, resumirTecnicaImportada, montarTecnicaFinal, ENERGIAS_TECNICA,
} from './importadorTecnicas';
import { lerRespostaDaIA } from './importadorIA';
import { ESTADOS } from './condicoes';

const ELEMS = ['Fogo', 'Agua', 'Neutro', 'Truques de Ciclo', 'Elemento Nevoa'];
const op = { elementos: ELEMS, elementoPadrao: 'Neutro' };
const prep = (bruto, o = op) => prepararTecnicaImportada(bruto, o);

describe('prepararTecnicaImportada - happy path', () => {
    it('tecnica completa vira objeto no formato de ficha.ataquesElementais', () => {
        const r = prep({
            nome: 'Bola de Fogo', descricao: 'Uma bola', elemento: 'Fogo', danoQtd: 3, danoFaces: 10,
            custoPercentual: 10, custoPercentualMax: 30, energiaCombustao: 'mana', tipoMecanica: 'saving', savingAttr: 'constituicao',
            alcance: 5, area: 2, alvosAfetados: 'inimigos', duracao: 3, elementosAfetados: 'Gelo',
        });
        expect(r.valido).toBe(true);
        expect(r.avisos).toEqual([]);
        expect(r.objeto).toMatchObject({
            nome: 'Bola de Fogo', descricao: 'Uma bola', elemento: 'Fogo', dadosExtraQtd: 3, dadosExtraFaces: 10,
            custoValor: 10, custoValorMax: 30, energiaCombustao: 'mana', tipoMecanica: 'saving', savingAttr: 'constituicao',
            alcanceQuad: 5, areaQuad: 2, alvosAfetados: 'inimigos', duracaoZona: 3, elementosAfetados: 'Gelo',
            equipado: false, bonusTipo: 'nenhum', semComoPoder: false,
        });
    });
    it('aceita aliases dadosQtd/dadosFaces/custoValor/alcanceQuad', () => {
        const r = prep({ nome: 'X', dadosQtd: 2, dadosFaces: 6, custoValor: 5, alcanceQuad: 3, areaQuad: 1, duracaoZona: 2 });
        expect(r.objeto).toMatchObject({ dadosExtraQtd: 2, dadosExtraFaces: 6, custoValor: 5, alcanceQuad: 3, areaQuad: 1, duracaoZona: 2 });
    });
    it('aceita numeros com virgula decimal em string', () => {
        expect(prep({ nome: 'X', custoPercentual: '12,5' }).objeto.custoValor).toBe(12.5);
    });
    it('defaults: alcance 1, area 0, ataque, destreza, todos, flexivel', () => {
        const o = prep({ nome: 'X' }).objeto;
        expect(o).toMatchObject({ alcanceQuad: 1, areaQuad: 0, tipoMecanica: 'ataque', savingAttr: 'destreza', alvosAfetados: 'todos', energiaCombustao: 'flexivel', dadosExtraQtd: 0 });
    });
});

describe('prepararTecnicaImportada - elemento', () => {
    it('casa sem acento e sem diferenciar maiuscula com o nome conhecido', () => {
        const r = prep({ nome: 'X', elemento: 'elemento NEVOA' });
        expect(r.objeto.elemento).toBe('Elemento Nevoa');
        expect(r.avisos).toEqual([]);
        expect(prep({ nome: 'X', elemento: 'fógo' }).objeto.elemento).toBe('Fogo');
    });
    it('elemento desconhecido: usa o padrao e avisa', () => {
        const r = prep({ nome: 'X', elemento: 'Plasma' });
        expect(r.objeto.elemento).toBe('Neutro');
        expect(r.avisos.some(a => /Plasma/.test(a) && /não existe/.test(a))).toBe(true);
    });
    it('elemento igual ao padrao ou vazio: sem aviso', () => {
        expect(prep({ nome: 'X', elemento: 'neutro' }).avisos).toEqual([]);
        expect(prep({ nome: 'X' }).avisos).toEqual([]);
    });
    it('elemento padrao customizado e usado no fallback', () => {
        expect(prep({ nome: 'X', elemento: 'Zzz' }, { elementos: ELEMS, elementoPadrao: 'Agua' }).objeto.elemento).toBe('Agua');
    });
});

describe('prepararTecnicaImportada - dados e limites', () => {
    it('Fogo 10d10 e cortado para 5d10 com aviso', () => {
        const r = prep({ nome: 'X', elemento: 'Fogo', danoQtd: 10, danoFaces: 10 });
        expect(r.objeto).toMatchObject({ dadosExtraQtd: 5, dadosExtraFaces: 10 });
        expect(r.avisos.some(a => /Limite de dados/.test(a) && /10d10/.test(a))).toBe(true);
    });
    it('dentro do limite (5d10) nao avisa', () => {
        const r = prep({ nome: 'X', elemento: 'Fogo', danoQtd: 5, danoFaces: 10 });
        expect(r.objeto.dadosExtraQtd).toBe(5);
        expect(r.avisos).toEqual([]);
    });
    it('elemento sem limite (Neutro) nao corta', () => {
        expect(prep({ nome: 'X', danoQtd: 100, danoFaces: 20 }).objeto.dadosExtraQtd).toBe(100);
    });
    it('qtd sem faces: avisa que nao ha faces', () => {
        const r = prep({ nome: 'X', danoQtd: 5, danoFaces: 0 });
        expect(r.avisos.some(a => /não as faces/.test(a))).toBe(true);
    });
    it('qtd sem faces: o aviso diz "ficou sem dano", entao dadosExtraQtd deve ser 0', () => {
        const r = prep({ nome: 'X', danoQtd: 5, danoFaces: 0 });
        expect(r.objeto.dadosExtraQtd).toBe(0);
    });
    it('valores negativos e lixo viram 0; enormes sao limitados a 1000', () => {
        expect(prep({ nome: 'X', danoQtd: -3, danoFaces: 'abc' }).objeto.dadosExtraQtd).toBe(0);
        expect(prep({ nome: 'X', danoQtd: 99999, danoFaces: 1 }).objeto.dadosExtraQtd).toBe(1000);
    });
    it('quantidade fracionaria e truncada', () => {
        expect(prep({ nome: 'X', danoQtd: 2.9, danoFaces: 6 }).objeto.dadosExtraQtd).toBe(2);
    });
});

describe('prepararTecnicaImportada - energia, mecanica, alvos, custo', () => {
    it('energia invalida vira flexivel com aviso', () => {
        const r = prep({ nome: 'X', energiaCombustao: 'plasma' });
        expect(r.objeto.energiaCombustao).toBe('flexivel');
        expect(r.avisos.some(a => /plasma/.test(a))).toBe(true);
    });
    it('energia valida com acento/maiuscula e aceita', () => {
        expect(prep({ nome: 'X', energiaCombustao: ' MANA ' }).objeto.energiaCombustao).toBe('mana');
        ENERGIAS_TECNICA.forEach(e => expect(prep({ nome: 'X', energiaCombustao: e }).objeto.energiaCombustao).toBe(e));
    });
    it('Truque forca energia livre', () => {
        expect(prep({ nome: 'X', elemento: 'Truques de Ciclo', energiaCombustao: 'mana' }).objeto.energiaCombustao).toBe('livre');
        expect(prep({ nome: 'X', elemento: 'Truques de Ciclo' }).objeto.energiaCombustao).toBe('livre');
    });
    it('mecanica invalida vira ataque; valida e mantida', () => {
        expect(prep({ nome: 'X', tipoMecanica: 'xyz' }).objeto.tipoMecanica).toBe('ataque');
        expect(prep({ nome: 'X', tipoMecanica: 'Suporte' }).objeto.tipoMecanica).toBe('suporte');
        expect(prep({ nome: 'X', tipoMecanica: 'infusao' }).objeto.tipoMecanica).toBe('infusao');
    });
    it('saving sem atributo valido: destreza com aviso; ataque nao avisa', () => {
        const r = prep({ nome: 'X', tipoMecanica: 'saving', savingAttr: 'sorte' });
        expect(r.objeto.savingAttr).toBe('destreza');
        expect(r.avisos.some(a => /resistência/.test(a))).toBe(true);
        expect(prep({ nome: 'X', tipoMecanica: 'ataque', savingAttr: 'sorte' }).avisos).toEqual([]);
    });
    it('alvosAfetados invalido vira todos', () => {
        expect(prep({ nome: 'X', alvosAfetados: 'amigos' }).objeto.alvosAfetados).toBe('todos');
        expect(prep({ nome: 'X', alvosAfetados: 'aliados' }).objeto.alvosAfetados).toBe('aliados');
    });
    it('custoMax menor que custo e ignorado com aviso', () => {
        const r = prep({ nome: 'X', custoPercentual: 30, custoPercentualMax: 10 });
        expect(r.objeto.custoValorMax).toBe(0);
        expect(r.objeto.custoValor).toBe(30);
        expect(r.avisos.some(a => /Custo máximo/.test(a))).toBe(true);
    });
    it('custoMax maior ou igual e mantido; custo negativo vira 0; limites 1000', () => {
        expect(prep({ nome: 'X', custoPercentual: 10, custoPercentualMax: 10 }).objeto.custoValorMax).toBe(10);
        expect(prep({ nome: 'X', custoPercentual: -5 }).objeto.custoValor).toBe(0);
        expect(prep({ nome: 'X', custoPercentual: 5000 }).objeto.custoValor).toBe(1000);
    });
    it('alcance/area/duracao respeitam limites e duracao e inteira', () => {
        const o = prep({ nome: 'X', alcance: 99999, area: -1, duracao: 500.7 }).objeto;
        expect(o).toMatchObject({ alcanceQuad: 1000, areaQuad: 0, duracaoZona: 99 });
    });
    it('alcance 0 explicito e preservado', () => {
        expect(prep({ nome: 'X', alcance: 0 }).objeto.alcanceQuad).toBe(0);
    });
});

describe('prepararTecnicaImportada - estados, ao acertar, usos', () => {
    it('aplicaEstados validos normalizados; invalidos descartados com aviso', () => {
        const r = prep({ nome: 'X', aplicaEstados: [{ id: 'queimado', stacks: 99 }, { id: 'inexistente' }, null] });
        expect(r.objeto.aplicaEstados).toEqual([{ id: 'queimado', stacks: 6 }]);
        expect(r.avisos.some(a => /2 estado/.test(a))).toBe(true);
    });
    it('aplicaEstados todos invalidos: campo nao existe', () => {
        const r = prep({ nome: 'X', aplicaEstados: [{ id: 'nope' }] });
        expect(r.objeto.aplicaEstados).toBeUndefined();
        expect(r.avisos.length).toBe(1);
    });
    it('aplicaEstados que nao e lista e ignorado sem quebrar', () => {
        const r = prep({ nome: 'X', aplicaEstados: 'queimado' });
        expect(r.objeto.aplicaEstados).toBeUndefined();
    });
    it('aoAcertar normalizado e invalidos descartados com aviso', () => {
        const r = prep({ nome: 'X', aoAcertar: [{ tipo: 'curarAtacante', modo: 'fixo', valor: 10 }, { tipo: 'bobagem', valor: 3 }, { tipo: 'curarAtacante', valor: 0 }] });
        expect(r.objeto.aoAcertar).toHaveLength(1);
        expect(r.objeto.aoAcertar[0]).toMatchObject({ tipo: 'curarAtacante', modo: 'fixo', valor: 10 });
        expect(r.avisos.some(a => /2 efeito/.test(a) && /Ao acertar/.test(a))).toBe(true);
    });
    it('aoAcertar debuffAlvo ganha atributo/duracao padrao', () => {
        const r = prep({ nome: 'X', aoAcertar: [{ tipo: 'debuffAlvo', valor: 2, atributo: 'xx', duracao: 999 }] });
        expect(r.objeto.aoAcertar[0]).toMatchObject({ tipo: 'debuffAlvo', atributo: 'evasiva', duracao: 20, modo: 'fixo' });
    });
    it('usos validos entram; usosPor invalido vira cena', () => {
        expect(prep({ nome: 'X', usosMax: 2, usosPor: 'descanso' }).objeto).toMatchObject({ usosMax: 2, usosPor: 'descanso' });
        expect(prep({ nome: 'X', usosMax: '3', usosPor: 'semana' }).objeto).toMatchObject({ usosMax: 3, usosPor: 'cena' });
    });
    it('usos 0/ausente: campos nao existem', () => {
        const o = prep({ nome: 'X', usosMax: 0 }).objeto;
        expect(o.usosMax).toBeUndefined();
        expect(o.usosPor).toBeUndefined();
    });
});

describe('prepararTecnicaImportada - efeitos de atributo, notas, validade', () => {
    it('efeitos e efeitosPassivos vao para naoAplicado e notasIA, nao para o objeto', () => {
        const r = prep({
            nome: 'X', notasIA: 'Só de noite', naoAplicado: ['dobra o dano'],
            efeitos: [{ nome: 'Fúria', atributo: 'forca', propriedade: 'bonus', valor: 5 }],
            efeitosPassivos: [{ atributo: 'evasiva', propriedade: 'bonus', valor: 2 }],
        });
        expect(r.naoAplicado).toHaveLength(3);
        expect(r.naoAplicado[0]).toBe('dobra o dano');
        expect(r.naoAplicado[1]).toMatch(/Fúria: forca bonus 5/);
        expect(r.naoAplicado[2]).toMatch(/evasiva bonus 2/);
        expect(r.objeto.efeitos).toBeUndefined();
        expect(r.objeto.efeitosPassivos).toBeUndefined();
        expect(r.objeto.naoAplicado).toEqual(r.naoAplicado);
        expect(r.objeto.notasIA).toMatch(/Só de noite/);
        expect(r.objeto.notasIA).toMatch(/dobra o dano/);
        expect(r.objeto.notasIA).toMatch(/Fúria/);
    });
    it('efeitos nao-objeto sao ignorados', () => {
        expect(prep({ nome: 'X', efeitos: [null, 'a', 3] }).naoAplicado).toEqual([]);
    });
    it('naoAplicado: dedupe sem diferenciar maiuscula e remove vazios; string unica vira lista', () => {
        expect(prep({ nome: 'X', naoAplicado: ['A', 'a', ' ', 'B'] }).naoAplicado).toEqual(['A', 'B']);
        expect(prep({ nome: 'X', naoAplicado: 'so um' }).naoAplicado).toEqual(['so um']);
    });
    it('nome vazio/so espacos: invalido com aviso', () => {
        ['', '   ', undefined, null].forEach((n) => {
            const r = prep({ nome: n });
            expect(r.valido).toBe(false);
            expect(r.avisos.some(a => /Sem nome/.test(a))).toBe(true);
        });
    });
    it('nome e cortado em 80, descricao em 4000', () => {
        const r = prep({ nome: 'n'.repeat(200), descricao: 'd'.repeat(5000) });
        expect(r.objeto.nome).toHaveLength(80);
        expect(r.objeto.descricao).toHaveLength(4000);
    });
    it('unicode e caracteres especiais preservados', () => {
        const r = prep({ nome: '火の玉 <b>"x"</b> 🔥', descricao: 'ação\nlinha 2' });
        expect(r.objeto.nome).toBe('火の玉 <b>"x"</b> 🔥');
        expect(r.objeto.descricao).toBe('ação\nlinha 2');
    });
    it('entrada nula/indefinida/primitiva: invalido e sem excecao', () => {
        [null, undefined, 5, 'texto', []].forEach((b) => {
            const r = prep(b);
            expect(r.valido).toBe(false);
        });
    });
    it('sem opcoes: usa Neutro e elementos vazios', () => {
        const r = prepararTecnicaImportada({ nome: 'X', elemento: 'Fogo' });
        expect(r.objeto.elemento).toBe('Neutro');
        expect(r.avisos.length).toBe(1);
    });
    it('elementos nao-array nao quebra', () => {
        expect(prepararTecnicaImportada({ nome: 'X' }, { elementos: null }).valido).toBe(true);
    });
});

describe('prepararImportacaoTecnicas', () => {
    it('gera chaves sequenciais a partir da inicial, marcado = valido e pedido', () => {
        const r = prepararImportacaoTecnicas([
            { nome: 'A', elemento: 'Fogo', danoQtd: 10, danoFaces: 10 },
            { nome: '' },
            { nome: 'C' },
        ], op, 7);
        expect(r.map(i => i.chave)).toEqual([7, 8, 9]);
        expect(r.map(i => i.marcado)).toEqual([true, false, true]);
        expect(r.map(i => i.valido)).toEqual([true, false, true]);
        expect(r[0].pedido).toEqual({ qtd: 10, faces: 10 });
        expect(r[0].objeto.dadosExtraQtd).toBe(5);
        expect(r[2].pedido).toEqual({ qtd: 0, faces: 0 });
        expect(r[0]).toHaveProperty('avisos');
        expect(r[0]).toHaveProperty('naoAplicado');
    });
    it('chave inicial padrao e 1', () => {
        expect(prepararImportacaoTecnicas([{ nome: 'A' }], op)[0].chave).toBe(1);
    });
    it('nao-array ou vazio devolve []', () => {
        expect(prepararImportacaoTecnicas(null)).toEqual([]);
        expect(prepararImportacaoTecnicas(undefined)).toEqual([]);
        expect(prepararImportacaoTecnicas('x')).toEqual([]);
        expect(prepararImportacaoTecnicas([])).toEqual([]);
    });
    it('item nulo na lista nao quebra e fica invalido', () => {
        const r = prepararImportacaoTecnicas([null], op);
        expect(r[0].valido).toBe(false);
        expect(r[0].pedido).toEqual({ qtd: 0, faces: 0 });
    });
    it('pedido usa aliases dadosQtd/dadosFaces', () => {
        expect(prepararImportacaoTecnicas([{ nome: 'A', dadosQtd: 3, dadosFaces: 8 }], op)[0].pedido).toEqual({ qtd: 3, faces: 8 });
    });
});

describe('trocarElementoDaPrevia', () => {
    const item = () => prepararImportacaoTecnicas([{ nome: 'A', elemento: 'Fogo', danoQtd: 10, danoFaces: 10, energiaCombustao: 'mana' }], op)[0];
    it('reaplica o limite do novo elemento com base em pedido (restaura dados ao ir para Neutro)', () => {
        const it0 = item();
        expect(it0.objeto.dadosExtraQtd).toBe(5);
        const novo = trocarElementoDaPrevia(it0, 'Neutro');
        expect(novo.objeto).toMatchObject({ elemento: 'Neutro', dadosExtraQtd: 10, dadosExtraFaces: 10 });
        expect(novo.avisos.some(a => /Limite de dados/.test(a))).toBe(false);
    });
    it('troca para elemento com limite menor corta e adiciona aviso novo', () => {
        const base = prepararImportacaoTecnicas([{ nome: 'A', danoQtd: 20, danoFaces: 10 }], op)[0];
        const novo = trocarElementoDaPrevia(base, 'Fogo');
        expect(novo.objeto.dadosExtraQtd).toBe(5);
        expect(novo.avisos.filter(a => /Limite de dados/.test(a))).toHaveLength(1);
        expect(novo.avisos[0]).toMatch(/20d10/);
    });
    it('trocar duas vezes nao acumula avisos de limite', () => {
        const a = trocarElementoDaPrevia(item(), 'Fogo');
        const b = trocarElementoDaPrevia(a, 'Fogo');
        expect(b.avisos.filter(x => /Limite de dados/.test(x))).toHaveLength(1);
    });
    it('Truque forca energia livre', () => {
        const novo = trocarElementoDaPrevia(item(), 'Truques de Ciclo');
        expect(novo.objeto.energiaCombustao).toBe('livre');
    });
    it('limpa o aviso antigo de elemento inexistente mas preserva outros avisos', () => {
        const base = prepararImportacaoTecnicas([{ nome: 'A', elemento: 'Plasma', energiaCombustao: 'xx', danoQtd: 1, danoFaces: 6 }], op)[0];
        expect(base.avisos.some(a => /não existe/.test(a))).toBe(true);
        const novo = trocarElementoDaPrevia(base, 'Agua');
        expect(novo.avisos.some(a => /não existe/.test(a))).toBe(false);
        expect(novo.avisos.some(a => /Energia/.test(a))).toBe(true);
    });
    it('nao muta o item original', () => {
        const it0 = item();
        const snap = JSON.parse(JSON.stringify(it0));
        trocarElementoDaPrevia(it0, 'Neutro');
        expect(it0).toEqual(snap);
    });
    it('sem pedido, usa os dados do objeto como pedido', () => {
        const it0 = item();
        delete it0.pedido;
        const novo = trocarElementoDaPrevia(it0, 'Neutro');
        expect(novo.objeto.dadosExtraQtd).toBe(5);
    });
    it('item nulo ou sem objeto e devolvido como esta', () => {
        expect(trocarElementoDaPrevia(null, 'Fogo')).toBeNull();
        const semObj = { chave: 1 };
        expect(trocarElementoDaPrevia(semObj, 'Fogo')).toBe(semObj);
    });
});

describe('resumirTecnicaImportada', () => {
    it('monta resumo com elemento, dados, custo, mecanica, alcance, area e usos', () => {
        const o = prep({ nome: 'X', elemento: 'Fogo', danoQtd: 2, danoFaces: 6, custoPercentual: 10, custoPercentualMax: 20, energiaCombustao: 'mana', alcance: 3, area: 2, usosMax: 1, usosPor: 'cena' }).objeto;
        const s = resumirTecnicaImportada(o);
        expect(s).toContain('Fogo');
        expect(s).toContain('2d6');
        expect(s).toContain('custo 10–20% mana');
        expect(s).toContain('alcance 3Q');
        expect(s).toContain('área 2Q');
        expect(s).toContain('1×/cena');
    });
    it('saving mostra o atributo; sem custo mostra a energia', () => {
        const s = resumirTecnicaImportada(prep({ nome: 'X', tipoMecanica: 'saving', savingAttr: 'forca' }).objeto);
        expect(s).toContain('resistência (forca)');
        expect(s).toContain('flexivel');
    });
    it('null devolve string vazia', () => {
        expect(resumirTecnicaImportada(null)).toBe('');
    });
});

describe('montarTecnicaFinal', () => {
    it('copia profunda, sem naoAplicado, com id', () => {
        const o = prep({ nome: 'X', aplicaEstados: [{ id: 'queimado', stacks: 1 }], naoAplicado: ['a'] }).objeto;
        const f = montarTecnicaFinal(o, 'ia_el_1');
        expect(f.id).toBe('ia_el_1');
        expect(f.naoAplicado).toBeUndefined();
        expect(o.naoAplicado).toEqual(['a']);
        expect(f.aplicaEstados).toEqual(o.aplicaEstados);
        expect(f.aplicaEstados).not.toBe(o.aplicaEstados);
        f.aplicaEstados[0].stacks = 5;
        expect(o.aplicaEstados[0].stacks).toBe(1);
    });
    it('objeto nulo gera apenas o id', () => {
        expect(montarTecnicaFinal(null, 'k')).toEqual({ id: 'k' });
    });
});

describe('lerRespostaTecnicas', () => {
    it('formato {ataquesElementais:[...]}', () => {
        const r = lerRespostaTecnicas(JSON.stringify({ ataquesElementais: [{ nome: 'A' }, { nome: 'B' }] }));
        expect(r.ok).toBe(true);
        expect(r.itens.map(i => i.nome)).toEqual(['A', 'B']);
    });
    it('lista na raiz', () => {
        const r = lerRespostaTecnicas('[{"nome":"A"}]');
        expect(r.ok).toBe(true);
        expect(r.itens).toHaveLength(1);
    });
    it('{tecnicas:[...]}, {magias:[...]} e cerca de codigo markdown', () => {
        expect(lerRespostaTecnicas('{"tecnicas":[{"nome":"A"}]}').itens[0].nome).toBe('A');
        expect(lerRespostaTecnicas('{"magias":[{"nome":"M"}]}').itens[0].nome).toBe('M');
        const r = lerRespostaTecnicas('Aqui:\n```json\n{"ataquesElementais":[{"nome":"Z"}]}\n```\nfim');
        expect(r.ok).toBe(true);
        expect(r.itens[0].nome).toBe('Z');
    });
    it('prompt colado por engano e recusado com mensagem clara', () => {
        const r = lerRespostaTecnicas(montarPromptTecnicas('texto', ELEMS, 'Fogo'));
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/instrução/);
    });
    it('vazio, lixo e JSON invalido: ok false com erro', () => {
        ['', '   ', 'sem json nenhum', '{quebrado', null, undefined].forEach((t) => {
            const r = lerRespostaTecnicas(t);
            expect(r.ok).toBe(false);
            expect(typeof r.erro).toBe('string');
        });
    });
    it('lista vazia: ok false', () => {
        expect(lerRespostaTecnicas('{"ataquesElementais":[]}').ok).toBe(false);
    });
    it('fluxo de Habilidades nao regrediu: poderes/habilidades/formas continuam lidos', () => {
        const r = lerRespostaDaIA(JSON.stringify({ poderes: [{ nome: 'P1' }, { nome: 'P2' }] }));
        expect(r.ok).toBe(true);
        expect(r.itens.map(i => i.nome)).toEqual(['P1', 'P2']);
        expect(lerRespostaDaIA('{"habilidades":[{"nome":"H"}]}').itens[0].nome).toBe('H');
        expect(lerRespostaDaIA('{"formas":[{"nome":"F"}]}').itens[0].nome).toBe('F');
        // poder solto com lista de efeitos nao vira "poderes"
        const solto = lerRespostaDaIA(JSON.stringify({ nome: 'Solo', efeitos: [{ atributo: 'forca', valor: 1 }] }));
        expect(solto.ok).toBe(true);
        expect(solto.itens).toHaveLength(1);
        expect(solto.itens[0].nome).toBe('Solo');
        // chave vazia nao vence chave preenchida
        expect(lerRespostaDaIA('{"poderes":[],"habilidades":[{"nome":"H2"}]}').itens[0].nome).toBe('H2');
        // prompt de Habilidades continua recusado
        expect(lerRespostaDaIA('Atue como extrator de dados').ok).toBe(false);
    });
});

describe('montarPromptTecnicas', () => {
    const p = montarPromptTecnicas('Bola de fogo causa 3d6', ELEMS, 'Fogo');
    it('lista os elementos reais, o padrao e o texto', () => {
        ELEMS.forEach(e => expect(p).toContain(e));
        expect(p).toContain('Bola de fogo causa 3d6');
        expect(p).toContain('"elemento": "Fogo"');
        expect(p).toMatch(/Atue como extrator/);
    });
    it('lista energias, mecanicas e todos os estados reais', () => {
        ['mana', 'aura', 'chakra', 'corpo', 'pontosVitais', 'pontosMortais', 'livre', 'flexivel'].forEach(e => expect(p).toContain(`"${e}"`));
        ['ataque', 'saving', 'infusao', 'suporte'].forEach(m => expect(p).toContain(`"${m}"`));
        ESTADOS.forEach(e => expect(p).toContain(e.id));
        expect(p).toContain('inimigos');
        expect(p).toContain('ataquesElementais');
    });
    it('sem elementos conhecidos usa texto generico; entradas invalidas nao quebram', () => {
        expect(montarPromptTecnicas('x', [])).toContain('o elemento da técnica');
        expect(montarPromptTecnicas('x', null)).toContain('"elemento": "Neutro"');
        expect(montarPromptTecnicas(null, undefined)).toContain('TEXTO:');
    });
    it('o JSON de exemplo do prompt nao e interpretado como resposta (protecao)', () => {
        expect(lerRespostaTecnicas(p).ok).toBe(false);
    });
});
