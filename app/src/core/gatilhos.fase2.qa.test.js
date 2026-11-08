import { describe, it, expect } from 'vitest';
import * as NOVO_GAT from './gatilhos.js';
import * as NOVO_APL from './gatilhosAplicar.js';
import * as NOVO_DANO from './danoVida.js';
import * as NOVO_CUSTO from './custoPorTurno.js';
import * as NOVO_CONT from './contadores.js';

// QA Fase 2 dos Gatilhos (core). Parte 1: NAO-REGRESSAO por comparacao diferencial com as copias do HEAD (*.qaf2old.js, temporarias;
// sem elas os testes diferenciais sao pulados). Parte 2: exemplos do catalogo e bordas. Os valores sao calculados a mao quando possivel.
const velhos = import.meta.glob('./*.qaf2old.js', { eager: true });
const O = {
    gat: velhos['./gatilhos.qaf2old.js'], apl: velhos['./gatilhosAplicar.qaf2old.js'], dano: velhos['./danoVida.qaf2old.js'],
    custo: velhos['./custoPorTurno.qaf2old.js'], cont: velhos['./contadores.qaf2old.js'],
};
const temOld = !!(O.gat && O.apl && O.dano && O.custo && O.cont);

const F = 1000;
const clone = (o) => JSON.parse(JSON.stringify(o));
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
const vital = (base, atual = base) => ({ base, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual, regeneracao: 0 });
const ficha = (extra = {}) => ({
    iniciativa: 0, vida: vital(1000000, 1000 * F), mana: vital(100000000, 100 * F), aura: vital(100000000, 100 * F), chakra: vital(100000000, 100 * F), corpo: vital(100000000, 100 * F),
    forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 }, sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 },
    carisma: { base: 1000000 }, stamina: { base: 1000000 }, constituicao: { base: 1000000 },
    multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {}, poderes: [], inventario: [], passivas: [], contadores: [],
    ...extra,
});
const G = (g) => ({ nome: 'g', ...g });
const poder = (gatilhos, extra = {}) => ({ id: 'p1', nome: 'Poder X', ativa: true, gatilhos, ...extra });
const norm = (lista) => NOVO_GAT.normalizarGatilhos(lista).gatilhos;
const disparar = (f, ev, ctx = {}) => NOVO_APL.dispararEventoNaFicha(f, ev, { cenaId: 'c1', nome: 'Eu', ...ctx });
const ct = (id, extra = {}) => NOVO_CONT.normalizarContador({ id, nome: id, valor: 0, min: 0, max: 100, ...extra });
const valor = (f, id) => f.contadores.find(c => c.id === id).valor;
const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const FAIXA = { id: 'fx', nome: 'Faixa', evento: { tipo: 'vidaAbaixoDe', de: 50, ate: 1 }, acoes: [{ tipo: 'escudo', nome: 'Cinzas', valor: 50, tipoEscudo: 'escudo' }, { tipo: 'mensagem', texto: 'ai' }] };

// ---------------------------------------------------------------------------------------------------------
describe.skipIf(!temOld)('NAO-REGRESSAO (diferencial vs HEAD) - Fase 1 inalterada', () => {
    const cenarios = () => {
        const lista = [];
        const gat = [[], [NEGAR], [FAIXA], [NEGAR, FAIXA]];
        const vidas = [1000, 500, 100, 1];
        const danos = [0, 1, 50, 499, 500, 999, 1000, 5000];
        const esc = [undefined, [{ id: 'e1', nome: 'Domo', valor: 30, tipo: 'escudo' }], [{ id: 'e2', nome: 'VT', valor: 5000, tipo: 'vidaTemporaria' }]];
        const gods = [false, true];
        gat.forEach((gs, gi) => vidas.forEach(v => danos.forEach(d => esc.forEach((e, ei) => gods.forEach((god) => {
            lista.push({ nome: `g${gi} v${v} d${d} e${ei} god${god}`, gs, v, d, e, god });
        })))));
        return lista;
    };
    const montar = (c) => {
        const f = ficha({ poderes: c.gs.length ? [poder(clone(c.gs))] : [], ...(c.e ? { escudos: clone(c.e) } : {}), ...(c.god ? { combate: { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } } } : {}) });
        f.vida.atual = c.v * F;
        return f;
    };
    it('aplicarDanoNaVida: ficha final e resultado identicos em toda a matriz (sem `golpe`)', () => {
        let n = 0;
        cenarios().forEach((c) => {
            const a = montar(c); const b = montar(c);
            const ctx = { nome: 'Eu', cenaId: 'c1', vidaMaxBruta: 1000 * F, eventoId: 'ev1' };
            const ra = NOVO_DANO.aplicarDanoNaVida(a, c.d, clone(ctx));
            const rb = O.dano.aplicarDanoNaVida(b, c.d, clone(ctx));
            expect(JSON.stringify(a), c.nome).toBe(JSON.stringify(b));
            expect(JSON.stringify(ra), c.nome).toBe(JSON.stringify(rb));
            n++;
        });
        expect(n).toBeGreaterThan(500);
    });
    it('aplicarDanoNaVida COM `golpe` e sem gatilhos de Fase 2 e igual a sem golpe (ficha e resultado)', () => {
        cenarios().forEach((c) => {
            const a = montar(c); const b = montar(c);
            const ctx = { nome: 'Eu', cenaId: 'c1', vidaMaxBruta: 1000 * F, eventoId: 'ev1' };
            const ra = NOVO_DANO.aplicarDanoNaVida(a, c.d, { ...ctx, golpe: { nivel: 'critico' } });
            const rb = O.dano.aplicarDanoNaVida(b, c.d, ctx);
            expect(JSON.stringify(a), c.nome).toBe(JSON.stringify(b));
            expect(JSON.stringify(ra), c.nome).toBe(JSON.stringify(rb));
        });
    });
    it('aplicarDanoNaVida: ctx semEscudo e jaAbsorvido iguais', () => {
        [{ semEscudo: true }, { jaAbsorvido: true }].forEach((extra) => {
            [0, 300, 5000].forEach((d) => {
                const a = ficha({ escudos: [{ id: 'e', nome: 'D', valor: 100, tipo: 'escudo' }], poderes: [poder([NEGAR])] }); const b = clone(a);
                const ra = NOVO_DANO.aplicarDanoNaVida(a, d, { nome: 'Eu', cenaId: 'c', ...extra });
                const rb = O.dano.aplicarDanoNaVida(b, d, { nome: 'Eu', cenaId: 'c', ...extra });
                expect(JSON.stringify([a, ra])).toBe(JSON.stringify([b, rb]));
            });
        });
    });
    it('aplicarAcoesNoRascunho: acoes da Fase 1 dao os mesmos textos/caminhos/anulado/ficha', () => {
        const acoes = [
            { tipo: 'definirVida', valor: 7 }, { tipo: 'definirVida', percMax: 10 }, { tipo: 'curar', modo: 'fixo', valor: 30 }, { tipo: 'curar', modo: 'percMax', valor: 5 },
            { tipo: 'curar', modo: 'percAtual', valor: 50 }, { tipo: 'escudo', nome: 'Es', valor: 40, tipoEscudo: 'escudo' }, { tipo: 'escudo', nome: 'VT', valor: 40, tipoEscudo: 'vidaTemporaria' },
            { tipo: 'buff', atributo: 'forca', valor: 3, duracao: 2, modo: 'turnos' }, { tipo: 'limparCondicoes' }, { tipo: 'imunidadeTotal', duracaoTurnos: 2 }, { tipo: 'mensagem', texto: 'oi' }, { tipo: 'anularDano' },
        ];
        acoes.forEach((ac) => {
            [undefined, 'antes'].forEach((fase) => {
                const base = ficha({ condicoes: [{ id: 'queimado', stacks: 1 }] }); base.vida.atual = 400 * F;
                const a = clone(base); const b = clone(base);
                const lista = [{ ...ac, gatilhoNome: 'G', chave: 'k', fonte: { tipo: 'poder', id: 'p1', nome: 'P' }, ...(fase ? { fase } : {}) }];
                const ctx = { vidaMaxBruta: 1000 * F, cenaId: 'c' };
                const ra = NOVO_APL.aplicarAcoesNoRascunho(a, clone(lista), ctx); const rb = O.apl.aplicarAcoesNoRascunho(b, clone(lista), ctx);
                expect(JSON.stringify(a), ac.tipo).toBe(JSON.stringify(b));
                expect({ t: ra.textos, c: [...ra.caminhos].sort(), x: ra.anulado }, ac.tipo).toEqual({ t: rb.textos, c: [...rb.caminhos].sort(), x: rb.anulado });
            });
        });
    });
    it('normalizarGatilhos e avaliarGatilhos da Fase 1 identicos', () => {
        const entradas = [[NEGAR], [FAIXA], [NEGAR, FAIXA], [{ ...NEGAR, id: '' }, { ...NEGAR, id: '' }], [{ nome: 'x', evento: { tipo: 'xx' }, acoes: [] }], [{ ...FAIXA, evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 50 } }], [{ ...FAIXA, evento: { tipo: 'vidaAbaixoDe' } }]];
        entradas.forEach((e) => {
            const ra = NOVO_GAT.normalizarGatilhos(clone(e), { persistir: false }); const rb = O.gat.normalizarGatilhos(clone(e), { persistir: false });
            expect(JSON.stringify(ra)).toBe(JSON.stringify(rb));
        });
        const f = ficha({ poderes: [poder([NEGAR, FAIXA])] });
        [[{ tipo: 'danoQueZeraria' }, { vidaAntes: 100 * F, vidaDepois: 0 }], [{ tipo: 'vidaAbaixoDe' }, { vidaAntes: 900 * F, vidaDepois: 400 * F, vidaMaxBruta: 1000 * F }], [{ tipo: 'vidaAbaixoDe' }, { vidaAntes: 900 * F, vidaDepois: 800 * F, vidaMaxBruta: 1000 * F }]].forEach(([ev, ctx]) => {
            expect(JSON.stringify(NOVO_GAT.avaliarGatilhos(ev, ctx, clone(f)))).toBe(JSON.stringify(O.gat.avaliarGatilhos(ev, ctx, clone(f))));
        });
        expect(NOVO_GAT.coletarGatilhos(f).map(c => c.chave)).toEqual(O.gat.coletarGatilhos(f).map(c => c.chave));
    });
    it('descreverGatilho da Fase 1 identico', () => {
        norm([NEGAR, FAIXA]).forEach(g => expect(NOVO_GAT.descreverGatilho(g)).toBe(O.gat.descreverGatilho(g)));
    });
    it('contadores: normalizar/adicionar/atualizar/mudar/remover identicos para contadores sem reset', () => {
        const base = ficha({ poderes: [{ id: 'pe', nome: 'Est', estagios: [{ nome: 'a' }, { nome: 'b' }, { nome: 'c' }] }] });
        const passos = (M) => {
            const f = clone(base);
            M.adicionarContador(f, { id: 'a', nome: 'A', min: 0, max: 5 });
            M.adicionarContador(f, { id: 'b', nome: 'B', min: -3, max: 3, poderId: 'pe' });
            M.mudarContador(f, 'a', 2); M.mudarContador(f, 'a', 99); M.mudarContador(f, 'b', -9); M.mudarContador(f, 'x', 1);
            M.atualizarContador(f, 'a', { nome: '  Z  ', max: 1 }); M.atualizarContador(f, 'b', { poderId: '' });
            M.removerContador(f, 'a');
            return JSON.stringify([f, M.listaDeContadores(f), M.normalizarContador({ id: 1, nome: '', valor: 'x', min: 'y', max: NaN }), M.normalizarContador(null)]);
        };
        expect(passos(NOVO_CONT)).toBe(passos(O.cont));
    });
    it('custoPorTurno: calcular/aplicar identicos (menos o novo campo `ids`), incluindo desligar sem energia', () => {
        const mk = (extra) => ficha({ poderes: [
            { id: 1, nome: 'A', ativa: true, custoPorTurno: { modo: 'fixo', valor: 30, energia: 'mana' } },
            { id: 2, nome: 'B', ativa: true, custoPorTurno: { modo: 'fixo', valor: 80, energia: 'mana' } },
            { id: 3, nome: 'C', ativa: true, custoPorTurno: { modo: 'percMax', valor: 10, energia: 'aura' } },
            { id: 4, nome: 'D', ativa: false, custoPorTurno: { modo: 'fixo', valor: 1, energia: 'corpo' } },
            { id: 5, nome: 'E', ativa: true },
        ], ...extra });
        [{}, { mana: vital(100000000, 50 * F) }, { aura: vital(100000000, 0) }, { mana: undefined }].forEach((extra) => {
            const a = mk(extra); const b = clone(a);
            expect(JSON.stringify(NOVO_CUSTO.calcularCustosPorTurno(a))).toBe(JSON.stringify(O.custo.calcularCustosPorTurno(b)));
            const ra = NOVO_CUSTO.aplicarCustosPorTurno(a); const rb = O.custo.aplicarCustosPorTurno(b);
            const { ids, ...restoA } = ra;
            expect(JSON.stringify(restoA)).toBe(JSON.stringify(rb));
            expect(JSON.stringify(a)).toBe(JSON.stringify(b));
            expect(ids.length).toBe(ra.desligados);
        });
    });
    it('desligarPoderNoRascunho com id numerico igual ao do HEAD', () => {
        const a = ficha({ poderes: [{ id: 1, nome: 'A', ativa: true }, { id: 2, nome: 'B', ativa: false }] }); const b = clone(a);
        [1, 2, 3].forEach(id => expect(NOVO_CUSTO.desligarPoderNoRascunho(a, id)).toBe(O.custo.desligarPoderNoRascunho(b, id)));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('NAO-REGRESSAO (valores a mao) - sem gatilhos nada muda', () => {
    it('eventos novos com ficha sem gatilhos: ficha byte a byte igual e nenhum caminho (poder ligado, item equipado, passiva sem gatilhos)', () => {
        const f = ficha({ poderes: [{ id: 'p1', nome: 'X', ativa: true, custoPorTurno: { modo: 'fixo', valor: 1, energia: 'mana' } }], inventario: [{ id: 'i', nome: 'Espada', equipado: true }], passivas: [{ id: 'pa', nome: 'Pa' }], contadores: [ct('a', { valor: 3 }), ct('b', { valor: 2, reset: 'cena' })], escudos: [{ id: 'e', nome: 'E', valor: 5, tipo: 'escudo' }] });
        const antes = JSON.stringify(f);
        ['acertou', 'errou', 'atingido', 'inimigoErrou', 'turnoFim', 'poderLigou', 'poderDesligou', 'contadorAtingiu'].forEach((t) => {
            const r = disparar(f, { tipo: t, nivel: 'fatal', poderId: 'p1', contadorId: 'a', valorAntes: 0, valorDepois: 9 });
            expect(r).toEqual({ textos: [], caminhos: [], chaves: [], disparou: false });
        });
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('turnoInicio/fimDeLuta sem gatilhos so mexem em usos "por turno" e contadores de cena (nada mais)', () => {
        const f = ficha({ contadores: [ct('a', { valor: 3 })], combate: { usosPoderes: { x: { n: 1, cena: 'c' } }, fadigaTurnos: 2 } });
        const antes = JSON.stringify(f);
        expect(disparar(f, { tipo: 'turnoInicio' }).caminhos).toEqual([]);
        expect(disparar(f, { tipo: 'fimDeLuta' }).caminhos).toEqual([]);
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('dano sem gatilhos: Vida = max(0, vida - dano*1000) e caminhos so ["vida/atual"]; com golpe igual', () => {
        const f = ficha(); const g = ficha();
        const r = NOVO_DANO.aplicarDanoNaVida(f, 250, {}); const s = NOVO_DANO.aplicarDanoNaVida(g, 250, { golpe: { nivel: 'fatal' } });
        expect(f.vida.atual).toBe(750 * F); expect(r.caminhos).toEqual(['vida/atual']); expect(s).toEqual(r);
        const h = ficha(); NOVO_DANO.aplicarDanoNaVida(h, 99999, { golpe: { nivel: 'normal' } });
        expect(h.vida.atual).toBe(0);
    });
    it('reset ausente = permanente: ficha antiga sem os campos novos funciona', () => {
        const antiga = { vida: { atual: 5000 }, contadores: [{ id: 'a', nome: 'A', valor: 4, min: 0, max: 5 }] };
        expect(NOVO_CONT.resetarContadoresDeCena(antiga)).toEqual([]);
        expect(disparar(antiga, { tipo: 'fimDeLuta' }).caminhos).toEqual([]);
        expect(antiga.contadores[0].valor).toBe(4);
        const semNada = {};
        expect(() => disparar(semNada, { tipo: 'turnoInicio' })).not.toThrow();
        expect(semNada).toEqual({});
    });
    it('fimDeLuta nao gera nenhum `undefined` em ficha sem combate', () => {
        const f = ficha({ contadores: [ct('a', { valor: 2, reset: 'cena' })] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(semUndefined(f)).toBe(true);
        expect(f.combate).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('Catalogo (fluxo) - Ego Superior, Furia, Quebra-cascos, Marca da morte, Assalto 3, Cura Criacao, contra-ataque', () => {
    it('Ego Superior: +2/+3/+4 por nivel; um golpe "qualquer" do poder soma separado; valores finais a mao', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'n', evento: { tipo: 'acertou', nivel: 'normal' }, acoes: [{ tipo: 'contador', id: 'e', op: 'somar', valor: 2 }] }),
            G({ id: 'c', evento: { tipo: 'acertou', nivel: 'critico' }, acoes: [{ tipo: 'contador', id: 'e', op: 'somar', valor: 3 }] }),
            G({ id: 'x', evento: { tipo: 'acertou', nivel: 'fatal' }, acoes: [{ tipo: 'contador', id: 'e', op: 'somar', valor: 4 }] }),
        ])], contadores: [ct('e', { max: 9999 })] });
        const seq = ['normal', 'normal', 'critico', 'fatal', 'fatal', 'critico', 'normal'];
        seq.forEach(n => disparar(f, { tipo: 'acertou', nivel: n }));
        expect(valor(f, 'e')).toBe(2 + 2 + 3 + 4 + 4 + 3 + 2);
    });
    it('Ego Superior respeita o teto do contador (max)', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou', nivel: 'fatal' }, acoes: [{ tipo: 'contador', id: 'e', op: 'somar', valor: 4 }] })])], contadores: [ct('e', { max: 6 })] });
        disparar(f, { tipo: 'acertou', nivel: 'fatal' }); disparar(f, { tipo: 'acertou', nivel: 'fatal' }); disparar(f, { tipo: 'acertou', nivel: 'fatal' });
        expect(valor(f, 'e')).toBe(6);
    });
    it('Furia: no teto o acerto nao muda nada (sem texto, sem caminho)', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'f', op: 'somar', valor: 2 }] })])], contadores: [ct('f', { valor: 10, max: 10 })] });
        const r = disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(r.caminhos).toEqual([]); expect(r.textos).toEqual([]); expect(valor(f, 'f')).toBe(10);
    });
    it('Furia: sorteio 1d3 com rng extremos fica entre -1 e -3 e nunca abaixo do min 0', () => {
        const mk = () => ficha({ poderes: [poder([G({ evento: { tipo: 'atingido' }, acoes: [{ tipo: 'contador', id: 'f', op: 'somar', valor: -1, sorteio: '1d3' }] })])], contadores: [ct('f', { valor: 5 })] });
        const a = mk(); disparar(a, { tipo: 'atingido', nivel: 'normal' }, { rng: () => 0 }); expect(valor(a, 'f')).toBe(4);
        const b = mk(); disparar(b, { tipo: 'atingido', nivel: 'normal' }, { rng: () => 0.999 }); expect(valor(b, 'f')).toBe(2);
        const c = mk(); c.contadores[0].valor = 1; disparar(c, { tipo: 'atingido', nivel: 'normal' }, { rng: () => 0.999 }); expect(valor(c, 'f')).toBe(0);
    });
    it('Furia via ponto unico de dano: golpe tira 1d3 do contador alem da Vida; texto do contador entra em `textos`', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'atingido' }, acoes: [{ tipo: 'contador', id: 'f', op: 'somar', valor: -2 }] })])], contadores: [ct('f', { valor: 9 })] });
        const r = NOVO_DANO.aplicarDanoNaVida(f, 100, { nome: 'Eu', cenaId: 'c', golpe: { nivel: 'normal' } });
        expect(f.vida.atual).toBe(900 * F); expect(valor(f, 'f')).toBe(7);
        expect(r.textos.join(' ')).toContain('f 9 → 7');
        expect(r.caminhos).toEqual(expect.arrayContaining(['vida/atual', 'contadores/0/valor']));
        expect(semUndefined(r)).toBe(true);
    });
    it('Quebra-cascos: a cada 3 acertos dispara; 7 acertos = 2 disparos e sobra 1; so conta na borda', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'a', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'q', op: 'somar', valor: 1 }] }),
            G({ id: 'b', evento: { tipo: 'contadorAtingiu', contadorId: 'q', op: '>=', valor: 3 }, acoes: [{ tipo: 'mensagem', texto: 'QUEBROU' }, { tipo: 'contador', id: 'q', op: 'zerar' }] }),
        ])], contadores: [ct('q')] });
        let quebras = 0;
        for (let i = 0; i < 7; i++) quebras += disparar(f, { tipo: 'acertou', nivel: 'normal' }).textos.filter(t => t.includes('QUEBROU')).length;
        expect(quebras).toBe(2); expect(valor(f, 'q')).toBe(1);
    });
    it('Quebra-cascos sem zerar: nao repete enquanto fica acima; repete ao voltar abaixo e subir', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'a', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'q', op: 'somar', valor: 1 }] }),
            G({ id: 'b', evento: { tipo: 'contadorAtingiu', contadorId: 'q', op: '>=', valor: 3 }, acoes: [{ tipo: 'mensagem', texto: 'Q' }] }),
            G({ id: 'c', evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'contador', id: 'q', op: 'definir', valor: 0 }] }),
        ])], contadores: [ct('q')] });
        const q = () => disparar(f, { tipo: 'acertou', nivel: 'normal' }).textos.filter(t => t.includes(': Q')).length;
        expect([q(), q(), q(), q(), q()]).toEqual([0, 0, 1, 0, 0]);
        disparar(f, { tipo: 'turnoFim' });
        expect([q(), q(), q()]).toEqual([0, 0, 1]);
    });
    it('Marca da morte: cena zera no fimDeLuta, permanente nao; fimDeLuta de OUTRO ciclo tambem; caminhos so do que mudou', () => {
        const f = ficha({ contadores: [ct('m', { valor: 4, reset: 'cena' }), ct('p', { valor: 4 }), ct('z', { valor: 0, reset: 'cena' })] });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(f.contadores.map(c => c.valor)).toEqual([0, 4, 0]);
        expect(r.caminhos).toEqual(['contadores/0/valor']);
        expect(disparar(f, { tipo: 'fimDeLuta' }).caminhos).toEqual([]);
    });
    it('Marca da morte com min > 0 volta ao MIN, nao a 0', () => {
        const f = ficha({ contadores: [ct('m', { valor: 4, min: 2, reset: 'cena' })] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(valor(f, 'm')).toBe(2);
    });
    it('Assalto 3: todo acerto soma (normal/critico/fatal) e para no max', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [ct('a', { max: 3 })] });
        ['normal', 'critico', 'fatal', 'normal', 'normal'].forEach(n => disparar(f, { tipo: 'acertou', nivel: n }));
        expect(valor(f, 'a')).toBe(3);
    });
    it('Cura Criacao: turnoInicio cura 100; com limite 1 por turno, 2 disparos no mesmo turno curam 1 vez; novo turnoInicio libera', () => {
        const f = ficha({ poderes: [poder([G({ id: 'cc', evento: { tipo: 'turnoInicio' }, limite: { max: 1, por: 'turno' }, acoes: [{ tipo: 'curar', modo: 'fixo', valor: 100 }] })])] });
        f.vida.atual = 100 * F;
        disparar(f, { tipo: 'turnoInicio' });
        expect(f.vida.atual).toBe(200 * F);
        // o turnoInicio ZERA o uso do proprio turno antes de avaliar: cada inicio de turno cura 1 vez
        disparar(f, { tipo: 'turnoInicio' });
        expect(f.vida.atual).toBe(300 * F);
        expect(semUndefined(f)).toBe(true);
    });
    it('Cura Criacao: cura limitada pela Vida maxima (nao passa do teto)', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'curar', modo: 'fixo', valor: 100000 }] })])] });
        f.vida.atual = 999000;
        disparar(f, { tipo: 'turnoInicio' }, { vidaMaxBruta: 1000 * F });
        expect(f.vida.atual).toBeLessThanOrEqual(1000 * F);
    });
    it('contra-ataque: inimigoErrou -> mensagem com o nome do gatilho; Poder desligado nao responde', () => {
        const mk = (ativa) => ficha({ poderes: [poder([G({ nome: 'Contra', evento: { tipo: 'inimigoErrou' }, acoes: [{ tipo: 'mensagem', texto: 'Contra-ataque!' }] })], { ativa })] });
        expect(disparar(mk(true), { tipo: 'inimigoErrou' }).textos).toEqual(['Contra: Contra-ataque!']);
        expect(disparar(mk(false), { tipo: 'inimigoErrou' }).textos).toEqual([]);
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('Bordas - lacos, cadeia, ids, fontes', () => {
    it('LACO custoPorTurno <-> poderDesligou: ligarPoder religa o Poder desligado por falta de energia; nao entra em laco infinito e termina', () => {
        const alvo = { id: 'p1', nome: 'Aura', ativa: true, custoPorTurno: { modo: 'fixo', valor: 50, energia: 'mana' },
            gatilhos: [G({ id: 'r', nome: 'Religa', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'ligarPoder', poderId: 'p1' }] })] };
        const f = ficha({ poderes: [alvo] }); f.mana.atual = 10 * F; // sem energia
        const r = NOVO_CUSTO.aplicarCustosPorTurno(f);
        expect(r.ids).toEqual(['p1']); expect(f.poderes[0].ativa).toBe(false);
        const ev = disparar(f, { tipo: 'poderDesligou', poderId: 'p1' });
        expect(f.poderes[0].ativa).toBe(true); // religou
        expect(ev.textos.join(' ')).toContain('ligou');
        // proximo turno: desliga de novo e religa de novo - sempre termina no mesmo turno (nao recursa)
        NOVO_CUSTO.aplicarCustosPorTurno(f); disparar(f, { tipo: 'poderDesligou', poderId: 'p1' });
        expect(f.poderes[0].ativa).toBe(true);
        expect(f.mana.atual).toBe(10 * F); // nunca cobrou
    });
    it('LACO com recarga: religar apos desligar por falta de energia e barrado se o Poder esta em recarga', () => {
        const alvo = { id: 'p1', nome: 'Aura', ativa: false, recargaRestante: 2, gatilhos: [G({ id: 'r', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'ligarPoder', poderId: 'p1' }] })] };
        const f = ficha({ poderes: [alvo] });
        const ev = disparar(f, { tipo: 'poderDesligou', poderId: 'p1' });
        expect(f.poderes[0].ativa).toBe(false); expect(ev.textos.join(' ')).toContain('recarga');
    });
    it('LACO ligar<->desligar: poderLigou desliga o mesmo Poder, poderDesligou religa: profundidade e jaDisparados cortam', () => {
        const p = { id: 'p1', nome: 'Pisca', ativa: false, gatilhos: [
            G({ id: 'a', evento: { tipo: 'poderLigou' }, acoes: [{ tipo: 'desligarPoder', poderId: 'p1' }] }),
            G({ id: 'b', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'ligarPoder', poderId: 'p1' }] }),
        ] };
        const f = ficha({ poderes: [p] });
        p.ativa = true; // ligou
        const r = disparar(f, { tipo: 'poderLigou', poderId: 'p1' });
        expect(typeof f.poderes[0].ativa).toBe('boolean');
        expect(r.textos.length).toBeLessThanOrEqual(6); // cadeia curta, nunca explode
    });
    it('profundidade: A->B->C->D: so 3 niveis disparam (D ja nao)', () => {
        const mkContador = (id) => ct(id);
        const f = ficha({ poderes: [poder([
            G({ id: 'g0', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] }),
            G({ id: 'g1', evento: { tipo: 'contadorAtingiu', contadorId: 'a', op: '>=', valor: 1 }, acoes: [{ tipo: 'contador', id: 'b', op: 'somar', valor: 1 }] }),
            G({ id: 'g2', evento: { tipo: 'contadorAtingiu', contadorId: 'b', op: '>=', valor: 1 }, acoes: [{ tipo: 'contador', id: 'c', op: 'somar', valor: 1 }] }),
            G({ id: 'g3', evento: { tipo: 'contadorAtingiu', contadorId: 'c', op: '>=', valor: 1 }, acoes: [{ tipo: 'contador', id: 'd', op: 'somar', valor: 1 }] }),
            G({ id: 'g4', evento: { tipo: 'contadorAtingiu', contadorId: 'd', op: '>=', valor: 1 }, acoes: [{ tipo: 'contador', id: 'e', op: 'somar', valor: 1 }] }),
        ])], contadores: ['a', 'b', 'c', 'd', 'e'].map(mkContador) });
        disparar(f, { tipo: 'turnoInicio' });
        const vs = ['a', 'b', 'c', 'd', 'e'].map(i => valor(f, i));
        // g0 (prof 0) -> g1 (1) -> g2 (2) -> g3 (3: bloqueado, profundidade >= 3). a,b,c mudam; d nao.
        expect(vs.slice(0, 3)).toEqual([1, 1, 1]);
        expect(vs[3]).toBe(0); expect(vs[4]).toBe(0);
    });
    it('o mesmo gatilho nao dispara 2x na cadeia (auto-realimentacao por contador)', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'auto', evento: { tipo: 'contadorAtingiu', contadorId: 'a', op: '>=', valor: 1 }, acoes: [{ tipo: 'contador', id: 'a', op: 'zerar' }, { tipo: 'contador', id: 'a', op: 'somar', valor: 1 }, { tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] }),
            G({ id: 'ini', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] }),
        ])], contadores: [ct('a'), ct('n')] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(valor(f, 'n')).toBe(1);
    });
    it('eventoId duplicado: o mesmo evento aplicado 2x nao dobra a acao (idempotencia)', () => {
        const f = ficha({ poderes: [poder([G({ id: 'k', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [ct('a')] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' }, { eventoId: 'ev-1' });
        const r = disparar(f, { tipo: 'acertou', nivel: 'normal' }, { eventoId: 'ev-1' });
        expect(valor(f, 'a')).toBe(1); expect(r.disparou).toBe(false);
        disparar(f, { tipo: 'acertou', nivel: 'normal' }, { eventoId: 'ev-2' });
        expect(valor(f, 'a')).toBe(2);
    });
    it('dois golpes seguidos sem eventoId disparam duas vezes', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [ct('a')] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' }); disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'a')).toBe(2);
    });
    it('eventoId do dano: golpe aplicado 2x com o mesmo eventoId nao dobra o `atingido`', () => {
        const f = ficha({ poderes: [poder([G({ id: 'k', evento: { tipo: 'atingido' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [ct('a')] });
        NOVO_DANO.aplicarDanoNaVida(f, 10, { golpe: { nivel: 'normal' }, eventoId: 'golpe-1', cenaId: 'c' });
        NOVO_DANO.aplicarDanoNaVida(f, 10, { golpe: { nivel: 'normal' }, eventoId: 'golpe-1', cenaId: 'c' });
        expect(valor(f, 'a')).toBe(1);
        expect(f.vida.atual).toBe(980 * F); // o dano em si e aplicado nas duas chamadas (idempotencia e so do gatilho)
    });
    it('gatilho em Poder DESLIGADO so dispara poderDesligou proprio; passivo dispara sempre', () => {
        const mk = (extra = {}) => ficha({ poderes: [poder([
            G({ id: 'a', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] }),
            G({ id: 'd', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 10 }] }),
            G({ id: 'l', evento: { tipo: 'poderLigou' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 100 }] }),
        ], { ativa: false, ...extra })], contadores: [ct('n', { max: 9999 })] });
        const f = mk();
        disparar(f, { tipo: 'acertou', nivel: 'normal' }); expect(valor(f, 'n')).toBe(0);
        disparar(f, { tipo: 'poderDesligou', poderId: 'p1' }); expect(valor(f, 'n')).toBe(10); // dispararEventoNaFicha inclui o Poder recem-desligado (tambemLigado)
    });
    it('poderDesligou do proprio Poder JA desligado dispara via dispararEventoNaFicha; poderDesligou de outro Poder nao', () => {
        const f = ficha({ poderes: [
            poder([G({ id: 'd', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 10 }] })], { ativa: false }),
            { id: 'p2', nome: 'Outro', ativa: false },
        ], contadores: [ct('n', { max: 9999 })] });
        disparar(f, { tipo: 'poderDesligou', poderId: 'p2' }); expect(valor(f, 'n')).toBe(0);
        disparar(f, { tipo: 'poderDesligou', poderId: 'p1' }); expect(valor(f, 'n')).toBe(10);
    });
    it('poderDesligou de um Poder X ligado em gatilho de outro Poder (poderId explicito / qualquer)', () => {
        const f = ficha({ poderes: [
            poder([
                G({ id: 'a', evento: { tipo: 'poderDesligou', poderId: 'p2' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] }),
                G({ id: 'b', evento: { tipo: 'poderDesligou', poderId: 'qualquer' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 10 }] }),
            ]),
            { id: 'p2', nome: 'Outro', ativa: false },
        ], contadores: [ct('n', { max: 9999 })] });
        disparar(f, { tipo: 'poderDesligou', poderId: 'p2' });
        expect(valor(f, 'n')).toBe(11);
    });
    it('item equipado e passiva disparam; item NAO equipado nao; item equipado de efeito desligado so se passivo', () => {
        const gat = [G({ id: 'a', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] })];
        const f = ficha({ inventario: [{ id: 'i1', nome: 'Anel', equipado: true, gatilhos: clone(gat) }, { id: 'i2', nome: 'Colar', equipado: false, gatilhos: clone(gat) }], passivas: [{ id: 'pa', nome: 'Pa', gatilhos: clone(gat) }], contadores: [ct('n')] });
        const cs = NOVO_GAT.coletarGatilhos(f);
        disparar(f, { tipo: 'turnoInicio' });
        expect(valor(f, 'n')).toBe(cs.length);
        expect(cs.map(c => c.fonte.tipo).sort()).toEqual(['item', 'passiva'].filter((t) => cs.some(c => c.fonte.tipo === t)).sort());
        expect(cs.some(c => c.fonte.id === 'i2')).toBe(false);
    });
    it('mestreDesligou barra o gatilho de eventos novos', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou' }, mestreDesligou: true, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] })])], contadores: [ct('n')] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'n')).toBe(0);
    });
    it('modo opcional nao dispara (Fase 3)', () => {
        const f = ficha({ poderes: [poder([G({ modo: 'opcional', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] })])], contadores: [ct('n')] });
        const r = disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'n')).toBe(0); expect(r.disparou).toBe(false);
    });
    it('condicoes do gatilho valem nos eventos novos (vida_maior_que)', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou' }, condicoes: ['vida_maior_que:500'], acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] })])], contadores: [ct('n')] });
        f.vida.atual = 400 * F; disparar(f, { tipo: 'acertou', nivel: 'normal' }); expect(valor(f, 'n')).toBe(0);
        f.vida.atual = 600 * F; disparar(f, { tipo: 'acertou', nivel: 'normal' }); expect(valor(f, 'n')).toBe(1);
    });
});

describe('Bordas - atingido, God Mode, danoEmSi, estados', () => {
    const fu = () => ficha({ poderes: [poder([G({ id: 'k', evento: { tipo: 'atingido' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [ct('a')] });
    it('God Mode como ALVO: atingido NAO dispara, contador e escudo intactos', () => {
        const f = fu(); f.combate = { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } }; f.escudos = [{ id: 'e', nome: 'E', valor: 50, tipo: 'escudo' }];
        const r = NOVO_DANO.aplicarDanoNaVida(f, 100, { golpe: { nivel: 'critico' }, cenaId: 'c' });
        expect(r.imune).toBe(true); expect(valor(f, 'a')).toBe(0); expect(f.vida.atual).toBe(1000 * F); expect(f.escudos[0].valor).toBe(50);
    });
    it('God Mode como ATACANTE: acertou dispara normalmente (God Mode so protege o dano recebido)', () => {
        const f = ficha({ combate: { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } }, poderes: [poder([G({ evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [ct('a')] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'a')).toBe(1);
    });
    it('atingido: dano totalmente absorvido pelo escudo (restante 0) nao conta como atingido', () => {
        const f = fu(); f.escudos = [{ id: 'e', nome: 'E', valor: 500, tipo: 'escudo' }];
        NOVO_DANO.aplicarDanoNaVida(f, 100, { golpe: { nivel: 'normal' }, cenaId: 'c' });
        expect(valor(f, 'a')).toBe(0); expect(f.vida.atual).toBe(1000 * F);
    });
    it('atingido: escudo absorve parte e o resto fere -> dispara 1 vez', () => {
        const f = fu(); f.escudos = [{ id: 'e', nome: 'E', valor: 30, tipo: 'escudo' }];
        NOVO_DANO.aplicarDanoNaVida(f, 100, { golpe: { nivel: 'normal' }, cenaId: 'c' });
        expect(valor(f, 'a')).toBe(1); expect(f.vida.atual).toBe(930 * F);
    });
    it('atingido: nivel padrao "normal" quando golpe sem nivel; "fatal" casa nivel fatal', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'atingido', nivel: 'normal' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [ct('a')] });
        NOVO_DANO.aplicarDanoNaVida(f, 1, { golpe: {}, cenaId: 'c' });
        expect(valor(f, 'a')).toBe(1);
    });
    it('Negar morte anula o golpe -> "atingido" nao dispara (documenta o comportamento atual)', () => {
        const f = ficha({ poderes: [poder([NEGAR, G({ id: 'k', evento: { tipo: 'atingido' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [ct('a')] });
        NOVO_DANO.aplicarDanoNaVida(f, 5000, { golpe: { nivel: 'normal' }, cenaId: 'c' });
        expect(f.vida.atual).toBe(1 * F);
        expect(valor(f, 'a')).toBe(0);
    });
    it('golpe que MATA (sem Negar morte) ainda dispara atingido', () => {
        const f = fu();
        NOVO_DANO.aplicarDanoNaVida(f, 5000, { golpe: { nivel: 'normal' }, cenaId: 'c' });
        expect(f.vida.atual).toBe(0); expect(valor(f, 'a')).toBe(1);
    });
    it('danoEmSi: fixo, percMax, percAtual; valor com decimal e piso; nunca negativo; God Mode zera; sem vida ignora', () => {
        const mk = (acao) => ficha({ poderes: [poder([G({ evento: { tipo: 'turnoInicio' }, acoes: [acao] })])] });
        let f = mk({ tipo: 'danoEmSi', modo: 'percMax', valor: 10 }); disparar(f, { tipo: 'turnoInicio' }, { vidaMaxBruta: 1000 * F }); expect(f.vida.atual).toBe(900 * F);
        f = mk({ tipo: 'danoEmSi', modo: 'percAtual', valor: 50 }); f.vida.atual = 400 * F; disparar(f, { tipo: 'turnoInicio' }); expect(f.vida.atual).toBe(200 * F);
        f = mk({ tipo: 'danoEmSi', modo: 'fixo', valor: 999999 }); disparar(f, { tipo: 'turnoInicio' }); expect(f.vida.atual).toBe(0);
        f = mk({ tipo: 'danoEmSi', modo: 'fixo', valor: 0.5 }); // normalizacao: 0.5 > 0 passa; floor => 0 => ignorado
        disparar(f, { tipo: 'turnoInicio' }); expect(f.vida.atual).toBe(1000 * F);
        const sv = mk({ tipo: 'danoEmSi', modo: 'fixo', valor: 5 }); delete sv.vida;
        expect(() => disparar(sv, { tipo: 'turnoInicio' })).not.toThrow();
    });
    it('danoEmSi ignora escudo (dano direto na Vida)', () => {
        const f = ficha({ escudos: [{ id: 'e', nome: 'E', valor: 500, tipo: 'escudo' }], poderes: [poder([G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'danoEmSi', modo: 'fixo', valor: 10 }] })])] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(f.vida.atual).toBe(990 * F); expect(f.escudos[0].valor).toBe(500);
    });
    it('danoEmSi nao dispara `atingido` (nao e golpe)', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'a', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'danoEmSi', modo: 'fixo', valor: 10 }] }),
            G({ id: 'b', evento: { tipo: 'atingido' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] }),
        ])], contadores: [ct('n')] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(valor(f, 'n')).toBe(0);
    });
    it('danoEmSi dispara faixa de vida (vidaAbaixoDe) em cadeia', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'a', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'danoEmSi', modo: 'fixo', valor: 600 }] }),
            G({ id: 'b', evento: { tipo: 'vidaAbaixoDe', de: 50, ate: 1 }, acoes: [{ tipo: 'mensagem', texto: 'metade' }] }),
        ])] });
        const r = disparar(f, { tipo: 'turnoInicio' }, { vidaMaxBruta: 1000 * F });
        expect(r.textos.join(' ')).toContain('metade');
    });
    it('aplicarEstado stacks (1..6), soma stacks; removerEstado inexistente nao muda nada', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'a', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'aplicarEstado', estado: 'queimado', stacks: 2 }] }),
            G({ id: 'b', evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'removerEstado', estado: 'sangrando' }] }),
        ])] });
        disparar(f, { tipo: 'turnoInicio' });
        const s1 = f.condicoes.find(c => c.id === 'queimado').stacks;
        disparar(f, { tipo: 'turnoInicio' });
        expect(f.condicoes.find(c => c.id === 'queimado').stacks).toBeGreaterThan(s1);
        const r = disparar(f, { tipo: 'turnoFim' });
        expect(r.caminhos).toEqual([]); expect(r.textos).toEqual([]);
    });
    it('aplicarEstado respeita imune_estado: ficha imune NAO ganha condicao, ganha texto; sem a imunidade ganha; imune a OUTRO estado ganha', () => {
        const ef = (escopo) => ({ nome: 'E', atributo: 'imune_estado', propriedade: 'base', valor: 1, escopo });
        const mk = (escopo) => ficha({ poderes: [poder([G({ nome: 'Veneno', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'aplicarEstado', estado: 'queimado', stacks: 2 }] })], escopo ? { efeitosPassivos: [ef(escopo)] } : {})] });
        const imune = mk('queimado'); const r = disparar(imune, { tipo: 'turnoInicio' });
        expect(imune.condicoes).toBeUndefined(); expect(r.textos.join(' ')).toContain('imune'); expect(r.caminhos).not.toContain('condicoes');
        const livre = mk(null); disparar(livre, { tipo: 'turnoInicio' }); expect(livre.condicoes.length).toBe(1);
        const outro = mk('lento'); disparar(outro, { tipo: 'turnoInicio' }); expect(outro.condicoes.length).toBe(1);
        const todos = mk('todos'); disparar(todos, { tipo: 'turnoInicio' }); expect(todos.condicoes).toBeUndefined();
        expect(semUndefined(imune)).toBe(true);
    });
    it('contador removido no meio da cadeia: acao seguinte ignora em silencio e nao quebra', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }, { tipo: 'contador', id: 'b', op: 'somar', valor: 1 }] })])], contadores: [ct('a'), ct('b')] });
        NOVO_CONT.removerContador(f, 'a');
        const r = disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(f.contadores.length).toBe(1); expect(valor(f, 'b')).toBe(1);
        expect(r.caminhos).toEqual(['contadores/0/valor']); // indice REAL de b depois da remocao
    });
    it('indice do contador e achado pelo id (nao pela posicao original)', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'c', op: 'somar', valor: 1 }] })])], contadores: [ct('a'), ct('b'), ct('c')] });
        const r = disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(r.caminhos).toEqual(['contadores/2/valor']);
        expect(NOVO_APL.camposParaGravar(f, r.caminhos)).toEqual({ 'contadores/2/valor': 1 });
    });
    it('id de contador numerico vs string (id: 5 e acao id "5")', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: '5', op: 'somar', valor: 1 }] })])], contadores: [{ id: 5, nome: 'N', valor: 0, min: 0, max: 9 }] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(f.contadores[0].valor).toBe(1);
    });
    it('contador com min/max: somar clampa, definir fora do intervalo clampa, dividir trunca, zerar volta a 0 (ou ao min se 0 < min)', () => {
        const mk = (acao, extra) => ficha({ poderes: [poder([G({ evento: { tipo: 'turnoInicio' }, acoes: [acao] })])], contadores: [ct('a', extra)] });
        let f = mk({ tipo: 'contador', id: 'a', op: 'somar', valor: 50 }, { valor: 8, max: 10 }); disparar(f, { tipo: 'turnoInicio' }); expect(valor(f, 'a')).toBe(10);
        f = mk({ tipo: 'contador', id: 'a', op: 'definir', valor: -50 }, { valor: 8, min: -5, max: 10 }); disparar(f, { tipo: 'turnoInicio' }); expect(valor(f, 'a')).toBe(-5);
        f = mk({ tipo: 'contador', id: 'a', op: 'dividir', valor: 3 }, { valor: 10 }); disparar(f, { tipo: 'turnoInicio' }); expect(valor(f, 'a')).toBe(3);
        f = mk({ tipo: 'contador', id: 'a', op: 'dividir', valor: 3 }, { valor: -10, min: -20 }); disparar(f, { tipo: 'turnoInicio' }); expect(valor(f, 'a')).toBe(-3);
        f = mk({ tipo: 'contador', id: 'a', op: 'zerar' }, { valor: 8, min: 2 }); disparar(f, { tipo: 'turnoInicio' }); expect(valor(f, 'a')).toBe(2);
    });
    it('valores NaN/Infinity/enormes/negativos nas acoes: normalizacao descarta ou limita (nunca grava NaN)', () => {
        const a = (acao) => norm([G({ evento: { tipo: 'turnoInicio' }, acoes: [acao] })]);
        expect(a({ tipo: 'contador', id: 'a', op: 'somar', valor: NaN })).toEqual([]);
        expect(a({ tipo: 'contador', id: 'a', op: 'somar', valor: Infinity })).toEqual([]);
        expect(a({ tipo: 'contador', id: 'a', op: 'somar', valor: '1e999' })).toEqual([]);
        expect(a({ tipo: 'contador', id: 'a', op: 'somar', valor: -1e30 })[0].acoes[0].valor).toBe(-9999);
        expect(a({ tipo: 'contador', id: 'a', op: 'somar', valor: 2.9 })[0].acoes[0].valor).toBe(2);
        expect(a({ tipo: 'contador', id: 'a', op: 'dividir', valor: -2 })).toEqual([]);
        expect(a({ tipo: 'contador', id: 'a', op: 'somar', valor: '' })).toEqual([]);
        expect(a({ tipo: 'danoEmSi', valor: Infinity })).toEqual([]);
        expect(a({ tipo: 'danoEmSi', modo: 'percMax', valor: 500 })[0].acoes[0].valor).toBe(100);
        expect(a({ tipo: 'danoEmSi', valor: -5 })).toEqual([]);
        expect(a({ tipo: 'aplicarEstado', estado: 'queimado', stacks: NaN })[0].acoes[0].stacks).toBe(1);
        expect(a({ tipo: 'aplicarEstado', estado: 'queimado', stacks: -4 })[0].acoes[0].stacks).toBe(1);
    });
    it('contador gigante vem do Firebase (valor 1e20): somar nao vira NaN e fica dentro de [min,max]', () => {
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [{ id: 'a', nome: 'A', valor: 1e20, min: 0, max: 10 }] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(Number.isFinite(f.contadores[0].valor)).toBe(true);
        expect(f.contadores[0].valor).toBeLessThanOrEqual(10);
        const g = ficha({ poderes: [poder([G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'contador', id: 'a', op: 'somar', valor: 1 }] })])], contadores: [{ id: 'a', nome: 'A', valor: 'abc', min: 0, max: 10 }] });
        disparar(g, { tipo: 'turnoInicio' });
        expect(Number.isFinite(g.contadores[0].valor)).toBe(true);
    });
    it('id de contador inexistente / vazio / ficha sem lista de contadores: ignorado sem quebrar', () => {
        const sem = ficha({ poderes: [poder([G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'contador', id: 'zzz', op: 'somar', valor: 1 }] })])] }); delete sem.contadores;
        const r = disparar(sem, { tipo: 'turnoInicio' });
        expect(r.textos).toEqual([]); expect(sem.contadores).toBeUndefined();
        const ev = ficha({ poderes: [poder([G({ evento: { tipo: 'contadorAtingiu', contadorId: 'zzz', op: '>=', valor: 1 }, acoes: [{ tipo: 'mensagem', texto: 'x' }] })])] });
        expect(disparar(ev, { tipo: 'contadorAtingiu', contadorId: 'zzz', valorAntes: 0, valorDepois: 5 }).textos.join(' ')).toContain('x');
    });
});

describe('Bordas - Poder de Estagios comandado por contador e limite por turno', () => {
    it('contador ligado a Poder com Estagios: somar muda estagioAtual e informa caminhos de estagio e vitais (sem undefined)', () => {
        const pe = { id: 'pe', nome: 'Furia', ativa: true, estagios: { habilitado: true, maximo: 3 }, estagioAtual: 1 };
        const f = ficha({ poderes: [poder([G({ evento: { tipo: 'acertou' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] })]), pe], contadores: [ct('k', { max: 2, poderId: 'pe' })] });
        const r = disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(f.poderes[1].estagioAtual).toBe(2);
        expect(r.caminhos).toEqual(expect.arrayContaining(['contadores/0/valor', 'poderes/1/estagioAtual']));
        const campos = NOVO_APL.camposParaGravar(f, r.caminhos);
        expect(Object.values(campos).every(v => v !== undefined)).toBe(true);
        expect(campos['poderes/1/estagioAtual']).toBe(2);
    });
    it('limite por turno: dois gatilhos distintos tem contagem independente; zera so no dono (turnoInicio) e no fimDeLuta', () => {
        const f = ficha({ poderes: [poder([
            G({ id: 'a', evento: { tipo: 'acertou' }, limite: { max: 2, por: 'turno' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] }),
            G({ id: 'b', evento: { tipo: 'acertou' }, limite: { max: 1, por: 'turno' }, acoes: [{ tipo: 'contador', id: 'm', op: 'somar', valor: 1 }] }),
        ])], contadores: [ct('n'), ct('m')] });
        for (let i = 0; i < 4; i++) disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect([valor(f, 'n'), valor(f, 'm')]).toEqual([2, 1]);
        disparar(f, { tipo: 'turnoFim' }); // fim do turno NAO zera
        disparar(f, { tipo: 'acertou', nivel: 'normal' }); expect(valor(f, 'n')).toBe(2);
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.combate.usosPoderes).toBeUndefined();
        disparar(f, { tipo: 'acertou', nivel: 'normal' }); expect([valor(f, 'n'), valor(f, 'm')]).toEqual([3, 2]);
        expect(semUndefined(f)).toBe(true);
    });
    it('limite por turno nao apaga usos de "cena"/"descanso" de Poderes ao zerar', () => {
        const f = ficha({ combate: { usosPoderes: { a: { n: 1, cena: 'c', turno: true }, p9: { n: 2, cena: 'c' }, p8: { n: 1, descanso: true } } } });
        disparar(f, { tipo: 'turnoInicio' });
        expect(Object.keys(f.combate.usosPoderes).sort()).toEqual(['p8', 'p9']);
    });
    it('turnoInicio: usos por turno de OUTRO gatilho persistido com campo turno=false/ausente nao sao apagados', () => {
        const f = ficha({ combate: { usosPoderes: { x: { n: 1, cena: 'c', turno: false } } } });
        expect(NOVO_APL.zerarUsosPorTurno(f)).toBe(false);
    });
    it('limite por turno com max 3 permite 3 e bloqueia a 4a', () => {
        const f = ficha({ poderes: [poder([G({ id: 'a', evento: { tipo: 'acertou' }, limite: { max: 3, por: 'turno' }, acoes: [{ tipo: 'contador', id: 'n', op: 'somar', valor: 1 }] })])], contadores: [ct('n')] });
        for (let i = 0; i < 6; i++) disparar(f, { tipo: 'acertou', nivel: 'normal' });
        expect(valor(f, 'n')).toBe(3);
    });
});

describe('Bordas - normalizarGatilhos com eventos/acoes novos', () => {
    const mkG = (i, extra = {}) => ({ nome: `g${i}`, id: `id${i}`, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'x' }], ...extra });
    it('limite de 8 gatilhos por fonte e descarte do 9o com motivo', () => {
        const r = NOVO_GAT.normalizarGatilhos(Array.from({ length: 11 }, (_, i) => mkG(i)));
        expect(r.gatilhos.length).toBe(8); expect(r.descartados.length).toBe(3);
        expect(r.descartados[0].motivo).toContain('mais de 8');
    });
    it('limite de 6 acoes: ignora as excedentes (trunca) sem descartar o gatilho', () => {
        const r = NOVO_GAT.normalizarGatilhos([mkG(0, { acoes: Array.from({ length: 9 }, (_, i) => ({ tipo: 'contador', id: `c${i}`, op: 'somar', valor: 1 })) })]);
        expect(r.gatilhos[0].acoes.length).toBe(6);
    });
    it("limite {por:'luta'} descarta o gatilho inteiro; 'turno' passa; max 0/negativo ignora limite", () => {
        expect(NOVO_GAT.normalizarGatilhos([mkG(0, { limite: { max: 1, por: 'luta' } })]).gatilhos).toEqual([]);
        expect(NOVO_GAT.normalizarGatilhos([mkG(0, { limite: { max: 1, por: 'luta' } })]).descartados[0].motivo).toContain('luta');
        expect(NOVO_GAT.normalizarGatilhos([mkG(0, { limite: { max: 1, por: 'turno' } })]).gatilhos[0].limite).toEqual({ max: 1, por: 'turno' });
        expect(NOVO_GAT.normalizarGatilhos([mkG(0, { limite: { max: 0, por: 'turno' } })]).gatilhos[0].limite).toBeUndefined();
        expect(NOVO_GAT.normalizarGatilhos([mkG(0, { limite: { max: -3, por: 'luta' } })]).gatilhos.length).toBe(1);
    });
    it('anularDano so em danoQueZeraria, inclusive nos eventos novos (descarta)', () => {
        ['acertou', 'errou', 'atingido', 'inimigoErrou', 'turnoInicio', 'turnoFim', 'poderLigou', 'poderDesligou', 'fimDeLuta'].forEach((t) => {
            expect(NOVO_GAT.normalizarGatilhos([mkG(0, { evento: { tipo: t }, acoes: [{ tipo: 'anularDano' }] })]).gatilhos).toEqual([]);
        });
    });
    it('ids duplicados (eventoId duplicado entre gatilhos): o 2o recebe id novo unico; persistir:false e deterministico', () => {
        const r = NOVO_GAT.normalizarGatilhos([mkG(0, { id: 'x' }), mkG(1, { id: 'x' }), mkG(2, { id: '' })]);
        expect(new Set(r.gatilhos.map(g => g.id)).size).toBe(3);
        const a = NOVO_GAT.normalizarGatilhos([mkG(0, { id: 'x' }), mkG(1, { id: 'x' })], { persistir: false });
        const b = NOVO_GAT.normalizarGatilhos([mkG(0, { id: 'x' }), mkG(1, { id: 'x' })], { persistir: false });
        expect(a).toEqual(b);
    });
    it('ids com caracteres proibidos no Firebase viram _ e chaves nao contem . # $ [ ] /', () => {
        const f = ficha({ poderes: [poder([mkG(0, { id: 'a.b#c$d[e]f/g' })], { id: 'p.1/x' })] });
        const c = NOVO_GAT.coletarGatilhos(f)[0];
        expect(c.chave).not.toMatch(/[.#$[\]/]/);
    });
    it('contadorAtingiu: valor negativo/decimal, op invalida vira >=, sem contadorId descarta, valor vazio descarta', () => {
        const ev = (e) => NOVO_GAT.normalizarGatilhos([mkG(0, { evento: { tipo: 'contadorAtingiu', ...e } })]).gatilhos[0];
        expect(ev({ contadorId: 'k', valor: -3.7, op: '<' }).evento).toEqual({ tipo: 'contadorAtingiu', contadorId: 'k', op: '>=', valor: -3 });
        expect(ev({ contadorId: '', valor: 1 })).toBeUndefined();
        expect(ev({ contadorId: 'k', valor: '' })).toBeUndefined();
        expect(ev({ contadorId: 'k', valor: 1e12 }).evento.valor).toBe(9999);
    });
    it('gatilhos novos sao mantidos em formas e itens (coleta por fonte) e a chave distingue fontes', () => {
        const f = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, formaAtivaId: 'f1', formas: [{ id: 'f1', gatilhos: [mkG(0, { id: 'gf' })] }], gatilhos: [mkG(1, { id: 'g0' })] }], inventario: [{ id: 'i1', nome: 'I', equipado: true, gatilhos: [mkG(2, { id: 'g0', passivo: true })] }] });
        const chaves = NOVO_GAT.coletarGatilhos(f).map(c => c.chave);
        expect(new Set(chaves).size).toBe(chaves.length);
        expect(chaves.length).toBeGreaterThanOrEqual(2);
    });
    it('sem `undefined` em nenhum gatilho normalizado com eventos e acoes novos', () => {
        const lista = [
            mkG(0, { evento: { tipo: 'acertou' } }), mkG(1, { evento: { tipo: 'poderLigou' } }), mkG(2, { evento: { tipo: 'contadorAtingiu', contadorId: 'k', valor: 2 }, acoes: [{ tipo: 'contador', id: 'k', op: 'zerar' }, { tipo: 'removerEstado', estado: 'queimado' }, { tipo: 'desligarPoder', poderId: 'p' }, { tipo: 'danoEmSi', valor: 5 }] }),
        ];
        expect(semUndefined(NOVO_GAT.normalizarGatilhos(lista))).toBe(true);
    });
    it('descreverGatilho cobre todos os eventos e todas as acoes novas sem vazio nem "undefined"/"NaN"', () => {
        const eventos = [{ tipo: 'acertou', nivel: 'qualquer' }, { tipo: 'acertou', nivel: 'fatal' }, { tipo: 'atingido', nivel: 'critico' }, { tipo: 'errou' }, { tipo: 'inimigoErrou' }, { tipo: 'turnoInicio' }, { tipo: 'turnoFim' }, { tipo: 'poderLigou' }, { tipo: 'poderLigou', poderId: 'qualquer' }, { tipo: 'poderDesligou', poderId: 'zz' }, { tipo: 'fimDeLuta' }, { tipo: 'contadorAtingiu', contadorId: 'k', op: '==', valor: 3 }];
        eventos.forEach((e) => {
            const g = norm([G({ evento: e, acoes: [{ tipo: 'contador', id: 'k', op: 'dividir', valor: 2 }, { tipo: 'aplicarEstado', estado: 'queimado', stacks: 2 }, { tipo: 'removerEstado', estado: 'queimado' }, { tipo: 'desligarPoder', poderId: 'zz' }, { tipo: 'danoEmSi', modo: 'percAtual', valor: 5 }] })])[0];
            const t = NOVO_GAT.descreverGatilho(g, { contadores: [], poderes: [] });
            expect(t.length).toBeGreaterThan(10); expect(t).not.toMatch(/undefined|NaN|\[object/);
        });
        expect(NOVO_GAT.descreverGatilho(null)).toBe('');
        expect(NOVO_GAT.descreverAcaoGatilho({ tipo: 'xx' })).toBe('');
    });
});
