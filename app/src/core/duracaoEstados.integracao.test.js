import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(),
    salvarDummie: vi.fn()
}));

import { salvarCamposPersonagem } from '../services/firebase-sync';
import { normalizarAplicaEstados, resolverEstadosNoAlvo, juntarAplicados, descreverResolucao, coletarEstadosDoGolpe } from './estadosGolpe';
import { normalizarAcaoGatilho, descreverAcaoGatilho, normalizarGatilhos } from './gatilhos';
import { aplicarAcoesNoRascunho, camposDeGatilhosAlterados } from './gatilhosAplicar';
import { prepararItemImportado, montarPromptImportacao } from './importadorIA';
import { prepararTecnicaImportada, montarPromptTecnicas } from './importadorTecnicas';
import { lerGatilhosDaIA } from './gatilhosImportacao';
import { descreverExtrasProposta } from './sextaFeiraCriacao';
import { condicoesComEstados, gravarEstadosNoAlvo, aplicarEstadosDoGolpe } from '../services/posGolpe';

const rngFixo = (v) => () => v;

describe('aplicaEstados com duracao (estadosGolpe)', () => {
    it('normalizar aceita numero e dado; descarta invalidos; sem duracao nada muda (regressao)', () => {
        expect(normalizarAplicaEstados([
            { id: 'imobilizado', stacks: 1, duracao: 1 },
            { id: 'criogenia', stacks: 2, duracao: '4' },
            { id: 'paralisado', stacks: 1 },
            { id: 'lento', stacks: 1, duracao: '1d12+1' },
            { id: 'queimado', stacks: 1, duracao: 'abc' },
            { id: 'sangrando', stacks: 1, duracao: 0 },
            { id: 'amedrontado', stacks: 1, duracao: 500 },
        ])).toEqual([
            { id: 'imobilizado', stacks: 1, duracao: 1 },
            { id: 'criogenia', stacks: 2, duracao: 4 },
            { id: 'lento', stacks: 1, duracao: '1d12+1' },
            { id: 'queimado', stacks: 1 },
            { id: 'sangrando', stacks: 1 },
            { id: 'amedrontado', stacks: 1, duracao: 99 },
        ]);
        expect(normalizarAplicaEstados([{ id: 'lento', stacks: 2 }])).toEqual([{ id: 'lento', stacks: 2 }]);
    });
    it('resolver: numero passa direto, dado e sorteado ao aplicar com o rng injetado', () => {
        const r = resolverEstadosNoAlvo([
            { id: 'imobilizado', stacks: 1, duracao: 1, origem: 'A' },
            { id: 'lento', stacks: 1, duracao: '1d12+1', origem: 'B' },
            { id: 'queimado', stacks: 1, origem: 'C' },
        ], null, { rng: rngFixo(0.999) });
        expect(r.aplicados).toEqual([
            { id: 'imobilizado', stacks: 1, origem: 'A', duracao: 1 },
            { id: 'lento', stacks: 1, origem: 'B', duracao: 13 },
            { id: 'queimado', stacks: 1, origem: 'C' },
        ]);
    });
    it('estado resistido nao sorteia nem aplica duracao', () => {
        const alvo = { forca: { base: 50000 } };
        const r = resolverEstadosNoAlvo([{ id: 'imobilizado', stacks: 1, duracao: 3, teste: { atributo: 'forca', cd: 5 } }], alvo, { rolar: () => 20 });
        expect(r.aplicados).toEqual([]);
        expect(r.resistidos).toHaveLength(1);
    });
    it('juntarAplicados: soma stacks, maior duracao; permanente vence; texto mostra o prazo', () => {
        expect(juntarAplicados([{ id: 'lento', stacks: 1, duracao: 2 }, { id: 'lento', stacks: 1, duracao: 5 }])).toEqual([{ id: 'lento', stacks: 2, duracao: 5 }]);
        expect(juntarAplicados([{ id: 'lento', stacks: 1, duracao: 2 }, { id: 'lento', stacks: 1 }])).toEqual([{ id: 'lento', stacks: 2 }]);
        expect(juntarAplicados([{ id: 'lento', stacks: 1 }])).toEqual([{ id: 'lento', stacks: 1 }]);
        const t = descreverResolucao({ aplicados: [{ id: 'imobilizado', stacks: 1, duracao: 1 }], resistidos: [] }, 'Ana');
        expect(t).toContain('Imobilizado +1 ⏳ 1 turno');
    });
    it('coletarEstadosDoGolpe leva a duracao junto', () => {
        const e = coletarEstadosDoGolpe({ fontes: [{ nome: 'Gelo', aplicaEstados: [{ id: 'criogenia', stacks: 1, duracao: 4 }] }] });
        expect(e).toEqual([{ id: 'criogenia', stacks: 1, duracao: 4, origem: 'Gelo' }]);
    });
});

describe('posGolpe grava a duracao nos alvos', () => {
    const personagem = (ficha = {}) => ({ isPersonagem: true, personagemNome: 'Goku', nome: 'Goku', ficha });
    it('personagem: grava condicoes e duracaoEstados (so os caminhos tocados)', () => {
        salvarCamposPersonagem.mockClear();
        gravarEstadosNoAlvo('x', personagem({}), [{ id: 'imobilizado', stacks: 1, duracao: 1 }], 'Natsu');
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Goku', { condicoes: [{ id: 'imobilizado', stacks: 1, fonte: 'Natsu' }], duracaoEstados: { imobilizado: 1 } });
    });
    it('personagem sem duracao: so condicoes (regressao)', () => {
        salvarCamposPersonagem.mockClear();
        gravarEstadosNoAlvo('x', personagem({}), [{ id: 'lento', stacks: 1 }]);
        expect(Object.keys(salvarCamposPersonagem.mock.calls[0][1])).toEqual(['condicoes']);
    });
    it('renovacao: maior entre restante e novo', () => {
        salvarCamposPersonagem.mockClear();
        gravarEstadosNoAlvo('x', personagem({ condicoes: [{ id: 'criogenia', stacks: 1 }], duracaoEstados: { criogenia: 3 } }), [{ id: 'criogenia', stacks: 1, duracao: 1 }]);
        // duracao nao mudou (3): so condicoes e gravado
        expect(Object.keys(salvarCamposPersonagem.mock.calls[0][1])).toEqual(['condicoes']);
        salvarCamposPersonagem.mockClear();
        gravarEstadosNoAlvo('x', personagem({ condicoes: [{ id: 'criogenia', stacks: 1 }], duracaoEstados: { criogenia: 3 } }), [{ id: 'criogenia', stacks: 1, duracao: 6 }]);
        expect(salvarCamposPersonagem.mock.calls[0][1].duracaoEstados).toEqual({ criogenia: 6 });
    });
    it('dummie: devolve o alvo com condicoes e duracaoEstados para gravar com o Dano', () => {
        const d = { isPersonagem: false, nome: 'Boneco', vida: 10 };
        const novo = gravarEstadosNoAlvo('d1', d, [{ id: 'lento', stacks: 1, duracao: 2 }]);
        expect(novo.condicoes).toEqual([{ id: 'lento', stacks: 1 }]);
        expect(novo.duracaoEstados).toEqual({ lento: 2 });
        expect(condicoesComEstados(d, [{ id: 'lento', stacks: 1, duracao: 2 }])).toEqual([{ id: 'lento', stacks: 1 }]);
    });
    it('aplicarEstadosDoGolpe de ponta a ponta sorteia o dado', () => {
        const d = { isPersonagem: false, nome: 'Boneco', vida: 10 };
        const r = aplicarEstadosDoGolpe({ idAlvo: 'd1', alvo: d, estados: [{ id: 'imobilizado', stacks: 1, duracao: '1d1+4' }] });
        expect(r.alvo.duracaoEstados).toEqual({ imobilizado: 5 });
        expect(r.texto).toContain('⏳ 5 turnos');
    });
});

describe('acao de gatilho aplicarEstado com duracao', () => {
    it('normalizar: duracao opcional (numero, dado ou invalida); sem ela, igual a antes', () => {
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'imobilizado', stacks: 1, duracao: 1 })).toEqual({ tipo: 'aplicarEstado', estado: 'imobilizado', stacks: 1, duracao: 1 });
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'imobilizado', stacks: 1, duracao: '1d12+1' }).duracao).toBe('1d12+1');
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'imobilizado', stacks: 1, duracao: '' })).toEqual({ tipo: 'aplicarEstado', estado: 'imobilizado', stacks: 1 });
        expect(normalizarAcaoGatilho({ tipo: 'aplicarEstado', estado: 'imobilizado', duracao: 'x' })).toEqual({ tipo: 'aplicarEstado', estado: 'imobilizado', stacks: 1 });
    });
    it('descrever: "por N turnos"', () => {
        expect(descreverAcaoGatilho({ tipo: 'aplicarEstado', estado: 'criogenia', stacks: 1, duracao: 4 })).toBe('aplicar 1x Criogenia em mim por 4 turnos');
        expect(descreverAcaoGatilho({ tipo: 'aplicarEstado', estado: 'criogenia', stacks: 1 })).toBe('aplicar 1x Criogenia em mim');
    });
    it('aplicar: numero e dado (rng do contexto), com caminhos e feed', () => {
        const f = {};
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'aplicarEstado', estado: 'imobilizado', stacks: 1, duracao: '1d12+1', gatilhoNome: 'Raio' }], { rng: rngFixo(0.999) });
        expect(f.duracaoEstados).toEqual({ imobilizado: 13 });
        expect(r.caminhos).toEqual(expect.arrayContaining(['condicoes', 'duracaoEstados']));
        expect(r.textos[0]).toContain('⏳ 13 turnos');
    });
    it('aplicar sem duracao: so condicoes (regressao)', () => {
        const f = {};
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'aplicarEstado', estado: 'lento', stacks: 2, gatilhoNome: 'G' }], {});
        expect(f.duracaoEstados).toBeUndefined();
        expect(r.caminhos).toEqual(['condicoes']);
    });
    it('removerEstado e limparCondicoes apagam a duracao', () => {
        const f = { condicoes: [{ id: 'lento', stacks: 1 }, { id: 'queimado', stacks: 1 }], duracaoEstados: { lento: 3, queimado: 2 } };
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'removerEstado', estado: 'lento', gatilhoNome: 'G' }], {});
        expect(f.duracaoEstados).toEqual({ queimado: 2 });
        expect(r.caminhos).toEqual(expect.arrayContaining(['condicoes', 'duracaoEstados']));
        const r2 = aplicarAcoesNoRascunho(f, [{ tipo: 'limparCondicoes', gatilhoNome: 'G' }], {});
        expect(f.duracaoEstados).toBeUndefined();
        expect(r2.caminhos).toEqual(expect.arrayContaining(['condicoes', 'duracaoEstados']));
    });
    it('camposDeGatilhosAlterados inclui duracaoEstados (null quando some)', () => {
        const antes = { condicoes: [{ id: 'lento', stacks: 1 }], duracaoEstados: { lento: 1 } };
        const depois = {};
        expect(camposDeGatilhosAlterados(antes, depois)).toEqual({ condicoes: null, duracaoEstados: null });
        expect(camposDeGatilhosAlterados({}, { duracaoEstados: { lento: 2 } })).toEqual({ duracaoEstados: { lento: 2 } });
    });
    it('gatilho completo guarda a duracao da acao', () => {
        const { gatilhos } = normalizarGatilhos([{ nome: 'Congelar', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'aplicarEstado', estado: 'criogenia', stacks: 1, duracao: 4 }] }]);
        expect(gatilhos[0].acoes[0]).toEqual({ tipo: 'aplicarEstado', estado: 'criogenia', stacks: 1, duracao: 4 });
    });
});

describe('importador por IA e Sexta-Feira', () => {
    it('Poder importado mantem a duracao dos estados (e nao inventa)', () => {
        const r = prepararItemImportado({ nome: 'Corrente', aplicaEstados: [{ id: 'imobilizado', stacks: 1, duracao: 1 }, { id: 'lento', stacks: 1 }] });
        const estados = r.objeto.aplicaEstados;
        expect(estados.find(e => e.id === 'imobilizado').duracao).toBe(1);
        expect(estados.find(e => e.id === 'lento').duracao).toBeUndefined();
    });
    it('Tecnica importada com dado de duracao', () => {
        const r = prepararTecnicaImportada({ nome: 'Gelo', aplicaEstados: [{ id: 'criogenia', stacks: 1, duracao: '1d10' }] }, { elementos: [], elementoPadrao: 'Neutro' });
        expect(r.objeto.aplicaEstados).toEqual([{ id: 'criogenia', stacks: 1, duracao: '1d10' }]);
    });
    it('prompts orientam a duracao e so os estados existentes', () => {
        const p1 = montarPromptImportacao('texto');
        expect(p1).toContain('"duracao"');
        expect(p1).toContain('imobilizado por 1 turno');
        expect(p1).toContain('aplicarEstado {"estado":"<id>","stacks":N,"duracao"');
        expect(montarPromptTecnicas('texto', [], 'Neutro')).toContain('"duracao"');
    });
    it('gatilho vindo da IA mantem a duracao da acao', () => {
        const r = lerGatilhosDaIA([{ nome: 'Paralisia', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'aplicarEstado', estado: 'imobilizado', stacks: 1, duracao: '1d10' }] }]);
        expect(r.gatilhos[0].acoes[0].duracao).toBe('1d10');
    });
    it('resumo da proposta da Sexta-Feira mostra o prazo', () => {
        const linhas = descreverExtrasProposta({ aplicaEstados: [{ id: 'imobilizado', stacks: 1, duracao: 1 }] });
        expect(linhas[0]).toContain('por 1 turno');
    });
});
