import { describe, it, expect } from 'vitest';
import {
    montarPromptImportacao, lerRespostaDaIA, prepararItemImportado, prepararImportacao, montarPoderFinal, montarPoderImportado,
    contarPendentes, contarGatilhosPendentes, listarGatilhosImportados, decidirModoGatilhoImportado, decidirTodosOsGatilhos,
    decidirTodosOsIncertos,
} from './importadorIA';
import { lerGatilhosDaIA } from './gatilhosImportacao';
import { normalizarGatilhos, coletarGatilhos, EVENTOS_GATILHO, ACOES_GATILHO } from './gatilhos';
import { normalizarPoder, normalizarProposta, resumirProposta, descreverExtrasProposta, DECLARACOES_CRIACAO } from './sextaFeiraCriacao';

const volta = () => ({ nome: 'Volta das cinzas', evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'definirVida', valor: 1 }, { tipo: 'imunidadeTotal', duracaoTurnos: 1 }] });
const turno = () => ({ nome: 'Regeneração', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'curar', modo: 'percMax', valor: 5 }] });

describe('prompt de importação: gatilhos', () => {
    it('documenta todos os eventos e ações reais e o limite sem "luta"', () => {
        const p = montarPromptImportacao('texto');
        expect(p).toContain('"gatilhos"');
        EVENTOS_GATILHO.forEach(e => expect(p).toContain(e.id));
        ACOES_GATILHO.forEach(a => expect(p).toContain(a.id));
        expect(p).toMatch(/"luta" NÃO existe/);
        expect(p).toContain('NÃO escreva "modo", "armado"');
    });
});

describe('lerGatilhosDaIA', () => {
    it('aceita gatilhos válidos e os entrega opcionais e desarmados', () => {
        const r = lerGatilhosDaIA([volta(), turno()]);
        expect(r.naoAplicado).toEqual([]);
        expect(r.gatilhos).toHaveLength(2);
        r.gatilhos.forEach(g => { expect(g.modo).toBe('opcional'); expect(g.armado).toBe(false); });
        expect(r.gatilhos[0].limite).toEqual({ max: 1, por: 'cena' });
        // o que sai passa por normalizarGatilhos sem perdas
        expect(normalizarGatilhos(r.gatilhos).descartados).toEqual([]);
    });

    it('a IA nunca decide modo, armado, perguntar, passivo nem mestreDesligou', () => {
        const r = lerGatilhosDaIA([{ ...volta(), modo: 'automatico', armado: true, perguntar: true, passivo: true, mestreDesligou: true }]);
        const g = r.gatilhos[0];
        expect(g.modo).toBe('opcional');
        expect(g.armado).toBe(false);
        expect(g.perguntar).toBeUndefined();
        expect(g.passivo).toBeUndefined();
        expect(g.mestreDesligou).toBeUndefined();
    });

    it('limite por "luta"/"combate" vira cena', () => {
        ['luta', 'combate', 'por luta', 'Batalha'].forEach((por) => {
            const r = lerGatilhosDaIA([{ ...volta(), limite: { max: 1, por } }]);
            expect(r.gatilhos[0].limite).toEqual({ max: 1, por: 'cena' });
        });
    });

    it('período desconhecido descarta o gatilho inteiro para naoAplicado', () => {
        const r = lerGatilhosDaIA([{ ...volta(), limite: { max: 1, por: 'semana' } }]);
        expect(r.gatilhos).toEqual([]);
        expect(r.naoAplicado[0]).toContain('Volta das cinzas');
        expect(r.naoAplicado[0]).toContain('semana');
    });

    it('inválidos: evento/ação desconhecidos, sem ações, anularDano fora de danoQueZeraria, não-objeto', () => {
        const r = lerGatilhosDaIA([
            { nome: 'A', evento: { tipo: 'voar' }, acoes: [{ tipo: 'curar', valor: 1 }] },
            { nome: 'B', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'explodir' }] },
            { nome: 'C', evento: { tipo: 'turnoInicio' }, acoes: [] },
            { nome: 'D', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'anularDano' }] },
            'texto', null,
            turno(),
        ]);
        expect(r.gatilhos.map(g => g.nome)).toEqual(['Regeneração']);
        expect(r.naoAplicado).toHaveLength(6);
        expect(r.naoAplicado.join('|')).toContain('Gatilho não importado (A)');
        expect(r.naoAplicado.join('|')).toContain('formato inválido');
    });

    it('lista que não é array vai para naoAplicado', () => {
        const r = lerGatilhosDaIA({ nome: 'x' });
        expect(r.gatilhos).toEqual([]);
        expect(r.naoAplicado).toHaveLength(1);
        expect(lerGatilhosDaIA(undefined)).toEqual({ gatilhos: [], naoAplicado: [], avisos: [] });
    });

    it('acima de 8 gatilhos: os extras vão para naoAplicado', () => {
        const lista = Array.from({ length: 10 }, (_, i) => ({ ...turno(), nome: `G${i}` }));
        const r = lerGatilhosDaIA(lista);
        expect(r.gatilhos).toHaveLength(8);
        expect(r.naoAplicado).toHaveLength(2);
        expect(r.naoAplicado[0]).toContain('mais de 8');
    });

    it('mais de 6 ações (não corta em silêncio) e tabela com mais de 12 faixas são recusadas', () => {
        const sete = Array.from({ length: 7 }, () => ({ tipo: 'mensagem', texto: 'oi' }));
        const faixas = Array.from({ length: 13 }, (_, i) => ({ ate: i + 1, acoes: [{ tipo: 'mensagem', texto: 'x' }] }));
        const r = lerGatilhosDaIA([
            { nome: 'Muitas', evento: { tipo: 'turnoInicio' }, acoes: sete },
            { nome: 'Tabela', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'rolarTabela', dado: '1d20', resultados: faixas }] },
            { nome: 'Seis', evento: { tipo: 'turnoInicio' }, acoes: sete.slice(0, 6) },
        ]);
        expect(r.gatilhos.map(g => g.nome)).toEqual(['Seis']);
        expect(r.naoAplicado.join('|')).toContain('mais de 6 ações');
        expect(r.naoAplicado.join('|')).toContain('mais de 12 faixas');
    });

    it('tabela válida passa', () => {
        const r = lerGatilhosDaIA([{ nome: 'Sorte', evento: { tipo: 'acertou', nivel: 'critico' }, acoes: [{ tipo: 'rolarTabela', dado: '1d6', resultados: [{ ate: 3, texto: 'cura', acoes: [{ tipo: 'curar', modo: 'percMax', valor: 10 }] }, { ate: 6, acoes: [{ tipo: 'danoEmSi', modo: 'percMax', valor: 5 }] }] }] }]);
        expect(r.naoAplicado).toEqual([]);
        expect(r.gatilhos[0].acoes[0].resultados).toHaveLength(2);
    });

    it('avisa para conferir contador e Poder citados por nome', () => {
        const r = lerGatilhosDaIA([{ nome: 'Carga', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'Cargas', op: 'somar', valor: 1 }, { tipo: 'ligarPoder', poderId: 'Fúria' }] }]);
        expect(r.gatilhos).toHaveLength(1);
        expect(r.avisos[0]).toContain('Cargas');
        expect(r.avisos[0]).toContain('Fúria');
    });
});

describe('pipeline do importador', () => {
    it('lerRespostaDaIA preserva gatilhos e prepararItemImportado os valida', () => {
        const resp = '```json\n' + JSON.stringify({ poderes: [{ nome: 'Fênix', categoria: 'poder', gatilhos: [volta(), { nome: 'Ruim', evento: { tipo: 'nada' }, acoes: [] }] }] }) + '\n```';
        const lido = lerRespostaDaIA(resp);
        expect(lido.ok).toBe(true);
        const { objeto, naoAplicado, valido } = prepararItemImportado(lido.itens[0]);
        expect(valido).toBe(true);
        expect(objeto.gatilhos).toHaveLength(1);
        expect(objeto.gatilhos[0].modoPendente).toBe(true);
        expect(naoAplicado.join('|')).toContain('Gatilho não importado (Ruim)');
        expect(objeto.notasIA).toContain('Gatilho não importado (Ruim)');
    });

    it('sem gatilhos, nada muda', () => {
        const { objeto } = prepararItemImportado({ nome: 'Simples' });
        expect(objeto.gatilhos).toBeUndefined();
        expect(contarPendentes(objeto)).toBe(0);
    });

    it('cada gatilho sem resposta conta como pendente (junto com os efeitos incertos)', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', gatilhos: [volta(), turno()], efeitosIncertos: [{ nome: 'e', atributo: 'forca', propriedade: 'base', valor: 3 }] });
        expect(contarGatilhosPendentes(objeto)).toBe(2);
        expect(contarPendentes(objeto)).toBe(3);
        const a = decidirModoGatilhoImportado(objeto, 'pai', 0, 'automatico');
        expect(contarPendentes(a)).toBe(2);
        const b = decidirTodosOsGatilhos(a, 'opcional');
        expect(contarGatilhosPendentes(b)).toBe(0);
        expect(contarPendentes(b)).toBe(1);
        expect(contarPendentes(decidirTodosOsIncertos(b, 'ativo'))).toBe(0);
        // desfazer volta a pendente
        expect(contarGatilhosPendentes(decidirModoGatilhoImportado(b, 'pai', 1, ''))).toBe(1);
        // não muta o original
        expect(contarGatilhosPendentes(objeto)).toBe(2);
    });

    it('gravação final: automático grava modo automatico; opcional grava desarmado', () => {
        let { objeto } = prepararItemImportado({ nome: 'X', gatilhos: [volta(), turno()] });
        objeto = decidirModoGatilhoImportado(objeto, 'pai', 0, 'automatico');
        objeto = decidirModoGatilhoImportado(objeto, 'pai', 1, 'opcional');
        const final = montarPoderFinal(objeto, 7);
        expect(final.gatilhos[0].modo).toBe('automatico');
        expect(final.gatilhos[0].armado).toBeUndefined();
        expect(final.gatilhos[1].modo).toBe('opcional');
        expect(final.gatilhos[1].armado).toBe(false);
        final.gatilhos.forEach(g => expect(g.modoPendente).toBeUndefined());
        // sobrevive a normalizarGatilhos (o que o jogo faz ao coletar)
        expect(normalizarGatilhos(final.gatilhos).descartados).toEqual([]);
        const ficha = { poderes: [{ ...final, ativa: true }] };
        expect(coletarGatilhos(ficha).map(c => c.gatilho.modo).sort()).toEqual(['automatico', 'opcional']);
    });

    it('atalho sem prévia: pendente grava opcional desarmado (nunca dispara de graça)', () => {
        const final = montarPoderImportado({ nome: 'X', gatilhos: [volta()] }, 'poder', 3);
        expect(final.gatilhos[0].modo).toBe('opcional');
        expect(final.gatilhos[0].armado).toBe(false);
        expect(final.gatilhos[0].modoPendente).toBeUndefined();
    });

    it('prepararImportacao e resumo não quebram com gatilhos', () => {
        const r = prepararImportacao([{ nome: 'X', gatilhos: [turno()] }]);
        expect(r[0].objeto.gatilhos).toHaveLength(1);
    });
});

describe('sub-habilidades com gatilhos', () => {
    const bruto = () => ({
        nome: 'Rinnegan', categoria: 'poder', gatilhos: [turno()],
        subHabilidades: [
            { nome: 'Limbo', gatilhos: [volta(), { nome: 'Quebrado', evento: { tipo: 'x' }, acoes: [{ tipo: 'curar', valor: 1 }] }] },
            { nome: 'Izanagi' },
        ],
    });

    it('a forma carrega os gatilhos, pendentes, e o descartado vai para a descrição da forma', () => {
        const { objeto } = prepararItemImportado(bruto());
        expect(objeto.formas[0].gatilhos).toHaveLength(1);
        expect(objeto.formas[1].gatilhos).toBeUndefined();
        expect(objeto.formas[0].descricao).toContain('Gatilho não importado (Quebrado)');
        const lista = listarGatilhosImportados(objeto);
        expect(lista.map(i => i.onde)).toEqual(['pai', 0]);
        expect(contarPendentes(objeto)).toBe(2);
    });

    it('decide por forma e grava na forma final', () => {
        let { objeto } = prepararItemImportado(bruto());
        objeto = decidirModoGatilhoImportado(objeto, 0, 0, 'automatico');
        expect(contarGatilhosPendentes(objeto)).toBe(1);
        objeto = decidirTodosOsGatilhos(objeto, 'opcional');
        const final = montarPoderFinal(objeto, 9);
        expect(final.gatilhos[0].modo).toBe('opcional');
        expect(final.formas[0].gatilhos[0].modo).toBe('opcional');
        expect(final.formas[0].gatilhos[0].armado).toBe(false);
        expect(final.formas[0].gatilhos[0].modoPendente).toBeUndefined();
        expect(final.formas[1].gatilhos).toBeUndefined();
    });

    it('forma ativa entrega seus gatilhos a coletarGatilhos', () => {
        let { objeto } = prepararItemImportado(bruto());
        objeto = decidirTodosOsGatilhos(objeto, 'automatico');
        const final = montarPoderFinal(objeto, 9);
        const ficha = { poderes: [{ ...final, ativa: true, formaAtivaId: final.formas[0].id }] };
        const nomes = coletarGatilhos(ficha).map(c => c.gatilho.nome).sort();
        expect(nomes).toEqual(['Regeneração', 'Volta das cinzas']);
    });
});

describe('Sexta-Feira: gatilhos na criação por pedido', () => {
    it('normalizarPoder aceita gatilhos validados, desarmados, com aviso', () => {
        const { objeto, avisos } = normalizarPoder({ nome: 'Fênix', categoria: 'poder', gatilhos: [{ ...volta(), modo: 'automatico', armado: true }, { nome: 'Ruim', evento: { tipo: 'z' }, acoes: [] }] });
        expect(objeto.gatilhos).toHaveLength(1);
        expect(objeto.gatilhos[0].modo).toBe('opcional');
        expect(objeto.gatilhos[0].armado).toBe(false);
        expect(avisos.join('|')).toContain('DESARMADOS');
        expect(avisos.join('|')).toContain('Gatilho não importado (Ruim)');
    });

    it('sem gatilhos não grava o campo e normalizarProposta repassa', () => {
        expect(normalizarPoder({ nome: 'X' }).objeto.gatilhos).toBeUndefined();
        const r = normalizarProposta('poder', { nome: 'X', gatilhos: [turno()] });
        expect(r.objeto.gatilhos).toHaveLength(1);
    });

    it('é idempotente (o pedido é normalizado de novo ao aplicar)', () => {
        const a = normalizarPoder({ nome: 'X', gatilhos: [volta()] }).objeto;
        const b = normalizarPoder(a).objeto;
        const semId = (l) => l.map(({ id, ...g }) => g); // o id é regenerado (ainda não foi gravado na ficha)
        expect(semId(b.gatilhos)).toEqual(semId(a.gatilhos));
    });

    it('o cartão de confirmação mostra a frase do gatilho', () => {
        const { objeto } = normalizarPoder({ nome: 'X', gatilhos: [volta()] });
        const linhas = descreverExtrasProposta(objeto);
        expect(linhas.some(l => l.includes('Volta das cinzas') && l.includes('0'))).toBe(true);
        expect(resumirProposta('poder', objeto)).toContain('Volta das cinzas');
    });

    it('a ferramenta propor_habilidade declara gatilhos com o vocabulário real', () => {
        const dec = DECLARACOES_CRIACAO.find(d => d.name === 'propor_habilidade');
        const sch = dec.parameters.properties.gatilhos;
        expect(sch.type).toBe('ARRAY');
        expect(sch.items.properties.evento.properties.tipo.enum).toEqual(EVENTOS_GATILHO.map(e => e.id));
        expect(sch.items.properties.acoes.items.properties.tipo.enum).toEqual(ACOES_GATILHO.map(a => a.id));
        expect(sch.items.properties.limite.properties.por.enum).not.toContain('luta');
        expect(() => JSON.stringify(dec)).not.toThrow();
    });
});
