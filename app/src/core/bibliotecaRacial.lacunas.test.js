import { describe, it, expect } from 'vitest';
import {
    sanitizarBiblioteca, getBiblioteca, criarEntradaDePoder, disponivelParaFicha, montarPoderConcedido, sanitizarModelo,
    disponiveisParaJogador, limparRacaDaBiblioteca, LIMITE_BIBLIOTECA, LIMITE_NOME_BIBLIOTECA, LIMITE_BYTES_MODELO,
} from './bibliotecaRacial';

const cenario = {
    racas: [
        { id: 'saiyajin', nome: 'Saiyajin', icone: '🐒' },
        { id: 'humano', nome: 'Humano', icone: '🧍' },
        { id: 'meio', nome: 'Meio-Saiyajin', icone: '🧬', herdaDe: 'saiyajin' },
        { id: 'cria', nome: 'Cria', icone: '🐣', descendeDe: 'saiyajin' },
        { id: 'primordial', nome: 'Primordial', icone: '🌟', acessoTotalDescendentes: true },
        { id: 'filho', nome: 'Filho', icone: '1', descendeDe: 'primordial' },
        { id: 'neto', nome: 'Neto', icone: '2', descendeDe: 'filho' },
        { id: 'bisneto', nome: 'Bisneto', icone: '3', descendeDe: 'neto' },
    ],
};
const poder = (extra = {}) => ({
    id: 9, nome: 'Zenkai', categoria: 'habilidadeRaca', descricao: 'desc', ativa: true, equipado: true, racasAcesso: ['saiyajin'], percentualMinimo: 50,
    racaExcecao: true, bloqueio: { ativo: true, requisito: 'x', motivo: 'm' }, origemBiblioteca: 'bib_velho', ensinadoPor: 'F', recargaRestante: 4, estagioAtual: 2,
    efeitos: [{ nome: 'F', atributo: 'forca', propriedade: 'bonus', valor: 5 }],
    gatilhos: [{ id: 'g', armado: true, mestreDesligou: true, evento: 'ev' }], ...extra,
});
const entrada = (nome, racasAcesso, min, extra = {}) => criarEntradaDePoder(poder({ nome, ...extra }), { racasAcesso, percentualMinimo: min, criadoPor: 'M', agora: 1 }).entrada;
const comp = (...p) => ({ bio: { composicaoRacial: p.map(([racaId, percentual]) => ({ racaId, percentual })) }, poderes: [] });

describe('(a) mestiço 70% Saiyajin / 30% Humano com duas entradas', () => {
    const mestico = comp(['saiyajin', 70], ['humano', 30]);
    const A = entrada('Zenkai', ['saiyajin'], 50);
    const B = entrada('Adaptacao', ['humano'], 40);
    it('A (Saiyajin, mín 50): disponível, 70%, atinge', () => {
        expect(disponivelParaFicha(cenario, mestico, A)).toEqual({ disponivel: true, percentual: 70, minimo: 50, atingeMinimo: true, jaPossui: false, motivo: '' });
    });
    it('B (Humano, mín 40): disponível, 30%, NÃO atinge', () => {
        const s = disponivelParaFicha(cenario, mestico, B);
        expect(s).toMatchObject({ disponivel: true, percentual: 30, minimo: 40, atingeMinimo: false, jaPossui: false });
        expect(s.motivo).toBe('Domínio insuficiente: 30% de 40%.');
    });
    it('jaPossui por origemBiblioteca só marca a entrada correspondente', () => {
        const f = { ...mestico, poderes: [{ id: 1, nome: 'Qualquer', origemBiblioteca: A.id }] };
        expect(disponivelParaFicha(cenario, f, A).jaPossui).toBe(true);
        expect(disponivelParaFicha(cenario, f, A).motivo).toBe('Já possui esta habilidade.');
        expect(disponivelParaFicha(cenario, f, B).jaPossui).toBe(false);
    });
    it('entrada com as duas Raças: percentual = maior Domínio (70)', () => {
        const C = entrada('Mista', ['saiyajin', 'humano'], 60);
        expect(disponivelParaFicha(cenario, mestico, C)).toMatchObject({ percentual: 70, minimo: 60, atingeMinimo: true });
    });
    it('exatamente no mínimo atinge (50% de 50)', () => {
        expect(disponivelParaFicha(cenario, comp(['saiyajin', 50], ['humano', 50]), A)).toMatchObject({ percentual: 50, atingeMinimo: true });
        expect(disponivelParaFicha(cenario, comp(['saiyajin', 49], ['humano', 51]), A)).toMatchObject({ percentual: 49, atingeMinimo: false });
    });
    it('disponiveisParaJogador do mestiço traz A e B sem modelo', () => {
        const cen = { ...cenario, bibliotecaRacial: [A, B] };
        const l = disponiveisParaJogador(cen, mestico);
        expect(l.map(x => x.nome)).toEqual(['Zenkai', 'Adaptacao']);
        expect(l[0].situacao.atingeMinimo).toBe(true);
        expect(l[1].situacao.atingeMinimo).toBe(false);
        l.forEach(x => expect(x.modelo).toBeUndefined());
    });
});

describe('(a) Primordial, descendentes (3 níveis), herdaDe vs descendeDe', () => {
    const bis = entrada('Bis', ['bisneto'], 0);
    const prim = entrada('Prim', ['primordial'], 0);
    it('Primordial 100% acessa entrada de Bisneto (3 níveis abaixo)', () => {
        expect(disponivelParaFicha(cenario, comp(['primordial', 100]), bis)).toMatchObject({ disponivel: true, percentual: 100, atingeMinimo: true });
    });
    it('Primordial 60% / Saiyajin 40% com mínimo 50: percentual 60 atinge', () => {
        const e = entrada('Bis50', ['bisneto'], 50);
        expect(disponivelParaFicha(cenario, comp(['primordial', 60], ['saiyajin', 40]), e)).toMatchObject({ disponivel: true, percentual: 60, atingeMinimo: true });
        expect(disponivelParaFicha(cenario, comp(['primordial', 40], ['saiyajin', 60]), e)).toMatchObject({ disponivel: true, percentual: 40, atingeMinimo: false });
    });
    it('inverso: Bisneto/Neto/Filho NÃO acessam entrada da Primordial', () => {
        ['bisneto', 'neto', 'filho'].forEach(r => expect(disponivelParaFicha(cenario, comp([r, 100]), prim).disponivel).toBe(false));
    });
    it('descendente não acessa a de uma irmã/outro ramo', () => {
        expect(disponivelParaFicha(cenario, comp(['filho', 100]), bis).disponivel).toBe(false); // sem acessoTotalDescendentes
        expect(disponivelParaFicha(cenario, comp(['neto', 100]), entrada('F', ['filho'], 0)).disponivel).toBe(false);
    });
    it('herdaDe: Meio-Saiyajin acessa entrada de Saiyajin; o inverso não', () => {
        const s = entrada('Sai', ['saiyajin'], 0); const m = entrada('Meio', ['meio'], 0);
        expect(disponivelParaFicha(cenario, comp(['meio', 100]), s).disponivel).toBe(true);
        expect(disponivelParaFicha(cenario, comp(['saiyajin', 100]), m).disponivel).toBe(false);
    });
    it('descendeDe (sem acessoTotal) NÃO dá acesso nenhum, nos dois sentidos', () => {
        const s = entrada('Sai', ['saiyajin'], 0); const c = entrada('Cria', ['cria'], 0);
        expect(disponivelParaFicha(cenario, comp(['cria', 100]), s).disponivel).toBe(false);
        expect(disponivelParaFicha(cenario, comp(['saiyajin', 100]), c).disponivel).toBe(false);
    });
});

describe('(b) modelo publicado vs poder concedido', () => {
    const e = entrada('Zenkai', ['humano'], 25, { manipulaDNA: true });
    it('modelo NÃO contém campos de instância, estado, segurança nem acesso do poder de origem', () => {
        ['id', 'ativa', 'equipado', 'bloqueio', 'racaExcecao', 'origemBiblioteca', 'ensinadoPor', 'recargaRestante', 'estagioAtual', 'racasAcesso', 'percentualMinimo', 'manipulaDNA']
            .forEach(k => expect(Object.prototype.hasOwnProperty.call(e.modelo, k), k).toBe(false));
        expect(e.modelo.gatilhos).toEqual([{ id: 'g', evento: 'ev' }]);
        expect(JSON.stringify(e.modelo)).not.toMatch(/armado|mestreDesligou|bib_velho/);
        expect(e.modelo.categoria).toBe('habilidadeRaca');
    });
    it('a entrada leva o acesso/mínimo escolhidos na meta, não os do poder (saiyajin/50)', () => {
        expect(e.racasAcesso).toEqual(['humano']);
        expect(e.percentualMinimo).toBe(25);
    });
    it('concedido: origemBiblioteca=id, ativa false, categoria, racasAcesso e mínimo da ENTRADA', () => {
        const p = montarPoderConcedido(e, { id: 42 });
        expect(p).toMatchObject({ id: 42, origemBiblioteca: e.id, ativa: false, categoria: 'habilidadeRaca', racasAcesso: ['humano'], percentualMinimo: 25 });
        expect(p.racasAcesso).not.toContain('saiyajin');
        expect(p.bloqueio).toBeUndefined();
        expect(p.racaExcecao).toBeUndefined();
        expect(p.gatilhos[0].armado).toBeUndefined();
    });
    it('sanitizarModelo é idempotente e não muta o original', () => {
        const orig = poder();
        const m1 = sanitizarModelo(orig);
        expect(sanitizarModelo(m1)).toEqual(m1);
        expect(orig.ativa).toBe(true);
        expect(orig.gatilhos[0].armado).toBe(true);
    });
});

describe('(c) visão do jogador', () => {
    it('disponiveisParaJogador: só campos públicos, nunca modelo, nem entradas de outras Raças', () => {
        const cen = { ...cenario, bibliotecaRacial: [entrada('Zenkai', ['saiyajin'], 0), entrada('Adapt', ['humano'], 0)] };
        const l = disponiveisParaJogador(cen, comp(['humano', 100]));
        expect(l).toHaveLength(1);
        expect(l[0].nome).toBe('Adapt');
        expect(Object.keys(l[0]).sort()).toEqual(['icone', 'id', 'nome', 'requisito', 'resumo', 'situacao']);
        expect(JSON.stringify(l)).not.toMatch(/modelo|efeitos|Zenkai/);
    });
    it('ficha sem Raça (vazia) não vê nada', () => {
        const cen = { ...cenario, bibliotecaRacial: [entrada('Zenkai', ['saiyajin'], 0)] };
        expect(disponiveisParaJogador(cen, {})).toEqual([]);
        expect(disponiveisParaJogador(cen, null)).toEqual([]);
    });
});

describe('(d) sanitização', () => {
    const base = entrada('N', ['saiyajin'], 0);
    it('>60 entradas: mantém as 60 primeiras', () => {
        const muitas = Array.from({ length: 61 }, (_, i) => ({ ...base, id: `i${i}`, nome: `N${i}` }));
        const r = sanitizarBiblioteca(muitas);
        expect(r).toHaveLength(60);
        expect(r[59].id).toBe('i59');
        expect(LIMITE_BIBLIOTECA).toBe(60);
    });
    it('nome >60 é cortado em exatamente 60; nome só com espaços é descartado', () => {
        const r = sanitizarBiblioteca([{ ...base, nome: 'a'.repeat(61) }, { ...base, id: 'z', nome: '   ' }]);
        expect(r).toHaveLength(1);
        expect(r[0].nome).toHaveLength(LIMITE_NOME_BIBLIOTECA);
    });
    it('modelo >20KB é descartado; no limite é mantido', () => {
        const grande = { ...base, id: 'g', nome: 'Grande', modelo: { nome: 'G', descricao: 'x'.repeat(LIMITE_BYTES_MODELO + 1) } };
        expect(sanitizarBiblioteca([grande, base])).toHaveLength(1);
        const folga = { ...base, id: 'ok', nome: 'Ok', modelo: { nome: 'G', descricao: 'x'.repeat(LIMITE_BYTES_MODELO - 200) } };
        expect(sanitizarBiblioteca([folga])).toHaveLength(1);
    });
    it('cenário do Firebase com objeto {0:..,1:..} em vez de array funciona (getBiblioteca e jogador)', () => {
        const a = entrada('A', ['saiyajin'], 0); const b = entrada('B', ['saiyajin'], 0);
        const cen = { ...cenario, bibliotecaRacial: { 0: a, 1: b } };
        expect(getBiblioteca(cen).map(x => x.nome)).toEqual(['A', 'B']);
        expect(disponiveisParaJogador(cen, comp(['saiyajin', 100])).map(x => x.nome)).toEqual(['A', 'B']);
    });
    it('bibliotecaRacial string/número/null viram lista vazia', () => {
        ['x', 5, null, true].forEach(v => expect(getBiblioteca({ bibliotecaRacial: v })).toEqual([]));
    });
    it('ids duplicados ou inválidos recebem ids únicos e válidos', () => {
        const r = sanitizarBiblioteca([{ ...base, id: 'dup', nome: 'Um' }, { ...base, id: 'dup', nome: 'Dois' }, { ...base, id: 'a.b', nome: 'Tres' }, { ...base, id: '', nome: 'Quatro' }]);
        expect(r).toHaveLength(4);
        expect(new Set(r.map(x => x.id)).size).toBe(4);
        r.forEach(x => expect(x.id).not.toMatch(/[.#$[\]/]/));
        expect(r[0].id).toBe('dup');
    });
    it('percentual inválido vira 0, negativo 0, >100 vira 100; ícone vazio vira padrão', () => {
        const r = sanitizarBiblioteca([{ ...base, percentualMinimo: 'abc', icone: '' }, { ...base, id: 'n', nome: 'n', percentualMinimo: -5 }, { ...base, id: 'o', nome: 'o', percentualMinimo: 101 }]);
        expect(r.map(x => x.percentualMinimo)).toEqual([0, 0, 100]);
        expect(r[0].icone).toBe('📚');
    });
});

describe('(f) raça removida e ids órfãos', () => {
    it('limparRacaDaBiblioteca só mexe em quem tem a raça; sem a raça, alterados 0 e mesma referência dos itens', () => {
        const a = entrada('A', ['saiyajin', 'humano'], 0); const b = entrada('B', ['humano'], 0);
        const r = limparRacaDaBiblioteca('saiyajin', [a, b]);
        expect(r.alterados).toBe(1);
        expect(r.biblioteca[0].racasAcesso).toEqual(['humano']);
        expect(r.biblioteca[1]).toBe(b);
        expect(limparRacaDaBiblioteca('nada', [a, b]).alterados).toBe(0);
        expect(limparRacaDaBiblioteca('x', undefined)).toEqual({ biblioteca: [], alterados: 0 });
    });
    it('entrada que ficou sem racasAcesso fica sem ninguém disponível; órfão não aparece para o jogador', () => {
        const a = entrada('A', ['saiyajin'], 0);
        const limpa = limparRacaDaBiblioteca('saiyajin', [a]).biblioteca;
        const cen = { ...cenario, bibliotecaRacial: limpa };
        expect(disponiveisParaJogador(cen, comp(['saiyajin', 100]))).toEqual([]);
        const orfa = { ...cenario, bibliotecaRacial: [{ ...a, racasAcesso: ['fantasma'] }] };
        expect(disponiveisParaJogador(orfa, comp(['saiyajin', 100]))).toEqual([]);
        // raça removida do catálogo mas id ainda na entrada: ninguém acessa por ela
        const semRaca = { racas: cenario.racas.filter(r => r.id !== 'saiyajin'), bibliotecaRacial: [a] };
        expect(disponiveisParaJogador(semRaca, comp(['saiyajin', 100]))).toEqual([]);
    });
});
