import { describe, it, expect } from 'vitest';
import {
    prepararItemImportado, prepararImportacao, montarPoderFinal, contarPendentes, contarGatilhosPendentes, listarGatilhosImportados,
    decidirModoGatilhoImportado, decidirTodosOsGatilhos, decidirTodosOsIncertos, faltaResponderGatilho,
} from './importadorIA';
import {
    lerGatilhosDaIA, decidirModoDoGatilho, finalizarGatilho, marcarGatilhosPendentes, gatilhoFaltaResponder,
} from './gatilhosImportacao';
import { normalizarGatilhos, LIMITE_GATILHOS_POR_FONTE, LIMITE_ACOES_POR_GATILHO, LIMITE_LINHAS_TABELA } from './gatilhos';
import { normalizarPoder, normalizarProposta, descreverExtrasProposta, DECLARACOES_CRIACAO } from './sextaFeiraCriacao';
import { LIMITE_USOS } from './usosPoder';

const volta = (extra = {}) => ({ nome: 'Volta', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'definirVida', valor: 1 }], ...extra });
const turno = (extra = {}) => ({ nome: 'Regen', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'curar', modo: 'percMax', valor: 5 }], ...extra });
const acaoMsg = { tipo: 'mensagem', texto: 'oi' };

describe('lerGatilhosDaIA: entrada lixo', () => {
    it.each([[undefined], [null], [''], [[]]])('vazio (%j) nao gera nada nem avisos', (v) => {
        expect(lerGatilhosDaIA(v)).toEqual({ gatilhos: [], naoAplicado: [], avisos: [] });
    });
    it.each([['texto'], [42], [true], [{ nome: 'x' }]])('nao-lista (%j) vira um aviso e nao lanca', (v) => {
        const r = lerGatilhosDaIA(v);
        expect(r.gatilhos).toEqual([]);
        expect(r.naoAplicado).toHaveLength(1);
    });
    it('itens lixo dentro da lista: null, string, numero, array aninhado', () => {
        const r = lerGatilhosDaIA([null, 'x', 7, [volta()], undefined, volta()]);
        expect(r.gatilhos).toHaveLength(1);
        expect(r.naoAplicado.filter(f => /formato inválido/.test(f))).toHaveLength(5);
    });
    it('nome nao-string, gigante ou ausente nao quebra', () => {
        const r = lerGatilhosDaIA([volta({ nome: { a: 1 } }), volta({ nome: 'x'.repeat(500) }), volta({ nome: undefined }), volta({ nome: 123 })]);
        expect(r.gatilhos).toHaveLength(4);
        r.gatilhos.forEach(g => expect(g.nome.length).toBeLessThanOrEqual(60));
    });
    it('ids duplicados e ids com caracteres proibidos geram ids unicos e seguros', () => {
        const r = lerGatilhosDaIA([volta({ id: 'a' }), volta({ id: 'a' }), volta({ id: 'b.c#d' })]);
        const ids = r.gatilhos.map(g => g.id);
        expect(new Set(ids).size).toBe(3);
        ids.forEach(i => expect(i).not.toMatch(/[.#$[\]/]/));
    });
    it('evento/acoes/condicoes de tipo errado descartam sem lancar', () => {
        const r = lerGatilhosDaIA([
            volta({ evento: 'danoQueZeraria' }), volta({ evento: null }), volta({ acoes: 'x' }), volta({ acoes: [null] }),
            volta({ acoes: [[{ tipo: 'curar' }]] }), volta({ condicoes: 'em_combate' }), volta({ condicoes: [null] }),
        ]);
        expect(r.gatilhos.length + r.naoAplicado.length).toBeGreaterThanOrEqual(7);
    });
});

describe('lerGatilhosDaIA: limite', () => {
    const com = (limite) => lerGatilhosDaIA([volta({ limite })]);
    it('por vazio com max>0 descarta com motivo', () => {
        const r = com({ max: 1, por: '' });
        expect(r.gatilhos).toEqual([]);
        expect(r.naoAplicado[0]).toMatch(/vazio/);
    });
    it('por ausente com max>0 descarta', () => { expect(com({ max: 1 }).gatilhos).toEqual([]); });
    it('por null/numero/objeto/array nao lancam', () => {
        [null, 5, {}, ['cena']].forEach(por => expect(() => com({ max: 1, por })).not.toThrow());
        expect(com({ max: 1, por: 5 }).gatilhos).toEqual([]);
    });
    it('luta/semana', () => {
        expect(com({ max: 1, por: 'luta' }).gatilhos[0].limite.por).toBe('cena');
        expect(com({ max: 1, por: '  LUTA ' }).gatilhos[0].limite.por).toBe('cena');
        expect(com({ max: 1, por: 'Por Encontro' }).gatilhos[0].limite.por).toBe('cena');
        expect(com({ max: 1, por: 'semana' }).gatilhos).toEqual([]);
    });
    it('turno e descanso preservados', () => {
        expect(com({ max: 2, por: 'Turno' }).gatilhos[0].limite).toEqual({ max: 2, por: 'turno' });
        expect(com({ max: 2, por: 'descanso' }).gatilhos[0].limite).toEqual({ max: 2, por: 'descanso' });
    });
    it('max negativo, zero, NaN, texto ou null: gatilho entra SEM limite', () => {
        [-3, 0, NaN, 'abc', null, undefined].forEach((max) => {
            const r = com({ max, por: 'cena' });
            expect(r.gatilhos).toHaveLength(1);
            expect(r.gatilhos[0].limite).toBeUndefined();
        });
    });
    it('max enorme e fracionario sao limitados', () => {
        expect(com({ max: 1e12, por: 'cena' }).gatilhos[0].limite.max).toBe(LIMITE_USOS);
        expect(com({ max: 1e12, por: 'turno' }).gatilhos[0].limite.max).toBeLessThanOrEqual(LIMITE_USOS);
        expect(com({ max: 2.9, por: 'cena' }).gatilhos[0].limite.max).toBe(2);
    });
    it('limite null, string ou array e ignorado', () => {
        [null, 'cena', ['cena'], 7].forEach(l => expect(com(l).gatilhos[0].limite).toBeUndefined());
    });
});

describe('lerGatilhosDaIA: limites de quantidade', () => {
    it('9 gatilhos: entram 8 e o 9o vai para naoAplicado', () => {
        const r = lerGatilhosDaIA(Array.from({ length: LIMITE_GATILHOS_POR_FONTE + 1 }, (_, i) => volta({ nome: `G${i}` })));
        expect(r.gatilhos).toHaveLength(LIMITE_GATILHOS_POR_FONTE);
        expect(r.naoAplicado).toHaveLength(1);
    });
    it('exatamente 6 acoes passa; 7 recusa o gatilho inteiro', () => {
        expect(lerGatilhosDaIA([volta({ acoes: Array(LIMITE_ACOES_POR_GATILHO).fill(acaoMsg) })]).gatilhos).toHaveLength(1);
        const r = lerGatilhosDaIA([volta({ acoes: Array(LIMITE_ACOES_POR_GATILHO + 1).fill(acaoMsg) })]);
        expect(r.gatilhos).toEqual([]);
        expect(r.naoAplicado[0]).toMatch(/mais de 6/);
    });
    const tab = (n, acoesPorLinha = [acaoMsg]) => ({ tipo: 'rolarTabela', dado: '1d100', resultados: Array.from({ length: n }, (_, i) => ({ ate: i + 1, texto: 't', acoes: acoesPorLinha })) });
    it('tabela com 12 faixas passa; 13 recusa', () => {
        expect(lerGatilhosDaIA([volta({ acoes: [tab(LIMITE_LINHAS_TABELA)] })]).gatilhos).toHaveLength(1);
        const r = lerGatilhosDaIA([volta({ acoes: [tab(LIMITE_LINHAS_TABELA + 1)] })]);
        expect(r.gatilhos).toEqual([]);
        expect(r.naoAplicado[0]).toMatch(/12 faixas/);
    });
    it('faixa com 7 acoes recusa; com 6 passa', () => {
        expect(lerGatilhosDaIA([volta({ acoes: [tab(2, Array(7).fill(acaoMsg))] })]).gatilhos).toEqual([]);
        expect(lerGatilhosDaIA([volta({ acoes: [tab(2, Array(6).fill(acaoMsg))] })]).gatilhos).toHaveLength(1);
    });
    it('tabelas malformadas nao lancam e sao descartadas', () => {
        const casos = [
            { tipo: 'rolarTabela', dado: '1d6', resultados: 'x' }, { tipo: 'rolarTabela', dado: '1d6', resultados: [] },
            { tipo: 'rolarTabela', dado: '1d6', resultados: [null, { ate: 3, acoes: [acaoMsg] }] },
            { tipo: 'rolarTabela', dado: '1d6', resultados: [{ ate: 3, acoes: [acaoMsg] }, { ate: 3, acoes: [acaoMsg] }] },
            { tipo: 'rolarTabela', dado: '1d6', resultados: [{ ate: 6, acoes: [tab(1)] }] },
        ];
        casos.forEach((c) => {
            const r = lerGatilhosDaIA([volta({ acoes: [c] })]);
            expect(r.gatilhos).toEqual([]);
            expect(r.naoAplicado).toHaveLength(1);
        });
    });
});

describe('lerGatilhosDaIA: IA tentando impor controle', () => {
    it('modo/armado/perguntar/passivo/mestreDesligou/modoPendente sao ignorados', () => {
        [{ modo: 'automatico', armado: true }, { modo: 'opcional', armado: true, perguntar: true }, { modo: 'XYZ', armado: 'true' },
            { modoPendente: false, passivo: true, mestreDesligou: true }, { armado: true }].forEach((extra) => {
            const g = lerGatilhosDaIA([volta(extra)]).gatilhos[0];
            expect(g.modo).toBe('opcional');
            expect(g.armado).toBe(false);
            expect(g.perguntar).toBeUndefined();
            expect(g.passivo).toBeUndefined();
            expect(g.mestreDesligou).toBeUndefined();
            expect(g.modoPendente).toBeUndefined();
        });
    });
    it('nao muta a entrada', () => {
        const entrada = [volta({ modo: 'automatico', armado: true, limite: { max: 1, por: 'luta' }, id: 'k' })];
        const copia = JSON.parse(JSON.stringify(entrada));
        lerGatilhosDaIA(entrada);
        expect(entrada).toEqual(copia);
    });
    it('avisa sobre contador/Poder referenciados, sem repetir', () => {
        const r = lerGatilhosDaIA([volta({ acoes: [{ tipo: 'contador', id: 'cargas', op: 'somar', valor: 1 }, { tipo: 'contador', id: 'cargas', op: 'somar', valor: 1 }, { tipo: 'ligarPoder', poderId: 'Fenix' }] })]);
        expect(r.avisos).toHaveLength(1);
        expect(r.avisos[0].match(/contador "cargas"/g)).toHaveLength(1);
        expect(r.avisos[0]).toContain('Poder "Fenix"');
    });
});

describe('prepararItemImportado: pai e sub-habilidades', () => {
    it('sem gatilhos: nada pendente, sem campo gatilhos', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', subHabilidades: [{ nome: 'S' }] });
        expect(objeto.gatilhos).toBeUndefined();
        expect(objeto.formas[0].gatilhos).toBeUndefined();
        expect(contarPendentes(objeto)).toBe(0);
        expect(listarGatilhosImportados(objeto)).toEqual([]);
    });
    it('pai e sub com gatilhos: todos pendentes e listados com onde correto', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', gatilhos: [volta(), turno()], subHabilidades: [{ nome: 'A', gatilhos: [volta()] }, { nome: 'B' }, { nome: 'C', gatilhos: [turno()] }] });
        expect(listarGatilhosImportados(objeto).map(i => i.onde)).toEqual(['pai', 'pai', 0, 2]);
        expect(contarGatilhosPendentes(objeto)).toBe(4);
        expect(contarPendentes(objeto)).toBe(4);
        listarGatilhosImportados(objeto).forEach(i => { expect(i.gatilho.modoPendente).toBe(true); expect(i.gatilho.modo).toBe('opcional'); expect(i.gatilho.armado).toBe(false); });
    });
    it('somente sub com gatilhos (pai sem)', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', subHabilidades: [{ nome: 'A', gatilhos: [volta()] }] });
        expect(objeto.gatilhos).toBeUndefined();
        expect(contarGatilhosPendentes(objeto)).toBe(1);
    });
    it('gatilho invalido na sub vai para o naoAplicado da sub e nao deixa pendencia', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', subHabilidades: [{ nome: 'A', gatilhos: [volta({ limite: { max: 1, por: 'semana' } })] }] });
        expect(objeto.formas[0].gatilhos).toBeUndefined();
        expect(objeto.formas[0].naoAplicado.join(' ')).toMatch(/semana/);
        expect(contarPendentes(objeto)).toBe(0);
    });
    it('gatilhos invalidos no pai entram no naoAplicado do pai', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', gatilhos: 'lixo' });
        expect(objeto.gatilhos).toBeUndefined();
        expect(objeto.naoAplicado.join(' ')).toMatch(/formato inválido/);
    });
    it('subHabilidades lixo nao quebram', () => {
        expect(() => prepararItemImportado({ nome: 'X', subHabilidades: [null, 'a', [], { nome: 'ok', gatilhos: null }] })).not.toThrow();
    });
    it('aviso da sub leva o nome da sub', () => {
        const { avisos } = prepararItemImportado({ nome: 'X', subHabilidades: [{ nome: 'Limbo', gatilhos: [volta({ acoes: [{ tipo: 'contador', id: 'c', op: 'somar', valor: 1 }] })] }] });
        expect(avisos.some(a => a.startsWith('Limbo:'))).toBe(true);
    });
    it('IA impondo modo no item completo continua pendente e opcional', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', gatilhos: [volta({ modo: 'automatico', armado: true })] });
        expect(objeto.gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false, modoPendente: true });
    });
    it('item invalido nao lanca', () => {
        expect(() => prepararItemImportado({ gatilhos: [volta()] })).not.toThrow();
        expect(() => prepararItemImportado(null)).not.toThrow();
    });
});

describe('respostas: individual, em massa, desfazer', () => {
    const base = () => prepararItemImportado({ nome: 'X', gatilhos: [volta(), turno()], subHabilidades: [{ nome: 'A', gatilhos: [volta()] }] }).objeto;
    it('Todos automaticos depois de respostas individuais sobrescreve tudo', () => {
        let o = decidirModoGatilhoImportado(base(), 'pai', 0, 'opcional');
        o = decidirModoGatilhoImportado(o, 0, 0, 'automatico');
        o = decidirTodosOsGatilhos(o, 'automatico');
        listarGatilhosImportados(o).forEach(i => { expect(i.gatilho.modo).toBe('automatico'); expect(i.gatilho.modoPendente).toBeUndefined(); expect(i.gatilho.armado).toBeUndefined(); });
        expect(contarPendentes(o)).toBe(0);
    });
    it('Todos opcionais depois de automatico individual volta a opcional desarmado', () => {
        let o = decidirModoGatilhoImportado(base(), 'pai', 1, 'automatico');
        o = decidirTodosOsGatilhos(o, 'opcional');
        listarGatilhosImportados(o).forEach(i => expect(i.gatilho).toMatchObject({ modo: 'opcional', armado: false }));
    });
    it('desfazer volta a pendente', () => {
        let o = decidirModoGatilhoImportado(base(), 'pai', 0, 'automatico');
        expect(contarGatilhosPendentes(o)).toBe(2);
        o = decidirModoGatilhoImportado(o, 'pai', 0, '');
        expect(contarGatilhosPendentes(o)).toBe(3);
        expect(o.gatilhos[0]).toMatchObject({ modoPendente: true, modo: 'opcional', armado: false });
    });
    it('modo invalido desfaz (nunca vira automatico)', () => {
        const o = decidirModoGatilhoImportado(base(), 'pai', 0, 'qualquer');
        expect(o.gatilhos[0].modoPendente).toBe(true);
        expect(o.gatilhos[0].modo).toBe('opcional');
    });
    it('indice/onde inexistente nao muda nada nem lanca', () => {
        const b = base();
        expect(decidirModoGatilhoImportado(b, 'pai', 99, 'automatico')).toEqual(b);
        expect(decidirModoGatilhoImportado(b, 9, 0, 'automatico')).toEqual(b);
        expect(decidirModoGatilhoImportado(b, 0, 99, 'automatico')).toEqual(b);
        expect(() => decidirModoGatilhoImportado(null, 'pai', 0, 'automatico')).not.toThrow();
        expect(() => decidirTodosOsGatilhos(null, 'automatico')).not.toThrow();
    });
    it('imutavel: o objeto original nao e alterado', () => {
        const b = base(); const snap = JSON.stringify(b);
        decidirTodosOsGatilhos(b, 'automatico');
        expect(JSON.stringify(b)).toBe(snap);
    });
    it('decidirTodosOsIncertos nao mexe nos gatilhos', () => {
        expect(contarGatilhosPendentes(decidirTodosOsIncertos(base(), 'ativo'))).toBe(3);
    });
    it('decidirModoDoGatilho: automatico limpa armado/perguntar; opcional desarma', () => {
        const g = { id: 'a', modo: 'opcional', armado: true, perguntar: true, modoPendente: true };
        expect(decidirModoDoGatilho(g, 'automatico')).toEqual({ id: 'a', modo: 'automatico' });
        expect(decidirModoDoGatilho(g, 'opcional')).toEqual({ id: 'a', modo: 'opcional', armado: false, perguntar: true });
    });
    it('faltaResponder trata null/undefined', () => {
        expect(gatilhoFaltaResponder(null)).toBe(true);
        expect(faltaResponderGatilho(undefined)).toBe(true);
        expect(gatilhoFaltaResponder({ modo: 'automatico' })).toBe(false);
    });
});

describe('montarPoderFinal com gatilhos', () => {
    it('sem resposta: tudo vira opcional desarmado, sem modoPendente', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', gatilhos: [volta()], subHabilidades: [{ nome: 'A', gatilhos: [turno()] }] });
        const f = montarPoderFinal(objeto, 5);
        expect(f.gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false });
        expect(f.gatilhos[0].modoPendente).toBeUndefined();
        expect(f.formas[0].gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false });
        expect(f.formas[0].gatilhos[0].modoPendente).toBeUndefined();
    });
    it('sem gatilhos ou lista vazia: campo removido', () => {
        expect('gatilhos' in montarPoderFinal({ nome: 'X' }, 1)).toBe(false);
        expect('gatilhos' in montarPoderFinal({ nome: 'X', gatilhos: [] }, 1)).toBe(false);
        expect('gatilhos' in montarPoderFinal({ nome: 'X', formas: [{ nome: 'F', gatilhos: [], configs: [{}] }] }, 1).formas[0]).toBe(false);
    });
    it('automatico respondido sobrevive e passa por normalizarGatilhos sem descartes', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', gatilhos: [volta(), turno()] });
        const f = montarPoderFinal(decidirTodosOsGatilhos(objeto, 'automatico'), 'abc');
        expect(f.gatilhos.every(g => g.modo === 'automatico')).toBe(true);
        expect(normalizarGatilhos(f.gatilhos).descartados).toEqual([]);
    });
    it('nao muta a previa e nao vaza naoAplicado', () => {
        const { objeto } = prepararItemImportado({ nome: 'X', gatilhos: [volta()] });
        const snap = JSON.stringify(objeto);
        const f = montarPoderFinal(objeto, 1);
        expect(JSON.stringify(objeto)).toBe(snap);
        expect(f.naoAplicado).toBeUndefined();
    });
    it('objeto null nao lanca', () => { expect(() => montarPoderFinal(null, 1)).not.toThrow(); });
    it('finalizarGatilho: casos de borda', () => {
        expect(finalizarGatilho({ modo: 'xyz', armado: true })).toEqual({ modo: 'opcional', armado: false });
        expect(finalizarGatilho({})).toEqual({ modo: 'opcional', armado: false });
        expect(finalizarGatilho({ modo: 'opcional', armado: true })).toEqual({ modo: 'opcional', armado: true });
        expect(finalizarGatilho({ modo: 'opcional', armado: 'sim' }).armado).toBe(false);
        expect(finalizarGatilho({ modo: 'opcional', modoPendente: true, armado: true }).armado).toBe(false);
        expect(finalizarGatilho({ modo: 'automatico', modoPendente: true }).modo).toBe('opcional');
    });
    it('marcarGatilhosPendentes nao muta', () => {
        const g = [{ a: 1 }]; marcarGatilhosPendentes(g);
        expect(g[0].modoPendente).toBeUndefined();
    });
});

describe('prepararImportacao: lote', () => {
    it('varios itens, um com lixo, mantem os outros', () => {
        const itens = prepararImportacao([{ nome: 'A', gatilhos: [volta()] }, { nome: 'B', gatilhos: 5 }, { nome: 'C' }]);
        expect(itens).toHaveLength(3);
        expect(contarPendentes(itens[0].objeto)).toBe(1);
        expect(contarPendentes(itens[1].objeto)).toBe(0);
    });
});

describe('Sexta-Feira: normalizarPoder / cartao / schema', () => {
    it('sem gatilhos nao cria campo nem aviso', () => {
        const r = normalizarPoder({ nome: 'X' });
        expect(r.objeto.gatilhos).toBeUndefined();
        expect(r.avisos.join(' ')).not.toMatch(/gatilho/i);
    });
    it('gatilhos chegam opcionais e desarmados mesmo com modo/armado impostos, e avisa', () => {
        const r = normalizarPoder({ nome: 'X', gatilhos: [volta({ modo: 'automatico', armado: true })] });
        expect(r.objeto.gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false });
        expect(r.objeto.gatilhos[0].modoPendente).toBeUndefined();
        expect(r.avisos.join(' ')).toMatch(/OPCIONAIS e DESARMADOS/);
    });
    it('lixo nao lanca nem cria campo', () => {
        ['x', { a: 1 }, null, '', 0, [null]].forEach((v) => {
            expect(normalizarPoder({ nome: 'X', gatilhos: v }).objeto.gatilhos).toBeUndefined();
        });
    });
    it('idempotente: normalizar a saida de novo da o mesmo resultado', () => {
        const a = normalizarPoder({ nome: 'X', gatilhos: [volta(), turno({ limite: { max: 2, por: 'luta' } })] }).objeto;
        // Observacao: lerGatilhosDaIA descarta o `id`, entao cada normalizacao gera ids novos (ver relatorio). Compara sem id.
        const semId = (l) => l.map(({ id, ...r }) => r);
        const b = normalizarPoder({ ...a }).objeto;
        expect(semId(b.gatilhos)).toEqual(semId(a.gatilhos));
        expect(semId(normalizarPoder({ ...b }).objeto.gatilhos)).toEqual(semId(a.gatilhos));
    });
    it('normalizarGatilhos da saida e estavel (ids mantidos)', () => {
        const a = normalizarPoder({ nome: 'X', gatilhos: [volta()] }).objeto.gatilhos;
        expect(normalizarGatilhos(a).gatilhos).toEqual(a);
    });
    it('9 gatilhos truncam em 8 com aviso', () => {
        const r = normalizarPoder({ nome: 'X', gatilhos: Array.from({ length: 9 }, (_, i) => volta({ nome: `G${i}` })) });
        expect(r.objeto.gatilhos).toHaveLength(8);
        expect(r.avisos.join(' ')).toMatch(/mais de 8/);
    });
    it('normalizarProposta("poder") e valido mesmo com todos os gatilhos invalidos', () => {
        const r = normalizarProposta('poder', { nome: 'X', gatilhos: [volta({ evento: { tipo: 'nada' } })] });
        expect(r.valido).toBe(true);
        expect(r.objeto.gatilhos).toBeUndefined();
        expect(r.avisos.join(' ')).toMatch(/evento desconhecido/);
    });
    it('cartao mostra uma linha por gatilho; sem gatilhos nao mostra', () => {
        const { objeto } = normalizarPoder({ nome: 'X', gatilhos: [volta(), turno()] });
        const linhas = descreverExtrasProposta(objeto).filter(l => l.startsWith('🔔'));
        expect(linhas).toHaveLength(2);
        expect(linhas[0]).toContain('Volta');
        expect(descreverExtrasProposta({ nome: 'X' }).some(l => l.startsWith('🔔'))).toBe(false);
        expect(() => descreverExtrasProposta({ nome: 'X', gatilhos: null })).not.toThrow();
    });
    it('schema: propor_habilidade expoe gatilhos sem modo/armado e sem "luta"', () => {
        const decl = DECLARACOES_CRIACAO.find(d => d.name === 'propor_habilidade');
        const g = decl.parameters.properties.gatilhos;
        expect(g.type).toBe('ARRAY');
        expect(g.items.required).toEqual(['nome', 'evento', 'acoes']);
        expect(g.items.properties.evento.properties.tipo.enum.length).toBeGreaterThan(5);
        expect(g.items.properties.limite.properties.por.enum).not.toContain('luta');
        expect(g.items.properties).not.toHaveProperty('modo');
        expect(g.items.properties).not.toHaveProperty('armado');
        expect(g.items.properties).not.toHaveProperty('perguntar');
        expect(g.items.properties.acoes.items.properties.tipo.enum).toContain('rolarTabela');
    });
});
