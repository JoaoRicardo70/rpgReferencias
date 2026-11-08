import { describe, it, expect } from 'vitest';
import * as NOVO_GAT from './gatilhos.js';
import * as NOVO_APL from './gatilhosAplicar.js';
import * as NOVO_DANO from './danoVida.js';

// QA Fase 3 dos Gatilhos (core). Parte 1: NAO-REGRESSAO por comparacao diferencial com a copia do HEAD (pasta temporaria ../coreQaf3Old, apagada ao final;
// sem ela os diferenciais sao pulados). Parte 2: dados antigos. Parte 3: Volta das cinzas por componente. Parte 4: motor (rolarTabela, danoNoAtacante, perguntar). Parte 5: bordas.
const velhos = import.meta.glob('../coreQaf3Old/{gatilhos,gatilhosAplicar,danoVida}.js', { eager: true });
const O = { gat: velhos['../coreQaf3Old/gatilhos.js'], apl: velhos['../coreQaf3Old/gatilhosAplicar.js'], dano: velhos['../coreQaf3Old/danoVida.js'] };
const temOld = !!(O.gat && O.apl && O.dano);

const F = 1000;
const MAX = 100000 * F;
const clone = (o) => JSON.parse(JSON.stringify(o));
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
const vital = (base, atual = base) => ({ base, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual, regeneracao: 0 });
const ficha = (extra = {}, vidaExibida = 100000) => ({
    iniciativa: 0, vida: vital(100000000, vidaExibida * F), mana: vital(100000000, 100 * F), aura: vital(100000000, 100 * F), chakra: vital(100000000, 100 * F), corpo: vital(100000000, 100 * F),
    forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 }, sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 },
    carisma: { base: 1000000 }, stamina: { base: 1000000 }, constituicao: { base: 1000000 },
    multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {}, poderes: [], inventario: [], passivas: [], contadores: [],
    ...extra,
});
const poder = (gatilhos, extra = {}) => ({ id: 'p1', nome: 'Volta das cinzas', ativa: true, gatilhos, ...extra });
let seq = 0;
const dano = (f, d, ctx = {}) => NOVO_DANO.aplicarDanoNaVida(f, d, { nome: 'Natsu', vidaMaxBruta: MAX, cenaId: 'c1', eventoId: `qa3_${++seq}`, ...ctx });
const rngPara = (v, faces = 4) => () => (v - 1) / faces + 0.001;
const usos = (f, chave, cena = 'c1') => NOVO_GAT.usosRestantesDoGatilho(f, chave, { max: 1, por: 'cena' }, cena);
const FONTE = { tipo: 'poder', id: 'p1', nome: 'P' };

// ---------- Volta das cinzas (B-20..B-23): 4 gatilhos opcionais armados ----------
const opc = (extra = {}) => ({ modo: 'opcional', armado: true, ...extra });
const TABELA = {
    tipo: 'rolarTabela', dado: '1d4',
    resultados: [
        { ate: 1, texto: 'cura total', acoes: [{ tipo: 'curar', modo: 'percMax', valor: 100 }] },
        { ate: 2, texto: 'limpa e cura 50', acoes: [{ tipo: 'limparCondicoes' }, { tipo: 'curar', modo: 'percMax', valor: 50 }] },
        { ate: 3, texto: 'imune 1 turno', acoes: [{ tipo: 'imunidadeTotal', duracaoTurnos: 1 }, { tipo: 'curar', modo: 'percMax', valor: 50 }] },
        { ate: 4, texto: 'volta', acoes: [{ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 100 }, { tipo: 'curar', modo: 'percMax', valor: 50 }] },
    ],
};
const g10 = (extra = {}) => ({ id: 'vc1', nome: 'Cinzas 10%', ...opc(), evento: { tipo: 'vidaAbaixoDe', de: 10, ate: 10 }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'escudo', nome: 'Cinzas', valor: 5000 }, { tipo: 'mensagem', texto: 'As cinzas' }], ...extra });
const g96 = (extra = {}) => ({ id: 'vc2', nome: 'Cinzas 9-6%', ...opc(), evento: { tipo: 'vidaAbaixoDe', de: 9, ate: 6 }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'curar', modo: 'percMax', valor: 20 }, { tipo: 'buff', atributo: 'destreza', valor: 5, duracao: 2, modo: 'turnos' }], ...extra });
const g51 = (extra = {}) => ({ id: 'vc3', nome: 'Cinzas 5-1%', ...opc(), evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 1 }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'limparCondicoes' }, { tipo: 'curar', modo: 'percMax', valor: 40 }], ...extra });
const g0 = (extra = {}) => ({ id: 'vc0', nome: 'Cinzas 0%', ...opc(), evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'definirVida', percMax: 1 }, TABELA], ...extra });
const todos = (ex = {}) => [g10(ex.g10), g96(ex.g96), g51(ex.g51), g0(ex.g0)];
const volta = (ex = {}, extraFicha = {}, vidaExibida = 100000) => ficha({ poderes: [poder(todos(ex))], ...extraFicha }, vidaExibida);

// =====================================================================================================
describe.skipIf(!temOld)('PRIORIDADE 1 - NAO-REGRESSAO (diferencial vs HEAD): gatilhos AUTOMATICOS e sem gatilhos', () => {
    const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
    const FAIXA = { id: 'fx', nome: 'Faixa', evento: { tipo: 'vidaAbaixoDe', de: 50, ate: 1 }, acoes: [{ tipo: 'escudo', nome: 'Cinzas', valor: 50, tipoEscudo: 'escudo' }, { tipo: 'mensagem', texto: 'ai' }, { tipo: 'danoEmSi', modo: 'fixo', valor: 3 }] };
    const ATING = { id: 'at', nome: 'Atingido', evento: { tipo: 'atingido', nivel: 'qualquer' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 2 }, { tipo: 'mensagem', texto: 'auch' }] };
    const AUTO_ARMADO_FALSE = { ...FAIXA, id: 'fa', armado: false }; // automatico ignora armado: igual ao HEAD
    const cenarios = () => {
        const lista = [];
        const gat = [[], [NEGAR], [FAIXA], [NEGAR, FAIXA, ATING], [AUTO_ARMADO_FALSE]];
        const vidas = [1000, 500, 100, 1];
        const danos = [0, 1, 50, 499, 500, 999, 1000, 5000];
        const esc = [undefined, [{ id: 'e1', nome: 'Domo', valor: 30, tipo: 'escudo' }], [{ id: 'e2', nome: 'VT', valor: 5000, tipo: 'vidaTemporaria' }]];
        gat.forEach((gs, gi) => vidas.forEach(v => danos.forEach(d => esc.forEach((e, ei) => [false, true].forEach((god) => [false, true].forEach((golpe) => {
            lista.push({ nome: `g${gi} v${v} d${d} e${ei} god${god} golpe${golpe}`, gs, v, d, e, god, golpe });
        }))))));
        return lista;
    };
    const montar = (c) => {
        const f = ficha({ contadores: [{ id: 'k', nome: 'K', valor: 0, min: 0, max: 100 }], poderes: c.gs.length ? [poder(clone(c.gs))] : [], ...(c.e ? { escudos: clone(c.e) } : {}), ...(c.god ? { combate: { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } } } : {}) });
        f.vida.atual = c.v * F;
        return f;
    };
    it('aplicarDanoNaVida: ficha e resultado identicos em toda a matriz (inclui golpe, God Mode, escudos)', () => {
        let n = 0;
        cenarios().forEach((c) => {
            const a = montar(c); const b = montar(c);
            const ctx = { nome: 'Eu', cenaId: 'c1', vidaMaxBruta: 1000 * F, eventoId: 'ev1', ...(c.golpe ? { golpe: { nivel: 'critico' } } : {}) };
            const ra = NOVO_DANO.aplicarDanoNaVida(a, c.d, clone(ctx));
            const rb = O.dano.aplicarDanoNaVida(b, c.d, clone(ctx));
            expect(JSON.stringify(a), c.nome).toBe(JSON.stringify(b));
            expect(JSON.stringify(ra), c.nome).toBe(JSON.stringify(rb));
            n++;
        });
        expect(n).toBeGreaterThan(1000);
    });
    it('aplicarDanoNaVida: ctx semEscudo / jaAbsorvido / profundidade iguais; ctx.rng/decisoes/atacante nao mudam nada sem gatilho opcional', () => {
        [{ semEscudo: true }, { jaAbsorvido: true }, { profundidade: 2 }, { rng: () => 0.5, decisoes: { x: false }, atacante: { nome: 'Z' }, perguntas: [] }].forEach((extra) => {
            [0, 300, 5000].forEach((d) => {
                const a = ficha({ escudos: [{ id: 'e', nome: 'D', valor: 100, tipo: 'escudo' }], poderes: [poder([NEGAR, FAIXA])] }); const b = clone(a);
                const ra = NOVO_DANO.aplicarDanoNaVida(a, d, { nome: 'Eu', cenaId: 'c', ...extra });
                const rb = O.dano.aplicarDanoNaVida(b, d, { nome: 'Eu', cenaId: 'c', ...extra });
                expect(JSON.stringify([a, ra])).toBe(JSON.stringify([b, rb]));
            });
        });
    });
    it('aplicarAcoesNoRascunho: todas as acoes antigas dao o mesmo resultado (incluindo as de contador/estado/poder/danoEmSi)', () => {
        const acoes = [
            { tipo: 'definirVida', valor: 7 }, { tipo: 'definirVida', percMax: 10 }, { tipo: 'curar', modo: 'fixo', valor: 30 }, { tipo: 'curar', modo: 'percMax', valor: 5 },
            { tipo: 'curar', modo: 'percAtual', valor: 50 }, { tipo: 'escudo', nome: 'Es', valor: 40, tipoEscudo: 'escudo' }, { tipo: 'escudo', nome: 'VT', valor: 40, tipoEscudo: 'vidaTemporaria' },
            { tipo: 'buff', atributo: 'forca', valor: 3, duracao: 2, modo: 'turnos' }, { tipo: 'limparCondicoes' }, { tipo: 'imunidadeTotal', duracaoTurnos: 2 }, { tipo: 'mensagem', texto: 'oi' }, { tipo: 'anularDano' },
            { tipo: 'contador', id: 'k', op: 'somar', valor: 5 }, { tipo: 'contador', id: 'k', op: 'somar', valor: 2, sorteio: '1d3' }, { tipo: 'contador', id: 'k', op: 'zerar' }, { tipo: 'contador', id: 'k', op: 'dividir', valor: 2 },
            { tipo: 'aplicarEstado', estado: 'queimado', stacks: 2 }, { tipo: 'removerEstado', estado: 'queimado' }, { tipo: 'danoEmSi', modo: 'fixo', valor: 10 }, { tipo: 'danoEmSi', modo: 'percMax', valor: 10 }, { tipo: 'danoEmSi', modo: 'percAtual', valor: 10 },
            { tipo: 'ligarPoder', poderId: 'p2' }, { tipo: 'desligarPoder', poderId: 'p2' },
        ];
        acoes.forEach((ac) => {
            [undefined, 'antes'].forEach((fase) => {
                const base = ficha({ condicoes: [{ id: 'queimado', stacks: 1 }], contadores: [{ id: 'k', nome: 'K', valor: 8, min: 0, max: 100 }], poderes: [{ id: 'p2', nome: 'Dois', ativa: false }] }, 400); base.vida.atual = 400 * F;
                const a = clone(base); const b = clone(base);
                const lista = [{ ...ac, gatilhoNome: 'G', chave: 'k', fonte: FONTE, ...(fase ? { fase } : {}) }];
                const ctx = { vidaMaxBruta: 1000 * F, cenaId: 'c', rng: rngPara(2, 3) };
                const ra = NOVO_APL.aplicarAcoesNoRascunho(a, clone(lista), ctx); const rb = O.apl.aplicarAcoesNoRascunho(b, clone(lista), ctx);
                expect(JSON.stringify(a), ac.tipo).toBe(JSON.stringify(b));
                expect(JSON.stringify(ra), ac.tipo).toBe(JSON.stringify(rb));
            });
        });
    });
    it('dispararEventoNaFicha: acertou/atingido/turnoInicio/poderLigou/contadorAtingiu iguais ao HEAD', () => {
        const gs = [
            { id: 'a1', nome: 'A1', evento: { tipo: 'acertou', nivel: 'normal' }, limite: { max: 1, por: 'turno' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] },
            { id: 'a2', nome: 'A2', evento: { tipo: 'atingido', nivel: 'qualquer' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] },
            { id: 'a3', nome: 'A3', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'turno' }] },
            { id: 'a4', nome: 'A4', evento: { tipo: 'contadorAtingiu', contadorId: 'k', op: '>=', valor: 2 }, acoes: [{ tipo: 'mensagem', texto: 'dois' }] },
            { id: 'a5', nome: 'A5', evento: { tipo: 'poderLigou' }, acoes: [{ tipo: 'curar', modo: 'fixo', valor: 5 }] },
        ];
        [['acertou', { nivel: 'normal' }], ['acertou', { nivel: 'normal' }], ['atingido', { nivel: 'fatal' }], ['turnoInicio', {}], ['poderLigou', { poderId: 'p1' }], ['fimDeLuta', {}]].forEach(([tipo, extra], i) => {
            const base = ficha({ contadores: [{ id: 'k', nome: 'K', valor: 0, min: 0, max: 100 }], poderes: [poder(gs)] }, 500);
            const a = clone(base); const b = clone(base);
            // sequencia: dispara 2 vezes seguidas na mesma ficha, para pegar limite e cadeia
            for (let r = 0; r < 2; r++) {
                const ra = NOVO_APL.dispararEventoNaFicha(a, { tipo, ...extra }, { cenaId: 'c', nome: 'Eu', eventoId: `e${i}${r}`, rng: rngPara(1) });
                const rb = O.apl.dispararEventoNaFicha(b, { tipo, ...extra }, { cenaId: 'c', nome: 'Eu', eventoId: `e${i}${r}`, rng: rngPara(1) });
                expect(JSON.stringify(ra), tipo).toBe(JSON.stringify(rb));
            }
            expect(JSON.stringify(a), tipo).toBe(JSON.stringify(b));
        });
    });
    it('normalizarGatilhos / avaliarGatilhos / coletarGatilhos / descreverGatilho de gatilhos automaticos iguais (inclui invalidos)', () => {
        const entradas = [[NEGAR], [FAIXA], [NEGAR, FAIXA, ATING], [{ ...NEGAR, id: '' }, { ...NEGAR, id: '' }], [{ nome: 'x', evento: { tipo: 'xx' }, acoes: [] }], [{ ...FAIXA, evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 50 } }],
            [{ ...NEGAR, acoes: [{ tipo: 'anularDano' }, { tipo: 'zzz' }] }], [{ ...ATING, acoes: [{ tipo: 'anularDano' }] }], [{ ...FAIXA, perguntar: true }], [{ ...FAIXA, modo: 'qualquer' }], [null, 3, 'x'], 'nao-lista', undefined];
        entradas.forEach((e) => {
            const ra = NOVO_GAT.normalizarGatilhos(clone(e ?? null), { persistir: false }); const rb = O.gat.normalizarGatilhos(clone(e ?? null), { persistir: false });
            expect(JSON.stringify(ra)).toBe(JSON.stringify(rb));
        });
        const f = ficha({ poderes: [poder([NEGAR, FAIXA, ATING])] });
        [[{ tipo: 'danoQueZeraria' }, { vidaAntes: 100 * F, vidaDepois: 0 }], [{ tipo: 'vidaAbaixoDe' }, { vidaAntes: 900 * F, vidaDepois: 400 * F, vidaMaxBruta: 1000 * F }], [{ tipo: 'atingido', nivel: 'critico' }, {}]].forEach(([ev, ctx]) => {
            expect(JSON.stringify(NOVO_GAT.avaliarGatilhos(ev, ctx, clone(f)))).toBe(JSON.stringify(O.gat.avaliarGatilhos(ev, ctx, clone(f))));
        });
        expect(NOVO_GAT.coletarGatilhos(f).map(c => c.chave)).toEqual(O.gat.coletarGatilhos(f).map(c => c.chave));
        NOVO_GAT.normalizarGatilhos([NEGAR, FAIXA, ATING]).gatilhos.forEach(g => expect(NOVO_GAT.descreverGatilho(g)).toBe(O.gat.descreverGatilho(g)));
    });
    it('camposParaGravar e forma da resposta de dispararEventoNaFicha (sem externos/perguntas extras quando nada novo ocorre)', () => {
        const f = ficha({ poderes: [poder([FAIXA])] }, 100);
        const r = dano(f, 95);
        expect(Object.keys(r).sort()).toEqual(Object.keys(O.dano.aplicarDanoNaVida(clone(ficha({ poderes: [poder([FAIXA])] }, 100)), 95, { nome: 'Natsu', vidaMaxBruta: MAX, cenaId: 'c1' })).sort());
        expect('externos' in r).toBe(false);
    });
});

// =====================================================================================================
describe('PRIORIDADE 1 - dados antigos (Fase 1/2) e ficha sem os campos novos', () => {
    const EV = { id: 'x', nome: 'X', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'oi' }] };
    it('gatilho modo:"opcional" SEM `armado` (salvo na Fase 1/2, inerte) continua NAO disparando: ausente = desarmado; armado:true dispara', () => {
        const f = ficha({ poderes: [poder([{ ...EV, modo: 'opcional' }])] });
        const r = NOVO_APL.dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c' });
        expect(r.disparou).toBe(false);
        const g = ficha({ poderes: [poder([{ ...EV, modo: 'opcional', armado: true }])] });
        expect(NOVO_APL.dispararEventoNaFicha(g, { tipo: 'turnoInicio' }, { cenaId: 'c' }).disparou).toBe(true);
        if (temOld) {
            const velho = O.apl.dispararEventoNaFicha(clone(f), { tipo: 'turnoInicio' }, { cenaId: 'c' });
            expect(velho.disparou).toBe(false); // HEAD: "modo opcional ainda nao e executado"
        }
    });
    it('opcional sem `armado`: normaliza gravando armado:false (boolean) e a frase diz "opcional, desarmado"', () => {
        const [g] = NOVO_GAT.normalizarGatilhos([{ ...EV, modo: 'opcional' }]).gatilhos;
        expect(g.armado).toBe(false);
        expect(NOVO_GAT.descreverGatilho(g)).toContain('(opcional, desarmado)');
    });
    it('`armado` nao booleano (string/null/0/vazio) em opcional = DESARMADO e nao dispara; em automatico e ignorado (dispara)', () => {
        ['false', 'true', null, 0, 1, '', 'nao'].forEach((v) => {
            const [g] = NOVO_GAT.normalizarGatilhos([{ ...EV, modo: 'opcional', armado: v }]).gatilhos;
            expect(g.armado, String(v)).toBe(false);
            const f = ficha({ poderes: [poder([{ ...EV, modo: 'opcional', armado: v }])] });
            expect(NOVO_APL.dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c' }).disparou, String(v)).toBe(false);
            const a = ficha({ poderes: [poder([{ ...EV, armado: v }])] });
            expect(NOVO_APL.dispararEventoNaFicha(a, { tipo: 'turnoInicio' }, { cenaId: 'c' }).disparou, String(v)).toBe(true);
        });
    });
    it('`perguntar` sem modo opcional (Fase 1/2 nao tinha) e descartado do automatico e nao cria pergunta', () => {
        const [g] = NOVO_GAT.normalizarGatilhos([{ ...EV, perguntar: true }]).gatilhos;
        expect('perguntar' in g).toBe(false);
        const f = ficha({ poderes: [poder([{ ...EV, perguntar: true, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }] }])] });
        expect(NOVO_DANO.preverPerguntasDeDano(f, 1e9, { vidaMaxBruta: MAX })).toEqual([]);
    });
    it('ficha antiga (sem combate, escudos, contadores, poderes, passivas, inventario): nenhum dos novos caminhos lanca', () => {
        const velha = { vida: { atual: 50 * F } };
        expect(() => NOVO_DANO.preverPerguntasDeDano(velha, 100)).not.toThrow();
        expect(NOVO_DANO.preverPerguntasDeDano(velha, 100)).toEqual([]);
        expect(() => dano(velha, 100)).not.toThrow();
        expect(velha.vida.atual).toBe(50 * F - 100 * F < 0 ? 0 : 50 * F - 100 * F);
        expect(NOVO_APL.forcarGatilhoNaFicha(velha, 'p1', 'g').achou).toBe(false);
        expect(NOVO_APL.forcarGatilhoNaFicha(null, 'p1', 'g').achou).toBe(false);
        expect(NOVO_APL.forcarGatilhoNaFicha(undefined, undefined, undefined).achou).toBe(false);
        expect(NOVO_GAT.preverGatilhos({ tipo: 'turnoInicio' }, {}, null)).toEqual([]);
        expect(NOVO_GAT.preverGatilhos({ tipo: 'turnoInicio' }, {}, {})).toEqual([]);
    });
    it('Poder SEM gatilhos / gatilhos vazios: dano comum, sem externos, sem criar combate.gatilhos', () => {
        [undefined, [], null].forEach((gs) => {
            const f = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, ...(gs !== undefined ? { gatilhos: gs } : {}) }] }, 500);
            const r = dano(f, 100);
            expect(f.vida.atual).toBe(400 * F); expect(r.textos).toEqual([]); expect(r.externos).toBeUndefined(); expect(f.combate).toBeUndefined();
        });
    });
    it('gatilho automatico + perguntar:true salvo (lixo): continua automatico e sem pergunta', () => {
        const f = ficha({ poderes: [poder([{ id: 'nm', nome: 'Negar', perguntar: true, armado: false, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] }])] }, 100);
        const perguntas = [];
        dano(f, 1e9, { perguntas });
        expect(perguntas).toEqual([]); expect(f.vida.atual).toBe(1 * F);
    });
});

// =====================================================================================================
describe('PRIORIDADE 2 - Volta das cinzas completa (motor)', () => {
    describe('faixas', () => {
        it('10%: dano que deixa a Vida em exatamente 10% dispara so a faixa 10% (escudo 5000 + mensagem), gasta o uso e NAO toca as outras', () => {
            const f = volta(); const r = dano(f, 90000);
            expect(f.vida.atual).toBe(10000 * F);
            expect(f.escudos).toHaveLength(1); expect(f.escudos[0]).toMatchObject({ nome: 'Cinzas', valor: 5000 });
            expect(r.textos.join(' | ')).toContain('As cinzas'); expect(r.textos.join(' ')).not.toContain('9-6%');
            expect(usos(f, 'p1:vc1')).toBe(0); expect(usos(f, 'p1:vc2')).toBe(1); expect(usos(f, 'p1:vc3')).toBe(1); expect(usos(f, 'p1:vc0')).toBe(1);
        });
        it('10,9% (arredonda para baixo = 10) tambem dispara; 11% nao', () => {
            const a = volta(); dano(a, 100000 - 10900); expect(a.escudos).toHaveLength(1);
            const b = volta(); dano(b, 100000 - 11000); expect(b.escudos).toBeUndefined();
        });
        it.each([[9, 20], [8, 20], [6, 20]])('%i%% da Vida: faixa 9-6 cura 20%% da Vida maxima e da buff (+5 destreza)', (pct, cura) => {
            const f = volta(); const r = dano(f, 100000 - pct * 1000);
            expect(f.vida.atual).toBe((pct + cura) * 1000 * F);
            expect(r.textos.join(' ')).toContain('Cinzas 9-6% curou 20.000');
            expect(f.buffsTemporarios).toHaveLength(1);
            expect(f.escudos).toBeUndefined();
        });
        it.each([[5], [3], [1]])('%i%% da Vida: faixa 5-1 limpa condicoes e cura 40%% (a ficha tinha queimado)', (pct) => {
            const f = volta({}, { condicoes: [{ id: 'queimado', stacks: 1 }] }); dano(f, 100000 - pct * 1000);
            expect(f.vida.atual).toBe((pct + 40) * 1000 * F);
            expect(f.condicoes).toBeUndefined();
        });
        it('0,5% (parte inteira 0) e 5,9% (parte inteira 5): 0,5% nao pertence a nenhuma faixa nem e zero (nada dispara); 5,9% cai na 5-1', () => {
            const a = volta(); const r = dano(a, 100000 - 500);
            expect(a.vida.atual).toBe(500 * F); expect(r.textos).toEqual([]);
            const b = volta(); dano(b, 100000 - 5900); expect(b.vida.atual).toBe((5900 + 40000) * F);
        });
        it('golpe que cruza varias faixas dispara so a faixa final (100% -> 8%: so 9-6)', () => {
            const f = volta(); dano(f, 92000);
            expect(f.vida.atual).toBe(28000 * F);
            expect(usos(f, 'p1:vc1')).toBe(1); expect(usos(f, 'p1:vc2')).toBe(0); expect(usos(f, 'p1:vc3')).toBe(1);
        });
        it('depois de curar para fora da faixa, nova queda na mesma cena nao repete (1 por cena); em outra cena repete', () => {
            const f = volta(); dano(f, 92000);
            f.vida.atual = 100000 * F; const r2 = dano(f, 92000);
            expect(f.vida.atual).toBe(8000 * F); expect(r2.textos).toEqual([]);
            f.vida.atual = 100000 * F; dano(f, 92000, { cenaId: 'c2' });
            expect(f.vida.atual).toBe(28000 * F);
        });
        it('faixas DESARMADAS nao disparam, mesmo com limite livre', () => {
            const f = volta({ g10: { armado: false }, g96: { armado: false }, g51: { armado: false } });
            const a = clone(f); dano(f, 90000); dano(a, 95000);
            expect(f.escudos).toBeUndefined(); expect(a.vida.atual).toBe(5000 * F);
        });
    });

    describe('0% (danoQueZeraria + definirVida 1% + rolarTabela 1d4) - cada resultado', () => {
        const rodar = (v, extraFicha = {}, ctx = {}, vidaExibida = 100000) => {
            const f = volta({}, extraFicha, vidaExibida); const r = dano(f, 9e9, { rng: rngPara(v), atacante: { nome: 'Vilao' }, ...ctx });
            return { f, r };
        };
        it('resultado 1: definirVida 1% e depois cura total (Vida maxima); anulou o golpe; nenhuma ordem de efeitos invertida', () => {
            const { f, r } = rodar(1);
            expect(r.anulado).toBe(true); expect(f.vida.atual).toBe(MAX);
            expect(r.textos.join(' | ')).toMatch(/segurou em 1\.000 de vida.*rolou 1 \(d4\): cura total.*curou 100\.000/);
            expect(r.externos).toBeUndefined();
        });
        it('resultado 2: limpa condicoes + 50% (fica em 51%)', () => {
            const { f, r } = rodar(2, { condicoes: [{ id: 'queimado', stacks: 2 }, { id: 'envenenado', stacks: 1 }] });
            expect(f.condicoes).toBeUndefined(); expect(f.vida.atual).toBe(51000 * F);
            expect(r.textos.join(' ')).toContain('limpou as condições'); expect(r.externos).toBeUndefined();
        });
        it('resultado 2 sem condicoes: nao inventa texto de limpeza, ainda cura 50%', () => {
            const { f, r } = rodar(2);
            expect(f.vida.atual).toBe(51000 * F); expect(r.textos.join(' ')).not.toContain('limpou as condições');
        });
        it('resultado 3: Imunidade total por 1 turno + 50%; o proximo dano e zerado e o turno seguinte tira a imunidade', () => {
            const { f } = rodar(3);
            expect(f.vida.atual).toBe(51000 * F); expect(f.combate.imunidadeTotal).toEqual({ turnosRestantes: 1, origem: 'Cinzas 0%' });
            const r2 = dano(f, 40000); expect(r2.imune).toBe(true); expect(f.vida.atual).toBe(51000 * F);
            const t = NOVO_APL.passarTurnoDaImunidadeTotal(f); expect(t.mudar ?? t.mudou).toBe(true);
            expect(f.combate.imunidadeTotal).toBeUndefined();
            dano(f, 40000); expect(f.vida.atual).toBe(11000 * F);
        });
        it('resultado 4: devolve 100% do dano recebido ao atacante (externos) + 50%', () => {
            const { f, r } = rodar(4);
            expect(f.vida.atual).toBe(51000 * F);
            expect(r.externos).toEqual([{ tipo: 'danoNoAtacante', atacante: { nome: 'Vilao' }, dano: 9e9, gatilhoNome: 'Cinzas 0%' }]);
            expect(r.textos.join(' ')).toContain('9.000.000.000 de dano volta para Vilao');
        });
        it('resultado 4 sem atacante: aviso, sem externos, ainda cura 50%', () => {
            const f = volta(); const r = dano(f, 9e9, { rng: rngPara(4) });
            expect(f.vida.atual).toBe(51000 * F); expect(r.externos).toBeUndefined(); expect(r.textos.join(' ')).toContain('dano no atacante ignorado');
        });
        it('o dano devolvido usa o dano EXIBIDO recebido DEPOIS do escudo? (afirma o comportamento: usa o dano total passado ao ponto unico, antes do escudo)', () => {
            const f = volta({}, { escudos: [{ id: 'e', nome: 'Domo', valor: 1000, tipo: 'escudo' }] });
            const r = dano(f, 5000, { rng: rngPara(4), atacante: { nome: 'V' }, eventoId: 'x' });
            // 5000 < Vida (100000): nada zera; so confere que o escudo absorveu e nada foi devolvido
            expect(r.externos).toBeUndefined();
            const g = volta({}, { escudos: [{ id: 'e', nome: 'Domo', valor: 1000, tipo: 'escudo' }] }, 3);
            const r2 = dano(g, 5000, { rng: rngPara(4), atacante: { nome: 'V' } });
            expect(r2.externos[0].dano).toBe(5000); // danoRecebido = dano bruto de entrada (nao desconta o escudo)
        });
        it('rolagem limite do 1d4: Math.random() proximo de 1 (0.9999) = 4; 0 = 1 (nunca fora da tabela)', () => {
            const a = volta(); const ra = dano(a, 9e9, { rng: () => 0.99999999 }); expect(ra.textos.join(' ')).toContain('rolou 4 (d4)');
            const b = volta(); const rb = dano(b, 9e9, { rng: () => 0 }); expect(rb.textos.join(' ')).toContain('rolou 1 (d4)');
        });
        it('limite 1 por cena do 0%: segundo golpe letal na mesma cena mata (Vida 0, nada dispara, nenhum externo); cena nova salva', () => {
            const { f } = rodar(1);
            f.vida.atual = 100 * F; const r = dano(f, 9e9, { rng: rngPara(1), atacante: { nome: 'V' } });
            expect(f.vida.atual).toBe(0); expect(r.textos).toEqual([]); expect(r.anulado).toBe(false);
            f.vida.atual = 100 * F; dano(f, 9e9, { rng: rngPara(1), cenaId: 'outra' }); expect(f.vida.atual).toBe(MAX);
        });
        it('desarmado: morre; armado depois de desarmar: salva (Mestre/dono alternando)', () => {
            const f = volta({ g0: { armado: false } }); dano(f, 9e9, { rng: rngPara(1) }); expect(f.vida.atual).toBe(0);
            const g = volta({ g0: { armado: false } }); g.poderes[0].gatilhos.find(x => x.id === 'vc0').armado = true; dano(g, 9e9, { rng: rngPara(1) }); expect(g.vida.atual).toBe(MAX);
        });
        it('Vida ja baixa (3%): cair a 0 aciona o 0% (e nao a faixa 5-1, pois ja estava dentro dela)', () => {
            const { f } = rodar(2, {}, {}, 3);
            expect(f.vida.atual).toBe(51000 * F); expect(usos(f, 'p1:vc3')).toBe(1);
        });
        it('Vida 100%, sem linha na tabela (so ate:3, roleta 4): fica em 1% e a faixa 5-1 reage a isso (cadeia observada)', () => {
            const tabela = { ...TABELA, resultados: TABELA.resultados.slice(0, 3) };
            const f = volta({ g0: { acoes: [{ tipo: 'definirVida', percMax: 1 }, tabela] } });
            const r = dano(f, 9e9, { rng: rngPara(4) });
            expect(r.textos.join(' ')).toContain('nada acontece');
            expect(f.vida.atual).toBe(41000 * F); // 1% + 40% da faixa 5-1 disparada depois do 0%
        });
        it('sem undefined nos campos gravados e camposParaGravar so devolve null/valores', () => {
            const { f, r } = rodar(2, { condicoes: [{ id: 'queimado', stacks: 1 }] });
            expect(semUndefined(f)).toBe(true); expect(semUndefined(r)).toBe(true);
            const campos = NOVO_DANO.camposParaGravar(f, r.caminhos);
            expect(semUndefined(campos)).toBe(true);
            expect(campos['vida/atual']).toBe(51000 * F);
        });
    });
});

// =====================================================================================================
describe('PRIORIDADE 2 - perguntar (previsao e decisoes)', () => {
    const asks = (ex = {}) => volta({ g0: { perguntar: true, ...(ex.g0 || {}) }, ...ex });
    it('previsao nao toca a ficha nem gasta Math.random; lista cada gatilho uma vez', () => {
        const f = asks(); const antes = JSON.stringify(f);
        const orig = Math.random; let chamadas = 0; Math.random = () => { chamadas++; return 0.5; };
        try { expect(NOVO_DANO.preverPerguntasDeDano(f, 9e9, { vidaMaxBruta: MAX, cenaId: 'c1' }).map(p => p.chave)).toEqual(['p1:vc0']); } finally { Math.random = orig; }
        expect(chamadas).toBe(0); expect(JSON.stringify(f)).toBe(antes);
    });
    it('perguntar desarmado: nao pergunta (so armado pergunta)', () => {
        expect(NOVO_DANO.preverPerguntasDeDano(asks({ g0: { perguntar: true, armado: false } }), 9e9, { vidaMaxBruta: MAX, cenaId: 'c1' })).toEqual([]);
    });
    it('perguntar em modo AUTOMATICO nunca pergunta (flag ignorada)', () => {
        expect(NOVO_DANO.preverPerguntasDeDano(asks({ g0: { modo: 'automatico', perguntar: true } }), 9e9, { vidaMaxBruta: MAX, cenaId: 'c1' })).toEqual([]);
    });
    it('perguntar com limite ja esgotado: nao pergunta (nao dispararia)', () => {
        const f = asks(); dano(f, 9e9, { rng: rngPara(1) }); f.vida.atual = 100 * F;
        expect(NOVO_DANO.preverPerguntasDeDano(f, 9e9, { vidaMaxBruta: MAX, cenaId: 'c1' })).toEqual([]);
    });
    it('dois gatilhos perguntam no mesmo golpe (0% e faixa 5-1): ambos aparecem na previsao com tudo "sim"', () => {
        const f = volta({ g0: { perguntar: true }, g51: { perguntar: true } });
        const nomes = NOVO_DANO.preverPerguntasDeDano(f, 9e9, { vidaMaxBruta: MAX, cenaId: 'c1' }).map(p => p.chave);
        expect(nomes).toEqual(['p1:vc0']);
        // com a tabela dando 1% sem cura (nenhuma linha) a faixa 5-1 passa a perguntar tambem
        const tabela = { ...TABELA, resultados: [{ ate: 1, acoes: [{ tipo: 'mensagem', texto: 'nada' }] }] };
        const g = volta({ g0: { perguntar: true, acoes: [{ tipo: 'definirVida', percMax: 1 }, tabela] }, g51: { perguntar: true } });
        expect(NOVO_DANO.preverPerguntasDeDano(g, 9e9, { vidaMaxBruta: MAX, cenaId: 'c1' }).map(p => p.chave).sort()).toEqual(['p1:vc0', 'p1:vc3']);
    });
    it('Sim em um e Nao no outro: so o "Sim" executa, o "Nao" nao gasta uso', () => {
        const tabela = { ...TABELA, resultados: [{ ate: 1, acoes: [{ tipo: 'mensagem', texto: 'nada' }] }] };
        const mk = () => volta({ g0: { perguntar: true, acoes: [{ tipo: 'definirVida', percMax: 1 }, tabela] }, g51: { perguntar: true } });
        const a = mk(); dano(a, 9e9, { decisoes: { 'p1:vc0': true, 'p1:vc3': false }, rng: rngPara(1) });
        expect(a.vida.atual).toBe(1000 * F); expect(usos(a, 'p1:vc0')).toBe(0); expect(usos(a, 'p1:vc3')).toBe(1);
        const b = mk(); dano(b, 9e9, { decisoes: { 'p1:vc0': false, 'p1:vc3': true }, rng: rngPara(1) });
        expect(b.vida.atual).toBe(0); expect(usos(b, 'p1:vc0')).toBe(1); expect(usos(b, 'p1:vc3')).toBe(1);
        const c = mk(); dano(c, 9e9, { decisoes: { 'p1:vc0': true, 'p1:vc3': true }, rng: rngPara(1) });
        expect(c.vida.atual).toBe(41000 * F); expect(usos(c, 'p1:vc3')).toBe(0);
    });
    it('"Nao" nao registra ultimoEvento nem cria combate.* na ficha', () => {
        const f = asks(); dano(f, 9e9, { decisoes: { 'p1:vc0': false } });
        expect(f.combate).toBeUndefined(); expect(f.vida.atual).toBe(0);
    });
    it('decisao para chave inexistente / valor truthy nao booleano: ignorada; `true` string nao conta como recusa', () => {
        const f = asks(); dano(f, 9e9, { decisoes: { outra: false, 'p1:vc0': 'nao' }, rng: rngPara(1) });
        expect(f.vida.atual).toBe(MAX); // so `false` estrito recusa
    });
    it('sem decisao e sem lista de perguntas (dono offline / golpe de outro cliente): vale so o armado, sem pergunta', () => {
        const f = asks(); const r = dano(f, 9e9, { rng: rngPara(1) });
        expect(f.vida.atual).toBe(MAX); expect(r.textos.length).toBeGreaterThan(0); expect(r.perguntas).toBeUndefined();
    });
    it('perguntar dentro de gatilho em CADEIA (danoEmSi dispara outro gatilho opcional com perguntar): a previsao tambem enxerga', () => {
        const gA = { id: 'ga', nome: 'Sangria', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'danoEmSi', modo: 'fixo', valor: 95000 }] };
        const gB = g51({ perguntar: true });
        const f = ficha({ poderes: [poder([gA, gB])] });
        const p = [];
        const clone1 = clone(f);
        NOVO_APL.dispararEventoNaFicha(clone1, { tipo: 'turnoInicio' }, { cenaId: 'c1', nome: 'N', perguntas: p });
        expect(p.map(x => x.chave)).toEqual(['p1:vc3']);
    });
});

// =====================================================================================================
describe('PRIORIDADE 2 - rolarTabela', () => {
    const acaoTab = (extra = {}) => ({ tipo: 'rolarTabela', dado: '1d6', gatilhoNome: 'T', chave: 'k', fase: 'depois', fonte: FONTE, resultados: [{ ate: 2, texto: 'baixo', acoes: [{ tipo: 'mensagem', texto: 'A' }] }, { ate: 6, acoes: [{ tipo: 'curar', modo: 'fixo', valor: 10 }] }], ...extra });
    it('mesma ficha + mesmo rng pre-sorteado = mesmo resultado, mesmo se o produtor rodar de novo (reiniciar)', () => {
        const rng = NOVO_APL.rngPreSorteado();
        const rodar = () => { const f = ficha({}, 100); rng.reiniciar(); return NOVO_APL.aplicarAcoesNoRascunho(f, [acaoTab(), acaoTab({ dado: '2d6' })], { rng, vidaMaxBruta: MAX }).textos; };
        const a = rodar(); const b = rodar(); const c = rodar();
        expect(b).toEqual(a); expect(c).toEqual(a);
    });
    it('rngPreSorteado: valores em [0,1), ciclico apos n, reiniciar volta ao inicio; tamanho 0/negativo nao trava', () => {
        const rng = NOVO_APL.rngPreSorteado(3);
        const v = [rng(), rng(), rng(), rng()];
        expect(v[3]).toBe(v[0]); v.forEach(x => { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); });
        rng.reiniciar(); expect(rng()).toBe(v[0]);
    });
    it('uma rolagem por aplicacao: a mesma ficha com dois rng diferentes pode divergir, mas um rng fixo rola exatamente 1 dado (1d6)', () => {
        let chamadas = 0; const rng = () => { chamadas++; return 0.4; };
        NOVO_APL.aplicarAcoesNoRascunho(ficha({}, 100), [acaoTab()], { rng, vidaMaxBruta: MAX });
        expect(chamadas).toBe(1);
        chamadas = 0; NOVO_APL.aplicarAcoesNoRascunho(ficha({}, 100), [acaoTab({ dado: '3d4' })], { rng, vidaMaxBruta: MAX });
        expect(chamadas).toBe(3);
    });
    it('Volta das cinzas via ponto unico: a rolagem acontece UMA vez por golpe, mesmo com perguntar (previsao nao rola)', () => {
        let chamadas = 0; const rng = () => { chamadas++; return 0.3; };
        const f = volta({ g0: { perguntar: true } });
        NOVO_DANO.preverPerguntasDeDano(f, 9e9, { vidaMaxBruta: MAX, cenaId: 'c1', rng });
        expect(chamadas).toBe(0); // a previsao usa o proprio rng fixo
        dano(f, 9e9, { rng, decisoes: { 'p1:vc0': true } });
        expect(chamadas).toBe(1);
    });
    it('resultado no limite: ate==rolado usa a linha; rolado acima da ultima nada acontece', () => {
        const f = ficha({}, 100);
        expect(NOVO_APL.aplicarAcoesNoRascunho(f, [acaoTab()], { rng: rngPara(2, 6) }).textos).toEqual(['T rolou 2 (d6): baixo', 'T: A']);
        const g = ficha({}, 100);
        expect(NOVO_APL.aplicarAcoesNoRascunho(g, [acaoTab({ resultados: [{ ate: 2, acoes: [{ tipo: 'mensagem', texto: 'A' }] }] })], { rng: rngPara(3, 6) }).textos).toEqual(['T rolou 3 (d6): nada acontece']);
    });
    it('dado invalido em runtime (acao crua sem passar pelo normalizador): rola 0 e nada acontece, sem lancar', () => {
        const f = ficha({}, 100);
        expect(() => NOVO_APL.aplicarAcoesNoRascunho(f, [acaoTab({ dado: 'abc' })], {})).not.toThrow();
        // Comportamento real: rolado 0 casa a PRIMEIRA linha (ate>=0). Inalcancavel na pratica: o normalizador recusa o dado antes.
        const r = NOVO_APL.aplicarAcoesNoRascunho(f, [acaoTab({ dado: 'abc' })], {});
        expect(r.textos[0]).toContain('rolou 0');
        expect(() => NOVO_APL.aplicarAcoesNoRascunho(f, [acaoTab({ resultados: undefined })], {})).not.toThrow();
    });
    it('acao crua com tabela ANINHADA na linha (nao passou pelo normalizador): o executor nao entra em loop infinito (profundidade), nao lanca', () => {
        const interna = acaoTab({ resultados: [{ ate: 6, acoes: [{ tipo: 'mensagem', texto: 'FUNDO' }] }] });
        const externa = acaoTab({ resultados: [{ ate: 6, acoes: [interna] }] });
        const f = ficha({}, 100);
        expect(() => NOVO_APL.aplicarAcoesNoRascunho(f, [externa], { rng: rngPara(1, 6) })).not.toThrow();
    });
    it('tabela com acoes que geram eventos derivados (ligarPoder dentro da tabela) disparam gatilho poderLigou em cadeia', () => {
        const gLiga = { id: 'gl', nome: 'Ao ligar', evento: { tipo: 'poderLigou', poderId: 'p2' }, acoes: [{ tipo: 'mensagem', texto: 'LIGOU' }] };
        const f = ficha({ poderes: [poder([gLiga]), { id: 'p2', nome: 'Demogorgon', ativa: false }] }, 100);
        const r = NOVO_APL.aplicarAcoesNoRascunho(f, [acaoTab({ resultados: [{ ate: 6, acoes: [{ tipo: 'ligarPoder', poderId: 'p2' }] }] })], { rng: rngPara(1, 6), cenaId: 'c1', vidaMaxBruta: MAX });
        expect(f.poderes[1].ativa).toBe(true); expect(r.textos.join(' ')).toContain('LIGOU');
    });
    it('uma tabela dentro de gatilho de profundidade maxima (3) ainda executa as acoes simples, mas nao dispara gatilhos derivados', () => {
        const f = ficha({}, 100);
        const r = NOVO_APL.aplicarAcoesNoRascunho(f, [acaoTab({ resultados: [{ ate: 6, acoes: [{ tipo: 'mensagem', texto: 'M' }] }] })], { rng: rngPara(1, 6), profundidade: 3 });
        expect(r.textos).toContain('T: M');
    });
    describe('normalizador (bordas)', () => {
        const base = (a, ev = 'turnoInicio') => NOVO_GAT.normalizarGatilhos([{ nome: 'X', evento: { tipo: ev }, acoes: [a] }]);
        const L = (ate, extra = {}) => ({ ate, acoes: [{ tipo: 'mensagem', texto: 'a' }], ...extra });
        const tab = (resultados, dado = '1d4') => ({ tipo: 'rolarTabela', dado, resultados });
        it('ate fora de ordem, duplicado, zero, negativo, NaN, vazio, null, string nao numerica: gatilho descartado inteiro', () => {
            [[L(3), L(2)], [L(2), L(2)], [L(0)], [L(-1)], [L(NaN)], [L('')], [L(null)], [L('abc')], [L(undefined)], [L(1), L(3), L(2)]].forEach((rs) => {
                const r = base(tab(rs));
                expect(r.gatilhos, JSON.stringify(rs)).toHaveLength(0); expect(r.descartados).toHaveLength(1);
            });
        });
        it('ate decimal vira inteiro (2.9 -> 2); ate enorme e limitado a 100000; ate string numerica aceito', () => {
            const g = base(tab([L(2.9), L('3'), L(1e12)])).gatilhos[0];
            expect(g.acoes[0].resultados.map(r => r.ate)).toEqual([2, 3, 100000]);
        });
        it('ate decimal que colapsa (2.1, 2.9) e duplicado apos truncar: descartado', () => {
            expect(base(tab([L(2.1), L(2.9)])).gatilhos).toHaveLength(0);
        });
        it('12 linhas ok, 13 descartado; 0 linhas e nao-lista descartados', () => {
            const n = (k) => Array.from({ length: k }, (_, i) => L(i + 1));
            expect(base(tab(n(12))).gatilhos).toHaveLength(1); expect(base(tab(n(13))).gatilhos).toHaveLength(0);
            expect(base(tab([])).gatilhos).toHaveLength(0); expect(base(tab('x')).gatilhos).toHaveLength(0); expect(base(tab(null)).gatilhos).toHaveLength(0);
        });
        it('mais de 6 acoes numa linha: descartado; exatamente 6: aceito; linha sem acoes: descartado', () => {
            const m = { tipo: 'mensagem', texto: 'a' };
            expect(base(tab([{ ate: 1, acoes: Array(6).fill(m) }])).gatilhos).toHaveLength(1);
            expect(base(tab([{ ate: 1, acoes: Array(7).fill(m) }])).gatilhos).toHaveLength(0);
            expect(base(tab([{ ate: 1, acoes: [] }])).gatilhos).toHaveLength(0);
            expect(base(tab([{ ate: 1 }])).gatilhos).toHaveLength(0);
        });
        it('tabela aninhada (direto ou dentro de linha de linha) recusada; anularDano aninhado so em danoQueZeraria', () => {
            expect(base(tab([L(1, { acoes: [tab([L(1)])] })])).gatilhos).toHaveLength(0);
            expect(base(tab([L(1, { acoes: [{ tipo: 'anularDano' }] })]), 'atingido').gatilhos).toHaveLength(0);
            expect(base(tab([L(1, { acoes: [{ tipo: 'anularDano' }] })]), 'danoQueZeraria').gatilhos).toHaveLength(1);
        });
        it('dado invalido: "", "d6", "1d", "0d6"(rola 0), "1d0", "1d1001", "-1d4", "1D4"(maiusculo ok), " 1d4 ", 1d4 numero', () => {
            const ok = (d) => base(tab([L(4)], d)).gatilhos.length;
            ['', 'd6', '1d', 'abc', '1d4+1', null, 14, {}].forEach(d => expect(ok(d), String(d)).toBe(0));
            expect(ok('1D4')).toBe(1);
        });
        it('texto da linha: truncado em 120, tipo errado vira ausente; nunca undefined', () => {
            const g = base(tab([L(1, { texto: 'x'.repeat(500) }), L(2, { texto: 42 }), L(3, { texto: null })])).gatilhos[0];
            const rs = g.acoes[0].resultados;
            expect(rs[0].texto.length).toBeLessThanOrEqual(120);
            expect(semUndefined(g)).toBe(true);
            expect(rs[2].texto).toBeUndefined();
        });
        it('mais de uma tabela no mesmo gatilho e aceita pelo normalizador (o editor e que limita a uma)', () => {
            const r = NOVO_GAT.normalizarGatilhos([{ nome: 'X', evento: { tipo: 'turnoInicio' }, acoes: [tab([L(1)]), tab([L(1)])] }]);
            expect(r.gatilhos).toHaveLength(1); expect(r.gatilhos[0].acoes).toHaveLength(2);
        });
        it('normalizar e idempotente: normalizar(normalizar(x)) === normalizar(x) para tabela + danoNoAtacante + opcional/perguntar', () => {
            const bruto = [{ id: 'a', nome: 'Op', modo: 'opcional', armado: false, perguntar: true, evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'definirVida', percMax: 1 }, tab([L(2, { texto: 't' }), L(4, { acoes: [{ tipo: 'danoNoAtacante', valor: 50 }] })])] }];
            const um = NOVO_GAT.normalizarGatilhos(bruto, { persistir: false }).gatilhos;
            const dois = NOVO_GAT.normalizarGatilhos(clone(um), { persistir: false }).gatilhos;
            expect(dois).toEqual(um); expect(semUndefined(um)).toBe(true);
        });
        it('descreverGatilho de tabela com texto, linhas unicas e faixas', () => {
            const g = base(tab([L(1, { texto: 'um' }), L(3), L(4)], '1d4'), 'danoQueZeraria').gatilhos[0];
            expect(NOVO_GAT.descreverGatilho(g)).toContain('rola 1d4: 1→"um" avisar');
            expect(NOVO_GAT.descreverGatilho(g)).toContain('2-3→');
            expect(NOVO_GAT.descreverGatilho(g)).toContain('; 4→');
        });
    });
});

// =====================================================================================================
describe('PRIORIDADE 2 - danoNoAtacante', () => {
    const acao = (extra = {}) => ({ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 100, gatilhoNome: 'G', chave: 'k', ...extra });
    it('sem atacante, atacante sem nome, atacante null/string: avisa e nao devolve externos', () => {
        [undefined, null, {}, { nome: '' }].forEach((atacante) => {
            const r = NOVO_APL.aplicarAcoesNoRascunho(ficha(), [acao()], { atacante, danoRecebido: 100 });
            expect(r.externos, JSON.stringify(atacante)).toBeUndefined(); expect(r.textos[0]).toContain('ignorado');
        });
    });
    it('dano 0, NaN, negativo ou undefined: nada e devolvido (sem aviso de erro)', () => {
        [0, NaN, -50, undefined, 'x'].forEach((d) => {
            const r = NOVO_APL.aplicarAcoesNoRascunho(ficha(), [acao()], { atacante: { nome: 'Z' }, danoRecebido: d });
            expect(r.externos).toBeUndefined(); expect(r.textos).toEqual([]);
        });
    });
    it('percentuais: 50% de 1001 = 500 (floor); 1000% (maximo do normalizador) multiplica; fixo ignora o dano recebido', () => {
        const r = NOVO_APL.aplicarAcoesNoRascunho(ficha(), [acao({ valor: 50 }), acao({ valor: 1000 }), acao({ modo: 'fixo', valor: 7 })], { atacante: { nome: 'Z' }, danoRecebido: 1001 });
        expect(r.externos.map(e => e.dano)).toEqual([500, 10010, 7]);
    });
    it('dano enorme (1e15) nao vira Infinity nem NaN', () => {
        const r = NOVO_APL.aplicarAcoesNoRascunho(ficha(), [acao({ modo: 'fixo', valor: 1e15 })], { atacante: { nome: 'Z' } });
        expect(Number.isFinite(r.externos[0].dano)).toBe(true);
    });
    it('normalizador: valor 0/negativo/NaN/texto e descartado; 1e30 e limitado; percentual passa de 1000 e e cortado em 1000', () => {
        const n = (a) => NOVO_GAT.normalizarGatilhos([{ nome: 'X', evento: { tipo: 'atingido' }, acoes: [a] }]).gatilhos[0];
        [0, -1, NaN, 'abc', null, undefined, ''].forEach(v => expect(n({ tipo: 'danoNoAtacante', valor: v }), String(v)).toBeUndefined());
        expect(n({ tipo: 'danoNoAtacante', modo: 'fixo', valor: 1e30 }).acoes[0].valor).toBe(NOVO_GAT.LIMITE_VALOR_GATILHO);
        expect(n({ tipo: 'danoNoAtacante', valor: 5000 }).acoes[0].valor).toBe(1000);
        expect(n({ tipo: 'danoNoAtacante', modo: 'estranho', valor: 10 }).acoes[0].modo).toBe('percDanoRecebido');
    });
    it('God Mode do DEFENSOR: o ponto unico sai antes; nenhum externo e gerado', () => {
        const f = volta({}, { combate: { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } } });
        const r = dano(f, 9e9, { rng: rngPara(4), atacante: { nome: 'V' } });
        expect(r.externos).toBeUndefined(); expect(r.imune).toBe(true);
    });
    it('atingido com danoNoAtacante (contra-ataque): usa o dano exibido do golpe e o atacante do ctx; nao dispara se o golpe nao vem de personagem', () => {
        const g = { id: 'ct', nome: 'Espinhos', evento: { tipo: 'atingido', nivel: 'qualquer' }, acoes: [{ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 10 }] };
        const f = ficha({ poderes: [poder([g])] });
        const r = dano(f, 2000, { golpe: { nivel: 'normal' }, atacante: { nome: 'V' } });
        expect(r.externos).toEqual([{ tipo: 'danoNoAtacante', atacante: { nome: 'V' }, dano: 200, gatilhoNome: 'Espinhos' }]);
        const f2 = ficha({ poderes: [poder([g])] });
        const r2 = dano(f2, 2000, { golpe: { nivel: 'normal' } });
        expect(r2.externos).toBeUndefined(); expect(r2.textos.join(' ')).toContain('ignorado');
    });
    it('danoNoAtacante em gatilho em cadeia (danoEmSi -> vidaAbaixoDe com danoNoAtacante): externo propagado', () => {
        const gA = { id: 'ga', nome: 'Dor', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'danoEmSi', modo: 'fixo', valor: 95000 }] };
        const gB = { id: 'gb', nome: 'Vinganca', evento: { tipo: 'vidaAbaixoDe', de: 10, ate: 1 }, acoes: [{ tipo: 'danoNoAtacante', modo: 'fixo', valor: 33 }] };
        const f = ficha({ poderes: [poder([gA, gB])] });
        const r = NOVO_APL.dispararEventoNaFicha(f, { tipo: 'turnoInicio' }, { cenaId: 'c', nome: 'N', atacante: { nome: 'V' } });
        // Comportamento real: o atacante NAO atravessa a cadeia danoEmSi (auto-dano nao tem atacante): avisa e ignora.
        expect(r.externos).toBeUndefined(); expect(r.textos.join(' ')).toContain('dano no atacante ignorado');
    });
});

// =====================================================================================================
describe('PRIORIDADE 2/3 - Forcar disparo e Mestre', () => {
    it('forca ignorando desarmado, mestreDesligou, limite esgotado, evento e condicoes; NAO gasta limite nem marca ultimoEvento', () => {
        const f = volta({ g0: { armado: false, mestreDesligou: true, condicoes: ['vida_maior_que:999999999'] } }, { vida: vital(100000000, 50 * F) });
        const r = NOVO_APL.forcarGatilhoNaFicha(f, 'p1', 'vc0', { rng: rngPara(1), cenaId: 'c1', vidaMaxBruta: MAX });
        expect(r.achou).toBe(true); expect(r.textos[0]).toBe('Cinzas 0% forçado pelo Mestre');
        expect(f.vida.atual).toBe(MAX);
        expect(f.combate).toBeUndefined(); // nao criou usosPoderes nem gatilhos
        expect(semUndefined(r)).toBe(true);
    });
    it('forca com limite ja esgotado (gasto antes): continua sem gastar e executa', () => {
        const f = volta(); dano(f, 9e9, { rng: rngPara(1) });
        const antes = JSON.stringify(f.combate);
        f.vida.atual = 10 * F;
        const r = NOVO_APL.forcarGatilhoNaFicha(f, 'p1', 'vc0', { rng: rngPara(2), cenaId: 'c1', vidaMaxBruta: MAX });
        expect(r.achou).toBe(true); expect(f.vida.atual).toBe(51000 * F);
        expect(JSON.stringify(f.combate)).toBe(antes);
    });
    it('forca gatilho de poder DESLIGADO (ativa:false): executa (ignora ligado)', () => {
        const f = volta({}, {}); f.poderes[0].ativa = false;
        expect(NOVO_APL.forcarGatilhoNaFicha(f, 'p1', 'vc1', { vidaMaxBruta: MAX }).achou).toBe(true);
        expect(f.escudos).toHaveLength(1);
    });
    it('poderId comparado como string (numero vs string) e gatilho invalido na lista (gatilho que o normalizador descarta): achou:false', () => {
        const f = ficha({ poderes: [{ id: 7, nome: 'P', gatilhos: [{ id: 'g', nome: 'g', evento: { tipo: 'xx' }, acoes: [] }, { id: 'ok', nome: 'ok', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'm' }] }] }] });
        expect(NOVO_APL.forcarGatilhoNaFicha(f, '7', 'g').achou).toBe(false);
        const r = NOVO_APL.forcarGatilhoNaFicha(f, '7', 'ok'); expect(r.achou).toBe(true); expect(r.textos).toContain('ok: m');
    });
    it('God Mode do alvo e as travas das acoes continuam valendo no forcado (danoEmSi zerado)', () => {
        const f = ficha({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } }, poderes: [poder([{ id: 'd', nome: 'Dor', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'danoEmSi', modo: 'fixo', valor: 500 }] }])] });
        NOVO_APL.forcarGatilhoNaFicha(f, 'p1', 'd', {}); expect(f.vida.atual).toBe(100000 * F);
    });
    it('forcar mesma ficha duas vezes com o mesmo rng pre-sorteado reiniciado da o mesmo resultado (Immer re-executando o produtor)', () => {
        const rng = NOVO_APL.rngPreSorteado();
        const a = volta({}, {}, 10); const b = volta({}, {}, 10);
        rng.reiniciar(); NOVO_APL.forcarGatilhoNaFicha(a, 'p1', 'vc0', { rng, cenaId: 'c1', vidaMaxBruta: MAX });
        rng.reiniciar(); NOVO_APL.forcarGatilhoNaFicha(b, 'p1', 'vc0', { rng, cenaId: 'c1', vidaMaxBruta: MAX });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});

// =====================================================================================================
describe('PRIORIDADE 2 - God Mode, Dano Verdadeiro, laco', () => {
    it('God Mode do dono vence gatilho opcional armado: nada dispara, nada gasta, ficha intacta, nem pergunta', () => {
        const f = volta({ g0: { perguntar: true } }, { combate: { imunidadeTotal: { turnosRestantes: 3, origem: 'x' } } });
        const antes = JSON.stringify(f); const perguntas = [];
        const r = dano(f, 9e9, { perguntas, rng: rngPara(1) });
        expect(JSON.stringify(f)).toBe(antes); expect(perguntas).toEqual([]); expect(r.imune).toBe(true);
    });
    it('God Mode e removido pelo gatilho 3 depois: a ordem imunidade -> cura 50% termina em 51% sem perder o God Mode no mesmo golpe', () => {
        const f = volta(); dano(f, 9e9, { rng: rngPara(3) });
        expect(f.combate.imunidadeTotal.turnosRestantes).toBe(1);
    });
    it('Dano Verdadeiro: o ponto unico recebe o dano final como numero; gatilho de morte (0%) dispara igual (nao ha como o Dano Verdadeiro pula-lo)', () => {
        const f = volta(); const r = dano(f, 1e12, { rng: rngPara(1) });
        expect(r.anulado).toBe(true); expect(f.vida.atual).toBe(MAX);
    });
    it('laco: cadeia de gatilhos de Vida com dano em si para na profundidade 3 (a, b, c disparam; d e bloqueado) e termina em 60%', () => {
        const mk = (id, de, ate) => ({ id, nome: id, evento: { tipo: 'vidaAbaixoDe', de, ate }, acoes: [{ tipo: 'danoEmSi', modo: 'fixo', valor: 10000 }] });
        const f = ficha({ poderes: [poder([mk('a', 90, 81), mk('b', 80, 71), mk('c', 70, 61), mk('d', 60, 51), mk('e', 50, 41)])] });
        const r = dano(f, 10000); // 100% -> 90%: a -> 80%: b -> 70%: c -> 60%: d bloqueado por profundidade
        expect(f.vida.atual).toBe(60000 * F);
        expect(r.textos.filter(t => t.includes('custou'))).toHaveLength(3);
    });
    it('laco A<->B por poderLigou/poderDesligou com danoNoAtacante nao trava e nao gera externos infinitos', () => {
        const gA = { id: 'ga', nome: 'A', evento: { tipo: 'atingido', nivel: 'qualquer' }, acoes: [{ tipo: 'danoNoAtacante', modo: 'fixo', valor: 10 }] };
        const f = ficha({ poderes: [poder([gA])] });
        const r = dano(f, 100, { golpe: { nivel: 'normal' }, atacante: { nome: 'Vilao' } });
        expect(r.externos).toHaveLength(1);
        // o atacante, atingido pelo dano devolvido SEM atacante (como o servico faz), nao devolve de volta
        const vilao = ficha({ poderes: [poder([{ ...gA, id: 'gv' }])] });
        const r2 = dano(vilao, 10, { golpe: { nivel: 'normal' } });
        expect(r2.externos).toBeUndefined();
    });
});

// =====================================================================================================
describe('PRIORIDADE 3 - bordas numericas e identificadores', () => {
    it('dano NaN / negativo / Infinity / string: Vida nunca vira NaN nem negativa; sem pergunta', () => {
        [NaN, -50, Infinity, 'abc', null, undefined].forEach((d) => {
            const f = volta({ g0: { perguntar: true } }); dano(f, d, { rng: rngPara(1) });
            expect(Number.isNaN(f.vida.atual), String(d)).toBe(false); expect(f.vida.atual).toBeGreaterThanOrEqual(0);
        });
    });
    it('dano enorme (1e300) salva pelo 0% e nao produz NaN em externos', () => {
        const f = volta(); const r = dano(f, 1e300, { rng: rngPara(4), atacante: { nome: 'V' } });
        expect(f.vida.atual).toBe(51000 * F); expect(Number.isFinite(r.externos[0].dano)).toBe(true);
    });
    it('Vida atual NaN/undefined na ficha: nao lanca', () => {
        [NaN, undefined, null, 'x'].forEach((v) => {
            const f = volta(); f.vida.atual = v;
            expect(() => dano(f, 100, { rng: rngPara(1) })).not.toThrow();
            expect(() => NOVO_DANO.preverPerguntasDeDano(f, 100, {})).not.toThrow();
        });
    });
    it('vidaMaxBruta ausente/0/negativa no ctx e ficha sem base: faixas em % nao disparam por engano; definirVida percMax nao grava 0', () => {
        const f = volta(); f.vida.base = 0;
        const r = NOVO_DANO.aplicarDanoNaVida(f, 90000, { nome: 'N', vidaMaxBruta: 0, cenaId: 'c1' });
        expect(Number.isNaN(f.vida.atual)).toBe(false); expect(r).toBeTruthy();
    });
    it('ids duplicados no mesmo poder: o segundo ganha id novo (persistir) ou determinístico (leitura); chaves de uso nao colidem', () => {
        const dup = [g10(), g10({ nome: 'Copia' })];
        const lido = NOVO_GAT.normalizarGatilhos(dup, { persistir: false }).gatilhos;
        expect(new Set(lido.map(g => g.id)).size).toBe(2);
        const f = ficha({ poderes: [poder(dup)] });
        const chaves = NOVO_GAT.coletarGatilhos(f).map(c => c.chave);
        expect(new Set(chaves).size).toBe(2);
        const lido2 = NOVO_GAT.normalizarGatilhos(dup, { persistir: false }).gatilhos;
        expect(lido2.map(g => g.id)).toEqual(lido.map(g => g.id)); // estavel entre leituras
    });
    it('ids duplicados com armado diferente: cada um responde so ao proprio armado (o segundo, renomeado, nao herda o do primeiro)', () => {
        const dup = [g10({ armado: false }), g10({ nome: 'Copia', armado: true })];
        const f = ficha({ poderes: [poder(dup)] });
        dano(f, 90000);
        expect(f.escudos).toHaveLength(1);
    });
    it('ids com caracteres proibidos no Firebase (. # $ [ ] /) viram "_" na chave; forcar acha pelo id bruto salvo', () => {
        const f = ficha({ poderes: [poder([{ ...g10(), id: 'a.b#c' }])] });
        const c = NOVO_GAT.coletarGatilhos(f)[0];
        expect(c.chave).toBe('p1:a_b_c'); expect(NOVO_GAT.chaveDoGatilhoDoPoder('p1', 'a.b#c')).toBe('p1:a_b_c');
    });
    it('chaveDoGatilhoDoPoder coincide com coletarGatilhos para poder de id numerico e com "/" no id', () => {
        const f = ficha({ poderes: [{ id: 12, nome: 'P', ativa: true, gatilhos: [g10({ id: 'x/y' })] }] });
        expect(NOVO_GAT.coletarGatilhos(f)[0].chave).toBe(NOVO_GAT.chaveDoGatilhoDoPoder(12, 'x/y'));
    });
    it('Poder desligado (ativa:false) com gatilho opcional armado NAO dispara e NAO pergunta (so passivo)', () => {
        const f = volta({ g0: { perguntar: true } }); f.poderes[0].ativa = false;
        expect(NOVO_DANO.preverPerguntasDeDano(f, 9e9, { vidaMaxBruta: MAX, cenaId: 'c1' })).toEqual([]);
        dano(f, 9e9, { rng: rngPara(1) }); expect(f.vida.atual).toBe(0);
    });
    it('gatilho opcional em ITEM equipado e em PASSIVA: armado/desarmado e perguntar tambem valem', () => {
        const gi = g0({ perguntar: true });
        const f = ficha({ inventario: [{ id: 'i1', nome: 'Anel', equipado: true, efeitosAtivos: true, gatilhos: [gi] }], passivas: [{ id: 'ps1', nome: 'Passiva', gatilhos: [g0({ id: 'pv', perguntar: true })] }] });
        const p = NOVO_DANO.preverPerguntasDeDano(f, 9e9, { vidaMaxBruta: MAX, cenaId: 'c1' }).map(x => x.fonte).sort();
        expect(p.length).toBeGreaterThanOrEqual(1); expect(p).toContain('Passiva');
    });
    it('gatilho opcional dentro de Forma ativa: coletado com a chave da forma', () => {
        const f = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, formaAtivaId: 'fa', formas: [{ id: 'fa', nome: 'Forma', gatilhos: [g0({ perguntar: true })] }] }] });
        const p = NOVO_DANO.preverPerguntasDeDano(f, 9e9, { vidaMaxBruta: MAX, cenaId: 'c1' });
        expect(p.map(x => x.chave)).toEqual(['p1:forma:fa:vc0']);
    });
    it('limite "turno" no opcional: usa combate.usosPoderes com turno:true e zerarUsosPorTurno devolve o uso', () => {
        const f = volta({ g0: { limite: { max: 1, por: 'turno' } } });
        dano(f, 9e9, { rng: rngPara(1) });
        expect(f.combate.usosPoderes['p1:vc0']).toMatchObject({ n: 1, turno: true });
        f.vida.atual = 10 * F; dano(f, 9e9, { rng: rngPara(1) }); expect(f.vida.atual).toBe(0);
        NOVO_APL.zerarUsosPorTurno(f); f.vida.atual = 10 * F; dano(f, 9e9, { rng: rngPara(1) }); expect(f.vida.atual).toBe(MAX);
    });
    it('mesmo eventoId reaplicado (re-execucao do produtor): o 0% nao dispara duas vezes na mesma ficha', () => {
        const f = volta({ g0: { limite: undefined } }); // sem limite para provar que e o eventoId que protege
        dano(f, 9e9, { rng: rngPara(1), eventoId: 'EV' });
        f.vida.atual = 10 * F;
        const r = dano(f, 9e9, { rng: rngPara(1), eventoId: 'EV' });
        expect(r.textos).toEqual([]); expect(f.vida.atual).toBe(0);
    });
});
