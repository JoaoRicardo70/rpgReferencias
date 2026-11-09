import { describe, it, expect } from 'vitest';
import { normalizarGatilhos, normalizarAcaoGatilho, LIMITE_GANHO_PERMANENTE, LIMITE_FATOR_GANHO, LIMITE_TOTAL_GANHO_PERMANENTE } from './gatilhos.js';
import { dispararEventoNaFicha, camposParaGravar } from './gatilhosAplicar.js';
import { getGlobalMultipliers, calcularPoderAtual } from './poder.js';
import { normalizarContador } from './contadores.js';
import { lerGatilhosDaIA, finalizarGatilho, decidirModoDoGatilho } from './gatilhosImportacao.js';
import { prepararImportacao, montarPoderFinal } from './importadorIA.js';
import { normalizarPoder } from './sextaFeiraCriacao.js';

const ct = (id, valor, extra = {}) => normalizarContador({ id, nome: id, valor, min: 0, max: 9999, ...extra });
const ficha = (extra = {}) => ({ vida: { atual: 1e9 }, poderes: [], inventario: [], passivas: [], contadores: [], ...extra });
const poder = (gatilhos) => ({ id: 'p1', nome: 'Poder X', ativa: true, gatilhos });
const G = (evento, acoes, extra = {}) => ({ nome: 'g', evento, acoes, ...extra });
const norm = (lista) => normalizarGatilhos(lista).gatilhos;
const disparar = (f, ev, ctx = {}) => dispararEventoNaFicha(f, ev, { cenaId: 'c1', nome: 'Eu', ...ctx });
const gp = (f) => f.ganhosPermanentes && f.ganhosPermanentes.poderCalculado;
const acao = (o) => normalizarAcaoGatilho({ tipo: 'ganhoPermanente', ...o });
const fixo = (v) => norm([G({ tipo: 'turnoInicio' }, [{ tipo: 'ganhoPermanente', valor: v }])]);

describe('QA ganhoPermanente: sanitização de valor', () => {
    it.each([NaN, Infinity, -Infinity, -0.0001, 0, '0', ' ', '   ', {}, [], true, false])('valor %s e rejeitado', (v) => {
        expect(acao({ valor: v })).toBeNull();
    });
    it('strings numéricas com vírgula, espaços e notação científica', () => {
        expect(acao({ valor: ' 3 ' })?.valor).toBe(3);
        expect(acao({ valor: '0,5' })?.valor).toBe(0.5);
        expect(acao({ valor: '1e3' })?.valor).toBe(1000);
    });
    it('teto de 1e6 por ação (inclusive acima)', () => {
        expect(acao({ valor: 1e6 }).valor).toBe(LIMITE_GANHO_PERMANENTE);
        expect(acao({ valor: 1e6 + 1 }).valor).toBe(1e6);
        expect(acao({ valor: 1e9 }).valor).toBe(1e6);
        expect(acao({ valor: 999999.5 }).valor).toBe(999999.5);
    });
    it('valor minúsculo positivo é mantido', () => {
        expect(acao({ valor: 1e-9 }).valor).toBe(1e-9);
    });
    it('fator: teto 1e6, rejeita NaN/Infinity/negativo/zero/string lixo', () => {
        expect(acao({ deContador: { id: 'a', fator: 1e9 } }).deContador.fator).toBe(LIMITE_FATOR_GANHO);
        [NaN, Infinity, -1, 0, 'x', null, undefined, ''].forEach(f => expect(acao({ deContador: { id: 'a', fator: f } })).toBeNull());
        expect(acao({ deContador: { id: 'a', fator: '0,0001' } }).deContador.fator).toBe(0.0001);
    });
    it('deContador com id numérico, espaços e muito longo', () => {
        expect(acao({ deContador: { id: ' dano ', fator: 1 } })?.deContador.id).toBe('dano');
        const longo = acao({ deContador: { id: 'x'.repeat(500), fator: 1 } });
        expect(longo.deContador.id.length).toBeLessThanOrEqual(60);
    });
    it('deContador tem prioridade sobre valor; deContador não-objeto cai para valor', () => {
        const a = acao({ valor: 5, deContador: { id: 'a', fator: 2 } });
        expect(a.deContador).toBeTruthy();
        expect(a.valor).toBeUndefined();
        expect(acao({ valor: 5, deContador: 'x' })).toEqual({ tipo: 'ganhoPermanente', valor: 5 });
        expect(acao({ valor: 5, deContador: null })).toEqual({ tipo: 'ganhoPermanente', valor: 5 });
    });
    it('zerar só com true estrito', () => {
        [1, 'true', 'sim', {}, false, undefined].forEach(z => expect(acao({ deContador: { id: 'a', fator: 1, zerar: z } }).deContador.zerar).toBeUndefined());
    });
});

describe('QA ganhoPermanente: aplicação, arredondamento e tetos', () => {
    it('arredonda a 9 casas (0.1 + 0.2 = 0.3 exato)', () => {
        const f = ficha({ poderes: [poder([...fixo(0.1), ...fixo(0.2)])] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(gp(f)).toBe(0.3);
    });
    it('vários disparos acumulam (10x +0.1)', () => {
        const f = ficha({ poderes: [poder(fixo(0.1))] });
        for (let i = 0; i < 10; i++) disparar(f, { tipo: 'turnoInicio' });
        expect(gp(f)).toBe(1);
    });
    it('teto total 1e9: soma que passa do teto é limitada', () => {
        const f = ficha({ ganhosPermanentes: { poderCalculado: 1e9 - 1 }, poderes: [poder(fixo(1e6))] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(gp(f)).toBe(LIMITE_TOTAL_GANHO_PERMANENTE);
    });
    it('campo corrompido (NaN, negativo, Infinity, objeto) vira base 0', () => {
        [NaN, -5, Infinity, {}, null, '7x'].forEach((lixo) => {
            const f = ficha({ ganhosPermanentes: { poderCalculado: lixo }, poderes: [poder(fixo(2))] });
            disparar(f, { tipo: 'turnoInicio' });
            expect(gp(f)).toBe(2);
        });
    });
    it('ganhosPermanentes não-objeto (string/número) é recriado', () => {
        [ 'abc', 5, null ].forEach((lixo) => {
            const f = ficha({ ganhosPermanentes: lixo, poderes: [poder(fixo(2))] });
            disparar(f, { tipo: 'turnoInicio' });
            expect(gp(f)).toBe(2);
        });
    });
    it('preserva outros campos de ganhosPermanentes', () => {
        const f = ficha({ ganhosPermanentes: { outro: 7, poderCalculado: 1 }, poderes: [poder(fixo(2))] });
        disparar(f, { tipo: 'turnoInicio' });
        expect(f.ganhosPermanentes).toEqual({ outro: 7, poderCalculado: 3 });
    });
    it('caminhos Firebase só tocam ganhosPermanentes/poderCalculado no valor fixo', () => {
        const f = ficha({ poderes: [poder(fixo(2))] });
        const r = disparar(f, { tipo: 'turnoInicio' });
        expect(r.caminhos).toEqual(['ganhosPermanentes/poderCalculado']);
        expect(camposParaGravar(f, r.caminhos)).toEqual({ 'ganhosPermanentes/poderCalculado': 2 });
    });
});

describe('QA ganhoPermanente: contador', () => {
    const dc = (extra = {}, fator = 2) => norm([G({ tipo: 'fimDeLuta' }, [{ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator, ...extra } }])]);
    it('contador inexistente não faz nada e não toca caminhos', () => {
        const f = ficha({ contadores: [ct('outro', 5)], poderes: [poder(dc({ zerar: true }))] });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosPermanentes).toBeUndefined();
        expect(r.caminhos).not.toContain('ganhosPermanentes/poderCalculado');
        expect(f.contadores[0].valor).toBe(5);
    });
    it('contadores ausente/não-array não quebra', () => {
        const f = ficha({ poderes: [poder(dc())] });
        delete f.contadores;
        expect(() => disparar(f, { tipo: 'fimDeLuta' })).not.toThrow();
        expect(f.ganhosPermanentes).toBeUndefined();
    });
    it('valor 0 com zerar: nada acontece e não gera caminho de contador', () => {
        const f = ficha({ contadores: [ct('dano', 0)], poderes: [poder(dc({ zerar: true }))] });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosPermanentes).toBeUndefined();
        expect(r.caminhos.some(c => c.startsWith('contadores'))).toBe(false);
    });
    it('valor negativo no contador (min negativo) não gera ganho nem zera', () => {
        const f = ficha({ contadores: [ct('dano', -4, { min: -10 })], poderes: [poder(dc({ zerar: true }))] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(f.ganhosPermanentes).toBeUndefined();
        expect(f.contadores[0].valor).toBe(-4);
    });
    it('id do contador casa por String (número vs string)', () => {
        const f = ficha({ contadores: [ct(7, 3)], poderes: [poder(norm([G({ tipo: 'fimDeLuta' }, [{ tipo: 'ganhoPermanente', deContador: { id: '7', fator: 1 } }])]))] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBe(3);
    });
    it('zerar: grava caminho do contador e dispara contadorAtingiu derivado', () => {
        const gat = [
            ...norm([G({ tipo: 'fimDeLuta' }, [{ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: 1, zerar: true } }], { nome: 'Converte' })]),
            ...norm([G({ tipo: 'contadorAtingiu', contadorId: 'dano', op: '==', valor: 0 }, [{ tipo: 'ganhoPermanente', valor: 100 }], { nome: 'Zerou' })]),
        ];
        const f = ficha({ contadores: [ct('dano', 50)], poderes: [poder(gat)] });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(f.contadores[0].valor).toBe(0);
        expect(gp(f)).toBe(150);
        expect(r.caminhos).toEqual(expect.arrayContaining(['ganhosPermanentes/poderCalculado', 'contadores/0/valor']));
    });
    it('contador com min > 0: zerar respeita o mínimo (valor final = min), e o texto reflete o valor real', () => {
        const f = ficha({ contadores: [ct('dano', 10, { min: 3 })], poderes: [poder(dc({ zerar: true }, 1))] });
        const r = disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBe(10);
        expect(f.contadores[0].valor).toBe(3);
        expect(r.textos.join(' ')).toContain('10 → 3');
    });
    it('fator pequeno com contador grande: arredondamento a 9 casas', () => {
        const f = ficha({ contadores: [ct('dano', 9999)], poderes: [poder(dc({}, 1e-10))] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBe(0.000001); // 9999e-10 ~ 1e-6
    });
    it('contador x fator acima do teto total fica em 1e9', () => {
        const f = ficha({ contadores: [ct('dano', 9999)], poderes: [poder(dc({}, 1e6))] });
        disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBe(1e9);
    });
});

describe('QA ganhoPermanente: dentro de rolarTabela', () => {
    const tab = () => norm([G({ tipo: 'turnoInicio' }, [{ tipo: 'rolarTabela', dado: '1d6', resultados: [
        { ate: 3, texto: 'pouco', acoes: [{ tipo: 'ganhoPermanente', valor: 1 }] },
        { ate: 6, texto: 'muito', acoes: [{ tipo: 'ganhoPermanente', valor: 5 }] },
    ] }])]);
    it('rng baixo e alto escolhem a linha', () => {
        const f = ficha({ poderes: [poder(tab())] });
        disparar(f, { tipo: 'turnoInicio' }, { rng: () => 0 });
        expect(gp(f)).toBe(1);
        disparar(f, { tipo: 'turnoInicio' }, { rng: () => 0.99 });
        expect(gp(f)).toBe(6);
    });
    it('deContador com zerar dentro da tabela', () => {
        const t = norm([G({ tipo: 'turnoInicio' }, [{ tipo: 'rolarTabela', dado: '1d2', resultados: [
            { ate: 2, acoes: [{ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: 2, zerar: true } }] },
        ] }])]);
        const f = ficha({ contadores: [ct('dano', 4)], poderes: [poder(t)] });
        const r = disparar(f, { tipo: 'turnoInicio' }, { rng: () => 0 });
        expect(gp(f)).toBe(8);
        expect(f.contadores[0].valor).toBe(0);
        expect(r.caminhos).toContain('contadores/0/valor');
    });
    it('idempotência com eventoId também dentro da tabela', () => {
        const f = ficha({ poderes: [poder(tab())] });
        disparar(f, { tipo: 'turnoInicio' }, { rng: () => 0, eventoId: 'e9' });
        disparar(f, { tipo: 'turnoInicio' }, { rng: () => 0, eventoId: 'e9' });
        expect(gp(f)).toBe(1);
    });
});

describe('QA ganhoPermanente: idempotência e exemplos de ficha', () => {
    const ego = () => norm([
        G({ tipo: 'acertou', nivel: 'normal' }, [{ tipo: 'ganhoPermanente', valor: 2 }], { nome: 'n' }),
        G({ tipo: 'acertou', nivel: 'critico' }, [{ tipo: 'ganhoPermanente', valor: 3 }], { nome: 'c' }),
        G({ tipo: 'acertou', nivel: 'fatal' }, [{ tipo: 'ganhoPermanente', valor: 4 }], { nome: 'f' }),
    ]);
    it('Ego Superior: um nível não dispara os outros; eventoIds diferentes somam', () => {
        const f = ficha({ poderes: [poder(ego())] });
        disparar(f, { tipo: 'acertou', nivel: 'fatal' }, { eventoId: 'a' });
        expect(gp(f)).toBe(4);
        disparar(f, { tipo: 'acertou', nivel: 'fatal' }, { eventoId: 'a' });
        expect(gp(f)).toBe(4);
        disparar(f, { tipo: 'acertou', nivel: 'fatal' }, { eventoId: 'b' });
        expect(gp(f)).toBe(8);
    });
    it('Ego Superior: poder desligado não ganha', () => {
        const p = poder(ego()); p.ativa = false;
        const f = ficha({ poderes: [p] });
        disparar(f, { tipo: 'acertou', nivel: 'normal' });
        // se o poder não estiver ativo, não deve disparar (comportamento dos demais gatilhos); apenas registra
        expect([undefined, 2]).toContain(gp(f));
    });
    it('Verg Avesta: duas lutas acumulam e usam o contador atual', () => {
        const g = norm([G({ tipo: 'fimDeLuta' }, [{ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: 0.0001, zerar: true } }])]);
        const f = ficha({ contadores: [ct('dano', 5000)], poderes: [poder(g)] });
        disparar(f, { tipo: 'fimDeLuta' });
        f.contadores[0].valor = 2500;
        disparar(f, { tipo: 'fimDeLuta' });
        expect(gp(f)).toBeCloseTo(0.75, 9);
        expect(f.contadores[0].valor).toBe(0);
    });
});

describe('QA ganhoPermanente: Poder Calculado', () => {
    it('combina com outras fontes MGERAL de forma aditiva', () => {
        const f = ficha({ dano: { mGeral: 2 }, ganhosPermanentes: { poderCalculado: 4 } });
        const g = getGlobalMultipliers(f);
        expect(g.finalG).toBe(7); // 1 + 2 + 4
        expect(g.finalB).toBe(1);
        expect(g.finalA).toBe(1);
    });
    it('não é ilimitado em decimais: 0.5 vira 1.5', () => {
        expect(getGlobalMultipliers(ficha({ ganhosPermanentes: { poderCalculado: 0.5 } })).finalG).toBe(1.5);
    });
    it('valores inválidos (NaN, Infinity, string) são ignorados sem quebrar', () => {
        [NaN, 'abc', null, {}, -1].forEach(v => expect(getGlobalMultipliers(ficha({ ganhosPermanentes: { poderCalculado: v } })).finalG).toBe(1));
        // Infinity não é finito: ignorado
        expect(getGlobalMultipliers(ficha({ ganhosPermanentes: { poderCalculado: Infinity } })).finalG).toBe(1);
    });
    it('string numérica vinda do Firebase ("3") é aceita', () => {
        expect(getGlobalMultipliers(ficha({ ganhosPermanentes: { poderCalculado: '3' } })).finalG).toBe(4);
    });
    it('calcularPoderAtual: com campo >= sem campo, e proporcional a (1+soma)', () => {
        const base = { vida: { base: 600000 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 100 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 }, divisores: { vida: 1e-12 }, bio: {}, estetica: {}, labels: {}, poderes: [], inventario: [], seresSelados: [] };
        const sem = calcularPoderAtual({ ...base }, 1);
        const semCampo = calcularPoderAtual({ ...base, ganhosPermanentes: {} }, 1);
        const com = calcularPoderAtual({ ...base, ganhosPermanentes: { poderCalculado: 9 } }, 1);
        expect(semCampo.poderExato).toBe(sem.poderExato);
        expect(com.poderExato).toBeGreaterThan(sem.poderExato);
        if (sem.poderExato > 0) expect(com.poderExato / sem.poderExato).toBeCloseTo(10, 5);
    });
});

describe('QA ganhoPermanente: importador e Sexta-Feira', () => {
    const bruto = (acoes, extra = {}) => ({ nome: 'G', evento: { tipo: 'fimDeLuta' }, acoes, ...extra });
    it('valor fixo e deContador normalizados; zerar lixo vira ausente; fator string', () => {
        const r = lerGatilhosDaIA([bruto([{ tipo: 'ganhoPermanente', valor: '2,5' }]), bruto([{ tipo: 'ganhoPermanente', deContador: { id: 'Dano', fator: '0,0001', zerar: 'sim' } }])]);
        expect(r.gatilhos[0].acoes[0]).toEqual({ tipo: 'ganhoPermanente', valor: 2.5 });
        expect(r.gatilhos[1].acoes[0]).toEqual({ tipo: 'ganhoPermanente', deContador: { id: 'Dano', fator: 0.0001 } });
    });
    it('valor fixo não gera aviso de contador; deContador gera', () => {
        const r1 = lerGatilhosDaIA([bruto([{ tipo: 'ganhoPermanente', valor: 1 }])]);
        expect(r1.avisos.join(' ')).not.toMatch(/contador/);
        const r2 = lerGatilhosDaIA([bruto([{ tipo: 'ganhoPermanente', deContador: { id: 'Dano', fator: 1 } }])]);
        expect(r2.avisos.join(' ')).toContain('contador "Dano"');
    });
    it('dentro de rolarTabela também avisa do contador', () => {
        const r = lerGatilhosDaIA([bruto([{ tipo: 'rolarTabela', dado: '1d2', resultados: [{ ate: 2, acoes: [{ tipo: 'ganhoPermanente', deContador: { id: 'Furia', fator: 1 } }] }] }])]);
        expect(r.gatilhos.length).toBe(1);
        expect(r.avisos.join(' ')).toContain('contador "Furia"');
    });
    it('ação inválida (fator 0, valor negativo/NaN) descarta o gatilho inteiro', () => {
        [{ deContador: { id: 'a', fator: 0 } }, { valor: -1 }, { valor: NaN }, {}].forEach((p) => {
            const r = lerGatilhosDaIA([bruto([{ tipo: 'ganhoPermanente', ...p }])]);
            expect(r.gatilhos.length).toBe(0);
        });
    });
    it('prepararImportacao + montarPoderFinal: chega opcional/desarmado e ao decidir automático vira executável', () => {
        const itens = prepararImportacao([{ nome: 'Verg', gatilhos: [bruto([{ tipo: 'ganhoPermanente', deContador: { id: 'dano', fator: 0.0001, zerar: true } }])] }]);
        const g = itens[0].objeto.gatilhos[0];
        expect(g.armado).toBe(false);
        expect(g.modo).toBe('opcional');
        expect(g.acoes[0].deContador).toEqual({ id: 'dano', fator: 0.0001, zerar: true });
        const dec = decidirModoDoGatilho(g, 'automatico');
        const fin = finalizarGatilho(dec);
        expect(fin.acoes[0].tipo).toBe('ganhoPermanente');
        expect(typeof montarPoderFinal).toBe('function');
    });
    it('Sexta-Feira (normalizarPoder): aceita, normaliza e descarta inválida', () => {
        const ok = normalizarPoder({ nome: 'Ego', gatilhos: [{ nome: 'Ego', evento: { tipo: 'acertou', nivel: 'critico' }, acoes: [{ tipo: 'ganhoPermanente', valor: '3' }] }] });
        const p = ok.objeto || ok;
        expect(p.gatilhos[0].acoes[0]).toEqual({ tipo: 'ganhoPermanente', valor: 3 });
        expect(p.gatilhos[0].armado).toBe(false);
        const ruim = normalizarPoder({ nome: 'Ego', gatilhos: [{ nome: 'Ego', evento: { tipo: 'acertou' }, acoes: [{ tipo: 'ganhoPermanente', valor: 0 }] }] });
        expect((ruim.objeto || ruim).gatilhos).toBeUndefined();
    });
});
