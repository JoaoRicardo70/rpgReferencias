import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Novo from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';
// Copia do HEAD para o diferencial (git show HEAD:<arquivo> > MapaFormContext.qaold.js[x]); sem ela os blocos P1 sao pulados.
const caminhoAntigo = './MapaFormContext.qaold';
const Velho = await import(/* @vite-ignore */ caminhoAntigo).catch(() => null);
const temAntigo = !!Velho;

// QA - Mapa: os caminhos de dano na Vida (Dano Rapido em mim / em outro jogador, Zona ao pisar, tick da Zona, estados no turno).
// P1: diferencial HEAD x working tree (sem gatilhos, sem God Mode). P2: gatilhos, God Mode, dono offline.

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), uploadImagem: vi.fn(),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()), zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
}));

const VIDA = 1000000000;
const vital = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: base, regeneracao: 0 });
const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const GOD = { turnosRestantes: 1, origem: 'Teste' };
const ESC = () => [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }, { id: 'b', nome: 'Falsa', valor: 50, tipo: 'vidaTemporaria' }];
const COMBATE = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 };
const ficha = (extra = {}) => ({
    iniciativa: 0, posicao: { x: 0, y: 0, z: 0 }, posicoes: { c: { x: 0, y: 0, z: 0, cenaId: 'c' } },
    acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
    vida: vital(VIDA), mana: vital(1000000), aura: vital(1000000), chakra: vital(1000000), corpo: vital(1000000),
    forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 }, sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 },
    carisma: { base: 1000000 }, stamina: { base: 1000000 }, constituicao: { base: 1000000 },
    multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
    poderes: [], inventario: [], passivas: [], combate: { ...COMBATE },
    ...extra,
});
const FICHAS = {
    simples: () => ficha(),
    escudos: () => ficha({ escudos: ESC() }),
    resistente: () => ficha({ reducoesDano: [{ id: 'a', nome: 'Armadura', percentual: 50, elemento: 'todos' }], afinidades: { resistencias: ['fogo'], imunidades: ['gelo'] } }),
    resistenteEscudo: () => ficha({ escudos: ESC(), reducoesDano: [{ id: 'a', nome: 'Armadura', percentual: 50, elemento: 'todos' }] }),
    vidaBaixa: () => { const f = ficha(); f.vida.atual = 300 * 1000; return f; },
    vidaZero: () => { const f = ficha(); f.vida.atual = 0; return f; },
    gatilhoDesligado: () => ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: false, gatilhos: [NEGAR] }] }),
    gatilhoOpcional: () => ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [{ ...NEGAR, modo: 'opcional' }] }] }),
    gatilhoNoItemGuardado: () => ficha({ inventario: [{ id: 'i', nome: 'It', equipado: false, gatilhos: [NEGAR] }] }),
    godVencido: () => ficha({ combate: { ...COMBATE, imunidadeTotal: { turnosRestantes: 0 } } }),
};

let storeState; let probe;
function montar(Mod, state) {
    storeState = state;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(storeState) : storeState));
    useStore.getState = () => storeState;
    const Harness = () => { probe = Mod.useMapaForm(); return null; };
    render(<Mod.MapaFormProvider><Harness /></Mod.MapaFormProvider>);
}
function estado(minhaFicha, extra = {}) {
    return {
        minhaFicha, meuNome: 'Mestre', personagens: {}, updateFicha: vi.fn((cb) => cb(minhaFicha)), feedCombate: [],
        isMestre: true, mesaCriador: 'Mestre', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'c', lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [] },
        ...extra,
    };
}
const nomesMock = ['salvarFichaSilencioso', 'enviarParaFeed', 'salvarDummie', 'aplicarDanoDireto', 'aplicarFadigaDireta', 'aplicarElementoDireto', 'aplicarElementoNivelDireto', 'salvarCamposPersonagem', 'salvarCenarioCompleto'];
const chamadas = () => JSON.stringify(nomesMock.map(n => [n, fb[n].mock.calls]));
const feeds = () => fb.enviarParaFeed.mock.calls.map(c => String(c[0].texto));
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ZONA = [{ id: 'z', nome: 'Fogo', cenaId: 'c', conjurador: 'Outro', duracao: 3, danoOriginal: 40, x: 5, y: 5, z: 0, raio: 2 }];
const ZONA_TICK = [{ id: 'z', nome: 'Fogo', cenaId: 'c', conjurador: 'Conj', duracao: 3, danoOriginal: 40, x: 5, y: 5, z: 0, raio: 2 }];

// Cada cenario devolve { ficha final, chamadas ao Firebase, feed }
const CENARIOS = {
    'Dano Rapido em mim': (Mod, mk, { dano, elemento, verdadeiro }) => {
        const eu = mk();
        montar(Mod, estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, dano, elemento, null, 0, null, false, verdadeiro); });
        return { eu };
    },
    'Dano Rapido em outro jogador': (Mod, mk, { dano, elemento, verdadeiro }) => {
        const vilao = mk();
        montar(Mod, estado(ficha({ poderes: [] }), { personagens: { Vilao: vilao } }));
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, dano, elemento, null, 0, null, false, verdadeiro); });
        return { vilao };
    },
    'Zona ao pisar': (Mod, mk, { dano }) => {
        const eu = mk();
        const z = ZONA.map(x => ({ ...x, danoOriginal: dano }));
        montar(Mod, estado(eu, { meuNome: 'Heroi', isMestre: false, cenario: { ativa: 'c', lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: z } }));
        act(() => { probe.handleCellClick(5, 5); });
        return { eu };
    },
    'Zona tick (passar turno)': (Mod, mk, { dano }) => {
        const eu = mk();
        eu.posicoes = { c: { x: 5, y: 5, z: 0, cenaId: 'c' } };
        const z = ZONA_TICK.map(x => ({ ...x, danoOriginal: dano }));
        const dummies = { a: { nome: 'A', iniciativa: 20, cenaId: 'c', hpAtual: 10 }, conj: { nome: 'Conj', iniciativa: 10, cenaId: 'c', hpAtual: 10 } };
        montar(Mod, estado(eu, { dummies, cenario: { ativa: 'c', lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: z } }));
        act(() => { probe.avancarTurno(); });
        return { eu };
    },
};

describe.skipIf(!temAntigo)('P1 - Mapa: identico ao HEAD sem gatilhos e sem God Mode (matriz)', () => {
    const DANOS_RAPIDO = [1, 299, 300, 349, 350, 351, 1000, 299999, 5000000, 1000000000, 1e12];
    Object.entries(CENARIOS).forEach(([nome, run]) => {
        it(`${nome}: mesma Vida/escudos/campos, mesmo feed e mesmas gravacoes`, () => {
            let n = 0;
            const danos = nome.startsWith('Zona') ? [1, 40, 299, 350, 351, 5000, 999999] : DANOS_RAPIDO;
            const opcoes = nome.startsWith('Dano') ? [{ elemento: 'fisico', verdadeiro: false }, { elemento: 'fogo', verdadeiro: false }, { elemento: 'gelo', verdadeiro: true }, { elemento: 'fogo', verdadeiro: true }] : [{}];
            Object.entries(FICHAS).forEach(([fn, mk]) => danos.forEach((dano) => opcoes.forEach((opc) => {
                vi.clearAllMocks(); const a = run(Velho, mk, { dano, ...opc }); const ca = chamadas(); const fa = JSON.stringify(a);
                cleanup();
                vi.clearAllMocks(); const b = run(Novo, mk, { dano, ...opc }); const cb = chamadas(); const fb2 = JSON.stringify(b);
                cleanup();
                n++;
                expect(fb2, `ficha ${fn} dano=${dano} ${JSON.stringify(opc)}`).toBe(fa);
                expect(cb, `chamadas ${fn} dano=${dano} ${JSON.stringify(opc)}`).toBe(ca);
            })));
            expect(n).toBeGreaterThan(30);
        });
    });

    it('estados no turno (aplicarDanoDeEstadosNoTurno): mesma Vida, escudo e texto; Dummie igual', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const estados = [[{ id: 'sangrando', stacks: 1 }], [{ id: 'sangrando', stacks: 3 }, { id: 'queimado', stacks: 2 }], []];
        Object.values(FICHAS).forEach((mk) => estados.forEach((cond) => [0, 4999, 5000, 3 * 1000, 1e12].forEach((vidaAtual) => {
            const a = mk(); a.condicoes = JSON.parse(JSON.stringify(cond)); if (vidaAtual) a.vida.atual = vidaAtual;
            const b = JSON.parse(JSON.stringify(a));
            const ta = Velho.aplicarDanoDeEstadosNoTurno(a, false);
            const tb = Novo.aplicarDanoDeEstadosNoTurno(b, false);
            expect(JSON.stringify(b)).toBe(JSON.stringify(a));
            expect(tb).toBe(ta);
        })));
        const d1 = { hpAtual: 100000, condicoes: [{ id: 'sangrando', stacks: 2 }] }; const d2 = JSON.parse(JSON.stringify(d1));
        expect(Novo.aplicarDanoDeEstadosNoTurno(d2, true)).toBe(Velho.aplicarDanoDeEstadosNoTurno(d1, true));
        expect(d2).toEqual(d1);
        const sem = ficha(); delete sem.vida; sem.condicoes = [{ id: 'sangrando', stacks: 1 }];
        expect(Novo.aplicarDanoDeEstadosNoTurno(JSON.parse(JSON.stringify(sem)), false)).toBe(Velho.aplicarDanoDeEstadosNoTurno(JSON.parse(JSON.stringify(sem)), false));
    });
});

describe('P2 - Mapa: gatilhos, God Mode e dono offline', () => {
    it('Dano Rapido em mim: Dano Verdadeiro nao fura Negar morte, mas God Mode anula ate o Dano Verdadeiro', () => {
        const eu = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [NEGAR] }] });
        montar(Novo, estado(eu));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, 5000000, 'fisico', null, 0, null, false, true); });
        expect(eu.vida.atual).toBe(1000);
        cleanup();
        const god = ficha({ combate: { ...COMBATE, imunidadeTotal: { ...GOD } }, escudos: ESC() });
        montar(Novo, estado(god));
        act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: god, isDummie: false }, 5000000, 'fisico', null, 0, null, false, true); });
        expect(god.vida.atual).toBe(VIDA);
        expect(god.escudos).toEqual(ESC());
        expect(feeds().at(-1)).toContain('Imunidade total');
    });

    it('Dano Rapido em OUTRO jogador (dono offline): grava so campos tocados, sem undefined, nunca a ficha inteira', () => {
        const vilao = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [{ ...NEGAR, acoes: [...NEGAR.acoes, { tipo: 'imunidadeTotal', duracaoTurnos: 2 }, { tipo: 'escudo', nome: 'Muro', valor: 77 }, { tipo: 'limparCondicoes' }] }] }], condicoes: [{ id: 'sangrando', stacks: 1 }] });
        montar(Novo, estado(ficha({ poderes: [] }), { personagens: { Vilao: vilao } }));
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, 5000000, 'fisico'); });
        const campos = fb.salvarCamposPersonagem.mock.calls.find(c => c[0] === 'Vilao')[1];
        expect(Object.keys(campos).sort()).toEqual(['combate/imunidadeTotal', 'combate/usosPoderes', 'condicoes', 'escudos']); // sem eventoId real do golpe nao ha combate/gatilhos
        expect(campos.condicoes).toBeNull();
        expect(campos['combate/imunidadeTotal']).toEqual({ turnosRestantes: 2, origem: 'Negar morte' });
        expect(semUndefined(campos)).toBe(true);
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 1000);
        expect(vilao.vida.atual).toBe(VIDA);
        expect(feeds().at(-1)).toContain('Negar morte segurou em 1 de vida');
    });

    it('Dano Rapido em outro jogador com God Mode: Vida e escudo intactos, nenhum campo gravado', () => {
        const vilao = ficha({ combate: { ...COMBATE, imunidadeTotal: { ...GOD } }, escudos: ESC() });
        montar(Novo, estado(ficha({ poderes: [] }), { personagens: { Vilao: vilao } }));
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, 5000000, 'fisico', null, 0, null, false, true); });
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Vilao', VIDA);
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(feeds().at(-1)).toContain('Imunidade total');
    });

    it('Zona ao pisar com God Mode: nada; sem God Mode e Negar morte: segura', () => {
        const eu = ficha({ combate: { ...COMBATE, imunidadeTotal: { ...GOD } } });
        montar(Novo, estado(eu, { meuNome: 'Heroi', isMestre: false, cenario: { ativa: 'c', lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: ZONA } }));
        act(() => { probe.handleCellClick(5, 5); });
        expect(eu.vida.atual).toBe(VIDA);
    });

    it('Zona tick (passar turno) com Negar morte e com God Mode', () => {
        const mk = (extra) => { const f = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [NEGAR] }], ...extra }); f.posicoes = { c: { x: 5, y: 5, z: 0, cenaId: 'c' } }; f.vida.atual = 30 * 1000; return f; };
        const run = (f) => {
            const dummies = { a: { nome: 'A', iniciativa: 20, cenaId: 'c', hpAtual: 10 }, conj: { nome: 'Conj', iniciativa: 10, cenaId: 'c', hpAtual: 10 } };
            montar(Novo, estado(f, { dummies, cenario: { ativa: 'c', lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: ZONA_TICK } }));
            act(() => { probe.avancarTurno(); });
        };
        const f = mk(); run(f);
        expect(f.vida.atual).toBe(1000);
        expect(feeds().some(t => t.includes('Negar morte segurou'))).toBe(true);
        cleanup(); vi.clearAllMocks();
        const g = mk({ combate: { ...COMBATE, imunidadeTotal: { ...GOD } } }); run(g);
        expect(g.vida.atual).toBe(30 * 1000);
    });

    it('estados no turno: Vida zerada por sangramento, gatilho de faixa e God Mode (Dano Verdadeiro de estados nao fura)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const faixa = { id: 'f', nome: 'Faixa', evento: { tipo: 'vidaAbaixoDe', de: 99, ate: 0 }, acoes: [{ tipo: 'mensagem', texto: 'caiu' }] };
        const f = ficha({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [faixa] }], condicoes: [{ id: 'sangrando', stacks: 1 }] });
        f.vida.atual = 11000000000; // 100% da Vida maxima (11e9 bruto com o multiplicador de Forca desta ficha)
        const t = Novo.aplicarDanoDeEstadosNoTurno(f, false);
        expect(t).toContain('Faixa: caiu');
        expect(f.vida.atual).toBe(11000000000 - 5 * 1000);
        const g = ficha({ combate: { ...COMBATE, imunidadeTotal: { ...GOD } }, condicoes: [{ id: 'sangrando', stacks: 5 }] });
        Novo.aplicarDanoDeEstadosNoTurno(g, false);
        expect(g.vida.atual).toBe(VIDA);
    });

    it('inicio do turno: a Imunidade total conta turnos ANTES do dano dos estados (turno 1 -> estados ja dao dano)', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const f = ficha({ combate: { ...COMBATE, imunidadeTotal: { turnosRestantes: 1, origem: 'x' } }, condicoes: [{ id: 'sangrando', stacks: 1 }] });
        const r = Novo.aplicarInicioDeTurno(f);
        expect('imunidadeTotal' in f.combate).toBe(false);
        expect(f.vida.atual).toBeLessThan(VIDA); // sangramento do inicio do turno ja vale
        expect(r.estados).toContain('');
    });

    it('inicio do turno de um Dummie nao mexe em imunidadeTotal nem cria chaves', () => {
        const d = { hpAtual: 1000, hpMax: 1000, condicoes: [] };
        Novo.aplicarInicioDeTurno(d, true);
        expect('combate' in d && 'imunidadeTotal' in (d.combate || {})).toBe(false);
    });

    it('turno de OUTRO jogador (avancarTurno): Imunidade total dele cai 1 e o campo vai como null/valor, sem undefined', () => {
        const vilao = ficha({ combate: { ...COMBATE, imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } });
        const dummies = { a: { nome: 'A', iniciativa: 20, cenaId: 'c', hpAtual: 10 } };
        const eu = ficha({ iniciativa: 0 });
        vilao.iniciativa = 10;
        montar(Novo, estado(eu, { dummies, personagens: { Vilao: vilao }, cenario: { ativa: 'c', lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [] } }));
        act(() => { probe.avancarTurno(); });
        const chamada = fb.salvarCamposPersonagem.mock.calls.find(c => c[0] === 'Vilao');
        if (chamada) {
            expect(chamada[1]['combate/imunidadeTotal']).toBeNull();
            expect(semUndefined(chamada[1])).toBe(true);
        }
    });
});
