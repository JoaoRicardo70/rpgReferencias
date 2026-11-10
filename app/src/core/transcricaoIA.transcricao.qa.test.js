import { describe, it, expect } from 'vitest';
import {
    LIMITE_CARACTERES_PARTE, dividirEmPartes, montarTextoDaParte, mesclarRespostas, normalizarNome,
    classificarErroLeitura, erroBloqueiaProximas, descreverFalhas, textoProgresso, chaveImportadorIA,
    MENSAGEM_SEM_CHAVE, MENSAGEM_COTA, MENSAGEM_TIMEOUT, MENSAGEM_NAO_JSON, MENSAGEM_CANCELADO,
} from './transcricaoIA';

const semEspacos = (s) => s.replace(/\s/g, '');
const AVISO = 'Item de mesmo nome, conteúdo diferente: confira se é duplicado.';

// PRNG determinístico (mulberry32) para os testes de propriedade.
function prng(semente) {
    let a = semente >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FRAGMENTOS = ['Dano de 3.5 por turno.', 'Espera... depois ataca!', '😀', '🔥🔥', '👨‍👩‍👧', 'Rinnegan:', '- Limbo: algo', '• item', 'ação', 'Çã', '"citado."', '(nota).', '?!', '…', '\r\n', '\n', '\n\n', '   ', '\t'];
function textoAleatorio(rnd, tamanho) {
    let s = '';
    while (s.length < tamanho) {
        const r = rnd();
        if (r < 0.15) s += 'x'.repeat(Math.floor(rnd() * 900) + 50); // linha longa sem quebra
        else if (r < 0.25) s += '😀'.repeat(Math.floor(rnd() * 400) + 20); // emoji sem espaço
        else if (r < 0.5) s += 'palavra '.repeat(Math.floor(rnd() * 60) + 1);
        else s += FRAGMENTOS[Math.floor(rnd() * FRAGMENTOS.length)] + (rnd() < 0.5 ? ' ' : '');
    }
    return s;
}
const temSubstitutoSolto = (s) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe('dividirEmPartes - caminho feliz', () => {
    it('limite padrão é 7000', () => expect(LIMITE_CARACTERES_PARTE).toBe(7000));
    it('texto curto vira uma parte só (trimado)', () => expect(dividirEmPartes('  oi  ')).toEqual(['oi']));
    it('texto no limite exato não divide', () => {
        const t = 'a'.repeat(LIMITE_CARACTERES_PARTE);
        expect(dividirEmPartes(t)).toEqual([t]);
    });
    it('divide em linhas em branco e respeita o limite', () => {
        const blocos = Array.from({ length: 6 }, (_, i) => `Habilidade ${i} ` + 'z '.repeat(120));
        const partes = dividirEmPartes(blocos.join('\n\n'), 600);
        expect(partes.length).toBeGreaterThan(1);
        partes.forEach(p => expect(p.length).toBeLessThanOrEqual(600));
        expect(semEspacos(partes.join(''))).toBe(semEspacos(blocos.join('')));
    });
    it('título fica colado ao bloco seguinte', () => {
        const corpo = (n) => `${n} ` + 'w '.repeat(110);
        const texto = [corpo('A'), corpo('B'), 'Rinnegan Supremo:', corpo('C'), corpo('D')].join('\n\n');
        const partes = dividirEmPartes(texto, 500);
        const comTitulo = partes.find(p => p.includes('Rinnegan Supremo:'));
        expect(comTitulo).toMatch(/Rinnegan Supremo:\n\nC /);
    });
    it('título markdown (##) também cola', () => {
        const corpo = (n) => `${n} ` + 'w '.repeat(110);
        const partes = dividirEmPartes([corpo('A'), corpo('B'), '## Técnicas', corpo('C')].join('\n\n'), 500);
        expect(partes.find(p => p.includes('## Técnicas'))).toMatch(/## Técnicas\n\nC /);
    });
    it('itens de lista ficam junto da habilidade principal', () => {
        const corpo = (n) => `${n} ` + 'w '.repeat(100);
        const texto = [corpo('A'), corpo('B'), corpo('Principal'), '- Limbo: efeito um', '• Outro: efeito dois', corpo('Z')].join('\n\n');
        const partes = dividirEmPartes(texto, 500);
        const p = partes.find(x => x.includes('Principal'));
        expect(p).toContain('- Limbo: efeito um');
        expect(p).toContain('• Outro: efeito dois');
    });
    it('normaliza CRLF e CR para LF', () => {
        const t = ('linha a\r\n\r\nlinha b\rlinha c ' + 'k '.repeat(150) + '\r\n\r\n').repeat(3);
        const partes = dividirEmPartes(t, 300);
        expect(partes.join('')).not.toMatch(/\r/);
    });
});

describe('dividirEmPartes - bordas', () => {
    it.each([[''], ['   '], ['\n\n\t'], [null], [undefined]])('vazio %j => []', (v) => expect(dividirEmPartes(v)).toEqual([]));
    it('limite absurdo (0, NaN, negativo, texto, 10) cai no mínimo/padrão sem travar', () => {
        const t = 'a b '.repeat(500);
        [0, NaN, -5, 'x', 10].forEach(l => {
            const partes = dividirEmPartes(t, l);
            expect(semEspacos(partes.join(''))).toBe(semEspacos(t));
        });
    });
    it('linha gigante sem nenhum espaço é cortada sem perder caracteres', () => {
        const t = 'x'.repeat(2050);
        const partes = dividirEmPartes(t, 500);
        expect(partes.join('')).toBe(t);
        partes.forEach(p => expect(p.length).toBeLessThanOrEqual(500));
    });
    it('não corta emoji ao meio (par substituto)', () => {
        for (const prefixo of ['', 'a', 'ab', 'abc']) {
            const t = prefixo + '😀'.repeat(700);
            const partes = dividirEmPartes(t, 201);
            partes.forEach(p => expect(temSubstitutoSolto(p)).toBe(false));
            expect(partes.join('')).toBe(t);
        }
    });
    it('não quebra decimais nem reticências', () => {
        const t = Array.from({ length: 80 }, (_, i) => `Golpe ${i} causa 3.5 de dano... e mais 2.75 depois.`).join(' ');
        const partes = dividirEmPartes(t, 300);
        const conta = (s, sub) => s.split(sub).length - 1;
        expect(partes.reduce((n, p) => n + conta(p, '3.5'), 0)).toBe(80);
        expect(partes.reduce((n, p) => n + conta(p, '2.75'), 0)).toBe(80);
        expect(partes.reduce((n, p) => n + conta(p, '...'), 0)).toBe(80);
    });
    it('frases em linha única longa: quebra em fim de frase quando possível', () => {
        const t = Array.from({ length: 60 }, (_, i) => `Frase número ${i} termina aqui.`).join(' ');
        const partes = dividirEmPartes(t, 400);
        expect(partes.length).toBeGreaterThan(1);
        partes.forEach(p => expect(p).toMatch(/\.$/));
    });
});

describe('dividirEmPartes - propriedade (concatenação sem espaços == original sem espaços)', () => {
    it('200 textos aleatórios, limites variados', () => {
        for (let seed = 1; seed <= 200; seed++) {
            const rnd = prng(seed);
            const t = textoAleatorio(rnd, 300 + Math.floor(rnd() * 6000));
            const limite = [200, 250, 333, 500, 1000, 7000][seed % 6];
            const partes = dividirEmPartes(t, limite);
            expect(semEspacos(partes.join('')), `seed ${seed} limite ${limite}`).toBe(semEspacos(t));
            partes.forEach((p) => {
                expect(p.length, `seed ${seed} tamanho`).toBeLessThanOrEqual(Math.max(200, limite));
                expect(p.trim().length).toBeGreaterThan(0);
                expect(temSubstitutoSolto(p), `seed ${seed} emoji cortado`).toBe(false);
            });
        }
    });
    it('textos grandes (> 7000) com limite padrão', () => {
        for (let seed = 1000; seed < 1030; seed++) {
            const rnd = prng(seed);
            const t = textoAleatorio(rnd, 20000 + Math.floor(rnd() * 20000));
            const partes = dividirEmPartes(t);
            expect(semEspacos(partes.join(''))).toBe(semEspacos(t));
            partes.forEach(p => expect(p.length).toBeLessThanOrEqual(LIMITE_CARACTERES_PARTE));
        }
    });
    it('CRLF puro e linhas longas sem quebra', () => {
        const t = ('y'.repeat(900) + '\r\n\r\n').repeat(30) + 'z'.repeat(5000);
        const partes = dividirEmPartes(t, 700);
        expect(semEspacos(partes.join(''))).toBe(semEspacos(t));
    });
    it('é determinístico', () => {
        const t = textoAleatorio(prng(7), 9000);
        expect(dividirEmPartes(t, 400)).toEqual(dividirEmPartes(t, 400));
    });
});

describe('montarTextoDaParte / progresso / chave', () => {
    it('uma parte só: texto intacto', () => expect(montarTextoDaParte('abc', 1, 1)).toBe('abc'));
    it('várias: prefixo Trecho N de M', () => {
        const r = montarTextoDaParte('abc', 2, 3);
        expect(r).toMatch(/^\(Trecho 2 de 3 /);
        expect(r.endsWith('\n\nabc')).toBe(true);
    });
    it('total inválido: sem prefixo', () => { expect(montarTextoDaParte('x', 1, 0)).toBe('x'); expect(montarTextoDaParte('x', 1, undefined)).toBe('x'); });
    it('textoProgresso', () => { expect(textoProgresso(1, 1)).toBe('Lendo o texto…'); expect(textoProgresso(2, 5)).toBe('Lendo parte 2 de 5…'); });
    it('chaveImportadorIA', () => { expect(chaveImportadorIA('Natsu')).toBe('Natsu|importador'); expect(chaveImportadorIA('')).toBe('_|importador'); expect(chaveImportadorIA(undefined)).toBe('_|importador'); });
});

describe('normalizarNome', () => {
    it('sem acento, minúsculo, espaços colapsados', () => expect(normalizarNome('  Ação   Ígnea ')).toBe('acao ignea'));
    it('nulo/indefinido => vazio', () => { expect(normalizarNome(null)).toBe(''); expect(normalizarNome(undefined)).toBe(''); });
    it('número vira string', () => expect(normalizarNome(42)).toBe('42'));
});

describe('mesclarRespostas', () => {
    const A = { nome: 'Fogo', descricao: 'queima', danoQtd: 2, danoFaces: 6 };
    it('junta listas sem repetições quando os nomes diferem', () => {
        expect(mesclarRespostas([[A], [{ nome: 'Gelo', descricao: 'x' }]]).map(i => i.nome)).toEqual(['Fogo', 'Gelo']);
    });
    it('nome igual (normalizado) e conteúdo igual: descarta', () => {
        const r = mesclarRespostas([[A], [{ ...A, nome: ' FOGO ' }], [{ ...A, nome: 'fógo' }]]);
        expect(r).toHaveLength(1);
        expect(r[0].nome).toBe('Fogo');
    });
    it('descrição com espaços/caixa/acento diferentes ainda é conteúdo igual', () => {
        expect(mesclarRespostas([[A], [{ ...A, descricao: '  QUEIMÁ  ' }]])).toHaveLength(1);
    });
    it('conteúdo diferente: mantém os dois e avisa em naoAplicado', () => {
        const r = mesclarRespostas([[A], [{ ...A, descricao: 'outra coisa' }]]);
        expect(r).toHaveLength(2);
        expect(r[1].naoAplicado).toContain(AVISO);
    });
    it('terceiro com mesmo nome e conteúdo igual ao segundo é descartado; aviso não duplica', () => {
        const B = { ...A, descricao: 'outra' };
        const r = mesclarRespostas([[A], [B], [B]]);
        expect(r).toHaveLength(2);
        expect(r[1].naoAplicado.filter(x => x === AVISO)).toHaveLength(1);
    });
    it('dano diferente conta como conteúdo diferente', () => {
        expect(mesclarRespostas([[A], [{ ...A, danoQtd: 9 }]])).toHaveLength(2);
    });
    it('efeitos diferentes contam como conteúdo diferente; ordem dos efeitos não importa', () => {
        const e1 = { atributo: 'forca', propriedade: 'bonus', valor: 1 };
        const e2 = { atributo: 'agilidade', propriedade: 'bonus', valor: 2 };
        expect(mesclarRespostas([[{ ...A, efeitos: [e1, e2] }], [{ ...A, efeitos: [e2, e1] }]])).toHaveLength(1);
        expect(mesclarRespostas([[{ ...A, efeitos: [e1] }], [{ ...A, efeitos: [e2] }]])).toHaveLength(2);
    });
    it('itens sem nome nunca deduplicam', () => {
        const r = mesclarRespostas([[{ descricao: 'x' }, { descricao: 'x' }, { nome: '', descricao: 'x' }, { nome: '   ' }]]);
        expect(r).toHaveLength(4);
    });
    it('duplicata acumula naoAplicado e notasIA do descartado', () => {
        const r = mesclarRespostas([[{ ...A, naoAplicado: ['a'], notasIA: 'n1' }], [{ ...A, naoAplicado: ['b', 'A'], notasIA: 'n2' }]]);
        expect(r).toHaveLength(1);
        expect(r[0].naoAplicado).toEqual(['a', 'b']);
        expect(r[0].notasIA).toBe('n1\nn2');
    });
    it('não altera os objetos de entrada', () => {
        const x = { ...A, naoAplicado: ['a'] }; const y = { ...A, descricao: 'z' };
        const copia = JSON.stringify([x, y]);
        mesclarRespostas([[x], [y]]);
        expect(JSON.stringify([x, y])).toBe(copia);
    });
    it('jaExistentes (objetos): igual descarta, diferente avisa', () => {
        const r = mesclarRespostas([[A, { nome: 'Fogo', descricao: 'diferente' }]], [A]);
        expect(r).toHaveLength(1);
        expect(r[0].descricao).toBe('diferente');
        expect(r[0].naoAplicado).toContain(AVISO);
    });
    it('jaExistentes só com nomes (strings): nome repetido é descartado', () => {
        expect(mesclarRespostas([[A, { nome: 'Gelo' }]], ['fogo']).map(i => i.nome)).toEqual(['Gelo']);
    });
    it('jaExistentes inválido não quebra', () => {
        expect(mesclarRespostas([[A]], null)).toHaveLength(1);
        expect(mesclarRespostas([[A]], [null, undefined, {}, 5])).toHaveLength(1);
    });
    it('entradas inválidas', () => {
        expect(mesclarRespostas(null)).toEqual([]);
        expect(mesclarRespostas(undefined)).toEqual([]);
        expect(mesclarRespostas([null, 'x', [null, 5, 'a', A]])).toHaveLength(1);
        expect(mesclarRespostas([])).toEqual([]);
    });
});

describe('classificarErroLeitura', () => {
    it('cancelado (flag)', () => expect(classificarErroLeitura({ cancelado: true })).toEqual({ tipo: 'cancelado', mensagem: MENSAGEM_CANCELADO }));
    it('sem chave', () => expect(classificarErroLeitura(new Error('A Sexta-Feira ainda não foi configurada: o Mestre precisa cadastrar a chave do Gemini.'))).toEqual({ tipo: 'sem-chave', mensagem: MENSAGEM_SEM_CHAVE }));
    it('cota', () => {
        expect(classificarErroLeitura(new Error('A cota gratuita do Gemini acabou por agora.')).tipo).toBe('cota');
        expect(classificarErroLeitura(new Error('HTTP 429')).mensagem).toBe(MENSAGEM_COTA);
    });
    it('timeout', () => expect(classificarErroLeitura(new Error('O Gemini demorou demais para responder. Tente de novo.'))).toEqual({ tipo: 'timeout', mensagem: MENSAGEM_TIMEOUT }));
    it('json', () => expect(classificarErroLeitura(new Error('JSON inválido: x'))).toEqual({ tipo: 'json', mensagem: MENSAGEM_NAO_JSON }));
    it('rede', () => expect(classificarErroLeitura(new Error('Não consegui falar com o Gemini. Verifique a conexão')).tipo).toBe('rede'));
    it('chave inválida não vira "sem chave"', () => expect(classificarErroLeitura(new Error('A chave do Gemini cadastrada pelo Mestre é inválida.')).tipo).not.toBe('sem-chave'));
    it('outro e entradas estranhas', () => {
        expect(classificarErroLeitura(new Error('xyz')).tipo).toBe('outro');
        expect(classificarErroLeitura(null).mensagem).toMatch(/Não consegui ler/);
        expect(classificarErroLeitura('texto solto').mensagem).toBe('texto solto');
        expect(classificarErroLeitura(undefined).tipo).toBe('outro');
    });
    it('bloqueio das próximas partes', () => {
        ['sem-chave', 'cota', 'cancelado'].forEach(t => expect(erroBloqueiaProximas(t)).toBe(true));
        ['timeout', 'json', 'rede', 'outro'].forEach(t => expect(erroBloqueiaProximas(t)).toBe(false));
    });
    it('descreverFalhas', () => {
        expect(descreverFalhas([{ indice: 2, total: 3, erro: { mensagem: 'ops' } }, { indice: 3, total: 3 }])).toEqual(['Parte 2 de 3 não pôde ser lida (ops).', 'Parte 3 de 3 não pôde ser lida.']);
        expect(descreverFalhas(null)).toEqual([]);
    });
    it('mensagens amigáveis fixas não trazem chave/segredo', () => {
        [MENSAGEM_SEM_CHAVE, MENSAGEM_COTA, MENSAGEM_TIMEOUT, MENSAGEM_NAO_JSON, MENSAGEM_CANCELADO].forEach(m => expect(m).not.toMatch(/AIza|SEGREDO/));
    });
});

// A assinatura compara o item cru da IA com o objeto JÁ PREPARADO da prévia (jaExistentes): os dois lados passam pelo mesmo
// preparo (padrões como dadosFaces 20 e alcance 1), então um item cru que omite esses campos bate com o preparado.
import { prepararImportacao } from './importadorIA';
describe('mesclarRespostas x prévia preparada (jaExistentes = objeto de prepararImportacao)', () => {
    it('item cru idêntico ao já preparado é descartado (sem duplicata)', () => {
        const cru = { nome: 'Alfa', descricao: 'desc Alfa' };
        const previa = prepararImportacao([cru], 'habilidade', 1);
        expect(mesclarRespostas([[cru]], previa.map(p => p.objeto))).toHaveLength(0);
    });
    it('assinatura: efeitos diferentes com mesmo nome e descrição mantêm os dois itens (o segundo com aviso)', () => {
        const a = { nome: 'Alfa', descricao: 'd', efeitos: [{ atributo: 'forca', propriedade: 'bonus', valor: 2 }] };
        const b = { nome: 'Alfa', descricao: 'd', efeitos: [{ atributo: 'forca', propriedade: 'bonus', valor: 5 }] };
        const r = mesclarRespostas([[a, b]]);
        expect(r).toHaveLength(2);
        expect(r[1].naoAplicado).toContain(AVISO);
    });
    it('assinatura: efeitos diferentes contra item já existente na prévia mantêm o novo com aviso', () => {
        const a = { nome: 'Alfa', descricao: 'd', efeitos: [{ atributo: 'forca', propriedade: 'bonus', valor: 2 }] };
        const b = { nome: 'Alfa', descricao: 'd', efeitos: [{ atributo: 'forca', propriedade: 'bonus', valor: 5 }] };
        expect(mesclarRespostas([[b]], [a])).toHaveLength(1);
        expect(mesclarRespostas([[a]], [a])).toHaveLength(0);
    });
    it('assinatura: dadosFaces e alcance padrão (omitidos no cru) batem com os explícitos dos dois lados', () => {
        const omitido = { nome: 'Alfa', descricao: 'd' };
        const explicito = { nome: 'Alfa', descricao: 'd', dadosFaces: 20, alcance: 1 };
        expect(mesclarRespostas([[omitido]], [explicito])).toHaveLength(0);
        expect(mesclarRespostas([[explicito]], [omitido])).toHaveLength(0);
        const previa = prepararImportacao([explicito], 'habilidade', 1).map(p => p.objeto);
        expect(mesclarRespostas([[omitido], [explicito]], previa)).toHaveLength(0);
    });
    it('assinatura: dadosFaces ou alcance realmente diferentes não são tratados como iguais', () => {
        const base = { nome: 'Alfa', descricao: 'd', dadosFaces: 8, alcance: 3 };
        expect(mesclarRespostas([[{ ...base }]], [{ ...base }])).toHaveLength(0);
        expect(mesclarRespostas([[{ ...base, dadosFaces: 6 }]], [base])).toHaveLength(1);
        expect(mesclarRespostas([[{ ...base, alcance: 9 }]], [base])).toHaveLength(1);
    });
    it('quando a IA informa todos os campos numéricos iguais aos preparados, descarta', () => {
        const cru = { nome: 'Alfa', descricao: 'desc Alfa', danoQtd: 0, danoFaces: 20, alcance: 1 };
        const previa = prepararImportacao([cru], 'habilidade', 1);
        expect(mesclarRespostas([[cru]], previa.map(p => p.objeto))).toHaveLength(0);
    });
});
