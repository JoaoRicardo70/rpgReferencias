import { describe, it, expect } from 'vitest';
import { lerGatilhosDaIA, finalizarGatilho, decidirModoDoGatilho } from './gatilhosImportacao.js';
import { normalizarPoder } from './sextaFeiraCriacao.js';
import { prepararItemImportado } from './importadorIA.js';

// QA pedirEscolha nos importadores (lerGatilhosDaIA, Sexta-Feira, importadorIA): aceita/recusa e mantém opcional + desarmado.
const msg = (t) => ({ tipo: 'mensagem', texto: t });
const op = (texto, ...a) => ({ texto, acoes: a.length ? a : [msg(texto)] });
const esc = (opcoes, extra = {}) => ({ tipo: 'pedirEscolha', opcoes, ...extra });
const gat = (acoes, extra = {}) => ({ nome: 'Escolha', evento: { tipo: 'turnoInicio' }, acoes, ...extra });

describe('lerGatilhosDaIA - pedirEscolha', () => {
    it('aceita escolha válida e força opcional + desarmado', () => {
        const r = lerGatilhosDaIA([gat([esc([op('A'), op('B')], { pergunta: 'Q?' })])]);
        expect(r.naoAplicado).toEqual([]);
        expect(r.gatilhos).toHaveLength(1);
        expect(r.gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false });
        expect(r.gatilhos[0].acoes[0]).toMatchObject({ tipo: 'pedirEscolha', pergunta: 'Q?' });
        expect(r.gatilhos[0].acoes[0].opcoes).toHaveLength(2);
    });
    it('a IA tentando mandar modo automático/armado: continua opcional e desarmado', () => {
        const r = lerGatilhosDaIA([gat([esc([op('A'), op('B')])], { modo: 'automatico', armado: true, perguntar: true })]);
        expect(r.gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false });
    });
    it('6 opções passam; 7 opções recusadas com motivo de limite', () => {
        const mk = (n) => Array.from({ length: n }, (_, i) => op('O' + i));
        expect(lerGatilhosDaIA([gat([esc(mk(6))])]).gatilhos).toHaveLength(1);
        const r = lerGatilhosDaIA([gat([esc(mk(7))])]);
        expect(r.gatilhos).toEqual([]);
        expect(r.naoAplicado.join('|')).toMatch(/Escolha.*mais de 6 opções/);
    });
    it('opção com mais de 6 ações é recusada com motivo', () => {
        const r = lerGatilhosDaIA([gat([esc([op('A', ...Array.from({ length: 7 }, (_, i) => msg('m' + i))), op('B')])])]);
        expect(r.gatilhos).toEqual([]);
        expect(r.naoAplicado.join('|')).toMatch(/opção da escolha com mais de 6 ações/);
    });
    it.each([
        ['1 opção', [op('A')]],
        ['opção sem texto', [op('A'), { acoes: [msg('x')] }]],
        ['opção sem ação', [op('A'), { texto: 'B', acoes: [] }]],
        ['aninhada', [op('A', esc([op('x'), op('y')])), op('B')]],
        ['com rolarTabela dentro', [op('A', { tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 4, acoes: [msg('x')] }] }), op('B')]],
    ])('recusa %s e não quebra', (_n, opcoes) => {
        const r = lerGatilhosDaIA([gat([esc(opcoes)])]);
        expect(r.gatilhos).toEqual([]);
        expect(r.naoAplicado.length).toBeGreaterThan(0);
    });
    it('anularDano dentro de opção: aceito só em danoQueZeraria', () => {
        const base = (ev) => gat([esc([op('A', { tipo: 'anularDano' }), op('B')])], { evento: { tipo: ev } });
        expect(lerGatilhosDaIA([base('danoQueZeraria')]).gatilhos).toHaveLength(1);
        expect(lerGatilhosDaIA([base('turnoInicio')]).gatilhos).toHaveLength(0);
    });
    it('textos longos são cortados em silêncio (opção 80, pergunta 120)', () => {
        const r = lerGatilhosDaIA([gat([esc([op('x'.repeat(200)), op('B')], { pergunta: 'p'.repeat(500) })])]);
        expect(r.gatilhos[0].acoes[0].opcoes[0].texto).toHaveLength(80);
        expect(r.gatilhos[0].acoes[0].pergunta).toHaveLength(120);
    });
    it('referências a contador/Poder dentro de opção geram aviso de conferência', () => {
        const r = lerGatilhosDaIA([gat([esc([op('A', { tipo: 'contador', id: 'raiva', op: 'somar', valor: 1 }, { tipo: 'ligarPoder', poderId: 'Fogo' }), op('B')])])]);
        const av = r.avisos.join('|');
        expect(av).toContain('contador "raiva"'); expect(av).toContain('Poder "Fogo"');
    });
    it('opcoes null / acoes não-array não lançam', () => {
        expect(() => lerGatilhosDaIA([gat([{ tipo: 'pedirEscolha', opcoes: null }])])).not.toThrow();
        expect(() => lerGatilhosDaIA([gat([esc([null, { texto: 'x', acoes: 'z' }])])])).not.toThrow();
        expect(lerGatilhosDaIA([gat([esc([null, { texto: 'x', acoes: 'z' }])])]).gatilhos).toEqual([]);
    });
    it('regressão: rolarTabela segue aceito', () => {
        const r = lerGatilhosDaIA([gat([{ tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 4, acoes: [msg('x')] }] }])]);
        expect(r.gatilhos).toHaveLength(1);
        expect(r.gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false });
    });
    it('decidir/finalizar: automático remove armado; sem resposta vira opcional desarmado (escolha preservada)', () => {
        const [g] = lerGatilhosDaIA([gat([esc([op('A'), op('B')])])]).gatilhos;
        expect(decidirModoDoGatilho(g, 'automatico').armado).toBeUndefined();
        expect(finalizarGatilho({ ...g, modoPendente: true })).toMatchObject({ modo: 'opcional', armado: false });
        expect(finalizarGatilho(g).acoes[0].tipo).toBe('pedirEscolha');
    });
});

describe('Sexta-Feira (normalizarPoder) - pedirEscolha', () => {
    it('aceita a ação, avisa que chega opcional/desarmado e mantém a escolha', () => {
        const { objeto, avisos } = normalizarPoder({ nome: 'Fênix', categoria: 'habilidade', gatilhos: [gat([esc([op('Curar', { tipo: 'curar', modo: 'percMax', valor: 10 }), op('Escudo', { tipo: 'escudo', nome: 'E', valor: 50 })], { pergunta: 'Qual?' })])] });
        expect(objeto.gatilhos).toHaveLength(1);
        expect(objeto.gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false });
        expect(objeto.gatilhos[0].acoes[0].opcoes.map(o => o.texto)).toEqual(['Curar', 'Escudo']);
        expect(avisos.join('|')).toMatch(/OPCIONAIS e DESARMADOS/);
    });
    it('recusa escolha inválida sem criar "meio gatilho"', () => {
        const { objeto } = normalizarPoder({ nome: 'X', gatilhos: [gat([esc([op('A')])])] });
        expect('gatilhos' in objeto && objeto.gatilhos.length > 0).toBe(false);
    });
    it('gatilho mal formado junto a um bom: só o bom fica', () => {
        const { objeto } = normalizarPoder({ nome: 'X', gatilhos: [gat([esc([op('A')])], { nome: 'Ruim' }), gat([esc([op('A'), op('B')])], { nome: 'Bom' })] });
        expect(objeto.gatilhos.map(g => g.nome)).toEqual(['Bom']);
    });
});

describe('importadorIA (prepararItemImportado) - pedirEscolha', () => {
    it('preserva escolha válida como opcional + desarmado', () => {
        const r = prepararItemImportado({ nome: 'Fênix', categoria: 'habilidade', gatilhos: [gat([esc([op('A'), op('B')])])] });
        expect(r.objeto.gatilhos).toHaveLength(1);
        expect(r.objeto.gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false });
        expect(r.objeto.gatilhos[0].acoes[0].tipo).toBe('pedirEscolha');
    });
    it('escolha inválida não quebra o item', () => {
        const r = prepararItemImportado({ nome: 'Fênix', categoria: 'habilidade', gatilhos: [gat([esc([op('A')])])] });
        expect(r.objeto.nome).toBe('Fênix');
        expect(!r.objeto.gatilhos || r.objeto.gatilhos.length === 0).toBe(true);
    });
});
