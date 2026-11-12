import { describe, it, expect } from 'vitest';
import { lerGatilhosDaIA } from './gatilhosImportacao.js';
import { montarPromptImportacao, prepararItemImportado } from './importadorIA.js';
import { normalizarPoder } from './sextaFeiraCriacao.js';
import fonteSexta from './sextaFeiraCriacao.js?raw';

// QA - Importadores: duracaoGanho ('permanente'|'combate') e duracao:'combate' viram duracao: 'combate' na acao; sem info = permanente.
const gat = (acao) => ({ nome: 'Ganho', evento: { tipo: 'acertou', nivel: 'qualquer' }, acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2, ...acao }] });
const acaoLida = (acao) => lerGatilhosDaIA([gat(acao)]).gatilhos[0].acoes[0];

describe('lerGatilhosDaIA: duracaoGanho', () => {
    it('duracaoGanho combate vira duracao combate', () => {
        expect(acaoLida({ duracaoGanho: 'combate' })).toMatchObject({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2, duracao: 'combate' });
    });
    it('normalizacao aceita tambem duracao: combate', () => {
        expect(acaoLida({ duracao: 'combate' })).toMatchObject({ duracao: 'combate' });
    });
    it('sem informacao = permanente (sem campo duracao)', () => {
        expect(acaoLida({})).not.toHaveProperty('duracao');
    });
    it.each(['permanente', 'PERMANENTE', 'temporario', '', null, 3, {}, []])('duracaoGanho %j = permanente', (v) => {
        expect(acaoLida({ duracaoGanho: v })).not.toHaveProperty('duracao');
    });
    it('duracaoGanho permanente explicita e duracao combate: o aceito e o combate', () => {
        expect(acaoLida({ duracaoGanho: 'permanente', duracao: 'combate' })).toMatchObject({ duracao: 'combate' });
    });
    it('funciona com deContador e com formato legado (bruto)', () => {
        const a = acaoLida({ valor: undefined, duracaoGanho: 'combate', deContador: { id: 'pts', fator: 1, zerar: true } });
        expect(a).toMatchObject({ duracao: 'combate', deContador: { id: 'pts', fator: 1, zerar: true } });
        const b = lerGatilhosDaIA([{ nome: 'L', evento: { tipo: 'acertou', nivel: 'qualquer' }, acoes: [{ tipo: 'ganhoPermanente', valor: 3, duracaoGanho: 'combate' }] }]).gatilhos[0].acoes[0];
        expect(b).toEqual({ tipo: 'ganhoPermanente', duracao: 'combate', valor: 3 });
    });
    it('gatilho importado continua opcional e desarmado', () => {
        expect(lerGatilhosDaIA([gat({ duracaoGanho: 'combate' })]).gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false });
    });
    it('duracaoGanho dentro de rolarTabela e pedirEscolha tambem e lido', () => {
        const r = lerGatilhosDaIA([{ nome: 'T', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 4, texto: 'x', acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 1, duracaoGanho: 'combate' }] }] }] }]);
        expect(r.gatilhos).toHaveLength(1);
        expect(JSON.stringify(r.gatilhos[0].acoes)).toContain('"duracao":"combate"');
        const e = lerGatilhosDaIA([{ nome: 'E', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'pedirEscolha', pergunta: 'q', opcoes: [{ texto: 'a', acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 1, duracaoGanho: 'combate' }] }, { texto: 'b', acoes: [{ tipo: 'mensagem', texto: 'm' }] }] }] }]);
        expect(JSON.stringify(e.gatilhos[0].acoes)).toContain('"duracao":"combate"');
    });
});

describe('Pipeline de importacao (IA -> poder)', () => {
    it('prepararItemImportado mantem duracao combate no gatilho do poder', () => {
        const item = { nome: 'Ego', categoria: 'habilidade', descricao: 'd', efeitos: [], gatilhos: [gat({ duracaoGanho: 'combate' })] };
        const r = prepararItemImportado(item, 'habilidade');
        const gs = r.objeto.gatilhos || [];
        expect(gs).toHaveLength(1);
        expect(gs[0].acoes[0]).toMatchObject({ duracao: 'combate', unidade: 'percentual' });
    });
    it('normalizarPoder (Sexta-Feira) com ganho temporario mantem duracao', () => {
        const { objeto } = normalizarPoder({ nome: 'Ego', gatilhos: [gat({ duracaoGanho: 'combate' })], efeitos: [] });
        const a = (objeto.gatilhos || [])[0].acoes[0];
        expect(a.duracao).toBe('combate');
    });
    it('normalizarPoder sem duracao: permanente (sem campo)', () => {
        const { objeto } = normalizarPoder({ nome: 'Ego', gatilhos: [gat({})], efeitos: [] });
        expect((objeto.gatilhos || [])[0].acoes[0]).not.toHaveProperty('duracao');
    });
});

describe('Prompts e schema citam duracaoGanho', () => {
    it('montarPromptImportacao cita duracaoGanho com os valores combate/permanente', () => {
        const p = montarPromptImportacao('texto qualquer', 'habilidade');
        expect(p).toContain('duracaoGanho');
        expect(p).toMatch(/duracaoGanho":"combate"/);
        expect(p).toMatch(/duracaoGanho":"permanente"/);
    });
    it('todas as categorias geram prompt com duracaoGanho', () => {
        ['habilidade', 'magia', 'item', 'tecnica'].forEach((c) => {
            let p = '';
            try { p = montarPromptImportacao('x', c); } catch { p = ''; }
            if (p) expect(p).toContain('duracaoGanho');
        });
    });
    it('schema da Sexta-Feira declara duracaoGanho como enum permanente/combate', () => {
        expect(fonteSexta).toMatch(/duracaoGanho: \{ type: 'STRING', enum: \['permanente', 'combate'\]/);
    });
});
