import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Novo from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';

// QA Fase 2 - Mapa: avancarTurno (turnoFim/turnoInicio/poderDesligou), encerrarCombate e descansar (fimDeLuta).
// P1 NAO-REGRESSAO: diferencial com a copia do HEAD (git show HEAD:... > MapaFormContext.qaf2old.jsx; sem ela os blocos sao pulados).
const velhos = import.meta.glob('./MapaFormContext.qaf2old.jsx', { eager: true });
const Velho = velhos['./MapaFormContext.qaf2old.jsx'] || null;

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), uploadImagem: vi.fn(),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()), zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
}));

const F = 1000;
const vital = (base, atual = base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual, regeneracao: 0 });
const COMBATE = () => ({ fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 });
const G = (g) => ({ nome: 'g', ...g });
const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const ct = (id, extra = {}) => ({ id, nome: id, valor: 0, min: 0, max: 100, ...extra });
const ficha = (extra = {}) => ({
    iniciativa: 10, posicao: { x: 0, y: 0, z: 0 }, posicoes: { c: { x: 0, y: 0, z: 0, cenaId: 'c' } },
    acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
    vida: vital(1000000000), mana: vital(1000000), aura: vital(1000000), chakra: vital(1000000), corpo: vital(1000000),
    forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 }, sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 },
    carisma: { base: 1000000 }, stamina: { base: 1000000 }, constituicao: { base: 1000000 },
    multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
    poderes: [], inventario: [], passivas: [], combate: COMBATE(),
    ...extra,
});
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
const clone = (o) => JSON.parse(JSON.stringify(o));

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
        cenario: { ativa: 'c', combates: { c: { ativo: true, rodada: 1 } }, lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [] },
        ...extra,
    };
}
const nomesMock = ['salvarFichaSilencioso', 'enviarParaFeed', 'salvarDummie', 'aplicarDanoDireto', 'aplicarFadigaDireta', 'salvarCamposPersonagem', 'salvarCenarioCompleto', 'zerarIniciativaGlobal'];
const chamadas = () => JSON.stringify(nomesMock.map(n => [n, fb[n].mock.calls]));
const feeds = () => fb.enviarParaFeed.mock.calls.map(c => String(c[0].texto));
const campos = (nome) => (fb.salvarCamposPersonagem.mock.calls.find(c => c[0] === nome) || [null, null])[1];

beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); vi.spyOn(Math, 'random').mockReturnValue(0); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------
const VARIANTES = {
    simples: () => ficha(),
    custoPagando: () => ficha({ poderes: [{ id: 'p1', nome: 'Aura', ativa: true, custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } }] }),
    custoSemEnergia: () => { const f = ficha({ poderes: [{ id: 'p1', nome: 'Aura', ativa: true, custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } }] }); f.mana.atual = 0; return f; },
    custoPercentual: () => ficha({ poderes: [{ id: 'p1', nome: 'Aura', ativa: true, custoPorTurno: { modo: 'percMax', valor: 10, energia: 'chakra' } }] }),
    recarga: () => ficha({ poderes: [{ id: 'p1', nome: 'R', ativa: false, recargaRestante: 2 }, { id: 'p2', nome: 'S', ativa: true }] }),
    estados: () => { const f = ficha({ condicoes: [{ id: 'sangrando', stacks: 2 }, { id: 'queimado', stacks: 1 }] }); return f; },
    estadosLetais: () => { const f = ficha({ condicoes: [{ id: 'sangrando', stacks: 3 }], poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [NEGAR] }] }); f.vida.atual = 4 * F; return f; },
    escudos: () => ficha({ escudos: [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }] }),
    godMode: () => ficha({ combate: { ...COMBATE(), imunidadeTotal: { turnosRestantes: 2, origem: 'x' } } }),
    contadoresPermanentes: () => ficha({ contadores: [ct('a', { valor: 3 }), ct('b', { valor: 7 })] }),
    gatilhosFase1: () => ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [NEGAR, { id: 'fx', nome: 'Faixa', evento: { tipo: 'vidaAbaixoDe', de: 50, ate: 1 }, acoes: [{ tipo: 'mensagem', texto: 'x' }] }] }] }),
    usosCenaExistentes: () => ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, usosMax: 2, usosPor: 'cena' }], combate: { ...COMBATE(), usosPoderes: { p1: { n: 1, cena: 'c' } } } }),
    buffs: () => ficha({ buffsTemporarios: [{ id: 'b1', nome: 'B', fonte: 'x', efeitos: [], duracao: 2, duracaoModo: 'turnos' }] }),
};
const OPS = {
    'avancar eu->Vilao': (Mod, mk) => { const eu = mk(); eu.iniciativa = 20; const vilao = mk(); montar(Mod, estado(eu, { personagens: { Vilao: vilao }, cenario: { ativa: 'c', combates: { c: { ativo: true, rodada: 1 } }, lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [] } })); act(() => { probe.avancarTurno(); }); return { eu, vilao }; },
    'avancar Vilao->eu': (Mod, mk) => { const eu = mk(); eu.iniciativa = 20; const vilao = mk(); montar(Mod, estado(eu, { personagens: { Vilao: vilao }, cenario: { ativa: 'c', combates: { c: { ativo: true, rodada: 1 } }, lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 1, zonas: [] } })); act(() => { probe.avancarTurno(); }); return { eu, vilao }; },
    'avancar eu->Dummie': (Mod, mk) => { const eu = mk(); eu.iniciativa = 20; const dummies = { d1: { nome: 'D', iniciativa: 5, cenaId: 'c', hpAtual: 10, condicoes: [{ id: 'sangrando', stacks: 1 }] } }; montar(Mod, estado(eu, { dummies })); act(() => { probe.avancarTurno(); }); return { eu, dummies }; },
    'avancar Dummie->eu': (Mod, mk) => { const eu = mk(); eu.iniciativa = 20; const dummies = { d1: { nome: 'D', iniciativa: 5, cenaId: 'c', hpAtual: 10 } }; montar(Mod, estado(eu, { dummies, cenario: { ativa: 'c', combates: { c: { ativo: true, rodada: 1 } }, lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 1, zonas: [] } })); act(() => { probe.avancarTurno(); }); return { eu, dummies }; },
    'encerrarCombate': (Mod, mk) => { const eu = mk(); const vilao = mk(); const fora = mk(); fora.iniciativa = 0; montar(Mod, estado(eu, { personagens: { Vilao: vilao, Fora: fora } })); act(() => { probe.encerrarCombate(); }); return { eu, vilao, fora }; },
    'descansar': (Mod, mk) => { const eu = mk(); montar(Mod, estado(eu)); act(() => { probe.descansar(); }); return { eu }; },
};

describe.skipIf(!Velho)('P1 NAO-REGRESSAO - Mapa (diferencial vs HEAD, fichas SEM gatilhos de Fase 2)', () => {
    Object.entries(OPS).forEach(([nomeOp, run]) => {
        it(`${nomeOp}: mesma ficha final, mesmo feed e mesmas gravacoes em todas as variantes`, () => {
            let n = 0;
            Object.entries(VARIANTES).forEach(([vn, mk]) => {
                vi.clearAllMocks(); const a = run(Velho, mk); const ca = chamadas(); const ra = JSON.stringify(a); cleanup();
                vi.clearAllMocks(); const b = run(Novo, mk); const cb = chamadas(); const rb = JSON.stringify(b); cleanup();
                n++;
                expect(rb, `ficha ${vn}`).toBe(ra);
                expect(cb, `chamadas ${vn}`).toBe(ca);
            });
            expect(n).toBe(Object.keys(VARIANTES).length);
        });
    });
    it('sanidade do diferencial: as comparacoes NAO sao vazias (houve gravacao, feed e custo cobrado)', () => {
        vi.clearAllMocks(); const r = OPS['avancar Vilao->eu'](Novo, VARIANTES.custoPagando); const c = chamadas();
        expect(c).toContain('consumiu 5 de mana'); expect(r.eu.mana.atual).toBe(1000000 - 5 * F); cleanup();
        vi.clearAllMocks(); OPS['avancar eu->Vilao'](Novo, VARIANTES.custoPagando);
        expect(JSON.stringify(fb.salvarCamposPersonagem.mock.calls)).toContain('mana'); cleanup();
        vi.clearAllMocks(); OPS.encerrarCombate(Novo, VARIANTES.simples);
        expect(fb.zerarIniciativaGlobal).toHaveBeenCalled(); expect(fb.salvarCenarioCompleto).toHaveBeenCalled();
    });
    it('aplicarInicioDeTurno: mesmo retorno (menos `gatilhos` novo) e mesma ficha, Dummie e jogador', () => {
        Object.values(VARIANTES).forEach((mk) => [false, true].forEach((dum) => {
            const a = mk(); const b = clone(a);
            const ra = Velho.aplicarInicioDeTurno(a, dum, 'N'); const { gatilhos, ...rb } = Novo.aplicarInicioDeTurno(b, dum, 'N');
            expect(JSON.stringify(b)).toBe(JSON.stringify(a));
            expect(JSON.stringify(rb)).toBe(JSON.stringify(ra));
            expect(gatilhos).toEqual({ textos: [], caminhos: [] });
        }));
    });
    it('aplicarDanoDeEstadosNoTurno inalterado', () => {
        Object.values(VARIANTES).forEach((mk) => {
            const a = mk(); a.condicoes = [{ id: 'sangrando', stacks: 2 }]; const b = clone(a);
            expect(Novo.aplicarDanoDeEstadosNoTurno(b, false, 'N')).toBe(Velho.aplicarDanoDeEstadosNoTurno(a, false, 'N'));
            expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        });
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('NAO-REGRESSAO (valores a mao) - Mapa sem gatilhos', () => {
    it('avancarTurno eu->eu(unico): custo por turno cobra 5 de mana e nao inventa chaves (combate.gatilhos/usosPoderes/contadores)', () => {
        const eu = ficha({ poderes: [{ id: 'p1', nome: 'Aura', ativa: true, custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } }] });
        montar(Novo, estado(eu));
        act(() => { probe.avancarTurno(); });
        expect(eu.mana.atual).toBe(1000000 - 5 * F);
        expect(feeds().some(t => t.startsWith('🔋 Aura consumiu 5 de mana'))).toBe(true);
        expect(feeds().some(t => t.includes('🔔'))).toBe(false);
        expect(eu.combate.usosPoderes).toBeUndefined(); expect(eu.combate.gatilhos).toBeUndefined(); expect(eu.contadores).toBeUndefined();
        expect(semUndefined(eu)).toBe(true);
    });
    it('turnoFim de quem acaba sem gatilhos: nenhuma gravacao extra em outro jogador (so as de sempre)', () => {
        const eu = ficha({ iniciativa: 5 }); const vilao = ficha({ iniciativa: 20 });
        montar(Novo, estado(eu, { personagens: { Vilao: vilao }, cenario: { ativa: 'c', combates: { c: { ativo: true, rodada: 1 } }, lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [] } }));
        act(() => { probe.avancarTurno(); }); // Vilao (ini 20) acaba o turno -> eu comeca
        expect(campos('Vilao')).toBeNull();
    });
    it('descansar sem gatilhos: so descansarCompleto + salvar + feed de sempre (sem frase de gatilho)', () => {
        const eu = ficha({ contadores: [ct('a', { valor: 3 })] });
        montar(Novo, estado(eu));
        act(() => { probe.descansar(); });
        expect(feeds()).toEqual(['💖 Mestre descansou e recuperou as forças!']);
        expect(eu.contadores[0].valor).toBe(3);
    });
    it('descansar cancelado (confirm=false) nao dispara nada', () => {
        window.confirm = vi.fn(() => false);
        const eu = ficha({ contadores: [ct('a', { valor: 3, reset: 'cena' })] });
        montar(Novo, estado(eu));
        act(() => { probe.descansar(); });
        expect(eu.contadores[0].valor).toBe(3); expect(fb.enviarParaFeed).not.toHaveBeenCalled(); expect(fb.salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('encerrarCombate cancelado nao reseta contadores', () => {
        window.confirm = vi.fn(() => false);
        const eu = ficha({ contadores: [ct('a', { valor: 3, reset: 'cena' })] });
        montar(Novo, estado(eu));
        act(() => { probe.encerrarCombate(); });
        expect(eu.contadores[0].valor).toBe(3); expect(fb.salvarCenarioCompleto).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('Fase 2 - encerrarCombate / descansar (fimDeLuta, reset de cena)', () => {
    const marca = () => [ct('marca', { valor: 4, reset: 'cena' }), ct('perm', { valor: 4 })];
    it('encerrarCombate: zera contadores de cena em MIM e em outro jogador NA cena; permanente fica; quem esta fora da cena nao e tocado', () => {
        const eu = ficha({ contadores: marca() }); const vilao = ficha({ contadores: marca() }); const fora = ficha({ iniciativa: 0, contadores: marca() });
        montar(Novo, estado(eu, { personagens: { Vilao: vilao, Fora: fora } }));
        act(() => { probe.encerrarCombate(); });
        expect(eu.contadores.map(c => c.valor)).toEqual([0, 4]);
        expect(campos('Vilao')).toEqual(expect.objectContaining({ 'contadores/0/valor': 0 }));
        expect(Object.keys(campos('Vilao')).filter(k => k.startsWith('contadores/'))).toEqual(['contadores/0/valor']);
        expect(campos('Fora')).toBeNull();
        expect(vilao.contadores[0].valor).toBe(4); // ficha espelhada nunca e mutada
        expect(fb.zerarIniciativaGlobal).toHaveBeenCalledWith(['Mestre', 'Vilao']);
    });
    it('encerrarCombate: gatilho fimDeLuta de outro jogador grava os caminhos tocados, sem undefined, e o feed leva o nome', () => {
        const vilao = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [G({ nome: 'Fim', evento: { tipo: 'fimDeLuta' }, acoes: [{ tipo: 'curar', modo: 'fixo', valor: 10 }, { tipo: 'mensagem', texto: 'acabou' }] }), G({ id: 'b', nome: 'Zera', evento: { tipo: 'fimDeLuta' }, acoes: [{ tipo: 'contador', id: 'k', op: 'zerar' }] })] }], contadores: [ct('k', { valor: 3 })] });
        vilao.vida.atual = 500 * F;
        montar(Novo, estado(ficha(), { personagens: { Vilao: vilao } }));
        act(() => { probe.encerrarCombate(); });
        const c = campos('Vilao');
        expect(c['vida/atual']).toBe(510 * F); expect(c['contadores/0/valor']).toBe(0);
        expect(Object.values(c).every(v => v !== undefined)).toBe(true);
        expect(feeds().some(t => t.startsWith('🔔 Vilao:') && t.includes('acabou'))).toBe(true);
    });
    it('encerrarCombate com cena em cada ficha: cada personagem na cena recebe o evento 1 vez (sem duplicar o do Mestre)', () => {
        const mk = () => ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [G({ evento: { tipo: 'fimDeLuta' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] })] }], contadores: [ct('k')] });
        const eu = mk(); const vilao = mk();
        montar(Novo, estado(eu, { personagens: { Vilao: vilao } }));
        act(() => { probe.encerrarCombate(); });
        expect(eu.contadores[0].valor).toBe(1);
        expect(campos('Vilao')['contadores/0/valor']).toBe(1);
        expect(fb.salvarCamposPersonagem.mock.calls.filter(c => c[0] === 'Vilao' && 'contadores/0/valor' in c[1]).length).toBe(1);
    });
    it('encerrarCombate: Dummie na cena nao quebra e nao recebe gatilho', () => {
        const eu = ficha({ contadores: marca() });
        montar(Novo, estado(eu, { dummies: { d1: { nome: 'D', iniciativa: 5, cenaId: 'c', hpAtual: 10 } } }));
        act(() => { probe.encerrarCombate(); });
        expect(eu.contadores[0].valor).toBe(0);
        expect(fb.salvarDummie).toHaveBeenCalled();
    });
    it('encerrarCombate: ficha sem contadores/combate/poderes nao quebra', () => {
        const eu = { iniciativa: 10, posicoes: { c: { x: 0, y: 0, cenaId: 'c' } } };
        montar(Novo, estado(eu, { personagens: { V: { iniciativa: 5, posicoes: { c: { x: 0, y: 0, cenaId: 'c' } } } } }));
        expect(() => act(() => { probe.encerrarCombate(); })).not.toThrow();
        expect(eu.iniciativa).toBe(0);
    });
    it('encerrarCombate ainda limpa a Imunidade total (God Mode) como antes', () => {
        const eu = ficha({ combate: { ...COMBATE(), imunidadeTotal: { turnosRestantes: 3, origem: 'x' } } });
        const vilao = ficha({ combate: { ...COMBATE(), imunidadeTotal: { turnosRestantes: 3, origem: 'x' } } });
        montar(Novo, estado(eu, { personagens: { Vilao: vilao } }));
        act(() => { probe.encerrarCombate(); });
        expect('imunidadeTotal' in eu.combate).toBe(false);
        expect(campos('Vilao')['combate/imunidadeTotal']).toBeNull();
    });
    it('fimDeLuta zera o limite "por turno" (usosPoderes turno) do jogador no encerrar', () => {
        const eu = ficha({ combate: { ...COMBATE(), usosPoderes: { 'p1:k': { n: 1, cena: 'c', turno: true }, p2: { n: 1, cena: 'c' } } } });
        montar(Novo, estado(eu));
        act(() => { probe.encerrarCombate(); });
        expect(Object.keys(eu.combate.usosPoderes)).toEqual(['p2']);
    });
    it('descansar: contadores de cena zeram, permanentes ficam, gatilho fimDeLuta dispara e o feed mostra antes do "descansou"', () => {
        const eu = ficha({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [G({ nome: 'Fim', evento: { tipo: 'fimDeLuta' }, acoes: [{ tipo: 'mensagem', texto: 'paz' }] })] }], contadores: marca() });
        montar(Novo, estado(eu));
        act(() => { probe.descansar(); });
        expect(eu.contadores.map(c => c.valor)).toEqual([0, 4]);
        const f = feeds();
        expect(f[0]).toContain('🔔 Mestre: Fim: paz'); expect(f[1]).toContain('descansou');
        expect(fb.salvarFichaSilencioso).toHaveBeenCalled();
    });
    it('descansar sem gatilhos mas com contador de cena: zera e SALVA (mesmo sem frase)', () => {
        const eu = ficha({ contadores: marca() });
        montar(Novo, estado(eu));
        act(() => { probe.descansar(); });
        expect(eu.contadores[0].valor).toBe(0);
        expect(fb.salvarFichaSilencioso.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('Fase 2 - avancarTurno (turnoFim, turnoInicio, poderDesligou)', () => {
    const cura = (extra = {}) => G({ id: 'cc', nome: 'Cura Criacao', evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'curar', modo: 'fixo', valor: 100 }], ...extra });
    const cenarioIdx = (i) => ({ ativa: 'c', combates: { c: { ativo: true, rodada: 1 } }, lista: { c: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: i, zonas: [] });
    it('turnoInicio do dono (eu): cura 100, uma vez por turno com limite; o proximo turno cura de novo', () => {
        const eu = ficha({ iniciativa: 20, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [cura({ limite: { max: 1, por: 'turno' } })] }] });
        eu.vida.atual = 100 * F;
        const outro = ficha({ iniciativa: 10 });
        montar(Novo, estado(eu, { personagens: { Vilao: outro }, cenario: cenarioIdx(1) }));
        act(() => { probe.avancarTurno(); }); // Vilao acaba, eu comeca
        expect(eu.vida.atual).toBe(200 * F);
        expect(feeds().some(t => t.startsWith('🔔 Mestre:') && t.includes('Cura Criacao curou 100'))).toBe(true);
        expect(eu.combate.usosPoderes['p1:cc']).toEqual({ n: 1, cena: expect.any(String), turno: true });
        cleanup(); vi.clearAllMocks();
        montar(Novo, estado(eu, { personagens: { Vilao: outro }, cenario: cenarioIdx(1) }));
        act(() => { probe.avancarTurno(); });
        expect(eu.vida.atual).toBe(300 * F);
    });
    it('turnoInicio de OUTRO jogador: grava so os caminhos tocados (vida, usos) no nó dele; ficha espelhada nao muda', () => {
        const vilao = ficha({ iniciativa: 10, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [cura({ limite: { max: 1, por: 'turno' } })] }], contadores: [ct('z', { valor: 2 })] });
        vilao.vida.atual = 100 * F;
        montar(Novo, estado(ficha({ iniciativa: 20 }), { personagens: { Vilao: vilao }, cenario: cenarioIdx(0) }));
        act(() => { probe.avancarTurno(); });
        const c = campos('Vilao');
        expect(c['vida/atual']).toBe(200 * F);
        expect(c['combate/usosPoderes']['p1:cc']).toMatchObject({ n: 1, turno: true });
        expect(Object.keys(c).some(k => k === 'contadores' || k === 'poderes')).toBe(false); // nunca o array inteiro
        expect(vilao.vida.atual).toBe(100 * F);
        expect(feeds().some(t => t.startsWith('🔔 Vilao:'))).toBe(true);
        expect(Object.values(c).every(v => v !== undefined)).toBe(true);
    });
    it('turnoFim de quem ACABA: em mim muta a minha ficha; em outro jogador grava caminhos do contador pelo id na ficha mais fresca', () => {
        const gat = [G({ nome: 'Fim', evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] })];
        const eu = ficha({ iniciativa: 20, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: gat }], contadores: [ct('k')] });
        const vilao = ficha({ iniciativa: 10, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: gat }], contadores: [ct('x'), ct('y'), ct('k', { valor: 5 })] });
        montar(Novo, estado(eu, { personagens: { Vilao: vilao }, cenario: cenarioIdx(0) }));
        act(() => { probe.avancarTurno(); }); // eu acaba
        expect(eu.contadores[0].valor).toBe(1); expect(campos('Mestre')).toBeNull();
        cleanup(); vi.clearAllMocks();
        montar(Novo, estado(eu, { personagens: { Vilao: vilao }, cenario: cenarioIdx(1) }));
        act(() => { probe.avancarTurno(); }); // Vilao acaba
        expect(campos('Vilao')).toEqual({ 'contadores/2/valor': 6 });
        expect(feeds().some(t => t.includes('🔔 Vilao: Fim: k 5 → 6'))).toBe(true);
    });
    it('turnoFim em MIM tambem salva a ficha (debounce) e nao exige gatilho no proximo', () => {
        const eu = ficha({ iniciativa: 20, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [G({ evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'mensagem', texto: 'tchau' }] })] }] });
        montar(Novo, estado(eu, { personagens: { Vilao: ficha({ iniciativa: 10 }) } }));
        act(() => { probe.avancarTurno(); });
        expect(feeds()[0]).toContain('tchau');
        expect(fb.salvarFichaSilencioso).toHaveBeenCalled();
    });
    it('um gatilho com erro no turnoFim NAO impede a passagem do turno', () => {
        const eu = ficha({ iniciativa: 20, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [G({ evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] })] }] });
        const st = estado(eu, { personagens: { Vilao: ficha({ iniciativa: 10 }) } });
        st.updateFicha = vi.fn(() => { throw new Error('boom'); });
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        montar(Novo, st);
        expect(() => act(() => { probe.avancarTurno(); })).not.toThrow();
        expect(fb.salvarCenarioCompleto).toHaveBeenCalledTimes(1);
        erro.mockRestore();
    });
    it('LACO custoPorTurno <-> poderDesligou: Poder sem energia desliga, o gatilho poderDesligou o religa; sem cobrar, sem loop, e o proximo turno repete', () => {
        const poder = { id: 'p1', nome: 'Aura', ativa: true, custoPorTurno: { modo: 'fixo', valor: 50, energia: 'mana' }, gatilhos: [G({ id: 'r', nome: 'Religa', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'ligarPoder', poderId: 'p1' }] })] };
        const eu = ficha({ iniciativa: 20, poderes: [poder] }); eu.mana.atual = 10 * F;
        montar(Novo, estado(eu, { dummies: { d: { nome: 'D', iniciativa: 5, cenaId: 'c', hpAtual: 1 } }, cenario: cenarioIdx(2) }));
        act(() => { probe.avancarTurno(); }); // dummie -> eu
        expect(eu.poderes[0].ativa).toBe(true);
        expect(eu.mana.atual).toBe(10 * F);
        const f = feeds();
        expect(f.some(t => t.includes('Aura desligou: sem mana'))).toBe(true);
        expect(f.some(t => t.includes('Religa ligou Aura'))).toBe(true);
        cleanup(); vi.clearAllMocks();
        montar(Novo, estado(eu, { dummies: { d: { nome: 'D', iniciativa: 5, cenaId: 'c', hpAtual: 1 } }, cenario: cenarioIdx(2) }));
        act(() => { probe.avancarTurno(); });
        expect(eu.poderes[0].ativa).toBe(true);
    });
    it('LACO com recarga em turnos: religar e barrado pela recarga e o Poder fica desligado', () => {
        const poder = { id: 'p1', nome: 'Aura', ativa: true, recargaRestante: 3, custoPorTurno: { modo: 'fixo', valor: 50, energia: 'mana' }, gatilhos: [G({ id: 'r', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'ligarPoder', poderId: 'p1' }] })] };
        const eu = ficha({ iniciativa: 20, poderes: [poder] }); eu.mana.atual = 0;
        montar(Novo, estado(eu, { dummies: { d: { nome: 'D', iniciativa: 5, cenaId: 'c', hpAtual: 1 } }, cenario: cenarioIdx(2) }));
        act(() => { probe.avancarTurno(); });
        expect(eu.poderes[0].ativa).toBe(false);
        expect(feeds().some(t => t.includes('recarga'))).toBe(true);
    });
    it('poderDesligou so dispara no Poder que desligou (o outro Poder ligado sem custo nao reage)', () => {
        const a = { id: 'a', nome: 'A', ativa: true, custoPorTurno: { modo: 'fixo', valor: 50, energia: 'mana' }, gatilhos: [G({ id: 'x', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] })] };
        const b = { id: 'b', nome: 'B', ativa: true, gatilhos: [G({ id: 'x', evento: { tipo: 'poderDesligou' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 10 }] })] };
        const eu = ficha({ iniciativa: 20, poderes: [a, b], contadores: [ct('k')] }); eu.mana.atual = 0;
        montar(Novo, estado(eu, { dummies: { d: { nome: 'D', iniciativa: 5, cenaId: 'c', hpAtual: 1 } }, cenario: cenarioIdx(2) }));
        act(() => { probe.avancarTurno(); });
        expect(eu.contadores[0].valor).toBe(1);
    });
    it('Dummie comecando o turno: nenhum gatilho/evento e executado nele', () => {
        const eu = ficha({ iniciativa: 20, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] })] }], contadores: [ct('k')] });
        montar(Novo, estado(eu, { dummies: { d: { nome: 'D', iniciativa: 5, cenaId: 'c', hpAtual: 1 } }, cenario: cenarioIdx(0) }));
        act(() => { probe.avancarTurno(); }); // eu acaba -> Vilao nao existe, indice 1 = dummie
        expect(eu.contadores[0].valor).toBe(0);
    });
    it('turnoInicio com danoEmSi + God Mode: Imunidade total perde 1 turno ANTES (a ultima volta zera o dano) e o dano e nulo enquanto vale', () => {
        const mk = (turnos) => ficha({ iniciativa: 20, combate: { ...COMBATE(), imunidadeTotal: { turnosRestantes: turnos, origem: 'x' } }, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [G({ evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'danoEmSi', modo: 'fixo', valor: 10 }] })] }] });
        const dois = mk(2); montar(Novo, estado(dois, { personagens: { V: ficha({ iniciativa: 10 }) }, cenario: cenarioIdx(1) }));
        act(() => { probe.avancarTurno(); });
        expect(dois.vida.atual).toBe(1000000000); // ainda imune (2 -> 1)
        cleanup();
        const um = mk(1); montar(Novo, estado(um, { personagens: { V: ficha({ iniciativa: 10 }) }, cenario: cenarioIdx(1) }));
        act(() => { probe.avancarTurno(); });
        expect(um.vida.atual).toBe(1000000000 - 10 * F); // God Mode terminou neste inicio de turno: o dano passa
    });
    it('jogador morto/Vida 0 ainda recebe turnoInicio sem quebrar (curar nao tira de 0 abaixo)', () => {
        const eu = ficha({ iniciativa: 20, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [cura()] }] }); eu.vida.atual = 0;
        montar(Novo, estado(eu, { personagens: { V: ficha({ iniciativa: 10 }) }, cenario: cenarioIdx(1) }));
        expect(() => act(() => { probe.avancarTurno(); })).not.toThrow();
        expect(eu.vida.atual).toBeGreaterThanOrEqual(0);
    });
    it('duplo clique em Passar turno nao dispara turnoFim 2x (guarda do avancandoTurnoRef)', () => {
        const eu = ficha({ iniciativa: 20, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [G({ evento: { tipo: 'turnoFim' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] })] }], contadores: [ct('k')] });
        montar(Novo, estado(eu, { personagens: { V: ficha({ iniciativa: 10 }) }, cenario: cenarioIdx(0) }));
        fb.salvarCenarioCompleto.mockImplementation(() => new Promise(() => {}));
        act(() => { probe.avancarTurno(); probe.avancarTurno(); });
        expect(eu.contadores[0].valor).toBe(1);
    });
});
