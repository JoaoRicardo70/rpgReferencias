import { describe, it, expect, vi } from 'vitest';
import { normalizarAcaoGatilho, normalizarGatilhos, descreverGatilho, descreverEscolha, descreverAcaoGatilho, MIN_OPCOES_ESCOLHA, LIMITE_OPCOES_ESCOLHA } from './gatilhos.js';
import { aplicarAcoesNoRascunho, dispararEventoNaFicha } from './gatilhosAplicar.js';
import { aplicarDanoNaVida } from './danoVida.js';

// QA pedirEscolha: normalizacao, descricao e motor (escolher sincrono, null/invalido/excecao, perguntas, encadeamento, regressao rolarTabela).
const F = 1000;
const vital = (base, atual = base) => ({ base, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual, regeneracao: 0 });
const ficha = (extra = {}, vidaExibida = 50000) => ({
    vida: vital(100000000, vidaExibida * F), mana: vital(100000000, 100 * F), aura: vital(100000000, 100 * F), chakra: vital(100000000, 100 * F), corpo: vital(100000000, 100 * F),
    poderes: [], inventario: [], passivas: [], contadores: [], ...extra,
});
const MAX = 100000 * F;
const msg = (t) => ({ tipo: 'mensagem', texto: t });
const opc = (texto, ...acoes) => ({ texto, acoes: acoes.length ? acoes : [msg(texto)] });
const escolha = (opcoes, extra = {}) => ({ tipo: 'pedirEscolha', opcoes, ...extra });
const duas = () => [opc('A'), opc('B')];
const norm = (b, o = {}) => normalizarAcaoGatilho(b, { eventoTipo: 'turnoInicio', ...o });
const clone = (o) => JSON.parse(JSON.stringify(o));
const dispara = (acoes, ctx = {}, extraFicha = {}, evento = 'turnoInicio') => {
    const f = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [{ id: 'g1', nome: 'G', evento: { tipo: evento }, acoes }] }], ...extraFicha });
    const r = dispararEventoNaFicha(f, { tipo: evento }, { cenaId: 'c1', nome: 'Eu', eventoId: 'e1', ...ctx });
    return { f, r };
};

describe('normalizarAcaoGatilho pedirEscolha - Happy Path', () => {
    it('aceita 2 opcoes e mantem pergunta e textos', () => {
        const r = norm(escolha(duas(), { pergunta: 'Qual?' }));
        expect(r).toEqual({ tipo: 'pedirEscolha', pergunta: 'Qual?', opcoes: [{ texto: 'A', acoes: [msg('A')] }, { texto: 'B', acoes: [msg('B')] }] });
    });
    it('aceita 6 opcoes (limite)', () => {
        expect(LIMITE_OPCOES_ESCOLHA).toBe(6); expect(MIN_OPCOES_ESCOLHA).toBe(2);
        expect(norm(escolha(Array.from({ length: 6 }, (_, i) => opc('O' + i)))).opcoes).toHaveLength(6);
    });
    it('sem pergunta nao grava a chave pergunta', () => {
        expect('pergunta' in norm(escolha(duas()))).toBe(false);
        expect('pergunta' in norm(escolha(duas(), { pergunta: '   ' }))).toBe(false);
    });
    it('acoes das opcoes sao normalizadas (valor convertido)', () => {
        const r = norm(escolha([opc('Cura', { tipo: 'curar', modo: 'percMax', valor: '10' }), opc('X')]));
        expect(r.opcoes[0].acoes[0]).toEqual({ tipo: 'curar', modo: 'percMax', valor: 10 });
    });
});

describe('normalizarAcaoGatilho pedirEscolha - Edge Cases', () => {
    it('texto da opcao > 80 e CORTADO em 80; pergunta > 120 e CORTADA em 120', () => {
        const r = norm(escolha([opc('x'.repeat(200)), opc('B')], { pergunta: 'p'.repeat(300) }));
        expect(r.opcoes[0].texto).toHaveLength(80);
        expect(r.pergunta).toHaveLength(120);
    });
    it('texto com espacos nas pontas e aparado; unicode preservado', () => {
        const r = norm(escolha([opc('  Curar 💚 ação  '), opc('B')]));
        expect(r.opcoes[0].texto).toBe('Curar 💚 ação');
    });
    it('opcao so com espacos no texto recusa a acao toda', () => {
        expect(norm(escolha([opc('   '), opc('B')]))).toBeNull();
    });
    it('opcao com 6 acoes passa; 7 recusa', () => {
        const mk = (n) => Array.from({ length: n }, (_, i) => msg('m' + i));
        expect(norm(escolha([{ texto: 'A', acoes: mk(6) }, opc('B')]))).not.toBeNull();
        expect(norm(escolha([{ texto: 'A', acoes: mk(7) }, opc('B')]))).toBeNull();
    });
    it('anularDano dentro da opcao so em danoQueZeraria', () => {
        const b = escolha([opc('Anula', { tipo: 'anularDano' }), opc('B')]);
        expect(norm(b, { eventoTipo: 'danoQueZeraria' })).not.toBeNull();
        expect(norm(b, { eventoTipo: 'turnoInicio' })).toBeNull();
        expect(norm(b, { eventoTipo: 'atingido' })).toBeNull();
    });
    it('normalizarGatilhos preserva pedirEscolha, sem undefined', () => {
        const { gatilhos } = normalizarGatilhos([{ nome: 'G', evento: { tipo: 'turnoInicio' }, acoes: [escolha(duas(), { pergunta: 'Q' })] }]);
        expect(gatilhos).toHaveLength(1);
        expect(gatilhos[0].acoes[0].tipo).toBe('pedirEscolha');
        expect(JSON.stringify(gatilhos, (k, v) => (v === undefined ? '__U__' : v))).not.toContain('__U__');
    });
});

describe('normalizarAcaoGatilho pedirEscolha - Error Cases', () => {
    it.each([
        ['sem opcoes', {}],
        ['opcoes nao-array', { opcoes: 'x' }],
        ['0 opcoes', { opcoes: [] }],
        ['1 opcao', { opcoes: [opc('A')] }],
        ['7 opcoes', { opcoes: Array.from({ length: 7 }, (_, i) => opc('O' + i)) }],
        ['opcao null', { opcoes: [opc('A'), null] }],
        ['opcao string', { opcoes: [opc('A'), 'B'] }],
        ['opcao sem texto', { opcoes: [opc('A'), { acoes: [msg('x')] }] }],
        ['opcao sem acoes', { opcoes: [opc('A'), { texto: 'B' }] }],
        ['opcao com acoes vazias', { opcoes: [opc('A'), { texto: 'B', acoes: [] }] }],
        ['opcao com acao invalida', { opcoes: [opc('A'), { texto: 'B', acoes: [{ tipo: 'curar', valor: -1 }] }] }],
        ['opcao com acao desconhecida', { opcoes: [opc('A'), { texto: 'B', acoes: [{ tipo: 'xyz' }] }] }],
    ])('recusa %s', (_n, extra) => {
        expect(norm({ tipo: 'pedirEscolha', ...extra })).toBeNull();
    });
    it('recusa pedirEscolha dentro de pedirEscolha', () => {
        expect(norm(escolha([opc('A', escolha(duas())), opc('B')]))).toBeNull();
    });
    it('recusa rolarTabela dentro de opcao', () => {
        const tab = { tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 4, acoes: [msg('x')] }] };
        expect(norm(escolha([opc('A', tab), opc('B')]))).toBeNull();
    });
    it('recusa pedirEscolha dentro de rolarTabela', () => {
        const tab = { tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 4, acoes: [escolha(duas())] }] };
        expect(norm(tab)).toBeNull();
    });
    it('recusa pedirEscolha chamado com dentroDeTabela', () => {
        expect(norm(escolha(duas()), { dentroDeTabela: true })).toBeNull();
    });
    it('null/undefined/string nao lancam', () => {
        expect(() => norm(null)).not.toThrow();
        expect(norm(undefined)).toBeNull();
        expect(norm('pedirEscolha')).toBeNull();
    });
});

describe('descreverGatilho / descreverEscolha', () => {
    const a = norm(escolha([opc('Curar', { tipo: 'curar', modo: 'percMax', valor: 10 }), opc('Duplo', msg('oi'), { tipo: 'limparCondicoes' })], { pergunta: 'Qual?' }));
    it('descreverEscolha lista opcoes com pergunta e acoes', () => {
        const t = descreverEscolha(a);
        expect(t).toContain('escolher (Qual?)');
        expect(t).toContain('"Curar" → curar 10% da Vida máxima');
        expect(t).toContain(' | ');
        expect(t).toContain('"Duplo" →');
        expect(t).toContain(' + ');
    });
    it('sem pergunta nao imprime parenteses', () => {
        expect(descreverEscolha(norm(escolha(duas())))).toMatch(/^escolher: /);
    });
    it('descreverAcaoGatilho delega para descreverEscolha', () => {
        expect(descreverAcaoGatilho(a)).toBe(descreverEscolha(a));
    });
    it('descreverGatilho inclui a escolha', () => {
        const { gatilhos } = normalizarGatilhos([{ nome: 'G', evento: { tipo: 'turnoInicio' }, acoes: [a] }]);
        expect(descreverGatilho(gatilhos[0])).toContain('escolher (Qual?)');
    });
    it('entrada sem opcoes nao lanca', () => {
        expect(descreverEscolha({ tipo: 'pedirEscolha' })).toBe('escolher: ');
    });
});

describe('motor: pedirEscolha em dispararEventoNaFicha', () => {
    const acao = () => norm(escolha([opc('Cura', { tipo: 'curar', modo: 'percMax', valor: 10 }), opc('Aviso', msg('aviso!'))], { pergunta: 'Qual?' }));

    it('escolha valida aplica SO a opcao escolhida e registra o feed', () => {
        const escolher = vi.fn(() => 1);
        const { f, r } = dispara([acao()], { escolher });
        expect(escolher).toHaveBeenCalledTimes(1);
        const [pergunta, textos, chave] = escolher.mock.calls[0];
        expect(pergunta).toBe('Qual?'); expect(textos).toEqual(['Cura', 'Aviso']); expect(typeof chave).toBe('string');
        expect(r.textos).toContain('G: escolheu "Aviso"');
        expect(r.textos.join('|')).toContain('aviso!');
        expect(f.vida.atual).toBe(50000 * F);
    });
    it('escolha 0 aplica a primeira opcao e altera a vida', () => {
        const { f, r } = dispara([acao()], { escolher: () => 0 });
        expect(r.textos).toContain('G: escolheu "Cura"');
        expect(f.vida.atual).toBeGreaterThan(50000 * F);
    });
    it('sem pergunta usa texto padrao com o nome', () => {
        const escolher = vi.fn(() => 0);
        dispara([norm(escolha(duas()))], { escolher });
        expect(escolher.mock.calls[0][0]).toBe('G: escolha uma opção');
    });
    it.each([['null', null], ['undefined', undefined], ['fora da faixa (2)', 2], ['negativo', -1], ['NaN', NaN], ['string "0"', '0'], ['fracionario', 0.5], ['Infinity', Infinity]])('escolher devolve %s => nada aplicado + feed de ignorada', (_n, v) => {
        const { f, r } = dispara([acao()], { escolher: () => v });
        expect(r.textos).toContain('G: escolha ignorada (nenhuma opção aplicada)');
        expect(r.textos.join('|')).not.toContain('escolheu');
        expect(f.vida.atual).toBe(50000 * F);
    });
    it('escolher que lanca excecao => ignorada, sem propagar', () => {
        const { r } = dispara([acao()], { escolher: () => { throw new Error('boom'); } });
        expect(r.textos).toContain('G: escolha ignorada (nenhuma opção aplicada)');
    });
    it('sem escolher (Mestre/clone/teste) => ignorada', () => {
        const { f, r } = dispara([acao()], {});
        expect(r.textos).toContain('G: escolha ignorada (nenhuma opção aplicada)');
        expect(f.vida.atual).toBe(50000 * F);
    });
    it('escolher nao-funcao => ignorada', () => {
        expect(dispara([acao()], { escolher: 'x' }).r.textos).toContain('G: escolha ignorada (nenhuma opção aplicada)');
        expect(dispara([acao()], { escolher: {} }).r.textos).toContain('G: escolha ignorada (nenhuma opção aplicada)');
    });
    it('ctx.perguntas array: NUNCA chama escolher e nao escreve no feed', () => {
        const escolher = vi.fn(() => 0);
        const { r } = dispara([acao()], { escolher, perguntas: [] });
        expect(escolher).not.toHaveBeenCalled();
        expect(r.textos.join('|')).not.toContain('escolha ignorada');
        expect(r.textos.join('|')).not.toContain('escolheu');
    });
    it('opcao com varias acoes aplica todas na ordem', () => {
        const a = norm(escolha([opc('Dupla', msg('um'), msg('dois')), opc('B')]));
        const { r } = dispara([a], { escolher: () => 0 });
        const j = r.textos.join('|');
        expect(j.indexOf('um')).toBeGreaterThan(-1);
        expect(j.indexOf('dois')).toBeGreaterThan(j.indexOf('um'));
    });
    it('textos com aspas/unicode aparecem no feed', () => {
        const a = norm(escolha([opc('Ação "forte" 🔥'), opc('B')]));
        const { r } = dispara([a], { escolher: () => 0 });
        expect(r.textos).toContain('G: escolheu "Ação "forte" 🔥"');
    });
});

describe('motor: encadeamento', () => {
    it('opcao com danoEmSi aplica o dano usando escolher', () => {
        const a = norm(escolha([opc('Sofrer', { tipo: 'danoEmSi', modo: 'fixo', valor: 1000 }), opc('B')]));
        const { f, r } = dispara([a], { escolher: () => 0, vidaMaxBruta: MAX });
        expect(r.textos).toContain('G: escolheu "Sofrer"');
        expect(f.vida.atual).toBeLessThan(50000 * F);
    });
    it('danoEmSi na opcao repassa o MESMO escolher ao gatilho de vidaAbaixoDe que tambem pede escolha', () => {
        const interno = norm(escolha([opc('Interna1'), opc('Interna2')]), { eventoTipo: 'vidaAbaixoDe' });
        const externo = norm(escolha([opc('Sofrer', { tipo: 'danoEmSi', modo: 'percMax', valor: 10 }), opc('B')]));
        const f = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [
            { id: 'g1', nome: 'Ext', evento: { tipo: 'turnoInicio' }, acoes: [externo] },
            { id: 'g2', nome: 'Int', evento: { tipo: 'vidaAbaixoDe', de: 20, ate: 10 }, acoes: [interno] },
        ] }] }, 50000);
        const escolher = vi.fn(() => 0);
        const r = dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'Eu', eventoId: 'e9', escolher, vidaMaxBruta: MAX });
        expect(r.textos.join('|')).toContain('Ext: escolheu "Sofrer"');
        const perguntasFeitas = escolher.mock.calls.map(c => c[1].join('/'));
        expect(perguntasFeitas).toContain('Interna1/Interna2');
    });
    it('aplicarAcoesNoRascunho diretamente com escolher', () => {
        const a = { ...norm(escolha(duas())), gatilhoId: 'g', gatilhoNome: 'G', chave: 'k' };
        const escolher = vi.fn(() => 1);
        const r = aplicarAcoesNoRascunho(ficha(), [a], { cenaId: 'c', nome: 'Eu', escolher });
        expect(escolher).toHaveBeenCalledWith('G: escolha uma opção', ['A', 'B'], 'k');
        expect(r.textos).toContain('G: escolheu "B"');
    });
    it('aplicarAcoesNoRascunho sem ctx.escolher => ignorada', () => {
        const a = norm(escolha(duas()));
        expect(aplicarAcoesNoRascunho(ficha(), [a], { cenaId: 'c', nome: 'Eu' }).textos).toContain('Gatilho: escolha ignorada (nenhuma opção aplicada)');
    });
    const gatZera = (a) => ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [{ id: 'g1', nome: 'G', evento: { tipo: 'danoQueZeraria' }, acoes: [a] }] }] }, 10);
    const ctxDano = (extra = {}) => ({ nome: 'Eu', vidaMaxBruta: MAX, cenaId: 'c', eventoId: 'ev', ...extra });
    const ANULA = () => norm(escolha([opc('Anula', { tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }), opc('B')]), { eventoTipo: 'danoQueZeraria' });
    it('aplicarDanoNaVida repassa ctx.escolher (danoQueZeraria anula o dano)', () => {
        const escolher = vi.fn(() => 0);
        const f = gatZera(ANULA());
        const r = aplicarDanoNaVida(f, 1e9, ctxDano({ escolher }));
        expect(escolher).toHaveBeenCalled();
        expect(r.anulado).toBe(true);
    });
    it('aplicarDanoNaVida sem escolher: dano NAO e anulado', () => {
        const r = aplicarDanoNaVida(gatZera(ANULA()), 1e9, ctxDano());
        expect(r.anulado).toBeFalsy();
    });
    it('aplicarDanoNaVida com ctx.perguntas array nunca abre dialogo', () => {
        const escolher = vi.fn(() => 0);
        aplicarDanoNaVida(gatZera(ANULA()), 1e9, ctxDano({ escolher, perguntas: [] }));
        expect(escolher).not.toHaveBeenCalled();
    });
});

describe('regressao rolarTabela', () => {
    const tab = { tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 2, texto: 'baixo', acoes: [msg('b')] }, { ate: 4, texto: 'alto', acoes: [msg('a')] }] };
    it('continua normalizando e rolando', () => {
        const n = norm(tab);
        expect(n.resultados).toHaveLength(2);
        const { r } = dispara([n], { rng: () => 0.9 });
        expect(r.textos.join('|')).toContain('rolou 4 (d4): alto');
    });
    it('rolarTabela dentro de rolarTabela segue recusado', () => {
        expect(norm({ ...tab, resultados: [{ ate: 4, acoes: [tab] }] })).toBeNull();
    });
    it('rolarTabela nao chama escolher', () => {
        const escolher = vi.fn(() => 0);
        dispara([norm(tab)], { escolher, rng: () => 0 });
        expect(escolher).not.toHaveBeenCalled();
    });
    it('descreverTabela inalterada', () => {
        expect(descreverAcaoGatilho(norm(tab))).toMatch(/^rola 1d4: 1-2→"baixo"/);
    });
});
