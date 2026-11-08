import { describe, it, expect } from 'vitest';
import { normalizarGatilhos, avaliarGatilhos, preverGatilhos, coletarGatilhos, descreverGatilho, usosRestantesDoGatilho } from './gatilhos.js';
import { aplicarAcoesNoRascunho, forcarGatilhoNaFicha, dispararEventoNaFicha } from './gatilhosAplicar.js';
import { aplicarDanoNaVida, preverPerguntasDeDano } from './danoVida.js';

// Fase 3 dos gatilhos: modo opcional (armado / perguntar), rolarTabela, danoNoAtacante e a Volta das cinzas completa (B-20..B-23).

const F = 1000;
const MAX = 100000 * F;
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
const ficha = (extra = {}, vidaExibida = 100000) => ({ vida: { atual: vidaExibida * F }, iniciativa: 0, poderes: [], inventario: [], passivas: [], ...extra });
const poder = (gatilhos, extra = {}) => ({ id: 'p1', nome: 'Volta das cinzas', ativa: true, gatilhos, ...extra });
let n = 0;
const dano = (f, d, ctx = {}) => aplicarDanoNaVida(f, d, { nome: 'Natsu', vidaMaxBruta: MAX, cenaId: 'c1', eventoId: `f3_${++n}`, ...ctx });
// rng que devolve o resultado `v` num dado de `faces` faces
const rngPara = (v, faces = 4) => () => (v - 1) / faces + 0.001;

const TABELA = {
    tipo: 'rolarTabela', dado: '1d4',
    resultados: [
        { ate: 1, texto: 'cura total', acoes: [{ tipo: 'curar', modo: 'percMax', valor: 100 }] },
        { ate: 2, texto: 'limpa condições e cura 50%', acoes: [{ tipo: 'limparCondicoes' }, { tipo: 'curar', modo: 'percMax', valor: 50 }] },
        { ate: 3, texto: 'imune por 1 turno e cura 50%', acoes: [{ tipo: 'imunidadeTotal', duracaoTurnos: 1 }, { tipo: 'curar', modo: 'percMax', valor: 50 }] },
        { ate: 4, texto: 'o dano volta ao atacante e cura 50%', acoes: [{ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 100 }, { tipo: 'curar', modo: 'percMax', valor: 50 }] },
    ],
};
const opc = (extra = {}) => ({ modo: 'opcional', armado: true, ...extra });
const VOLTA = [
    { id: 'vc1', nome: 'Cinzas 10%', ...opc(), evento: { tipo: 'vidaAbaixoDe', de: 10, ate: 10 }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'escudo', nome: 'Cinzas', valor: 5000 }, { tipo: 'mensagem', texto: 'As cinzas se agitam' }] },
    { id: 'vc2', nome: 'Cinzas 9-6%', ...opc(), evento: { tipo: 'vidaAbaixoDe', de: 9, ate: 6 }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'curar', modo: 'percMax', valor: 20 }] },
    { id: 'vc3', nome: 'Cinzas 5-1%', ...opc(), evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 1 }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'limparCondicoes' }, { tipo: 'curar', modo: 'percMax', valor: 40 }] },
    { id: 'vc0', nome: 'Cinzas 0%', ...opc(), evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'definirVida', percMax: 1 }, TABELA] },
];
const volta = (extraGatilho = {}, extraFicha = {}) => ficha({ poderes: [poder(VOLTA.map(g => (g.id === 'vc0' ? { ...g, ...extraGatilho } : g)))], ...extraFicha });
const vc0 = (f) => ({ chave: 'p1:vc0', ...f });

describe('Etapa 1 - modo opcional no motor', () => {
    it('opcional ARMADO dispara; DESARMADO nao; automatico ignora armado', () => {
        const g = { id: 'x', nome: 'X', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'oi' }] };
        const casos = [[{ modo: 'opcional', armado: true }, true], [{ modo: 'opcional', armado: false }, false], [{ modo: 'opcional' }, false], [{ modo: 'opcional', armado: 'false' }, false], [{ modo: 'opcional', armado: 'true' }, false], [{ modo: 'automatico', armado: false }, true]];
        casos.forEach(([extra, esperado]) => {
            const f = ficha({ poderes: [poder([{ ...g, ...extra }])] });
            expect(dispararEventoNaFicha(f, { tipo: 'turnoInicio' }).disparou).toBe(esperado);
        });
    });
    it('opcional sem armado nao dispara; armado:true dispara; armado string vira desarmado; sem consentimento por omissao', () => {
        const base = { nome: 'X', modo: 'opcional', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'oi' }] };
        const norm = (extra) => normalizarGatilhos([{ ...base, id: 'a', ...extra }]).gatilhos[0];
        expect(norm({}).armado).toBe(false);
        expect(norm({ armado: 'false' }).armado).toBe(false);
        expect(norm({ armado: null }).armado).toBe(false);
        expect(norm({ armado: true }).armado).toBe(true);
        expect(dispararEventoNaFicha(ficha({ poderes: [poder([{ ...base, id: 'a' }])] }), { tipo: 'turnoInicio' }).disparou).toBe(false);
        expect(dispararEventoNaFicha(ficha({ poderes: [poder([{ ...base, id: 'a', armado: true }])] }), { tipo: 'turnoInicio' }).disparou).toBe(true);
        const [g] = normalizarGatilhos([{ ...base, id: 'a' }]).gatilhos;
        expect(descreverGatilho(g)).toContain('(opcional, desarmado)');
    });
    it('mestreDesligou vence tudo (opcional armado nao dispara)', () => {
        const f = ficha({ poderes: [poder([{ id: 'x', nome: 'X', ...opc({ mestreDesligou: true }), evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'oi' }] }])] });
        expect(coletarGatilhos(f)).toHaveLength(0);
        expect(dispararEventoNaFicha(f, { tipo: 'turnoInicio' }).disparou).toBe(false);
    });
    it('normalizar aceita modo/armado/perguntar; perguntar so vale em opcional; sem undefined', () => {
        const base = { nome: 'X', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'oi' }] };
        const r = normalizarGatilhos([{ ...base, id: 'a', modo: 'opcional', armado: true, perguntar: true }, { ...base, id: 'b', modo: 'automatico', perguntar: true }, { ...base, id: 'c', modo: 'zzz' }, { ...base, id: 'd', modo: 'opcional', armado: 'sim', perguntar: 'sim' }]);
        expect(r.gatilhos[0]).toMatchObject({ modo: 'opcional', armado: true, perguntar: true });
        expect(r.gatilhos[1].perguntar).toBeUndefined();
        expect(r.gatilhos[2].modo).toBe('automatico');
        expect(r.gatilhos[3].armado).toBe(false); expect(r.gatilhos[3].perguntar).toBeUndefined();
        expect(semUndefined(r.gatilhos)).toBe(true);
    });
    it('descreverGatilho mostra (opcional, armado) / (opcional, desarmado)', () => {
        const [a] = normalizarGatilhos([{ nome: 'X', ...opc(), perguntar: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'oi' }] }]).gatilhos;
        expect(descreverGatilho(a)).toContain('(opcional, armado, pergunta antes)');
        expect(descreverGatilho({ ...a, armado: false, perguntar: undefined })).toContain('(opcional, desarmado)');
    });
    it('regressao: gatilho AUTOMATICO se comporta como antes (Negar morte)', () => {
        const f = ficha({ poderes: [poder([{ id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] }])] });
        const r = dano(f, 1e9);
        expect(f.vida.atual).toBe(1 * F); expect(r.anulado).toBe(true); expect(r.externos).toBeUndefined();
        const r2 = dano(f, 1e9);
        expect(f.vida.atual).toBe(0); expect(r2.textos).toEqual([]);
    });
});

describe('Etapa 2 - perguntar (decisoes em duas passadas)', () => {
    const ask = () => volta({ perguntar: true });
    it('preverPerguntasDeDano lista o gatilho que dispararia, sem tocar na ficha', () => {
        const f = ask(); const antes = JSON.stringify(f);
        const p = preverPerguntasDeDano(f, 1e9, { nome: 'Natsu', vidaMaxBruta: MAX, cenaId: 'c1' });
        expect(p).toEqual([{ chave: 'p1:vc0', nome: 'Cinzas 0%', fonte: 'Volta das cinzas' }]);
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('sem gatilho que pergunte: lista vazia (e nem clona)', () => {
        expect(preverPerguntasDeDano(volta(), 1e9, { vidaMaxBruta: MAX })).toEqual([]);
        expect(preverPerguntasDeDano(ficha(), 1e9)).toEqual([]);
    });
    it('golpe que nao zera: nao pergunta o gatilho de 0%', () => {
        expect(preverPerguntasDeDano(ask(), 1000, { vidaMaxBruta: MAX })).toEqual([]);
    });
    it('Sim dispara; Nao NAO dispara e NAO gasta o uso', () => {
        const sim = ask(); dano(sim, 1e9, { decisoes: { 'p1:vc0': true }, rng: rngPara(1) });
        expect(sim.vida.atual).toBe(MAX); // 1d4 = 1: cura total
        const nao = ask(); const r = dano(nao, 1e9, { decisoes: { 'p1:vc0': false } });
        expect(nao.vida.atual).toBe(0); expect(r.textos).toEqual([]);
        expect(usosRestantesDoGatilho(nao, 'p1:vc0', { max: 1, por: 'cena' }, 'c1')).toBe(1);
        // depois do Nao, um novo golpe ainda pode ser salvo
        const nao2 = ask(); dano(nao2, 1e9, { decisoes: { 'p1:vc0': false } }); nao2.vida.atual = 100 * F;
        dano(nao2, 1e9, { rng: rngPara(2) });
        expect(nao2.vida.atual).toBeGreaterThan(0);
    });
    it('dono offline / outro cliente (sem decisoes): armado basta, executa sem perguntar', () => {
        const f = ask(); const r = dano(f, 1e9, { rng: rngPara(1) });
        expect(r.textos.join(' ')).toContain('rolou 1 (d4)'); expect(f.vida.atual).toBe(MAX);
    });
    it('preverGatilhos (evento solto) devolve so os que perguntam', () => {
        const f = ask();
        expect(preverGatilhos({ tipo: 'danoQueZeraria' }, { vidaAntes: 100 * F, vidaDepois: -1, vidaMaxBruta: MAX, cenaId: 'c1' }, f).map(p => p.chave)).toEqual(['p1:vc0']);
    });
});

describe('Etapa 3 - rolarTabela', () => {
    it('Volta das cinzas 0%: cada resultado do 1d4 com rng fixo', () => {
        const feitos = {};
        [1, 2, 3, 4].forEach((v) => {
            const f = volta({}, v === 2 ? { condicoes: [{ id: 'queimado', stacks: 1 }] } : {});
            const r = dano(f, 1e9, { rng: rngPara(v), atacante: { nome: 'Vilão' } });
            feitos[v] = { f, r };
            expect(r.anulado).toBe(true);
            expect(r.textos.join(' | ')).toContain(`rolou ${v} (d4)`);
        });
        expect(feitos[1].f.vida.atual).toBe(MAX); // 1% (1000) + cura total
        expect(feitos[1].r.textos.join(' ')).toContain('cura total');
        // 2: limpa condições + cura 50%
        expect(feitos[2].f.condicoes).toBeUndefined(); expect(feitos[2].f.vida.atual).toBe(0.51 * MAX);
        // 3: imunidade total 1 turno + cura 50%
        expect(feitos[3].f.combate.imunidadeTotal).toMatchObject({ turnosRestantes: 1 }); expect(feitos[3].f.vida.atual).toBe(0.51 * MAX);
        // 4: dano no atacante = 100% do dano recebido + cura 50%
        expect(feitos[4].f.vida.atual).toBe(0.51 * MAX);
        expect(feitos[4].r.externos).toEqual([{ tipo: 'danoNoAtacante', atacante: { nome: 'Vilão' }, dano: 1e9, gatilhoNome: 'Cinzas 0%' }]);
        // o uso (1 por cena) foi gasto uma vez so
        expect(usosRestantesDoGatilho(feitos[1].f, 'p1:vc0', { max: 1, por: 'cena' }, 'c1')).toBe(0);
    });
    it('sem linha correspondente: nada acontece (so o aviso)', () => {
        const f = ficha();
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'rolarTabela', dado: '1d6', resultados: [{ ate: 2, acoes: [{ tipo: 'curar', modo: 'fixo', valor: 5 }] }], gatilhoNome: 'T', chave: 'k' }], { rng: rngPara(6, 6), vidaMaxBruta: MAX });
        expect(r.textos).toEqual(['T rolou 6 (d6): nada acontece']);
    });
    it('vale a PRIMEIRA linha com ate >= rolado', () => {
        const f = ficha({ vida: { atual: 10 * F } });
        const acoes = [{ tipo: 'rolarTabela', dado: '1d6', gatilhoNome: 'T', chave: 'k', resultados: [{ ate: 2, texto: 'baixo', acoes: [{ tipo: 'mensagem', texto: 'A' }] }, { ate: 5, texto: 'meio', acoes: [{ tipo: 'mensagem', texto: 'B' }] }, { ate: 6, acoes: [{ tipo: 'mensagem', texto: 'C' }] }] }];
        expect(aplicarAcoesNoRascunho(f, acoes, { rng: rngPara(3, 6) }).textos).toEqual(['T rolou 3 (d6): meio', 'T: B']);
        expect(aplicarAcoesNoRascunho(f, acoes, { rng: rngPara(6, 6) }).textos).toEqual(['T rolou 6 (d6)', 'T: C']);
    });
    it('2d6 aparece como 2d6 no feed', () => {
        const f = ficha();
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'rolarTabela', dado: '2d6', gatilhoNome: 'T', chave: 'k', resultados: [{ ate: 12, acoes: [{ tipo: 'mensagem', texto: 'A' }] }] }], { rng: () => 0 });
        expect(r.textos[0]).toBe('T rolou 2 (2d6)');
    });
    it('normalizador: valida dado, linhas (max 12, ate crescente), acoes aninhadas e proibe tabela dentro de tabela', () => {
        const base = (a) => normalizarGatilhos([{ nome: 'X', evento: { tipo: 'turnoInicio' }, acoes: [a] }]);
        const ok = { tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 2, acoes: [{ tipo: 'mensagem', texto: 'a' }] }, { ate: 4, texto: 'b', acoes: [{ tipo: 'curar', modo: 'percMax', valor: 10 }] }] };
        expect(base(ok).gatilhos).toHaveLength(1);
        expect(semUndefined(base(ok).gatilhos)).toBe(true);
        const linhas = (k) => Array.from({ length: k }, (_, i) => ({ ate: i + 1, acoes: [{ tipo: 'mensagem', texto: 'a' }] }));
        expect(base({ ...ok, resultados: linhas(12) }).gatilhos).toHaveLength(1);
        expect(base({ ...ok, resultados: linhas(13) }).gatilhos).toHaveLength(0);
        expect(base({ ...ok, dado: '1d1001' }).gatilhos).toHaveLength(0);
        expect(base({ ...ok, dado: 'abc' }).gatilhos).toHaveLength(0);
        expect(base({ ...ok, resultados: [] }).gatilhos).toHaveLength(0);
        expect(base({ ...ok, resultados: [{ ate: 3, acoes: ok.resultados[0].acoes }, { ate: 3, acoes: ok.resultados[0].acoes }] }).gatilhos).toHaveLength(0);
        expect(base({ ...ok, resultados: [{ ate: 3, acoes: [] }] }).gatilhos).toHaveLength(0);
        expect(base({ ...ok, resultados: [{ ate: 3, acoes: [{ tipo: 'zzz' }] }] }).gatilhos).toHaveLength(0);
        expect(base({ ...ok, resultados: [{ ate: 3, acoes: [ok] }] }).gatilhos).toHaveLength(0);
        // anularDano aninhado so em danoQueZeraria
        const comAnular = { ...ok, resultados: [{ ate: 3, acoes: [{ tipo: 'anularDano' }] }] };
        expect(base(comAnular).gatilhos).toHaveLength(0);
        expect(normalizarGatilhos([{ nome: 'X', evento: { tipo: 'danoQueZeraria' }, acoes: [comAnular] }]).gatilhos).toHaveLength(1);
    });
    it('descreverGatilho: "rola 1d4: 1→…; 2-3→…"', () => {
        const [g] = normalizarGatilhos([{ nome: 'T', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 1, texto: 'cura', acoes: [{ tipo: 'curar', modo: 'percMax', valor: 100 }] }, { ate: 3, acoes: [{ tipo: 'limparCondicoes' }, { tipo: 'danoNoAtacante', valor: 100 }] }] }] }]).gatilhos;
        const frase = descreverGatilho(g);
        expect(frase).toContain('rola 1d4: 1→"cura" curar 100% da Vida máxima; 2-3→limpar as condições + devolver 100% do dano recebido (antes do escudo) ao atacante');
    });
});

describe('Etapa 4 - danoNoAtacante', () => {
    it('sem atacante conhecido: ignora e avisa', () => {
        const f = ficha();
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 100, gatilhoNome: 'G', chave: 'k' }], { danoRecebido: 500 });
        expect(r.externos).toBeUndefined(); expect(r.textos[0]).toContain('ignorado');
    });
    it('percDanoRecebido e fixo', () => {
        const f = ficha();
        const r = aplicarAcoesNoRascunho(f, [{ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 50, gatilhoNome: 'G', chave: 'k' }, { tipo: 'danoNoAtacante', modo: 'fixo', valor: 77, gatilhoNome: 'G', chave: 'k' }], { atacante: { nome: 'Z' }, danoRecebido: 1001 });
        expect(r.externos.map(e => e.dano)).toEqual([500, 77]);
    });
    it('normalizador: modo/valor', () => {
        const base = (a) => normalizarGatilhos([{ nome: 'X', evento: { tipo: 'atingido' }, acoes: [a] }]).gatilhos[0];
        expect(base({ tipo: 'danoNoAtacante', valor: 100 }).acoes[0]).toEqual({ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 100 });
        expect(base({ tipo: 'danoNoAtacante', modo: 'fixo', valor: '300' }).acoes[0]).toEqual({ tipo: 'danoNoAtacante', modo: 'fixo', valor: 300 });
        expect(base({ tipo: 'danoNoAtacante', valor: 0 })).toBeUndefined();
    });
});

describe('Etapa 6 - Volta das cinzas e God Mode / Mestre', () => {
    it('desarmado: o golpe mortal mata (nada dispara)', () => {
        const f = volta({ armado: false }); const r = dano(f, 1e9, { rng: rngPara(1) });
        expect(f.vida.atual).toBe(0); expect(r.textos).toEqual([]); expect(r.anulado).toBe(false);
    });
    it('faixas opcionais armadas: 10% dispara; desarmando a faixa ela nao dispara', () => {
        const f = ficha({ poderes: [poder(VOLTA)] });
        const r = dano(f, 91000); // 100000 -> 9000 exibido = 9% -> faixa 9-6
        expect(r.textos.join(' ')).toContain('Cinzas 9-6% curou');
        const g = ficha({ poderes: [poder(VOLTA.map(x => (x.id === 'vc2' ? { ...x, armado: false } : x)))] });
        expect(dano(g, 91000).textos).toEqual([]);
    });
    it('limite 1 por cena vale para o opcional; outra cena renova', () => {
        const f = volta(); dano(f, 1e9, { rng: rngPara(1) });
        f.vida.atual = 100 * F; const r2 = dano(f, 1e9, { rng: rngPara(1) });
        expect(f.vida.atual).toBe(0); expect(r2.textos).toEqual([]);
        f.vida.atual = 100 * F; dano(f, 1e9, { rng: rngPara(1), cenaId: 'c2' });
        expect(f.vida.atual).toBeGreaterThan(0);
    });
    it('God Mode: ignora tudo (nenhum gatilho, nada gasto, nem pergunta)', () => {
        const f = volta({ perguntar: true }, { combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } });
        const antes = JSON.stringify(f);
        expect(preverPerguntasDeDano(f, 1e9, { vidaMaxBruta: MAX })).toEqual([]);
        const r = dano(f, 1e9, { rng: rngPara(1), atacante: { nome: 'Z' } });
        expect(r.imune).toBe(true); expect(JSON.stringify(f)).toBe(antes); expect(r.externos).toBeUndefined();
    });
    it('Dano Verdadeiro (so zera resistencias) NAO impede o gatilho de morte: o dano chega como valor final', () => {
        const f = volta(); dano(f, 5e9, { rng: rngPara(1) });
        expect(f.vida.atual).toBeGreaterThan(0);
    });
    it('Mestre FORCA o gatilho: ignora armado, limite e condicoes; nao gasta o limite; texto "forcado pelo Mestre"', () => {
        const f = volta({ armado: false }, { vida: { atual: 50 * F } });
        const r = forcarGatilhoNaFicha(f, 'p1', 'vc0', { rng: rngPara(3), cenaId: 'c1', vidaMaxBruta: MAX });
        expect(r.achou).toBe(true); expect(r.textos[0]).toBe('Cinzas 0% forçado pelo Mestre');
        expect(r.textos.join(' ')).toContain('rolou 3 (d4)');
        expect(f.combate.imunidadeTotal).toBeTruthy(); expect(f.vida.atual).toBe(0.51 * MAX);
        expect(usosRestantesDoGatilho(f, 'p1:vc0', { max: 1, por: 'cena' }, 'c1')).toBe(1);
        expect(r.caminhos).toEqual(expect.arrayContaining(['vida/atual', 'combate/imunidadeTotal']));
        // forcar de novo (limite ja "esgotado" nao importa)
        expect(forcarGatilhoNaFicha(f, 'p1', 'vc0', { rng: rngPara(1) }).achou).toBe(true);
        expect(forcarGatilhoNaFicha(f, 'p1', 'nao-existe').achou).toBe(false);
        expect(forcarGatilhoNaFicha(f, 'outro', 'vc0').achou).toBe(false);
    });
    it('forcar com danoNoAtacante sem atacante: avisa e ignora', () => {
        const f = volta();
        const r = forcarGatilhoNaFicha(f, 'p1', 'vc0', { rng: rngPara(4) });
        expect(r.textos.join(' ')).toContain('ignorado'); expect(r.externos).toEqual([]);
    });
    it('Mestre arma/desarma: alternar o campo armado no gatilho do Poder muda o disparo', () => {
        const f = volta({ armado: true });
        const g = f.poderes[0].gatilhos.find(x => x.id === 'vc0');
        g.armado = false; expect(coletarGatilhos(f).find(c => c.gatilho.id === 'vc0').gatilho.armado).toBe(false);
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { vidaAntes: 100 * F, vidaDepois: -1, vidaMaxBruta: MAX }, f).acoes).toEqual([]);
        g.armado = true;
        expect(avaliarGatilhos({ tipo: 'danoQueZeraria' }, { vidaAntes: 100 * F, vidaDepois: -1, vidaMaxBruta: MAX }, f).acoes.length).toBeGreaterThan(0);
    });
    it('ficha sem undefined depois de tudo', () => {
        const f = volta({}, { condicoes: [{ id: 'queimado', stacks: 1 }] }); dano(f, 1e9, { rng: rngPara(2) });
        expect(semUndefined(f)).toBe(true);
    });
});
