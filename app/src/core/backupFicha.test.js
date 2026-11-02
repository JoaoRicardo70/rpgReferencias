import { describe, it, expect } from 'vitest';
import {
    dataDeHoje, chaveAntesDeImportar, rotuloDoBackup, prepararBackup, resumoDaFicha, descreverResumo,
    pareceFichaMenor, nomeDoArquivo, montarArquivoExportacao, lerArquivoImportacao, ehFichaPlausivel,
    chavesParaApagar, TIPO_ARQUIVO
, temChaveInvalida, preservarImagensAtuais, chavesParaPodar, LIMITE_DIARIOS, LIMITE_ANTES_IMPORTAR, LIMITE_ARQUIVO_BYTES } from './backupFicha';

const fichaBoa = (extra = {}) => ({ vida: 10, bio: 'x', poderes: [], inventario: [], mana: 5, ...extra });
const lista = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe('backupFicha - datas e rotulos', () => {
    it('dataDeHoje formata AAAA-MM-DD com zeros', () => {
        expect(dataDeHoje(new Date(2026, 0, 5))).toBe('2026-01-05');
        expect(dataDeHoje(new Date(2026, 11, 31))).toBe('2026-12-31');
    });
    it('chaveAntesDeImportar inclui hora', () => {
        expect(chaveAntesDeImportar(new Date(2026, 2, 4, 5, 6, 7))).toBe('2026-03-04_antes_050607');
    });
    it('rotuloDoBackup diario e antes de importar', () => {
        expect(rotuloDoBackup('2026-03-04')).toBe('04/03/2026');
        expect(rotuloDoBackup('2026-03-04_antes_050607')).toBe('04/03/2026 05:06 (antes de importar)');
    });
    it('rotuloDoBackup devolve entrada invalida/vazia como texto', () => {
        expect(rotuloDoBackup('abc')).toBe('abc');
        expect(rotuloDoBackup(null)).toBe('');
        expect(rotuloDoBackup(undefined)).toBe('');
    });
});

describe('backupFicha - prepararBackup', () => {
    it('remove so data: URIs maiores que o limite e conta', () => {
        const grande = 'data:image/png;base64,' + 'A'.repeat(100);
        const ficha = { a: grande, b: { c: [grande, 'ok'] }, url: 'https://' + 'x'.repeat(100), pequena: 'data:abc' };
        const r = prepararBackup(ficha, 50);
        expect(r.imagensRemovidas).toBe(2);
        expect(r.ficha.a).toBe('');
        expect(r.ficha.b.c).toEqual(['', 'ok']);
        expect(r.ficha.url).toBe(ficha.url);
        expect(r.ficha.pequena).toBe('data:abc');
    });
    it('nao muta a ficha original', () => {
        const grande = 'data:' + 'A'.repeat(100);
        const ficha = { a: grande, n: { x: 1 } };
        const r = prepararBackup(ficha, 10);
        expect(ficha.a).toBe(grande);
        expect(r.ficha).not.toBe(ficha);
        expect(r.ficha.n).not.toBe(ficha.n);
    });
    it('string exatamente no limite nao e removida', () => {
        const s = 'data:' + 'A'.repeat(5);
        expect(prepararBackup({ s }, s.length).imagensRemovidas).toBe(0);
    });
    it('ficha nula vira objeto vazio', () => {
        expect(prepararBackup(null)).toEqual({ ficha: {}, imagensRemovidas: 0 });
    });
});

describe('backupFicha - resumo', () => {
    it('conta poderes, itens, tecnicas, formas e campos', () => {
        const r = resumoDaFicha({ poderes: lista(2), inventario: lista(3), ataquesElementais: lista(1), formas: lista(1), seresSelados: { a: 1, b: 2 } });
        expect(r).toMatchObject({ poderes: 2, itens: 3, tecnicas: 1, formas: 3, campos: 5 });
    });
    it('tolera nulo e tipos errados', () => {
        expect(resumoDaFicha(null)).toMatchObject({ poderes: 0, itens: 0, tecnicas: 0, formas: 0, campos: 0, kb: 0 });
        expect(resumoDaFicha({ poderes: 'x', inventario: 5 })).toMatchObject({ poderes: 0, itens: 0 });
    });
    it('descreverResumo gera texto', () => {
        expect(descreverResumo({ poderes: 1, itens: 2, tecnicas: 3, kb: 4 })).toBe('1 poder(es)/habilidade(s), 2 item(ns), 3 técnica(s), 4 KB');
    });
});

describe('backupFicha - pareceFichaMenor', () => {
    it('detecta ficha bem menor', () => {
        expect(pareceFichaMenor({ poderes: lista(10) }, { poderes: lista(2) })).toBe(true);
    });
    it('nao alerta com ficha parecida ou maior', () => {
        expect(pareceFichaMenor({ poderes: lista(10) }, { poderes: lista(8) })).toBe(false);
        expect(pareceFichaMenor({ poderes: lista(10) }, { poderes: lista(20) })).toBe(false);
    });
    it('nao alerta quando a atual e pequena (< 4)', () => {
        expect(pareceFichaMenor({ poderes: lista(3) }, {})).toBe(false);
        expect(pareceFichaMenor({ poderes: lista(4) }, {})).toBe(true);
    });
});

describe('backupFicha - nomeDoArquivo', () => {
    const d = new Date(2026, 4, 9);
    it('nome normal', () => expect(nomeDoArquivo('Ana', d)).toBe('ficha-Ana-2026-05-09.json'));
    it('troca caracteres invalidos por _', () => {
        expect(nomeDoArquivo('A/b:c*?', d)).toBe('ficha-A_b_c-2026-05-09.json');
        expect(nomeDoArquivo('João Silva', d)).toBe('ficha-Jo_o_Silva-2026-05-09.json');
    });
    it('vazio ou so invalido vira ficha', () => {
        expect(nomeDoArquivo('', d)).toBe('ficha-ficha-2026-05-09.json');
        expect(nomeDoArquivo('///', d)).toBe('ficha-ficha-2026-05-09.json');
        expect(nomeDoArquivo(null, d)).toBe('ficha-ficha-2026-05-09.json');
    });
});

describe('backupFicha - exportar/importar', () => {
    it('montarArquivoExportacao embrulha e copia', () => {
        const ficha = fichaBoa();
        const a = montarArquivoExportacao(ficha, 'Ana', new Date('2026-01-02T03:04:05.000Z'));
        expect(a).toMatchObject({ tipo: TIPO_ARQUIVO, versao: 1, nome: 'Ana', exportadoEm: '2026-01-02T03:04:05.000Z' });
        expect(a.ficha).toEqual(ficha);
        expect(a.ficha).not.toBe(ficha);
    });
    it('ida e volta do arquivo embrulhado', () => {
        const ficha = fichaBoa();
        const txt = JSON.stringify(montarArquivoExportacao(ficha, 'Ana'));
        const r = lerArquivoImportacao(txt);
        expect(r.ok).toBe(true);
        expect(r.ficha).toEqual(ficha);
        expect(r.nome).toBe('Ana');
        expect(r.exportadoEm).toBeTruthy();
    });
    it('aceita ficha crua', () => {
        const r = lerArquivoImportacao(JSON.stringify(fichaBoa()));
        expect(r.ok).toBe(true);
        expect(r.nome).toBe('');
        expect(r.exportadoEm).toBe('');
    });
    it('rejeita JSON invalido, vazio e undefined', () => {
        expect(lerArquivoImportacao('{nao json').ok).toBe(false);
        expect(lerArquivoImportacao('').ok).toBe(false);
        expect(lerArquivoImportacao(undefined).ok).toBe(false);
        expect(lerArquivoImportacao('{nao json').erro).toMatch(/JSON/);
    });
    it('rejeita array, null e primitivo', () => {
        expect(lerArquivoImportacao('[1,2,3]').ok).toBe(false);
        expect(lerArquivoImportacao('null').ok).toBe(false);
        expect(lerArquivoImportacao('42').ok).toBe(false);
    });
    it('rejeita objeto pequeno demais e sem marcadores', () => {
        expect(lerArquivoImportacao(JSON.stringify({ vida: 1, bio: 2 })).ok).toBe(false);
        expect(lerArquivoImportacao(JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5 })).ok).toBe(false);
    });
    it('rejeita embrulho cuja ficha interna e pequena', () => {
        expect(lerArquivoImportacao(JSON.stringify({ tipo: TIPO_ARQUIVO, ficha: { vida: 1 } })).ok).toBe(false);
    });
    it('embrulho com ficha array cai no objeto externo e e rejeitado', () => {
        expect(lerArquivoImportacao(JSON.stringify({ tipo: TIPO_ARQUIVO, ficha: [1, 2, 3, 4, 5, 6] })).ok).toBe(false);
    });
});

describe('backupFicha - ehFichaPlausivel', () => {
    it('aceita ficha com 5+ campos e marcador', () => expect(ehFichaPlausivel(fichaBoa())).toBe(true));
    it('rejeita nulos, array, poucos campos', () => {
        expect(ehFichaPlausivel(null)).toBe(false);
        expect(ehFichaPlausivel([])).toBe(false);
        expect(ehFichaPlausivel('x')).toBe(false);
        expect(ehFichaPlausivel({ vida: 1, bio: 1, poderes: 1, mana: 1 })).toBe(false);
    });
    it('marcador com valor null conta (so undefined nao)', () => {
        expect(ehFichaPlausivel({ a: 1, b: 2, c: 3, d: 4, vida: null })).toBe(true);
    });
});

describe('backupFicha - chavesParaApagar', () => {
    const chaves = (n) => Array.from({ length: n }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
    it('nada a apagar no limite ou abaixo', () => {
        expect(chavesParaApagar(chaves(20), 20)).toEqual([]);
        expect(chavesParaApagar(chaves(3), 20)).toEqual([]);
    });
    it('apaga as mais antigas acima do limite, independente da ordem de entrada', () => {
        const emb = chaves(23).reverse();
        expect(chavesParaApagar(emb, 20)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    });
    it('usa limite padrao 20', () => {
        expect(chavesParaApagar(chaves(21))).toEqual(['2026-01-01']);
    });
    it('ignora duplicatas e falsy', () => {
        expect(chavesParaApagar(['a', 'a', '', null, 'b', 'c'], 2)).toEqual(['a']);
    });
    it('entrada nula', () => expect(chavesParaApagar(null)).toEqual([]));
    it('chave _antes_ ordena depois da diaria do mesmo dia', () => {
        expect(chavesParaApagar(['2026-01-01_antes_100000', '2026-01-01', '2026-01-02'], 2)).toEqual(['2026-01-01']);
    });
});

describe('temChaveInvalida / lerArquivoImportacao com chaves ruins', () => {
    it('detecta . # $ [ ] / e __proto__ em qualquer profundidade', () => {
        expect(temChaveInvalida({ a: { b: [{ 'x.y': 1 }] } })).toBe(true);
        expect(temChaveInvalida({ a: { 'x/y': 1 } })).toBe(true);
        expect(temChaveInvalida(JSON.parse('{"a":{"__proto__":{"x":1}}}'))).toBe(true);
        expect(temChaveInvalida({ a: { constructor: 1 } })).toBe(true);
    });
    it('ficha normal passa', () => {
        expect(temChaveInvalida({ vida: { atual: 1 }, poderes: [{ nome: 'a b', efeitos: [] }] })).toBe(false);
    });
    it('importar recusa ficha com chave inválida', () => {
        const r = lerArquivoImportacao(JSON.stringify({ vida: 1, bio: {}, poderes: [], mana: 1, inventario: [], 'a.b': 2 }));
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/não aceita/);
    });
    it('o limite do arquivo é 5 MB', () => { expect(LIMITE_ARQUIVO_BYTES).toBe(5 * 1024 * 1024); });
});

describe('preservarImagensAtuais', () => {
    const grande = 'data:image/png;base64,' + 'A'.repeat(300100);
    it('mantém a imagem grande atual onde o backup está vazio, em qualquer profundidade e nas listas', () => {
        const nova = { avatar: { base: '' }, formas: [{ img: '' }, { img: 'https://x/y.png' }] };
        const atual = { avatar: { base: grande }, formas: [{ img: grande }, { img: grande }] };
        const r = preservarImagensAtuais(nova, atual);
        expect(r.avatar.base).toBe(grande);
        expect(r.formas[0].img).toBe(grande);
        expect(r.formas[1].img).toBe('https://x/y.png'); // o backup tem valor: ele manda
    });
    it('vazio onde a atual não tem imagem grande continua vazio, e não muta as entradas', () => {
        const nova = { avatar: { base: '' } };
        const atual = { avatar: { base: 'https://pequena' } };
        const r = preservarImagensAtuais(nova, atual);
        expect(r.avatar.base).toBe('');
        expect(nova.avatar.base).toBe('');
        expect(atual.avatar.base).toBe('https://pequena');
    });
    it('atual nula não quebra', () => { expect(preservarImagensAtuais({ a: '' }, null)).toEqual({ a: '' }); });
});

describe('chavesParaPodar', () => {
    const dias = (n) => Array.from({ length: n }, (_, i) => `2026-05-${String(i + 1).padStart(2, '0')}`);
    it('poda diárias e "antes" separadamente', () => {
        const antes = Array.from({ length: 8 }, (_, i) => `2026-06-01_antes_10000${i}`);
        const r = chavesParaPodar([...dias(20), ...antes]);
        expect(r.filter(k => !k.includes('_antes_'))).toHaveLength(20 - LIMITE_DIARIOS);
        expect(r.filter(k => k.includes('_antes_'))).toHaveLength(8 - LIMITE_ANTES_IMPORTAR);
        expect(r).toContain('2026-05-01');
        expect(r).not.toContain('2026-05-20');
    });
    it('muitas importações no mesmo dia não expulsam as diárias', () => {
        const antes = Array.from({ length: 30 }, (_, i) => `2026-06-01_antes_1000${String(i).padStart(2, '0')}`);
        const r = chavesParaPodar([...dias(10), ...antes]);
        expect(r.some(k => !k.includes('_antes_'))).toBe(false);
    });
    it('dentro dos limites não apaga nada', () => { expect(chavesParaPodar(dias(15))).toEqual([]); });
    it('entrada vazia/nula', () => { expect(chavesParaPodar(null)).toEqual([]); });
});
