import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Novo from './DefesaFormContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';

// QA Fase 2 - Defesa > Receber Dano: evento `atingido` (Furia: -2 / 1d3), God Mode, escudo, nivel do golpe.
// P1 NAO-REGRESSAO: diferencial com a copia do HEAD (DefesaFormContext.qaf2old.jsx; sem ela os blocos sao pulados).
const velhos = import.meta.glob('./DefesaFormContext.qaf2old.jsx', { eager: true });
const Velho = velhos['./DefesaFormContext.qaf2old.jsx'] || null;

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn() }));
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularCA: vi.fn(() => 10) }));
vi.mock('../../core/disputaPoder', async (importOriginal) => ({ ...(await importOriginal()), getPoderParaDisputa: vi.fn(() => null) }));

const FATOR = 1000;
const VIDA_BASE = 200000000;
const G = (g) => ({ nome: 'g', ...g });
const ct = (id, extra = {}) => ({ id, nome: id, valor: 0, min: 0, max: 100, ...extra });
const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
let probe; let state;

function fichaReal(extra = {}) {
    return {
        vida: { base: VIDA_BASE, atual: VIDA_BASE, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' },
        mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: { vida: 0.0001 }, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        afinidades: {}, inventario: [], poderes: [], contadores: [], ...extra,
    };
}
function montar(Mod, ficha, feed = []) {
    state = {
        minhaFicha: ficha, meuNome: 'Eu', personagens: {}, dummies: {}, feedCombate: feed, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(ficha)), setAbaAtiva: vi.fn(), cenario: { ativa: 'cena1', zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    const Harness = () => { probe = Mod.useDefesaForm(); return null; };
    render(<Mod.DefesaFormProvider><Harness /></Mod.DefesaFormProvider>);
    return ficha;
}
function receber(dano) {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    act(() => { probe.sofrerDanoBruto(); });
}
const ultimoFeed = () => fb.enviarParaFeed.mock.calls.at(-1)[0];
const v = (f, id = 'f') => f.contadores.find(c => c.id === id).valor;
const furia = (acoes, extra = {}) => [{ id: 'pf', nome: 'Furia', ativa: true, gatilhos: [G({ id: 'f1', evento: { tipo: 'atingido' }, acoes, ...extra })] }];
let seq = 0;
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); seq = 0; vi.spyOn(Date, 'now').mockImplementation(() => 1700000000000 + (seq++)); vi.spyOn(Math, 'random').mockReturnValue(0.3); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------
const FICHAS = {
    simples: () => fichaReal(),
    escudo: () => fichaReal({ escudos: [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }] }),
    vtEscudo: () => fichaReal({ escudos: [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }, { id: 'b', nome: 'VT', valor: 50, tipo: 'vidaTemporaria' }] }),
    god: () => fichaReal({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } }),
    negar: () => fichaReal({ poderes: [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos: [NEGAR] }] }),
    reducao: () => fichaReal({ reducoesDano: [{ id: 'r', nome: 'Armadura', percentual: 50, elemento: 'todos' }] }),
    contadores: () => fichaReal({ contadores: [ct('f', { valor: 9 })] }),
    vidaBaixa: () => { const f = fichaReal(); f.vida.atual = 500 * FATOR; return f; },
};
describe.skipIf(!Velho)('P1 NAO-REGRESSAO - Defesa (Receber Dano) identica ao HEAD sem gatilhos de Fase 2', () => {
    it('matriz de fichas x danos (0, 1, 299, 300, 349, 350, 999999): mesma ficha final, feed e saves', () => {
        let n = 0;
        Object.entries(FICHAS).forEach(([fn, mk]) => [1, 299, 300, 349, 350, 351, 999999, 5000000].forEach((d) => {
            const rodar = (M) => { vi.clearAllMocks(); const f = montar(M, mk()); receber(d); const r = JSON.stringify(f).replace(/ev_[a-z0-9_]+/g, 'EV'); const c = JSON.stringify([fb.enviarParaFeed.mock.calls, fb.salvarFichaSilencioso.mock.calls.length]); cleanup(); return [r, c]; };
            const a = rodar(Velho); const b = rodar(Novo); n++;
            expect(b[0], `${fn} d=${d}`).toBe(a[0]); expect(b[1], `${fn} d=${d}`).toBe(a[1]);
        }));
        expect(n).toBe(Object.keys(FICHAS).length * 8);
    });
    it('com um golpe do feed (critico com estados) e Reflexo: mesmo resultado', () => {
        const feed = [{ tipo: 'dano', ts: 7, nome: 'Vilao', dano: 100, estadosGolpe: [{ estado: 'queimado', stacks: 1, chance: 100 }], golpeCritico: true }];
        const rodar = (M) => { vi.clearAllMocks(); const f = montar(M, fichaReal(), feed); receber(1000); const r = JSON.stringify(f).replace(/ev_[a-z0-9_]+/g, 'EV'); const c = JSON.stringify(fb.enviarParaFeed.mock.calls); cleanup(); return [r, c]; };
        expect(rodar(Novo)).toEqual(rodar(Velho));
    });
    it('sanidade: receber 1000 realmente tira 1000 de vida e sai no feed', () => {
        const f = montar(Novo, fichaReal()); receber(1000);
        expect(f.vida.atual).toBe(VIDA_BASE - 1000 * FATOR); expect(ultimoFeed().texto).toContain('Recebeu');
    });
});

describe('NAO-REGRESSAO (valores a mao)', () => {
    it('ficha antiga sem os campos novos: nao ganha combate/contadores e o feed nao tem selo', () => {
        const f = montar(Novo, fichaReal()); delete f.contadores; receber(1000);
        expect(f.vida.atual).toBe(VIDA_BASE - 1000 * FATOR); expect('combate' in f).toBe(false); expect('contadores' in f).toBe(false);
        expect(ultimoFeed().texto).not.toContain('🔔');
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('Fase 2 - atingido na Defesa (Furia)', () => {
    it('Furia: ser atingido tira 2 do contador (min 0); o feed leva a frase; a Vida cai normalmente', () => {
        const f = montar(Novo, fichaReal({ poderes: furia([{ tipo: 'contador', id: 'f', op: 'somar', valor: -2 }]), contadores: [ct('f', { valor: 5 })] }));
        receber(1000);
        expect(v(f)).toBe(3); expect(f.vida.atual).toBe(VIDA_BASE - 1000 * FATOR);
        expect(ultimoFeed().texto).toContain('🔔'); expect(ultimoFeed().texto).toContain('f 5 → 3');
        receber(1000); receber(1000);
        expect(v(f)).toBe(0); // piso 0
    });
    it('Furia com sorteio 1d3 (Math.random 0.3 -> 1): tira 2 + 1', () => {
        const f = montar(Novo, fichaReal({ poderes: furia([{ tipo: 'contador', id: 'f', op: 'somar', valor: -2 }, { tipo: 'contador', id: 'f', op: 'somar', valor: -1, sorteio: '1d3' }]), contadores: [ct('f', { valor: 9 })] }));
        receber(1000);
        expect(v(f)).toBe(9 - 2 - 1);
    });
    it('cada clique em Receber dano e um novo evento: dois cliques = dois disparos (eventoId unico)', () => {
        const f = montar(Novo, fichaReal({ poderes: furia([{ tipo: 'contador', id: 'f', op: 'somar', valor: 1 }]), contadores: [ct('f')] }));
        receber(10); receber(10);
        expect(v(f)).toBe(2);
    });
    it('God Mode: dano 0, escudo intacto, atingido NAO dispara', () => {
        const f = montar(Novo, fichaReal({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } }, escudos: [{ id: 'a', nome: 'Domo', valor: 100, tipo: 'escudo' }], poderes: furia([{ tipo: 'contador', id: 'f', op: 'somar', valor: 1 }]), contadores: [ct('f')] }));
        receber(5000);
        expect(f.vida.atual).toBe(VIDA_BASE); expect(f.escudos[0].valor).toBe(100); expect(v(f)).toBe(0);
    });
    it('escudo que absorve tudo: nao e atingido; escudo parcial: e', () => {
        const mk = (valor) => fichaReal({ escudos: [{ id: 'a', nome: 'Domo', valor, tipo: 'escudo' }], poderes: furia([{ tipo: 'contador', id: 'f', op: 'somar', valor: 1 }]), contadores: [ct('f')] });
        let f = montar(Novo, mk(500)); receber(100); expect(v(f)).toBe(0); cleanup();
        f = montar(Novo, mk(50)); receber(100); expect(v(f)).toBe(1);
    });
    it('dano 0 digitado: nao e atingido', () => {
        const f = montar(Novo, fichaReal({ poderes: furia([{ tipo: 'contador', id: 'f', op: 'somar', valor: 1 }]), contadores: [ct('f')] }));
        receber(0);
        expect(v(f)).toBe(0);
    });
    it('golpe critico do feed (com estados) chega como nivel critico; sem feed e nivel normal', () => {
        const feed = [{ tipo: 'dano', ts: 7, nome: 'Vilao', dano: 100, estadosGolpe: [{ estado: 'queimado', stacks: 1, chance: 100 }], golpeCritico: true }];
        const mkPoder = () => [{ id: 'pf', nome: 'F', ativa: true, gatilhos: [G({ id: 'f1', evento: { tipo: 'atingido', nivel: 'critico' }, acoes: [{ tipo: 'contador', id: 'f', op: 'somar', valor: 1 }] })] }];
        let f = montar(Novo, fichaReal({ poderes: mkPoder(), contadores: [ct('f')] }), feed);
        act(() => { probe.setAtacanteInc('p:Vilao'); }); receber(1000); expect(v(f)).toBe(1); cleanup();
        f = montar(Novo, fichaReal({ poderes: mkPoder(), contadores: [ct('f')] }), []); receber(1000); expect(v(f)).toBe(0);
    });
    it('Negar morte segura o golpe: Vida 1, atingido nao dispara, texto do Negar morte no feed (sem undefined)', () => {
        const f = montar(Novo, fichaReal({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [NEGAR, G({ id: 'f1', evento: { tipo: 'atingido' }, acoes: [{ tipo: 'contador', id: 'f', op: 'somar', valor: 1 }] })] }], contadores: [ct('f')] }));
        receber(VIDA_BASE);
        expect(f.vida.atual).toBe(1 * FATOR); expect(v(f)).toBe(0); expect(ultimoFeed().texto).toContain('Negar morte segurou em 1 de vida');
        expect(semUndefined([f.contadores, f.combate])).toBe(true);
    });
    it('golpe que mata ainda dispara atingido; contador com poder de Estagios nao quebra', () => {
        const f = montar(Novo, fichaReal({ poderes: furia([{ tipo: 'contador', id: 'f', op: 'somar', valor: 1 }]), contadores: [ct('f')] }));
        receber(VIDA_BASE);
        expect(f.vida.atual).toBe(0); expect(v(f)).toBe(1);
    });
    it('limite 1 por turno: dois golpes seguidos so contam o primeiro', () => {
        const f = montar(Novo, fichaReal({ poderes: furia([{ tipo: 'contador', id: 'f', op: 'somar', valor: 1 }], { limite: { max: 1, por: 'turno' } }), contadores: [ct('f')] }));
        receber(10); receber(10);
        expect(v(f)).toBe(1);
    });
    it('contador removido: ignora em silencio, golpe aplicado normalmente', () => {
        const f = montar(Novo, fichaReal({ poderes: furia([{ tipo: 'contador', id: 'sumiu', op: 'somar', valor: 1 }]), contadores: [ct('outro')] }));
        receber(1000);
        expect(f.vida.atual).toBe(VIDA_BASE - 1000 * FATOR); expect(ultimoFeed().texto).not.toContain('🔔');
    });
    it('Dano Verdadeiro tambem e "atingido" (e so God Mode que anula)', () => {
        const f = montar(Novo, fichaReal({ poderes: furia([{ tipo: 'contador', id: 'f', op: 'somar', valor: 1 }]), contadores: [ct('f')], afinidades: { imunidades: ['fisico'] } }));
        act(() => { probe.setDanoVerdadeiro(true); }); receber(1000);
        expect(v(f)).toBe(1);
    });
});

describe('Fase 2 - atingido por nivel via golpeNivel do feed', () => {
    const gat = (nivel) => [{ id: 'pf', nome: 'F', ativa: true, gatilhos: [G({ id: 'f1', evento: { tipo: 'atingido', nivel }, acoes: [{ tipo: 'contador', id: 'f', op: 'somar', valor: 1 }] })] }];
    const golpe = (extra) => [{ tipo: 'dano', ts: 7, nome: 'Vilao', dano: 100, ...extra }];
    const rodar = (nivelGatilho, feed) => { const f = montar(Novo, fichaReal({ poderes: gat(nivelGatilho), contadores: [ct('f')] }), feed); act(() => { probe.setAtacanteInc('p:Vilao'); }); receber(1000); const r = v(f); cleanup(); return r; };
    it('golpeNivel critico e fatal (sem estados) disparam so o gatilho do proprio nivel', () => {
        expect(rodar('critico', golpe({ golpeNivel: 'critico' }))).toBe(1);
        expect(rodar('fatal', golpe({ golpeNivel: 'critico' }))).toBe(0);
        expect(rodar('fatal', golpe({ golpeNivel: 'fatal' }))).toBe(1);
        expect(rodar('critico', golpe({ golpeNivel: 'fatal' }))).toBe(0);
        expect(rodar('qualquer', golpe({ golpeNivel: 'fatal' }))).toBe(1);
        expect(rodar('normal', golpe({ golpeNivel: 'normal' }))).toBe(1);
    });
    it('feed antigo sem golpeNivel: golpeCritico=true vira critico; sem nada vira normal', () => {
        expect(rodar('critico', golpe({ golpeCritico: true }))).toBe(1);
        expect(rodar('normal', golpe({ golpeCritico: true }))).toBe(0);
        expect(rodar('normal', golpe({}))).toBe(1);
        expect(rodar('critico', golpe({}))).toBe(0);
    });
    it('golpeNivel invalido cai no fallback sem quebrar', () => {
        expect(rodar('normal', golpe({ golpeNivel: 'xyz' }))).toBe(1);
    });
});
