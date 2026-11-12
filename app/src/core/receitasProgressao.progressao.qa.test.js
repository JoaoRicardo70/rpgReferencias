import { describe, it, expect } from 'vitest';
import {
    RECEITAS, obterReceita, paramsReceita, paramsPadraoReceita, conferirLimitesProgressao, eventoDaReceita,
    EVENTOS_RECEITA, resumirResultado,
} from './receitasProgressao.js';
import { normalizarGatilhos, LIMITE_GATILHOS_POR_FONTE } from './gatilhos.js';
import { normalizarContador, LIMITE_CONTADORES } from './contadores.js';
import { dispararEventoNaFicha, restaurarUsosPorCena, camposParaGravar, camposDeGatilhosAlterados } from './gatilhosAplicar.js';
import { calcularPoderAtual, getGlobalMultipliers } from './poder.js';
import { restaurarUsos } from './usosPoder.js';
import { descansarCompleto } from './vitals.js';

// QA — Progressão em combate: receitas (lógica pura), simulação com o motor de gatilhos, restaurarUsosPorCena e Adaptação.

// Ajuste intencional (ganho com Duração): estes testes simulam ganhos PERMANENTES; sem `duracao` explícita a receita usaria o padrão novo ('combate' em ganhoPorEvento/crescerPorTurno).
const R = (id) => { const r = obterReceita(id); return r && { ...r, construir: (b, c) => r.construir({ duracao: 'permanente', ...b }, c) }; };
const disparar = (f, ev, ctx = {}) => dispararEventoNaFicha(f, ev, { cenaId: 'c1', nome: 'Eu', ...ctx });
const fp = (f) => f.ganhosPermanentes && f.ganhosPermanentes.fatorPoder;
const gp = (f) => f.ganhosPermanentes && f.ganhosPermanentes.poderCalculado;
const ct = (f, id) => f.contadores.find(c => c.id === id);

// Instala o resultado de construir() num poder ligado da ficha (gatilhos no poder, contadores na ficha com poderId).
function fichaCom(resultado, { poderId = 'p1', extra = {}, poderExtra = {} } = {}) {
    return {
        vida: { atual: 1e9 }, poderes: [{ id: poderId, nome: 'Adaptação', ativa: true, gatilhos: resultado.gatilhos, ...poderExtra }],
        inventario: [], passivas: [],
        contadores: resultado.contadores.map(c => normalizarContador({ ...c, valor: c.min, poderId })),
        ...extra,
    };
}
const acertos = (f, n, nivel = 'normal') => { for (let i = 0; i < n; i++) disparar(f, { tipo: 'acertou', nivel }); };

describe('Catálogo e campos', () => {
    it('tem as 4 receitas esperadas, com id/nome/resumo/campos/construir', () => {
        expect(RECEITAS.map(r => r.id)).toEqual(['ganhoPorEvento', 'acumularEConverter', 'crescerPorTurno', 'bonusACadaN']);
        RECEITAS.forEach((r) => {
            expect(typeof r.nome).toBe('string'); expect(r.resumo.length).toBeGreaterThan(10);
            expect(Array.isArray(r.campos)).toBe(true); expect(typeof r.construir).toBe('function');
        });
    });
    it('obterReceita devolve null para id desconhecido/vazio', () => {
        expect(obterReceita('nada')).toBeNull(); expect(obterReceita('')).toBeNull(); expect(obterReceita(undefined)).toBeNull();
    });
    it.each(RECEITAS.map(r => [r.id]))('%s: todo padrão está dentro de min/max (numero) ou entre as opções (select/evento)', (id) => {
        const r = R(id);
        r.campos.forEach((c) => {
            if (c.tipo === 'numero') { expect(c.padrao).toBeGreaterThanOrEqual(c.min); expect(c.padrao).toBeLessThanOrEqual(c.max); }
            else expect(c.opcoes.map(o => o.id)).toContain(c.padrao);
        });
        expect(paramsPadraoReceita(r)).toEqual(Object.fromEntries(r.campos.map(c => [c.id, c.padrao])));
    });
    it.each(RECEITAS.map(r => [r.id]))('%s: com os padrões gera gatilhos válidos, sem avisos e dentro dos limites', (id) => {
        const r = R(id).construir(paramsPadraoReceita(R(id)), {});
        expect(r.gatilhos.length).toBeGreaterThanOrEqual(1);
        expect(r.avisos).toEqual([]);
        expect(conferirLimitesProgressao(r, {}).ok).toBe(true);
        // Nada sai fora do que normalizarGatilhos aceita (idempotente).
        const de = normalizarGatilhos(r.gatilhos, { persistir: false });
        expect(de.descartados).toEqual([]);
        expect(de.gatilhos.map(g => g.id)).toEqual(r.gatilhos.map(g => g.id));
    });
    it('os modos percentuais usam sempre unidade percentual', () => {
        RECEITAS.forEach((rc) => ['somar', 'multiplicar'].forEach((modo) => {
            const r = rc.construir({ ...paramsPadraoReceita(rc), modo }, {});
            const ganhos = r.gatilhos.flatMap(g => g.acoes).filter(a => a.tipo === 'ganhoPermanente');
            expect(ganhos.length).toBe(1);
            ganhos.forEach(a => { expect(a.unidade).toBe('percentual'); expect(a.modo).toBe(modo); });
        }));
    });
    it('eventoDaReceita converte todos os eventos do catálogo e rejeita lixo', () => {
        EVENTOS_RECEITA.forEach(e => expect(eventoDaReceita(e.id)).not.toBeNull());
        expect(eventoDaReceita('acertou:critico')).toEqual({ tipo: 'acertou', nivel: 'critico' });
        expect(eventoDaReceita('errou')).toEqual({ tipo: 'errou' });
        expect(eventoDaReceita('turnoInicio')).toEqual({ tipo: 'turnoInicio' });
        ['', 'x', 'acertou', 'acertou:banana', null, undefined, 5].forEach(v => expect(eventoDaReceita(v)).toBeNull());
    });
});

describe('paramsReceita: normalização e bordas', () => {
    const rc = R('ganhoPorEvento');
    it('prende ao min/max e aceita vírgula decimal', () => {
        expect(paramsReceita(rc, { percentual: 0 }).percentual).toBe(0.01);
        expect(paramsReceita(rc, { percentual: -5 }).percentual).toBe(0.01);
        expect(paramsReceita(rc, { percentual: 1e9 }).percentual).toBe(1000);
        expect(paramsReceita(rc, { percentual: '0,5' }).percentual).toBe(0.5);
        expect(paramsReceita(rc, { limiteUsos: 500 }).limiteUsos).toBe(99);
        expect(paramsReceita(rc, { limiteUsos: -3 }).limiteUsos).toBe(0);
        expect(paramsReceita(rc, { limiteUsos: 2.9 }).limiteUsos).toBe(2);
    });
    it('lixo (texto, NaN, Infinity, objeto, null) cai no padrão ou é preso', () => {
        ['abc', NaN, null, undefined, '', {}].forEach(v => expect(paramsReceita(rc, { percentual: v }).percentual).toBe(2));
        expect(paramsReceita(rc, { percentual: Infinity }).percentual).toBe(2);
    });
    it('select/evento inválido cai no padrão', () => {
        const p = paramsReceita(rc, { modo: 'banana', evento: 'xx', limitePor: 1, opcionais: 'talvez' });
        expect(p).toMatchObject({ modo: 'multiplicar', evento: 'acertou:qualquer', limitePor: 'cena', opcionais: 'nao' });
    });
    it('brutos nulos/indefinidos não quebram', () => {
        expect(() => paramsReceita(rc, null)).not.toThrow();
        expect(paramsReceita(rc, undefined)).toEqual(paramsPadraoReceita(rc));
    });
    it('bordas de n (bonusACadaN 2..999), tetoTurnos (0..99), pontos (1..100)', () => {
        expect(paramsReceita(R('bonusACadaN'), { n: 1 }).n).toBe(2);
        expect(paramsReceita(R('bonusACadaN'), { n: 5000 }).n).toBe(999);
        expect(paramsReceita(R('crescerPorTurno'), { tetoTurnos: 5000 }).tetoTurnos).toBe(99);
        expect(paramsReceita(R('crescerPorTurno'), { tetoTurnos: -1 }).tetoTurnos).toBe(0);
        expect(paramsReceita(R('acumularEConverter'), { pontos: 0 }).pontos).toBe(1);
        expect(paramsReceita(R('acumularEConverter'), { pontos: 101 }).pontos).toBe(100);
        expect(paramsReceita(R('acumularEConverter'), { teto: 99999 }).teto).toBe(9999);
        expect(paramsReceita(R('acumularEConverter'), { teto: 0 }).teto).toBe(1);
    });
});

describe('Receita a) ganhoPorEvento', () => {
    it('um gatilho automático e armado, ganho percentual, sem contador', () => {
        const r = R('ganhoPorEvento').construir({ percentual: 2, modo: 'multiplicar' }, {});
        expect(r.gatilhos).toHaveLength(1); expect(r.contadores).toEqual([]);
        expect(r.gatilhos[0]).toMatchObject({ id: 'rp_ganhoPorEvento_1_g1', modo: 'automatico', armado: true, evento: { tipo: 'acertou', nivel: 'qualquer' } });
        expect(r.gatilhos[0].acoes[0]).toMatchObject({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', valor: 2 });
        expect(r.gatilhos[0].limite).toBeUndefined();
    });
    it.each(EVENTOS_RECEITA.map(e => [e.id]))('evento %s vira o evento do gatilho', (ev) => {
        const r = R('ganhoPorEvento').construir({ evento: ev }, {});
        expect(r.gatilhos).toHaveLength(1);
        expect(r.gatilhos[0].evento).toMatchObject(eventoDaReceita(ev));
    });
    it.each([['turno'], ['cena'], ['descanso']])('limite de 3 usos %s vira gatilho.limite', (por) => {
        const r = R('ganhoPorEvento').construir({ limiteUsos: 3, limitePor: por }, {});
        expect(r.gatilhos[0].limite).toEqual({ max: 3, por });
        expect(r.gatilhos[0].nome.length).toBeLessThanOrEqual(60); // normalizarGatilhos corta o nome em 60 caracteres
    });
    // O nome (limite de 60 caracteres do normalizador) mantém a informação do limite.
    it('o nome do gatilho mantém a informação do limite', () => {
        const r = R('ganhoPorEvento').construir({ limiteUsos: 3, limitePor: 'cena' }, {});
        expect(r.gatilhos[0].nome).toContain('máx 3x/cena');
    });
    it('percentual mínimo e máximo geram valor preso e gatilho válido', () => {
        const mn = R('ganhoPorEvento').construir({ percentual: 0.01 }, {});
        const mx = R('ganhoPorEvento').construir({ percentual: 1000 }, {});
        expect(mn.gatilhos[0].acoes[0].valor).toBe(0.01);
        expect(mx.gatilhos[0].acoes[0].valor).toBeGreaterThan(0);
        expect(mn.avisos).toEqual([]); expect(mx.avisos).toEqual([]);
    });
    it('opcionais = sim: gatilho opcional e DESARMADO; nao: automático armado', () => {
        const op = R('ganhoPorEvento').construir({ opcionais: 'sim' }, {});
        expect(op.gatilhos[0]).toMatchObject({ modo: 'opcional', armado: false });
        const nao = R('ganhoPorEvento').construir({ opcionais: 'nao' }, {});
        expect(nao.gatilhos[0]).toMatchObject({ modo: 'automatico', armado: true });
    });
    it('gatilho opcional desarmado NÃO dispara até ser armado', () => {
        const r = R('ganhoPorEvento').construir({ opcionais: 'sim' }, {});
        const f = fichaCom(r);
        acertos(f, 3);
        expect(fp(f)).toBeUndefined();
        f.poderes[0].gatilhos = f.poderes[0].gatilhos.map(g => ({ ...g, armado: true }));
        acertos(f, 1);
        expect(fp(f)).toBeCloseTo(1.02, 9);
    });
    it('nome usa vírgula decimal e descreve o modo', () => {
        const r = R('ganhoPorEvento').construir({ percentual: 0.5, modo: 'somar' }, {});
        expect(r.gatilhos[0].nome).toContain('0,5%'); expect(r.gatilhos[0].nome).toContain('soma');
    });
});

describe('Receita b) acumularEConverter', () => {
    const r = R('acumularEConverter').construir({ pontos: 2, teto: 500, percentual: 0.5, modo: 'multiplicar' }, {});
    it('gera 2 gatilhos e 1 contador PERMANENTE (sem reset) com min 0 e max=teto', () => {
        expect(r.gatilhos).toHaveLength(2); expect(r.contadores).toHaveLength(1);
        expect(r.contadores[0]).toEqual({ id: 'rp_acumularEConverter_1_c', nome: 'Progressão: pontos acumulados', min: 0, max: 500 });
        expect(r.contadores[0].reset).toBeUndefined();
    });
    it('gatilho de acúmulo soma `pontos`; o de fimDeLuta converte com deContador {fator, zerar:true}', () => {
        expect(r.gatilhos[0].acoes[0]).toMatchObject({ tipo: 'contador', id: 'rp_acumularEConverter_1_c', op: 'somar', valor: 2 });
        expect(r.gatilhos[1].evento).toEqual({ tipo: 'fimDeLuta' });
        expect(r.gatilhos[1].acoes[0]).toMatchObject({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', deContador: { id: 'rp_acumularEConverter_1_c', fator: 0.5, zerar: true } });
    });
    it('simulação: 10 acertos x 2 pontos = 20; fimDeLuta converte (20 x 0,5% composto) e zera; contador sobrevive ao reset de cena', () => {
        const f = fichaCom(r);
        acertos(f, 10);
        expect(ct(f, 'rp_acumularEConverter_1_c').valor).toBe(20);
        const res = disparar(f, { tipo: 'fimDeLuta' });
        expect(fp(f)).toBeCloseTo(1.1, 9); // 1 + 20*0,5/100
        expect(ct(f, 'rp_acumularEConverter_1_c').valor).toBe(0);
        expect(res.caminhos).toContain('ganhosPermanentes/fatorPoder');
    });
    it('resetarContadoresDeCena roda antes do fimDeLuta: um contador com reset cena perderia os pontos (por isso o permanente)', () => {
        const f = fichaCom(r);
        acertos(f, 4);
        f.contadores[0].reset = 'cena'; // simula o erro de projeto
        disparar(f, { tipo: 'fimDeLuta' });
        expect(fp(f)).toBeUndefined(); // nada convertido: já zerado antes da leitura
        const g = fichaCom(r); acertos(g, 4); disparar(g, { tipo: 'fimDeLuta' });
        expect(fp(g)).toBeCloseTo(1 + 8 * 0.005, 9); // o permanente converte
    });
    it('acúmulo respeita o teto do contador', () => {
        const rr = R('acumularEConverter').construir({ pontos: 100, teto: 250, percentual: 1, modo: 'somar' }, {});
        const f = fichaCom(rr);
        acertos(f, 10);
        expect(ct(f, 'rp_acumularEConverter_1_c').valor).toBe(250);
        disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBeCloseTo(2.5, 9);
    });
    it('contador vazio no fimDeLuta não ganha nada e não explode; 2 lutas seguidas acumulam separado', () => {
        const f = fichaCom(r);
        expect(() => disparar(f, { tipo: 'fimDeLuta' })).not.toThrow();
        expect(fp(f)).toBeUndefined();
        acertos(f, 1); disparar(f, { tipo: 'fimDeLuta' });
        acertos(f, 1); disparar(f, { tipo: 'fimDeLuta' });
        expect(fp(f)).toBeCloseTo(1.01 * 1.01, 6);
    });
    it('modo somar acumula linear em poderCalculado', () => {
        const rr = R('acumularEConverter').construir({ pontos: 1, teto: 999, percentual: 1, modo: 'somar' }, {});
        const f = fichaCom(rr); acertos(f, 7); disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBeCloseTo(0.07, 9); expect(fp(f)).toBeUndefined();
    });
    it('opcionais desarmados: nem acumula nem converte', () => {
        const rr = R('acumularEConverter').construir({ opcionais: 'sim' }, {});
        rr.gatilhos.forEach(g => { expect(g.modo).toBe('opcional'); expect(g.armado).toBe(false); });
        const f = fichaCom(rr); acertos(f, 5); disparar(f, { tipo: 'fimDeLuta' });
        expect(ct(f, 'rp_acumularEConverter_1_c').valor).toBe(0); expect(fp(f)).toBeUndefined(); expect(gp(f)).toBeUndefined();
    });
});

describe('Receita c) crescerPorTurno', () => {
    it('sem teto: 1 gatilho turnoInicio, sem contador e sem limite', () => {
        const r = R('crescerPorTurno').construir({ percentual: 1, modo: 'multiplicar', tetoTurnos: 0 }, {});
        expect(r.gatilhos).toHaveLength(1); expect(r.contadores).toEqual([]);
        expect(r.gatilhos[0].evento).toEqual({ tipo: 'turnoInicio' }); expect(r.gatilhos[0].limite).toBeUndefined();
        expect(r.gatilhos[0].acoes).toHaveLength(1);
    });
    it('com teto N: limite {max:N, por:cena}, ação de contador +1 e contador "turnos em combate" reset cena com max N', () => {
        const r = R('crescerPorTurno').construir({ percentual: 1, modo: 'multiplicar', tetoTurnos: 5 }, {});
        expect(r.gatilhos[0].limite).toEqual({ max: 5, por: 'cena' });
        expect(r.gatilhos[0].acoes[1]).toMatchObject({ tipo: 'contador', op: 'somar', valor: 1, id: 'rp_crescerPorTurno_1_c' });
        expect(r.contadores).toEqual([{ id: 'rp_crescerPorTurno_1_c', nome: 'Progressão: turnos em combate', min: 0, max: 5, reset: 'cena' }]);
    });
    it('teto 999 (máximo) e 1 (mínimo) são aceitos', () => {
        expect(R('crescerPorTurno').construir({ tetoTurnos: 999 }, {}).gatilhos[0].limite.max).toBe(99); // normalizarUsos limita a 99 (LIMITE_USOS)
        expect(R('crescerPorTurno').construir({ tetoTurnos: 1 }, {}).gatilhos[0].limite.max).toBe(1);
    });
    it('sem teto: 30 turnos compõem 1,01^30', () => {
        const f = fichaCom(R('crescerPorTurno').construir({ percentual: 1, modo: 'multiplicar', tetoTurnos: 0 }, {}));
        for (let i = 0; i < 30; i++) disparar(f, { tipo: 'turnoInicio' });
        expect(fp(f)).toBeCloseTo(1.01 ** 30, 6);
    });
    it('teto 3: 6 turnos só crescem 3; contador mostra 3', () => {
        const f = fichaCom(R('crescerPorTurno').construir({ percentual: 1, modo: 'multiplicar', tetoTurnos: 3 }, {}));
        for (let i = 0; i < 6; i++) disparar(f, { tipo: 'turnoInicio' });
        expect(fp(f)).toBeCloseTo(1.01 ** 3, 9);
        expect(ct(f, 'rp_crescerPorTurno_1_c').valor).toBe(3);
    });
    it('2º combate na MESMA cena volta a crescer depois do fimDeLuta (restaurarUsosPorCena) e o contador recomeça', () => {
        const f = fichaCom(R('crescerPorTurno').construir({ percentual: 1, modo: 'multiplicar', tetoTurnos: 3 }, {}));
        for (let i = 0; i < 5; i++) disparar(f, { tipo: 'turnoInicio' });
        const antes = fp(f);
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.combate && f.combate.usosPoderes).toBeUndefined();
        expect(ct(f, 'rp_crescerPorTurno_1_c').valor).toBe(0);
        for (let i = 0; i < 5; i++) disparar(f, { tipo: 'turnoInicio' });
        expect(fp(f)).toBeCloseTo(antes * 1.01 ** 3, 9);
    });
    it('sem fimDeLuta, trocar de cena também libera (uso por cena só vale na cena em que foi gasto)', () => {
        const f = fichaCom(R('crescerPorTurno').construir({ percentual: 1, modo: 'somar', tetoTurnos: 2 }, {}));
        for (let i = 0; i < 4; i++) disparar(f, { tipo: 'turnoInicio' }, { cenaId: 'a' });
        expect(gp(f)).toBeCloseTo(0.02, 9);
        for (let i = 0; i < 4; i++) disparar(f, { tipo: 'turnoInicio' }, { cenaId: 'b' });
        expect(gp(f)).toBeCloseTo(0.04, 9);
    });
});

describe('Receita d) bonusACadaN', () => {
    const r = R('bonusACadaN').construir({ n: 3, percentual: 5, modo: 'somar' }, {});
    it('2 gatilhos (contar e disparar >= N que dá ganho e zera) e contador max=N', () => {
        expect(r.gatilhos).toHaveLength(2);
        expect(r.gatilhos[1].evento).toEqual({ tipo: 'contadorAtingiu', contadorId: 'rp_bonusACadaN_1_c', op: '>=', valor: 3 });
        expect(r.gatilhos[1].acoes.map(a => a.tipo)).toEqual(['ganhoPermanente', 'contador']);
        expect(r.gatilhos[1].acoes[1]).toMatchObject({ op: 'zerar', id: 'rp_bonusACadaN_1_c' });
        expect(r.contadores).toEqual([{ id: 'rp_bonusACadaN_1_c', nome: 'Progressão: contagem de eventos', min: 0, max: 3 }]);
    });
    it('reinicio = sim põe reset cena no contador', () => {
        const rr = R('bonusACadaN').construir({ reinicio: 'sim' }, {});
        expect(rr.contadores[0].reset).toBe('cena');
    });
    it('dispara exatamente na borda (3º, 6º, 9º), zera, e não entra em loop', () => {
        const f = fichaCom(r);
        acertos(f, 2); expect(gp(f)).toBeUndefined(); expect(ct(f, 'rp_bonusACadaN_1_c').valor).toBe(2);
        acertos(f, 1); expect(gp(f)).toBeCloseTo(0.05, 9); expect(ct(f, 'rp_bonusACadaN_1_c').valor).toBe(0);
        acertos(f, 3); expect(gp(f)).toBeCloseTo(0.10, 9);
        acertos(f, 3); expect(gp(f)).toBeCloseTo(0.15, 9);
        acertos(f, 2); expect(gp(f)).toBeCloseTo(0.15, 9);
    });
    it('N=2 (mínimo): a cada 2 eventos; N=999 (máximo) gera contador max 999 e válido', () => {
        const r2 = R('bonusACadaN').construir({ n: 2, percentual: 1, modo: 'somar' }, {});
        const f = fichaCom(r2); acertos(f, 6); expect(gp(f)).toBeCloseTo(0.03, 9);
        const rm = R('bonusACadaN').construir({ n: 999 }, {});
        expect(rm.contadores[0].max).toBe(999); expect(rm.avisos).toEqual([]);
    });
    it('multiplicar compõe a cada N', () => {
        const rr = R('bonusACadaN').construir({ n: 2, percentual: 10, modo: 'multiplicar' }, {});
        const f = fichaCom(rr); acertos(f, 6);
        expect(fp(f)).toBeCloseTo(1.1 ** 3, 9);
    });
    it('eventos diferentes (critico) só contam em críticos', () => {
        const rr = R('bonusACadaN').construir({ evento: 'acertou:critico', n: 2, percentual: 1, modo: 'somar' }, {});
        const f = fichaCom(rr); acertos(f, 5, 'normal'); expect(ct(f, 'rp_bonusACadaN_1_c').valor).toBe(0);
        acertos(f, 2, 'critico'); expect(gp(f)).toBeCloseTo(0.01, 9);
    });
    it('reinicio=sim: contagem parcial zera no fimDeLuta', () => {
        const rr = R('bonusACadaN').construir({ n: 5, reinicio: 'sim', percentual: 1, modo: 'somar' }, {});
        const f = fichaCom(rr); acertos(f, 4); disparar(f, { tipo: 'fimDeLuta' });
        expect(ct(f, 'rp_bonusACadaN_1_c').valor).toBe(0);
        const g = fichaCom(R('bonusACadaN').construir({ n: 5, reinicio: 'nao' }, {})); acertos(g, 4); disparar(g, { tipo: 'fimDeLuta' });
        expect(ct(g, 'rp_bonusACadaN_1_c').valor).toBe(4);
    });
});

describe('Simulação ponta a ponta: ganho por evento', () => {
    it('50 acertos de +2% multiplicam ~2,69x (composto)', () => {
        const f = fichaCom(R('ganhoPorEvento').construir({ percentual: 2, modo: 'multiplicar' }, {}));
        acertos(f, 50);
        expect(fp(f)).toBeCloseTo(1.02 ** 50, 6);
        expect(fp(f)).toBeGreaterThan(2.68); expect(fp(f)).toBeLessThan(2.70);
        expect(gp(f)).toBeUndefined();
        expect(getGlobalMultipliers(f).fatorGanhoComposto).toBeCloseTo(2.6916, 3);
    });
    it('50 acertos de +2% somar dão +100% (x2 no total aditivo)', () => {
        const f = fichaCom(R('ganhoPorEvento').construir({ percentual: 2, modo: 'somar' }, {}));
        acertos(f, 50);
        expect(gp(f)).toBeCloseTo(1, 9); expect(fp(f)).toBeUndefined();
        expect(getGlobalMultipliers(f).totalDano).toBeCloseTo(2, 6);
    });
    it('o fator reflete UMA vez no Poder calculado (razão com/sem)', () => {
        const base = { vida: { base: 600000 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 100 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 }, divisores: { vida: 1e-12 }, bio: {}, estetica: {}, labels: {}, poderes: [], inventario: [], seresSelados: [] };
        const f = fichaCom(R('ganhoPorEvento').construir({ percentual: 2, modo: 'multiplicar' }, {}));
        acertos(f, 50);
        const sem = calcularPoderAtual({ ...base }, 1); const com = calcularPoderAtual({ ...base, ganhosPermanentes: f.ganhosPermanentes }, 1);
        expect(com.poderExato / sem.poderExato).toBeCloseTo(1.02 ** 50, 3);
    });
    it('só dispara para o nível configurado (fatal) e erros/atingidos não contam', () => {
        const f = fichaCom(R('ganhoPorEvento').construir({ evento: 'acertou:fatal', percentual: 10, modo: 'somar' }, {}));
        acertos(f, 3, 'normal'); disparar(f, { tipo: 'errou' }); disparar(f, { tipo: 'atingido', nivel: 'fatal' });
        expect(gp(f)).toBeUndefined();
        acertos(f, 1, 'fatal'); expect(gp(f)).toBeCloseTo(0.1, 9);
    });
    it('limite 2x por cena: o 3º acerto não ganha; depois do fimDeLuta volta', () => {
        const f = fichaCom(R('ganhoPorEvento').construir({ percentual: 10, modo: 'somar', limiteUsos: 2, limitePor: 'cena' }, {}));
        acertos(f, 5); expect(gp(f)).toBeCloseTo(0.2, 9);
        disparar(f, { tipo: 'fimDeLuta' });
        acertos(f, 5); expect(gp(f)).toBeCloseTo(0.4, 9);
    });
    it('limite por DESCANSO é preservado no fimDeLuta e só volta ao descansar', () => {
        const f = fichaCom(R('ganhoPorEvento').construir({ percentual: 10, modo: 'somar', limiteUsos: 2, limitePor: 'descanso' }, {}));
        acertos(f, 4); expect(gp(f)).toBeCloseTo(0.2, 9);
        const chave = Object.keys(f.combate.usosPoderes)[0];
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.combate.usosPoderes[chave]).toBeTruthy(); expect(f.combate.usosPoderes[chave].n).toBe(2);
        acertos(f, 3); expect(gp(f)).toBeCloseTo(0.2, 9);
        restaurarUsos(f); acertos(f, 3); expect(gp(f)).toBeCloseTo(0.4, 9);
    });
    it('limite 1x por TURNO: reabre no turnoInicio, não no fimDeLuta de outro poder', () => {
        const f = fichaCom(R('ganhoPorEvento').construir({ percentual: 10, modo: 'somar', limiteUsos: 1, limitePor: 'turno' }, {}));
        acertos(f, 3); expect(gp(f)).toBeCloseTo(0.1, 9);
        disparar(f, { tipo: 'turnoInicio' }); acertos(f, 3); expect(gp(f)).toBeCloseTo(0.2, 9);
    });
    it('2 receitas diferentes no mesmo poder não interferem entre si', () => {
        const a = R('crescerPorTurno').construir({ percentual: 1, modo: 'somar', tetoTurnos: 0 }, {});
        const b = R('bonusACadaN').construir({ n: 2, percentual: 10, modo: 'somar' }, { idsGatilhos: a.gatilhos.map(g => g.id) });
        const f = fichaCom({ gatilhos: [...a.gatilhos, ...b.gatilhos], contadores: [...a.contadores, ...b.contadores] });
        disparar(f, { tipo: 'turnoInicio' }); acertos(f, 2);
        expect(gp(f)).toBeCloseTo(0.01 + 0.1, 9);
    });
});

describe('IDs únicos e instâncias', () => {
    const todosIds = (r) => [...r.gatilhos.map(g => g.id), ...r.contadores.map(c => c.id)];
    it.each(RECEITAS.map(r => [r.id]))('%s: aplicar 2x e 3x no mesmo poder usa instâncias 1,2,3 sem colisão', (id) => {
        const params = { ...paramsPadraoReceita(R(id)), tetoTurnos: 3 };
        let idsG = []; let idsC = []; const geral = [];
        for (let i = 1; i <= 3; i++) {
            const r = R(id).construir(params, { idsGatilhos: idsG, idsContadores: idsC });
            r.gatilhos.forEach(g => expect(g.id).toMatch(new RegExp(`^rp_${id}_${i}_g\\d$`)));
            r.contadores.forEach(c => expect(c.id).toBe(`rp_${id}_${i}_c`));
            idsG = idsG.concat(r.gatilhos.map(g => g.id)); idsC = idsC.concat(r.contadores.map(c => c.id));
            geral.push(...todosIds(r));
        }
        expect(new Set(geral).size).toBe(geral.length);
    });
    it('contador já existente na FICHA força a próxima instância mesmo sem colisão de gatilho', () => {
        const r = R('acumularEConverter').construir({}, { idsGatilhos: [], idsContadores: ['rp_acumularEConverter_1_c'] });
        expect(r.contadores[0].id).toBe('rp_acumularEConverter_2_c'); expect(r.gatilhos[0].id).toBe('rp_acumularEConverter_2_g1');
    });
    it('gatilho do poder ocupando g2 da instância 1 (mas não g1) também pula', () => {
        const r = R('acumularEConverter').construir({}, { idsGatilhos: ['rp_acumularEConverter_1_g2'], idsContadores: [] });
        expect(r.gatilhos[0].id).toBe('rp_acumularEConverter_2_g1');
    });
    it('instância livre mais baixa é reaproveitada (buraco na numeração)', () => {
        const r = R('bonusACadaN').construir({}, { idsGatilhos: ['rp_bonusACadaN_1_g1', 'rp_bonusACadaN_1_g2', 'rp_bonusACadaN_3_g1'], idsContadores: [] });
        expect(r.gatilhos[0].id).toBe('rp_bonusACadaN_2_g1');
    });
    it('receita sem contador (ganhoPorEvento) ignora contadores da ficha com o id parecido; crescerPorTurno sem teto também', () => {
        expect(R('ganhoPorEvento').construir({}, { idsContadores: ['rp_ganhoPorEvento_1_c'] }).gatilhos[0].id).toBe('rp_ganhoPorEvento_1_g1');
        expect(R('crescerPorTurno').construir({ tetoTurnos: 0 }, { idsContadores: ['rp_crescerPorTurno_1_c'] }).gatilhos[0].id).toBe('rp_crescerPorTurno_1_g1');
        expect(R('crescerPorTurno').construir({ tetoTurnos: 2 }, { idsContadores: ['rp_crescerPorTurno_1_c'] }).gatilhos[0].id).toBe('rp_crescerPorTurno_2_g1');
    });
    it('ctx ausente, vazio, com null e com ids numéricos não quebra', () => {
        expect(() => R('bonusACadaN').construir({}, undefined)).not.toThrow();
        expect(() => R('bonusACadaN').construir({}, {})).not.toThrow();
        expect(() => R('bonusACadaN').construir({}, { idsGatilhos: null, idsContadores: null })).not.toThrow();
        expect(R('bonusACadaN').construir({}, { idsGatilhos: [1, 2] }).gatilhos[0].id).toBe('rp_bonusACadaN_1_g1');
    });
    it('3 instâncias aplicadas no motor trabalham de forma independente (cada uma com seu contador)', () => {
        let g = []; let c = []; const gatilhos = []; const contadores = [];
        for (let i = 0; i < 3; i++) {
            const r = R('bonusACadaN').construir({ n: 2, percentual: 1, modo: 'somar' }, { idsGatilhos: g, idsContadores: c });
            g = g.concat(r.gatilhos.map(x => x.id)); c = c.concat(r.contadores.map(x => x.id));
            gatilhos.push(...r.gatilhos); contadores.push(...r.contadores);
        }
        const f = fichaCom({ gatilhos: gatilhos.slice(0, LIMITE_GATILHOS_POR_FONTE), contadores });
        acertos(f, 2);
        expect(gp(f)).toBeCloseTo(0.03, 9);
    });
});

describe('conferirLimitesProgressao', () => {
    const um = () => R('ganhoPorEvento').construir({}, {});
    const dois = () => R('acumularEConverter').construir({}, {});
    it('8 gatilhos por poder: 6 + 2 = 8 passa; 7 + 2 = 9 bloqueia', () => {
        expect(conferirLimitesProgressao(dois(), { gatilhos: 6, contadores: 0 }).ok).toBe(true);
        const c = conferirLimitesProgressao(dois(), { gatilhos: 7, contadores: 0 });
        expect(c.ok).toBe(false); expect(c.erro).toContain('8'); expect(c.erro).toContain('9');
    });
    it('1 gatilho em poder com 8 bloqueia; com 7 passa', () => {
        expect(conferirLimitesProgressao(um(), { gatilhos: 8 }).ok).toBe(false);
        expect(conferirLimitesProgressao(um(), { gatilhos: 7 }).ok).toBe(true);
    });
    it('12 contadores por ficha: 11 + 1 passa; 12 + 1 bloqueia', () => {
        expect(conferirLimitesProgressao(dois(), { gatilhos: 0, contadores: LIMITE_CONTADORES - 1 }).ok).toBe(true);
        const c = conferirLimitesProgressao(dois(), { gatilhos: 0, contadores: LIMITE_CONTADORES });
        expect(c.ok).toBe(false); expect(c.erro).toContain('12'); expect(c.erro).toContain('13');
    });
    it('receita sem contador não é bloqueada por ficha com 12 contadores', () => {
        expect(conferirLimitesProgressao(um(), { gatilhos: 0, contadores: 12 }).ok).toBe(true);
    });
    it('existentes ausente = zero; resultado sem gatilhos vira erro; avisos são copiados', () => {
        expect(conferirLimitesProgressao(um()).ok).toBe(true);
        const vazio = conferirLimitesProgressao({ gatilhos: [], contadores: [], avisos: ['a'] }, {});
        expect(vazio.ok).toBe(false); expect(vazio.avisos).toEqual(['a']); expect(vazio.erro).toMatch(/nenhum gatilho/);
        expect(conferirLimitesProgressao({ gatilhos: um().gatilhos, contadores: [], avisos: ['x', 'y'] }).avisos).toEqual(['x', 'y']);
    });
    it('resumirResultado conta gatilhos/contadores e lista nomes', () => {
        const r = dois(); const s = resumirResultado(r);
        expect(s).toEqual({ gatilhos: 2, contadores: 1, nomes: r.gatilhos.map(g => g.nome) });
    });
});

describe('Nada é descartado em silêncio', () => {
    it('avisos é sempre um array, em todas as receitas e com params lixo', () => {
        RECEITAS.forEach(rc => ['x', null, {}, { percentual: 'abc', n: 'z' }].forEach(p => expect(Array.isArray(rc.construir(p, {}).avisos)).toBe(true)));
    });
    it('params lixo ainda produzem gatilhos válidos e nenhum aviso (valores caem no padrão)', () => {
        RECEITAS.forEach((rc) => { const r = rc.construir({ percentual: 'abc', n: 'z', pontos: {}, evento: 7 }, {}); expect(r.gatilhos.length).toBeGreaterThan(0); expect(r.avisos).toEqual([]); });
    });
    it('contrato: gatilhos + descartados == o que a receita pediu (acumularEConverter pede 2 e entrega 2)', () => {
        const r = R('acumularEConverter').construir({}, {});
        expect(r.gatilhos.length + r.avisos.length).toBe(2);
    });
});

describe('restaurarUsosPorCena', () => {
    const gatilho = (id, por) => ({ id, nome: id, evento: { tipo: 'acertou', nivel: 'qualquer' }, acoes: [{ tipo: 'contador', id: 'x', op: 'somar', valor: 1 }], limite: { max: 1, por } });
    const base = (poderes, usos) => ({ vida: { atual: 1 }, poderes, inventario: [], passivas: [], contadores: [], combate: { usosPoderes: usos } });
    it('apaga usos por cena de gatilhos e preserva descanso e turno', () => {
        const f = base([{ id: 'p', nome: 'P', ativa: true, gatilhos: [gatilho('c', 'cena'), gatilho('d', 'descanso'), gatilho('t', 'turno')] }], {
            'p:c': { n: 1, cena: 'c1' }, 'p:d': { n: 1, cena: 'c1' }, 'p:t': { n: 1, cena: 'c1', turno: true },
        });
        expect(restaurarUsosPorCena(f)).toBe(true);
        expect(f.combate.usosPoderes['p:c']).toBeUndefined();
        expect(f.combate.usosPoderes['p:d']).toEqual({ n: 1, cena: 'c1' });
        expect(f.combate.usosPoderes['p:t']).toEqual({ n: 1, cena: 'c1', turno: true });
    });
    it('poder com usosPor cena (limite de ligar) é limpo; usosPor descanso não', () => {
        const f = base([{ id: 'a', nome: 'A', usosMax: 2, usosPor: 'cena' }, { id: 'b', nome: 'B', usosMax: 2, usosPor: 'descanso' }], { a: { n: 2, cena: 'c1' }, b: { n: 2, cena: 'c1' } });
        expect(restaurarUsosPorCena(f)).toBe(true);
        expect(f.combate.usosPoderes).toEqual({ b: { n: 2, cena: 'c1' } });
    });
    it('poder DESLIGADO também é limpo (gatilho com uso guardado)', () => {
        const f = base([{ id: 'p', nome: 'P', ativa: false, gatilhos: [gatilho('c', 'cena')] }], { 'p:c': { n: 1, cena: 'c1' } });
        expect(restaurarUsosPorCena(f)).toBe(true);
    });
    it('apaga o objeto usosPoderes quando fica vazio; devolve false sem nada a limpar', () => {
        const f = base([{ id: 'p', nome: 'P', ativa: true, gatilhos: [gatilho('c', 'cena')] }], { 'p:c': { n: 1, cena: 'c1' } });
        restaurarUsosPorCena(f); expect('usosPoderes' in f.combate).toBe(false);
        expect(restaurarUsosPorCena(f)).toBe(false);
    });
    it('entradas ausentes/lixo não quebram', () => {
        [null, undefined, {}, { combate: {} }, { combate: { usosPoderes: null } }, { combate: { usosPoderes: 5 } }, { combate: { usosPoderes: {} }, poderes: [null, 3, 'x'] }]
            .forEach(f => expect(() => restaurarUsosPorCena(f)).not.toThrow());
        expect(restaurarUsosPorCena({ combate: { usosPoderes: { zz: { n: 1 } } }, poderes: [null] })).toBe(false);
    });
    it('uso de chave desconhecida (sem poder) nunca é apagado', () => {
        const f = base([], { 'fantasma:g': { n: 1, cena: 'c1' } });
        expect(restaurarUsosPorCena(f)).toBe(false); expect(f.combate.usosPoderes['fantasma:g']).toBeTruthy();
    });
    it('fimDeLuta: um gatilho fimDeLuta com limite 1 por cena dispara UMA vez por combate (1ª, 2ª e 3ª lutas)', () => {
        const g = { id: 'fim', nome: 'Fim', evento: { tipo: 'fimDeLuta' }, acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'somar', valor: 5 }], limite: { max: 1, por: 'cena' } };
        const f = base([{ id: 'p', nome: 'P', ativa: true, gatilhos: [g] }], undefined);
        delete f.combate.usosPoderes;
        for (let i = 1; i <= 3; i++) {
            const res = disparar(f, { tipo: 'fimDeLuta' });
            expect(res.disparou).toBe(true);
            expect(gp(f)).toBeCloseTo(0.05 * i, 9); // exatamente +5% por combate, nunca 2x no mesmo
        }
    });
    it('fimDeLuta devolve caminho combate/usosPoderes e a gravação em outro jogador não tem undefined', () => {
        const f = fichaCom(R('ganhoPorEvento').construir({ percentual: 1, modo: 'somar', limiteUsos: 1, limitePor: 'cena' }, {}));
        acertos(f, 2);
        const antes = JSON.parse(JSON.stringify(f));
        const res = disparar(f, { tipo: 'fimDeLuta' });
        expect(res.caminhos).toContain('combate/usosPoderes');
        const campos = camposParaGravar(f, res.caminhos);
        expect(campos['combate/usosPoderes']).toBeNull(); // apagado = null no Firebase
        Object.values(campos).forEach(v => expect(v).not.toBeUndefined());
        expect(JSON.stringify(campos)).not.toContain('undefined');
        const dif = camposDeGatilhosAlterados(antes, f);
        expect(dif).toHaveProperty('combate/usosPoderes'); expect(dif['combate/usosPoderes']).toBeNull();
    });
    it('fimDeLuta sem nenhum uso por cena não inclui o caminho', () => {
        const f = fichaCom(R('ganhoPorEvento').construir({}, {}));
        const res = disparar(f, { tipo: 'fimDeLuta' });
        expect(res.caminhos).not.toContain('combate/usosPoderes');
    });
    it('só o fimDeLuta restaura: turnoInicio/acertou não apagam usos por cena', () => {
        const f = fichaCom(R('ganhoPorEvento').construir({ limiteUsos: 3, limitePor: 'cena' }, {}));
        acertos(f, 1); const k = Object.keys(f.combate.usosPoderes)[0];
        disparar(f, { tipo: 'turnoInicio' }); disparar(f, { tipo: 'turnoFim' });
        expect(f.combate.usosPoderes[k].n).toBe(1);
    });
    it('fimDeLuta não toca nos usos por descanso do MESMO poder que tem gatilho por cena', () => {
        const a = R('ganhoPorEvento').construir({ limiteUsos: 1, limitePor: 'cena' }, {});
        const b = R('ganhoPorEvento').construir({ limiteUsos: 1, limitePor: 'descanso' }, { idsGatilhos: a.gatilhos.map(g => g.id) });
        const f = fichaCom({ gatilhos: [...a.gatilhos, ...b.gatilhos], contadores: [] });
        acertos(f, 2);
        expect(Object.keys(f.combate.usosPoderes)).toHaveLength(2);
        disparar(f, { tipo: 'fimDeLuta' });
        expect(Object.keys(f.combate.usosPoderes)).toEqual([`p1:${b.gatilhos[0].id}`]);
    });
});

describe('Adaptação por diferença de Poder no fimDeLuta (core)', () => {
    const fx = (c, extra = {}) => ({ vida: { atual: 1 }, poderes: [], contadores: [], combate: c, ...extra });
    it('fimDeLuta converte a média das % em permanente, zera F e devolve os caminhos', () => {
        const on = fx({ adaptacaoLigada: true, adaptacaoFator: 1.3125, adaptacaoSoma: 30, adaptacaoTurnos: 2, adaptacaoUltimo: { gain: 25 } });
        const res = disparar(on, { tipo: 'fimDeLuta' });
        expect(on.ganhosPermanentes.poderCalculado).toBeCloseTo(0.15, 9);
        expect(on.combate).toMatchObject({ adaptacaoFator: 1, adaptacaoSoma: 0, adaptacaoTurnos: 0 });
        expect(on.combate.adaptacaoUltimo).toBeUndefined();
        expect(res.caminhos).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado', 'combate/adaptacaoFator', 'combate/adaptacaoSoma', 'combate/adaptacaoTurnos', 'combate/adaptacaoUltimo']));
        expect(res.textos.some(t => /Adaptação/.test(t))).toBe(true);
        const campos = camposParaGravar(on, res.caminhos);
        expect(campos['ganhosPermanentes/poderCalculado']).toBeCloseTo(0.15, 9);
        expect(campos['combate/adaptacaoUltimo']).toBeNull();
        Object.values(campos).forEach(v => expect(v).not.toBeUndefined());
    });
    it('é idempotente: um segundo fimDeLuta não converte de novo nem gera caminhos', () => {
        const on = fx({ adaptacaoFator: 1.1, adaptacaoSoma: 10, adaptacaoTurnos: 1 });
        disparar(on, { tipo: 'fimDeLuta' });
        const res2 = disparar(on, { tipo: 'fimDeLuta' });
        expect(on.ganhosPermanentes.poderCalculado).toBeCloseTo(0.1, 9);
        expect(res2.caminhos).not.toContain('ganhosPermanentes/poderCalculado');
        expect(res2.caminhos).not.toContain('combate/adaptacaoFator');
    });
    it('ficha antiga (campos legados) e sem turnos: nada muda e nenhum caminho de Adaptação', () => {
        const x = fx({ municoAuto: true, municoTurnos: 7, municoPorTurno: 5 });
        const res = disparar(x, { tipo: 'fimDeLuta' });
        expect(x.combate.municoTurnos).toBe(7);
        expect(x.ganhosPermanentes).toBeUndefined();
        expect(res.caminhos.filter(c => /adaptacao/.test(c))).toEqual([]);
    });
    it('descansarCompleto NÃO zera a Adaptação (a conversão é do fimDeLuta que vem depois)', () => {
        const x = fx({ adaptacaoFator: 1.2, adaptacaoSoma: 20, adaptacaoTurnos: 1 }, { vida: { atual: 1, base: 1 } });
        descansarCompleto(x);
        expect(x.combate).toMatchObject({ adaptacaoFator: 1.2, adaptacaoTurnos: 1 });
        disparar(x, { tipo: 'fimDeLuta' });
        expect(x.ganhosPermanentes.poderCalculado).toBeCloseTo(0.2, 9);
    });
    it('o fator de combate F multiplica o Poder Calculado (só durante o combate)', () => {
        const base = { vida: { base: 600000 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 100 }, divisores: { vida: 1e-12 }, bio: {}, estetica: {}, labels: {}, inventario: [], seresSelados: [] };
        const sem = calcularPoderAtual({ ...base, combate: {} }, 1).poderExato;
        const com = calcularPoderAtual({ ...base, combate: { adaptacaoFator: 1.3125 } }, 1).poderExato;
        expect(com / sem).toBeCloseTo(1.3125, 3);
    });
});
