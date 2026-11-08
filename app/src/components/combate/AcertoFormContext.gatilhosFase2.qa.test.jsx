import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Novo from './AcertoFormContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';
import { calcularAcerto } from '../../core/engine';

// QA Fase 2 - Acerto: eventos `errou` (todos os alvos escaparam) e `inimigoErrou` (do lado do alvo-personagem).
// P1 NAO-REGRESSAO: diferencial com a copia do HEAD (AcertoFormContext.qaf2old.jsx; sem ela os blocos sao pulados).
const velhos = import.meta.glob('./AcertoFormContext.qaf2old.jsx', { eager: true });
const Velho = velhos['./AcertoFormContext.qaf2old.jsx'] || null;

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../core/engine', () => ({
    calcularAcerto: vi.fn(() => ({ acertoTotal: 15, rolagem: '1d20' })),
    calcularCA: vi.fn(() => 10),
}));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarCenarioCompleto: vi.fn(), salvarCamposPersonagem: vi.fn(),
}));

const ERRA = -1e9;
const G = (g) => ({ nome: 'g', ...g });
const ct = (id, extra = {}) => ({ id, nome: id, valor: 0, min: 0, max: 100, ...extra });
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
let probe; let state;

function montar(Mod, { alvo = 'g1', dummies, personagens = {}, poderes = [], contadores = [ct('k')], meuNome = 'Heroi', ficha = {} } = {}) {
    const minhaFicha = { iniciativa: 10, inventario: [{ tipo: 'arma', equipado: true, alcance: 100 }], poderes, ataquesElementais: [], contadores, posicao: { x: 0, y: 0, z: 0, cenaId: 'cena_x' }, ...ficha };
    state = {
        minhaFicha, meuNome, personagens, dummies: dummies || { g1: { nome: 'Goblin', valorDefesa: 10, hpAtual: 100, posicao: { x: 1, y: 0, z: 0, cenaId: 'cena_x' }, cenaId: 'cena_x' } },
        alvoSelecionado: alvo, setAbaAtiva: vi.fn(), updateFicha: vi.fn((cb) => cb(minhaFicha)), isMestre: false,
        cenario: { ativa: 'cena_x', lista: { cena_x: { escala: 1.5 } }, zonas: [] }, divisorPoderMesa: 1,
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    const Harness = () => { probe = Mod.useAcertoForm(); return null; };
    render(<Mod.AcertoFormProvider><Harness /></Mod.AcertoFormProvider>);
    return minhaFicha;
}
const acerto = (total) => calcularAcerto.mockReturnValue({ acertoTotal: total, rolagem: '1d20' });
const feeds = () => fb.enviarParaFeed.mock.calls.map(c => c[0]);
const sistema = () => feeds().filter(f => f.tipo === 'sistema').map(f => f.texto);
const campos = (nome) => fb.salvarCamposPersonagem.mock.calls.filter(c => c[0] === nome).map(c => c[1]).reduce((a, c) => ({ ...a, ...c }), {});
const v = (f, id) => f.contadores.find(c => c.id === id).valor;
const somaErrou = (evento) => ({ id: 'p1', nome: 'P', ativa: true, gatilhos: [G({ id: 'g1', evento, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] })] });
const contra = () => ({ id: 'p1', nome: 'P', ativa: true, gatilhos: [G({ id: 'g1', nome: 'Contra', evento: { tipo: 'inimigoErrou' }, acoes: [{ tipo: 'mensagem', texto: 'Contra-ataque!' }, { tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] })] });
const ana = (extra = {}) => ({ iniciativa: 5, posicao: { x: 1, y: 0, z: 0, cenaId: 'cena_x' }, poderes: [], inventario: [], contadores: [ct('k')], ...extra });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); vi.spyOn(Date, 'now').mockReturnValue(1700000000000); acerto(15); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------
const nomesMock = ['salvarFichaSilencioso', 'enviarParaFeed', 'salvarCenarioCompleto', 'salvarCamposPersonagem'];
const chamadas = () => JSON.stringify(nomesMock.map(n => [n, fb[n].mock.calls]));
const CENARIOS = {
    'Dummie acerta': (M) => montar(M, {}),
    'Dummie erra': (M) => { acerto(ERRA); return montar(M, {}); },
    'Dummie erra c/ poder Fase 1': (M) => { acerto(ERRA); return montar(M, { poderes: [{ id: 'p9', nome: 'NM', ativa: true, gatilhos: [{ id: 'nm', nome: 'NM', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }] }] }] }); },
    'pj:Ana acerta': (M) => montar(M, { alvo: 'pj:Ana', personagens: { Ana: ana() } }),
    'pj:Ana erra': (M) => { acerto(ERRA); return montar(M, { alvo: 'pj:Ana', personagens: { Ana: ana() } }); },
    'pj:Ana erra, com contadores': (M) => { acerto(ERRA); return montar(M, { alvo: 'pj:Ana', personagens: { Ana: ana({ contadores: [ct('z', { valor: 3, reset: 'cena' })] }) } }); },
    'rolagem livre (sem alvo)': (M) => { acerto(ERRA); return montar(M, { alvo: null }); },
    'alvo em outra cena': (M) => montar(M, { alvo: 'pj:Ana', personagens: { Ana: ana({ posicao: { x: 1, y: 0, z: 0, cenaId: 'outra' } }) } }),
};
describe.skipIf(!Velho)('P1 NAO-REGRESSAO - Acerto identico ao HEAD sem gatilhos de Fase 2', () => {
    Object.entries(CENARIOS).forEach(([nome, run]) => {
        it(`${nome}: mesma ficha, mesmos feeds e gravacoes`, () => {
            const rodar = (M) => { vi.clearAllMocks(); acerto(15); run(M); act(() => { probe.rolarAcerto(); }); const r = JSON.stringify([state.minhaFicha, state.personagens, state.dummies]); const c = chamadas(); cleanup(); return [r, c]; };
            const a = rodar(Velho); const b = rodar(Novo);
            expect(b[0]).toBe(a[0]); expect(b[1]).toBe(a[1]);
        });
    });
    it('sanidade: o acerto em Ana realmente vai ao feed com alvosArea', () => {
        CENARIOS['pj:Ana erra'](Novo); act(() => { probe.rolarAcerto(); });
        const f = feeds().find(x => x.tipo === 'acerto');
        expect(f.alvosArea).toEqual([expect.objectContaining({ nome: 'Ana', acertou: false })]);
    });
});

describe('NAO-REGRESSAO (valores a mao) - sem gatilhos', () => {
    it('errar sem gatilhos: so 1 item no feed (o acerto), sem frase de sistema e sem gravar nada em Ana', () => {
        acerto(ERRA); montar(Novo, { alvo: 'pj:Ana', personagens: { Ana: ana() } });
        act(() => { probe.rolarAcerto(); });
        expect(feeds().length).toBe(1); expect(feeds()[0].tipo).toBe('acerto');
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('Fase 2 - errou', () => {
    it('errar no Dummie: dispara errou na MINHA ficha e salva (debounce)', () => {
        acerto(ERRA); const f = montar(Novo, { poderes: [somaErrou({ tipo: 'errou' })] });
        act(() => { probe.rolarAcerto(); });
        expect(v(f, 'k')).toBe(1); expect(fb.salvarFichaSilencioso).toHaveBeenCalled();
        expect(sistema().some(t => t.startsWith('🔔') && t.includes('k 0 → 1'))).toBe(true);
    });
    it('acertar: errou NAO dispara', () => {
        acerto(15); const f = montar(Novo, { poderes: [somaErrou({ tipo: 'errou' })] });
        act(() => { probe.rolarAcerto(); });
        expect(v(f, 'k')).toBe(0); expect(sistema()).toEqual([]);
    });
    it('rolagem livre (sem alvo): nao e erro', () => {
        acerto(1); const f = montar(Novo, { alvo: null, poderes: [somaErrou({ tipo: 'errou' })] });
        act(() => { probe.rolarAcerto(); });
        expect(v(f, 'k')).toBe(0);
    });
    it('acerto automatico (acertoAutomatico) nao conta como erro mesmo com total baixo', () => {
        calcularAcerto.mockReturnValue({ acertoTotal: 1, rolagem: '1d20', acertoAutomatico: true });
        const f = montar(Novo, { poderes: [somaErrou({ tipo: 'errou' })] });
        act(() => { probe.rolarAcerto(); });
        expect(v(f, 'k')).toBe(0);
    });
    it('dois erros seguidos disparam duas vezes; limite por turno barra o segundo', () => {
        acerto(ERRA); const f = montar(Novo, { poderes: [somaErrou({ tipo: 'errou' })] });
        act(() => { probe.rolarAcerto(); }); act(() => { probe.rolarAcerto(); });
        expect(v(f, 'k')).toBe(2); cleanup();
        const p = somaErrou({ tipo: 'errou' }); p.gatilhos[0].limite = { max: 1, por: 'turno' };
        const g = montar(Novo, { poderes: [p] });
        act(() => { probe.rolarAcerto(); }); act(() => { probe.rolarAcerto(); });
        expect(v(g, 'k')).toBe(1);
    });
    it('erro contra jogador (pj:Ana) tambem dispara errou em mim', () => {
        acerto(ERRA); const f = montar(Novo, { alvo: 'pj:Ana', personagens: { Ana: ana() }, poderes: [somaErrou({ tipo: 'errou' })] });
        act(() => { probe.rolarAcerto(); });
        expect(v(f, 'k')).toBe(1);
    });
    it('Poder desligado nao dispara errou; sem `contadores` na ficha antiga ignora em silencio', () => {
        acerto(ERRA); const p = somaErrou({ tipo: 'errou' }); p.ativa = false;
        const f = montar(Novo, { poderes: [p] }); act(() => { probe.rolarAcerto(); }); expect(v(f, 'k')).toBe(0); cleanup();
        const h = montar(Novo, { poderes: [somaErrou({ tipo: 'errou' })] }); delete h.contadores;
        expect(() => act(() => { probe.rolarAcerto(); })).not.toThrow();
    });
    it('a falha de um gatilho nao impede o acerto de ir ao feed (feed do acerto sai ANTES)', () => {
        acerto(ERRA); montar(Novo, { poderes: [somaErrou({ tipo: 'errou' })] });
        act(() => { probe.rolarAcerto(); });
        expect(feeds()[0].tipo).toBe('acerto');
    });
});

describe('Fase 2 - inimigoErrou (contra-ataque simples)', () => {
    it('golpe que erra em Ana: gatilho DELA roda, grava so os caminhos e o feed leva o nome', () => {
        acerto(ERRA); const a = ana({ poderes: [contra()], contadores: [ct('x'), ct('k', { valor: 4 })] });
        montar(Novo, { alvo: 'pj:Ana', personagens: { Ana: a } });
        act(() => { probe.rolarAcerto(); });
        expect(campos('Ana')).toEqual({ 'contadores/1/valor': 5 });
        expect(a.contadores[1].valor).toBe(4);
        expect(sistema().some(t => t.includes('Ana: Contra: Contra-ataque!'))).toBe(true);
        expect(semUndefined(fb.salvarCamposPersonagem.mock.calls)).toBe(true);
    });
    it('golpe que acerta Ana: inimigoErrou NAO dispara', () => {
        acerto(15); montar(Novo, { alvo: 'pj:Ana', personagens: { Ana: ana({ poderes: [contra()] }) } });
        act(() => { probe.rolarAcerto(); });
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled(); expect(sistema()).toEqual([]);
    });
    it('Ana so mensagem (sem contador): nada gravado, so a frase', () => {
        acerto(ERRA); const p = contra(); p.gatilhos[0].acoes = [{ tipo: 'mensagem', texto: 'Contra-ataque!' }];
        montar(Novo, { alvo: 'pj:Ana', personagens: { Ana: ana({ poderes: [p] }) } });
        act(() => { probe.rolarAcerto(); });
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled(); expect(sistema().join(' ')).toContain('Contra-ataque!');
    });
    it('errar um Dummie com gatilho no meu proprio poder inimigoErrou: nao dispara em mim (nao sou o alvo)', () => {
        acerto(ERRA); const f = montar(Novo, { poderes: [contra()] });
        act(() => { probe.rolarAcerto(); });
        expect(v(f, 'k')).toBe(0);
    });
    it('Ana em God Mode ainda reage ao inimigoErrou (God Mode so afeta dano)', () => {
        acerto(ERRA); montar(Novo, { alvo: 'pj:Ana', personagens: { Ana: ana({ poderes: [contra()], combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } }) } });
        act(() => { probe.rolarAcerto(); });
        expect(sistema().join(' ')).toContain('Contra-ataque!');
    });
    it('Poder de Ana desligado: nao reage; passivo reage', () => {
        acerto(ERRA); const p = contra(); p.ativa = false;
        montar(Novo, { alvo: 'pj:Ana', personagens: { Ana: ana({ poderes: [p] }) } });
        act(() => { probe.rolarAcerto(); }); expect(sistema()).toEqual([]); cleanup(); vi.clearAllMocks(); acerto(ERRA);
        const q = contra(); q.ativa = false; q.gatilhos[0].passivo = true;
        montar(Novo, { alvo: 'pj:Ana', personagens: { Ana: ana({ poderes: [q] }) } });
        act(() => { probe.rolarAcerto(); }); expect(sistema().join(' ')).toContain('Contra-ataque!');
    });
});
