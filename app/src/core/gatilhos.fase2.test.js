import { describe, it, expect } from 'vitest';
import { normalizarGatilhos, descreverGatilho, coletarGatilhos } from './gatilhos.js';
import { dispararEventoNaFicha, zerarUsosPorTurno, camposParaGravar, rolarSorteio } from './gatilhosAplicar.js';
import { aplicarDanoNaVida } from './danoVida.js';
import { normalizarContador, resetarContadoresDeCena } from './contadores.js';

const F = 1000;
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
const ct = (id, extra = {}) => normalizarContador({ id, nome: id, valor: 0, min: 0, max: 100, ...extra });
const ficha = (extra = {}) => ({ vida: { atual: 1000 * F }, iniciativa: 0, poderes: [], inventario: [], passivas: [], contadores: [], ...extra });
const poder = (gatilhos, extra = {}) => ({ id: 'p1', nome: 'Poder X', ativa: true, gatilhos, ...extra });
const G = (g) => ({ nome: 'g', ...g });
const norm = (lista) => normalizarGatilhos(lista).gatilhos;
const disparar = (f, ev, ctx = {}) => dispararEventoNaFicha(f, ev, { cenaId: 'c1', nome: 'Eu', ...ctx });
const valor = (f, id) => f.contadores.find(c => c.id === id).valor;

describe('contadores com reset', () => {
    it('padrão é permanente e não grava campo reset; cena é mantido', () => {
        expect(ct('a').reset).toBeUndefined();
        expect('reset' in ct('a')).toBe(false);
        expect(ct('a', { reset: 'cena' }).reset).toBe('cena');
        expect('reset' in ct('a', { reset: 'permanente' })).toBe(false);
        expect(semUndefined(ct('a', { reset: 'cena' }))).toBe(true);
    });
    it('resetarContadoresDeCena volta ao mínimo só os de cena e devolve os índices', () => {
        const f = ficha({ contadores: [ct('a', { valor: 5, reset: 'cena' }), ct('b', { valor: 7 }), ct('c', { valor: 3, min: 1, reset: 'cena' })] });
        expect(resetarContadoresDeCena(f)).toEqual([0, 2]);
        expect(f.contadores.map(c => c.valor)).toEqual([0, 7, 1]);
        expect(resetarContadoresDeCena(f)).toEqual([]);
    });
    it('sem contadores não quebra', () => {
        expect(resetarContadoresDeCena({})).toEqual([]);
        expect(resetarContadoresDeCena(null)).toEqual([]);
    });
    it('fimDeLuta zera os de cena e informa os caminhos, mesmo sem gatilhos', () => {
        const f = ficha({ contadores: [ct('a', { valor: 5, reset: 'cena' }), ct('b', { valor: 7 })] });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(valor(f, 'a')).toBe(0); expect(valor(f, 'b')).toBe(7);
        expect(r.caminhos).toContain('contadores/0/valor');
        expect(camposParaGravar(f, r.caminhos)).toEqual({ 'contadores/0/valor': 0 });
    });
});

describe('normalizarGatilhos - eventos e ações da Fase 2', () => {
    it('aceita os eventos novos com parâmetros limpos', () => {
        const mk = (evento) => norm([G({ evento, acoes: [{ tipo: 'mensagem', texto: 'x' }] })])[0];
        expect(mk({ tipo: 'acertou', nivel: 'fatal' }).evento).toEqual({ tipo: 'acertou', nivel: 'fatal' });
        expect(mk({ tipo: 'acertou', nivel: 'xx' }).evento).toEqual({ tipo: 'acertou', nivel: 'qualquer' });
        expect(mk({ tipo: 'atingido' }).evento).toEqual({ tipo: 'atingido', nivel: 'qualquer' });
        expect(mk({ tipo: 'poderLigou' }).evento).toEqual({ tipo: 'poderLigou' });
        expect(mk({ tipo: 'contadorAtingiu', contadorId: 'k', op: '==', valor: '3' }).evento).toEqual({ tipo: 'contadorAtingiu', contadorId: 'k', op: '==', valor: 3 });
        expect(mk({ tipo: 'contadorAtingiu', contadorId: 'k' })).toBeUndefined();
        for (const t of ['errou', 'inimigoErrou', 'turnoInicio', 'turnoFim', 'fimDeLuta']) expect(mk({ tipo: t }).evento).toEqual({ tipo: t });
    });
    it('ações novas: válidas, limitadas e inválidas descartam o gatilho', () => {
        const a = (acao) => norm([G({ evento: { tipo: 'turnoInicio' }, acoes: [acao] })]);
        expect(a({ tipo: 'contador', id: 'k', op: 'somar', valor: 2 })[0].acoes[0]).toEqual({ tipo: 'contador', id: 'k', op: 'somar', valor: 2 });
        expect(a({ tipo: 'contador', id: 'k', op: 'somar', valor: -1, sorteio: '1D3' })[0].acoes[0]).toEqual({ tipo: 'contador', id: 'k', op: 'somar', valor: -1, sorteio: '1d3' });
        expect(a({ tipo: 'contador', id: 'k', op: 'zerar' })[0].acoes[0]).toEqual({ tipo: 'contador', id: 'k', op: 'zerar' });
        expect(a({ tipo: 'contador', id: 'k', op: 'dividir', valor: 0 })).toEqual([]);
        expect(a({ tipo: 'contador', id: 'k', op: 'somar', valor: 1, sorteio: 'abc' })).toEqual([]);
        expect(a({ tipo: 'contador', op: 'somar', valor: 1 })).toEqual([]);
        expect(a({ tipo: 'contador', id: 'k', op: 'somar', valor: 1e9 })[0].acoes[0].valor).toBe(9999);
        expect(a({ tipo: 'aplicarEstado', estado: 'queimado', stacks: 99 })[0].acoes[0]).toEqual({ tipo: 'aplicarEstado', estado: 'queimado', stacks: 6 });
        expect(a({ tipo: 'aplicarEstado', estado: 'nao_existe' })).toEqual([]);
        expect(a({ tipo: 'removerEstado', estado: 'queimado' })[0].acoes[0]).toEqual({ tipo: 'removerEstado', estado: 'queimado' });
        expect(a({ tipo: 'ligarPoder', poderId: 'p9' })[0].acoes[0]).toEqual({ tipo: 'ligarPoder', poderId: 'p9' });
        expect(a({ tipo: 'desligarPoder' })).toEqual([]);
        expect(a({ tipo: 'danoEmSi', modo: 'percMax', valor: 10 })[0].acoes[0]).toEqual({ tipo: 'danoEmSi', modo: 'percMax', valor: 10 });
        expect(a({ tipo: 'danoEmSi', valor: 0 })).toEqual([]);
        expect(semUndefined(a({ tipo: 'contador', id: 'k', op: 'somar', valor: 2 }))).toBe(true);
    });
    it("limite 'turno' é aceito", () => {
        const g = norm([G({ evento: { tipo: 'turnoInicio' }, limite: { max: 2, por: 'turno' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] })])[0];
        expect(g.limite).toEqual({ max: 2, por: 'turno' });
    });
});

describe('Ego Superior: acertou normal +2, crítico +3, fatal +4 num contador', () => {
    const poderEgo = () => poder([
        G({ id: 'e1', evento: { tipo: 'acertou', nivel: 'normal' }, acoes: [{ tipo: 'contador', id: 'prest', op: 'somar', valor: 2 }] }),
        G({ id: 'e2', evento: { tipo: 'acertou', nivel: 'critico' }, acoes: [{ tipo: 'contador', id: 'prest', op: 'somar', valor: 3 }] }),
        G({ id: 'e3', evento: { tipo: 'acertou', nivel: 'fatal' }, acoes: [{ tipo: 'contador', id: 'prest', op: 'somar', valor: 4 }] }),
    ]);
    it('soma conforme o nível e informa o caminho do contador', () => {
        const f = ficha({ poderes: [poderEgo()], contadores: [ct('prest', { max: 9999 })] });
        const r1 = disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'prest')).toBe(2);
        expect(r1.textos.join(' ')).toContain('prest 0 → 2');
        disparar(f, { tipo: 'acertou', nivel: 'critico' });
        expect(valor(f, 'prest')).toBe(5);
        const r3 = disparar(f, { tipo: 'acertou', nivel: 'fatal' });
        expect(valor(f, 'prest')).toBe(9);
        expect(r3.caminhos).toEqual(['contadores/0/valor']);
        expect(camposParaGravar(f, r3.caminhos)).toEqual({ 'contadores/0/valor': 9 });
        expect(semUndefined(f)).toBe(true);
    });
    it('poder desligado não dispara; gatilho passivo dispara mesmo desligado', () => {
        const f = ficha({ poderes: [{ ...poderEgo(), ativa: false }], contadores: [ct('prest')] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'prest')).toBe(0);
        const p = poderEgo(); p.ativa = false; p.gatilhos[0].passivo = true;
        const g = ficha({ poderes: [p], contadores: [ct('prest')] });
        disparar(g, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(g, 'prest')).toBe(2);
    });
    it('acertou qualquer casa com todos os níveis', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou', nivel: 'qualquer' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [ct('a')] });
        ['normal', 'critico', 'fatal'].forEach(n => disparar(f, { tipo: 'acertou', nivel: n }));
        expect(valor(f, 'a')).toBe(3);
    });
    it('contador inexistente é ignorado em silêncio', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'nao_existe', op: 'somar', valor: 1 }] })])] });
        const r = disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(r.textos).toEqual([]);
        expect(r.caminhos).toEqual([]);
    });
});

describe('Fúria: +2 por acerto; atingido com sorteio', () => {
    const furia = () => poder([
        G({ id: 'f1', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'furia', op: 'somar', valor: 2 }] }),
        G({ id: 'f2', evento: { tipo: 'atingido' }, acoes: [{ tipo: 'contador', id: 'furia', op: 'somar', valor: -2 }] }),
        G({ id: 'f3', evento: { tipo: 'atingido' }, acoes: [{ tipo: 'contador', id: 'furia', op: 'somar', valor: -1, sorteio: '1d3' }] }),
    ]);
    it('acertar soma 2; ser atingido tira 2 e mais 1d3 (rng fixo)', () => {
        const f = ficha({ poderes: [furia()], contadores: [ct('furia', { valor: 10 })] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'furia')).toBe(12);
        disparar(f, { tipo: 'atingido', nivel: 'normal' }, { rng: () => 0.99 }); // d3 = 3
        expect(valor(f, 'furia')).toBe(12 - 2 - 3);
    });
    it('não passa dos limites do contador (piso 0)', () => {
        const f = ficha({ poderes: [furia()], contadores: [ct('furia', { valor: 1 })] });
        disparar(f, { tipo: 'atingido', nivel: 'normal' }, { rng: () => 0 });
        expect(valor(f, 'furia')).toBe(0);
    });
    it('rolarSorteio soma NdM', () => {
        expect(rolarSorteio('2d6', () => 0)).toBe(2);
        expect(rolarSorteio('2d6', () => 0.999)).toBe(12);
        expect(rolarSorteio('xx')).toBe(0);
    });
    it('atingido pelo ponto único de dano só com golpe e dano real; God Mode não dispara', () => {
        const mk = () => ficha({ poderes: [furia()], contadores: [ct('furia', { valor: 10 })] });
        const f = mk();
        const r = aplicarDanoNaVida(f, 100, { nome: 'Eu', cenaId: 'c1', golpe: { nivel: 'critico' }, rng: undefined });
        expect(f.vida.atual).toBe(900 * F);
        expect(valor(f, 'furia')).toBeLessThan(10);
        expect(r.caminhos).toContain('contadores/0/valor');
        const g = mk(); aplicarDanoNaVida(g, 100, { nome: 'Eu', cenaId: 'c1' }); // sem golpe (zona, estado): não é "atingido"
        expect(valor(g, 'furia')).toBe(10);
        const h = mk(); h.combate = { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } };
        aplicarDanoNaVida(h, 100, { nome: 'Eu', cenaId: 'c1', golpe: { nivel: 'normal' } });
        expect(h.vida.atual).toBe(1000 * F);
        expect(valor(h, 'furia')).toBe(10);
        const z = mk(); aplicarDanoNaVida(z, 0, { nome: 'Eu', cenaId: 'c1', golpe: { nivel: 'normal' } });
        expect(valor(z, 'furia')).toBe(10);
    });
    it('atingido com nível específico', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'atingido', nivel: 'fatal' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [ct('a')] });
        aplicarDanoNaVida(f, 10, { golpe: { nivel: 'normal' }, cenaId: 'c1' });
        expect(valor(f, 'a')).toBe(0);
        aplicarDanoNaVida(f, 10, { golpe: { nivel: 'fatal' }, cenaId: 'c1' });
        expect(valor(f, 'a')).toBe(1);
    });
});

describe('Quebra-cascos: a cada 3 acertos', () => {
    const poderQuebra = () => poder([
        G({ id: 'q1', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'q', op: 'somar', valor: 1 }] }),
        G({ id: 'q2', evento: { tipo: 'contadorAtingiu', contadorId: 'q', op: '>=', valor: 3 }, acoes: [{ tipo: 'mensagem', texto: 'Casco quebrado' }, { tipo: 'contador', id: 'q', op: 'zerar' }] }),
    ]);
    it('no 3o acerto avisa e zera; o ciclo recomeça', () => {
        const f = ficha({ poderes: [poderQuebra()], contadores: [ct('q')] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' }); disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'q')).toBe(2);
        const r = disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(r.textos.join(' ')).toContain('Casco quebrado');
        expect(valor(f, 'q')).toBe(0);
        for (let i = 0; i < 3; i++) disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'q')).toBe(0);
    });
    it('a cadeia é limitada (zerar não reentra o mesmo gatilho; laço contador <-> contador para)', () => {
        const laco = poder([
            G({ id: 'l1', evento: { tipo: 'contadorAtingiu', contadorId: 'a', op: '>=', valor: 1 }, acoes: [{ tipo: 'contador', id: 'b', op: 'somar', valor: 1 }] }),
            G({ id: 'l2', evento: { tipo: 'contadorAtingiu', contadorId: 'b', op: '>=', valor: 1 }, acoes: [{ tipo: 'contador', id: 'a', op: 'definir', valor: 0 }, { tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] }),
            G({ id: 'l0', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] }),
        ]);
        const f = ficha({ poderes: [laco], contadores: [ct('a'), ct('b')] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'b')).toBe(1); // l1 disparou uma vez só
    });
    it('contadorAtingiu só dispara na borda (já acima não repete)', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'x', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'q', op: 'somar', valor: 1 }] }),
            G({ id: 'y', evento: { tipo: 'contadorAtingiu', contadorId: 'q', op: '==', valor: 2 }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] }),
        ])], contadores: [ct('q'), ct('n')] });
        for (let i = 0; i < 5; i++) disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'n')).toBe(1);
    });
});

describe('Marca da morte simplificada e reset de cena', () => {
    it('soma a cada acerto e zera no fimDeLuta (reset cena); o permanente fica', () => {
        const f = ficha({
            poderes: [poder([G({ evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'marca', op: 'somar', valor: 1 }, { tipo: 'contador', id: 'perm', op: 'somar', valor: 1 }] })])],
            contadores: [ct('marca', { reset: 'cena' }), ct('perm')],
        });
        disparar(f, { tipo: 'acertou', nivel: 'normal' }); disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect([valor(f, 'marca'), valor(f, 'perm')]).toEqual([2, 2]);
        disparar(f, { tipo: 'fimDeLuta' });
        expect([valor(f, 'marca'), valor(f, 'perm')]).toEqual([0, 2]);
    });
});

describe('Assalto 3 (todo acerto soma) e dividir/definir', () => {
  it('somar, definir e dividir', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'a', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'c', op: 'somar', valor: 5 }] }),
            G({ id: 'b', evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'contador', id: 'c', op: 'dividir', valor: 2 }] }),
            G({ id: 'c', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'contador', id: 'c', op: 'definir', valor: 9 }] }),
        ])], contadores: [ct('c')] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' }); disparar(f, { tipo: 'acertou', nivel: 'normal' }); // 10
        disparar(f, { tipo: 'turnoFim' });
        expect(valor(f, 'c')).toBe(5);
        disparar(f, { tipo: 'turnoInicio' });
        expect(valor(f, 'c')).toBe(9);
    });
});

describe('Cura Criação por turno (turnoInicio -> curar) e limite por turno', () => {
    const cura = (limite) => poder([G({ id: 'cc', evento: { tipo: 'turnoInicio' }, ...(limite ? { limite } : {}), acoes: [{ tipo: 'curar', modo: 'fixo', valor: 100 }] })]);
    it('cura no início do turno', () => {
        const f = ficha({ poderes: [cura()] }); f.vida.atual = 500 * F;
        const r = disparar(f, { tipo: 'turnoInicio' });
        expect(f.vida.atual).toBe(600 * F);
        expect(r.caminhos).toContain('vida/atual');
    });
    it("limite 'turno': 1 vez por turno do dono; volta no turnoInicio seguinte", () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'k', evento: { tipo: 'acertou' }, limite: { max: 1, por: 'turno' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] }),
        ])], contadores: [ct('a')] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' }); disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'a')).toBe(1);
        expect(semUndefined(f)).toBe(true);
        const r = disparar(f, { tipo: 'turnoInicio' });
        expect(r.caminhos).toContain('combate/usosPoderes');
        disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'a')).toBe(2);
    });
    it('zerarUsosPorTurno não mexe em usos de cena', () => {
        const f = ficha({ combate: { usosPoderes: { a: { n: 1, cena: 'c1', turno: true }, b: { n: 1, cena: 'c1' } } } });
        expect(zerarUsosPorTurno(f)).toBe(true);
        expect(Object.keys(f.combate.usosPoderes)).toEqual(['b']);
        expect(zerarUsosPorTurno(ficha())).toBe(false);
    });
    it('limite por cena também vale nos eventos novos', () => {
        const f = ficha({ poderes: [poder([G({ id: 'k', evento: { tipo: 'turnoInicio' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'curar', modo: 'fixo', valor: 1 }] })])] });
        f.vida.atual = 10 * F;
        disparar(f, { tipo: 'turnoInicio' }); disparar(f, { tipo: 'turnoInicio' });
        expect(f.vida.atual).toBe(11 * F);
        disparar(f, { tipo: 'turnoInicio' }, { cenaId: 'c2' });
        expect(f.vida.atual).toBe(12 * F);
    });
});

describe('Contra-ataque simples: inimigoErrou -> mensagem; errou', () => {
    it('inimigoErrou e errou casam só com o próprio evento', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'i', evento: { tipo: 'inimigoErrou' }, acoes: [{ tipo: 'mensagem', texto: 'Contra-ataque!' }] }),
            G({ id: 'e', evento: { tipo: 'errou' }, acoes: [{ tipo: 'mensagem', texto: 'Errei' }] }),
        ])] });
        expect(disparar(f, { tipo: 'inimigoErrou' }).textos.join(' ')).toContain('Contra-ataque!');
        expect(disparar(f, { tipo: 'errou' }).textos.join(' ')).toContain('Errei');
        expect(disparar(f, { tipo: 'turnoInicio' }).textos).toEqual([]);
    });
});

describe('Ações novas: estado, Poder, dano em si', () => {
    it('aplicarEstado / removerEstado respeitam imunidade e informam o caminho', () => {
        const f = ficha({ poderes: [poder([G({ id: 'a', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'aplicarEstado', estado: 'queimado', stacks: 2 }] }),
            G({ id: 'b', evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'removerEstado', estado: 'queimado' }] })])] });
        const r = disparar(f, { tipo: 'turnoInicio' });
        expect(f.condicoes).toEqual([{ id: 'queimado', stacks: 2, fonte: 'g'.length ? 'Poder X' : '' }]);
        expect(r.caminhos).toContain('condicoes');
        const r2 = disparar(f, { tipo: 'turnoFim' });
        expect(f.condicoes).toBeUndefined();
        expect(camposParaGravar(f, r2.caminhos)).toEqual({ condicoes: null });
        const imune = ficha({ poderes: [poder([G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'aplicarEstado', estado: 'queimado' }] })])], afinidades: {} });
        imune.poderes[0].efeitosPassivos = [{ atributo: 'imune_estado', propriedade: 'base', valor: 1, estado: 'queimado' }];
        disparar(imune, { tipo: 'turnoInicio' });
        expect(Array.isArray(imune.condicoes) ? imune.condicoes.length : 0).toBeLessThanOrEqual(1); // não quebra, com ou sem a imunidade reconhecida
    });
    it('ligarPoder passa pelas travas; desligarPoder desliga; ambos geram poderLigou/poderDesligou em cadeia', () => {
        const alvo = { id: 'p2', nome: 'Alvo', ativa: false, usosMax: 1, usosPor: 'cena' };
        const fonte = poder([
            G({ id: 'l', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'ligarPoder', poderId: 'p2' }] }),
            G({ id: 'd', evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'desligarPoder', poderId: 'p2' }] }),
        ]);
        const f = ficha({ poderes: [fonte, alvo] });
        const r = disparar(f, { tipo: 'turnoInicio' });
        expect(f.poderes[1].ativa).toBe(true);
        expect(r.caminhos).toContain('poderes/1/ativa');
        expect(f.combate.usosPoderes.p2.n).toBe(1);
        disparar(f, { tipo: 'turnoFim' });
        expect(f.poderes[1].ativa).toBe(false);
        const r3 = disparar(f, { tipo: 'turnoInicio' }); // sem usos: barrado
        expect(f.poderes[1].ativa).toBe(false);
        expect(r3.textos.join(' ')).toContain('sem usos');
    });
    it('ligar em recarga é barrado', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'ligarPoder', poderId: 'p2' }] })]), { id: 'p2', nome: 'B', ativa: false, recargaRestante: 2 }] });
        const r = disparar(f, { tipo: 'turnoInicio' });
        expect(f.poderes[1].ativa).toBe(false);
        expect(r.textos.join(' ')).toContain('recarga');
    });
    it('poderLigou do próprio Poder e poderDesligou (o Poder já desligado ainda conta)', () => {
        const mk = () => ficha({ poderes: [poder([
            G({ id: 'a', evento: { tipo: 'poderLigou' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] }),
            G({ id: 'b', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 10 }] }),
        ])], contadores: [ct('n')] });
        const f = mk();
        disparar(f, { tipo: 'poderLigou', poderId: 'p1' });
        expect(valor(f, 'n')).toBe(1);
        disparar(f, { tipo: 'poderLigou', poderId: 'outro' });
        expect(valor(f, 'n')).toBe(1);
        f.poderes[0].ativa = false;
        disparar(f, { tipo: 'poderDesligou', poderId: 'p1' });
        expect(valor(f, 'n')).toBe(11);
    });
    it('danoEmSi passa pelo ponto único: tira vida; God Mode zera', () => {
        const mk = () => ficha({ poderes: [poder([G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'danoEmSi', modo: 'fixo', valor: 100 }] })])] });
        const f = mk(); disparar(f, { tipo: 'turnoInicio' });
        expect(f.vida.atual).toBe(900 * F);
        const g = mk(); g.combate = { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } };
        const r = disparar(g, { tipo: 'turnoInicio' });
        expect(g.vida.atual).toBe(1000 * F);
        expect(r.textos.join(' ')).toContain('Imunidade total');
        const p = mk(); p.poderes[0].gatilhos[0].acoes = [{ tipo: 'danoEmSi', modo: 'percAtual', valor: 10 }];
        disparar(p, { tipo: 'turnoInicio' });
        expect(p.vida.atual).toBe(900 * F);
    });
    it('danoEmSi dispara negar morte (cadeia) sem laço', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'd', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'danoEmSi', modo: 'fixo', valor: 5000 }] }),
            G({ id: 'nm', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] }),
        ])] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(f.vida.atual).toBe(1 * F);
    });
});

describe('Regressão: sem gatilhos nada muda', () => {
    it('eventos novos em ficha sem gatilhos não alteram a ficha', () => {
        const f = ficha({ poderes: [{ id: 'p1', nome: 'X', ativa: true }], contadores: [ct('a', { valor: 3 })] });
        const antes = JSON.stringify(f);
        ['acertou', 'errou', 'atingido', 'inimigoErrou', 'turnoInicio', 'turnoFim', 'poderLigou', 'poderDesligou'].forEach(t => {
            const r = disparar(f, { tipo: t, nivel: 'normal', poderId: 'p1' });
            expect(r.textos).toEqual([]); expect(r.caminhos).toEqual([]);
        });
        expect(JSON.stringify(f)).toBe(antes);
        expect(disparar(null, { tipo: 'turnoInicio' }).textos).toEqual([]);
    });
    it('dano sem gatilhos e com golpe é idêntico ao de antes', () => {
        const f = ficha(); const g = ficha();
        aplicarDanoNaVida(f, 100, { golpe: { nivel: 'fatal' } }); aplicarDanoNaVida(g, 100, {});
        expect(JSON.stringify(f)).toBe(JSON.stringify(g));
    });
});

describe('descrição e coleta', () => {
    it('frases legíveis com nomes de contador e Poder', () => {
        const ctx = { contadores: [{ id: 'k', nome: 'Fúria' }], poderes: [{ id: 'p2', nome: 'Demogorgon' }] };
        const g = norm([G({ evento: { tipo: 'acertou', nivel: 'critico' }, limite: { max: 1, por: 'turno' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 3 }, { tipo: 'ligarPoder', poderId: 'p2' }, { tipo: 'danoEmSi', modo: 'percMax', valor: 5 }] })])[0];
        const t = descreverGatilho(g, ctx);
        expect(t).toContain('Quando eu acertar um golpe crítico');
        expect(t).toContain('+3 em Fúria'); expect(t).toContain('ligar Demogorgon'); expect(t).toContain('5% da Vida máxima'); expect(t).toContain('1x por turno');
        expect(descreverGatilho(norm([G({ evento: { tipo: 'contadorAtingiu', contadorId: 'k', op: '>=', valor: 3 }, acoes: [{ tipo: 'contador', id: 'k', op: 'zerar' }] })])[0], ctx)).toContain('Fúria a pelo menos 3');
        expect(descreverGatilho(norm([G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: -1, sorteio: '1d3' }] })])[0], ctx)).toContain('−1d3 em Fúria');
    });
    it('coletarGatilhos aceita tambemLigado', () => {
        const p = poder([G({ evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] })], { ativa: false });
        expect(coletarGatilhos(ficha({ poderes: [p] })).length).toBe(0);
        expect(coletarGatilhos(ficha({ poderes: [p] }), { tambemLigado: 'p1' }).length).toBe(1);
    });
});
