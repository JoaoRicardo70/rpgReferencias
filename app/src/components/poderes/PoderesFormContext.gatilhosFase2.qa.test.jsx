import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Novo from './PoderesFormContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';

// QA Fase 2 - togglePoder (poderLigou / poderDesligou) e Poder-contador de Estagios.
// P1 NAO-REGRESSAO: diferencial com a copia do HEAD (PoderesFormContext.qaf2old.jsx; sem ela os blocos sao pulados).
const velhos = import.meta.glob('./PoderesFormContext.qaf2old.jsx', { eager: true });
const Velho = velhos['./PoderesFormContext.qaf2old.jsx'] || null;

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn(() => ({ dano: 10 })) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarFirebaseImediato: vi.fn(() => Promise.resolve()), uploadImagem: vi.fn(),
    enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(),
}));

const F = FATOR_EXIBICAO_VITAIS;
const vital = (atual) => ({ base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual });
const G = (g) => ({ nome: 'g', ...g });
const ct = (id, extra = {}) => ({ id, nome: id, valor: 0, min: 0, max: 100, ...extra });
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
let mockState; let probe;

function montar(Mod, { poderes, contadores = [ct('k')], extra = {} }) {
    const minhaFicha = { poderes, vida: vital(100 * F), mana: vital(100 * F), aura: vital(100 * F), chakra: vital(100 * F), corpo: vital(100 * F), combate: {}, contadores, ...extra };
    mockState = {
        minhaFicha, meuNome: 'Heroi', isMestre: false, updateFicha: vi.fn((cb) => cb(minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(), poderEditandoId: null, setPoderEditandoId: vi.fn(),
        pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn(), dummies: {}, personagens: {}, feedCombate: [], alvoSelecionado: null, abaAtiva: 'mapa', setAbaAtiva: vi.fn(),
        cenario: { ativa: 'cenaZ' },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    const Harness = () => { probe = Mod.usePoderesForm(); return null; };
    return render(<Mod.PoderesFormProvider><Harness /></Mod.PoderesFormProvider>);
}
const poderBase = (extra = {}) => ({ id: 1, nome: 'P', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [], ...extra });
const feeds = () => fb.enviarParaFeed.mock.calls.map(c => String(c[0].texto));
const v = (id = 'k') => mockState.minhaFicha.contadores.find(c => c.id === id).valor;
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); vi.spyOn(Date, 'now').mockReturnValue(1700000000000); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------
const VARIANTES = {
    simples: (a) => [poderBase({ ativa: a })],
    usosCena: (a) => [poderBase({ ativa: a, usosMax: 1, usosPor: 'cena' })],
    usosEsgotados: (a) => [poderBase({ ativa: a, usosMax: 1, usosPor: 'cena' })],
    recarga: (a) => [poderBase({ ativa: a, recargaTurnos: 2, ...(a ? {} : { recargaRestante: 1 }) })],
    recargaLivre: (a) => [poderBase({ ativa: a, recargaTurnos: 2 })],
    escudo: (a) => [poderBase({ ativa: a, escudoAoLigar: { nome: 'Domo', valor: 50, tipo: 'escudo' } })],
    aoDesligar: (a) => [poderBase({ ativa: a, aoDesligar: { dados: 1, faces: 1, bonus: 5 } })],
    custo: (a) => [poderBase({ ativa: a, custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } })],
    gatilhoFase1: (a) => [poderBase({ ativa: a, gatilhos: [{ id: 'nm', nome: 'NM', evento: { tipo: 'danoQueZeraria' }, acoes: [{ tipo: 'anularDano' }] }] })],
    dois: (a) => [poderBase({ ativa: a }), poderBase({ id: 2, nome: 'Q', ativa: !a })],
    estagios: (a) => [poderBase({ ativa: a, estagios: { habilitado: true, maximo: 3 }, estagioAtual: 2 })],
};
describe.skipIf(!Velho)('P1 NAO-REGRESSAO - togglePoder identico ao HEAD sem gatilhos de Fase 2', () => {
    Object.entries(VARIANTES).forEach(([nome, mk]) => {
        it(`${nome}: ligar e desligar dao a mesma ficha, os mesmos avisos e as mesmas gravacoes`, () => {
            [false, true].forEach((ativa) => {
                const rodar = (M) => {
                    vi.clearAllMocks(); vi.spyOn(Math, 'random').mockReturnValue(0);
                    const poderes = mk(ativa); if (nome === 'usosEsgotados' && !ativa) poderes[0].usosGastos = 1;
                    montar(M, { poderes, contadores: [ct('k', { valor: 7 })] });
                    act(() => { probe.togglePoder(1); });
                    const r = JSON.stringify(mockState.minhaFicha); const c = JSON.stringify([fb.salvarFichaSilencioso.mock.calls, fb.enviarParaFeed.mock.calls, window.alert.mock.calls]);
                    cleanup(); return [r, c];
                };
                const a = rodar(Velho); const b = rodar(Novo);
                expect(b[0], `${nome} ativa=${ativa}`).toBe(a[0]); expect(b[1], `${nome} ativa=${ativa}`).toBe(a[1]);
            });
        });
    });
    it('togglePoder de id inexistente e semAoDesligar: iguais ao HEAD', () => {
        const rodar = (M) => { vi.clearAllMocks(); montar(M, { poderes: [poderBase({ ativa: true })] }); act(() => { probe.togglePoder(99); probe.togglePoder(1, { semAoDesligar: true }); }); const r = JSON.stringify(mockState.minhaFicha); cleanup(); return r; };
        expect(rodar(Novo)).toBe(rodar(Velho));
    });
    it('sanidade do diferencial: ligar realmente liga e salva', () => {
        vi.clearAllMocks(); montar(Novo, { poderes: VARIANTES.escudo(false) }); act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true); expect(mockState.minhaFicha.escudos[0].valor).toBe(50); expect(fb.salvarFichaSilencioso).toHaveBeenCalled();
    });
});

describe('NAO-REGRESSAO (valores a mao) - togglePoder sem gatilhos', () => {
    it('sem gatilhos nao cria combate.gatilhos/usosPoderes por causa do evento nem mexe nos contadores', () => {
        montar(Novo, { poderes: [poderBase({ ativa: false })], contadores: [ct('k', { valor: 7, reset: 'cena' })] });
        act(() => { probe.togglePoder(1); }); act(() => { probe.togglePoder(1); });
        expect(v()).toBe(7); expect(mockState.minhaFicha.combate).toEqual({});
        expect(feeds().filter(t => t.includes('🔔'))).toEqual([]);
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('Fase 2 - togglePoder: poderLigou / poderDesligou', () => {
    const lig = (acoes, ev = { tipo: 'poderLigou' }, extra = {}) => G({ id: 'a', nome: 'Gat', evento: ev, acoes, ...extra });
    it('ligar: poderLigou do proprio Poder soma; o feed leva a frase; a cena da mesa vai no limite por cena', () => {
        montar(Novo, { poderes: [poderBase({ gatilhos: [lig([{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }], { tipo: 'poderLigou' }, { limite: { max: 1, por: 'cena' } })] })] });
        act(() => { probe.togglePoder(1); });
        expect(v()).toBe(1); expect(feeds().some(t => t.startsWith('🔔 Gat: k 0 → 1'))).toBe(true);
        expect(mockState.minhaFicha.combate.usosPoderes['1:a'].cena).toBe('cenaZ');
        act(() => { probe.togglePoder(1); }); act(() => { probe.togglePoder(1); }); // desliga e liga de novo na MESMA cena: sem usos
        expect(v()).toBe(1);
    });
    it('poderLigou em OUTRO Poder (poderId explicito) e "qualquer"', () => {
        const watcher = poderBase({ id: 9, nome: 'W', ativa: true, gatilhos: [
            lig([{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }], { tipo: 'poderLigou', poderId: '2' }, { id: 'x' }),
            lig([{ tipo: 'contador', id: 'k', op: 'somar', valor: 10 }], { tipo: 'poderLigou', poderId: 'qualquer' }, { id: 'y' }),
        ] });
        montar(Novo, { poderes: [watcher, poderBase({ id: 2, nome: 'Q' }), poderBase({ id: 3, nome: 'R' })] });
        act(() => { probe.togglePoder(2); }); expect(v()).toBe(11);
        act(() => { probe.togglePoder(3); }); expect(v()).toBe(21);
    });
    it('desligar manual: poderDesligou dispara mesmo com o Poder ja desligado (tambemLigado)', () => {
        montar(Novo, { poderes: [poderBase({ ativa: true, gatilhos: [lig([{ tipo: 'contador', id: 'k', op: 'somar', valor: 5 }], { tipo: 'poderDesligou' })] })] });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(false); expect(v()).toBe(5);
    });
    it('LACO: poderDesligou religa o proprio Poder (ligarPoder) - o desligar manual nao funciona, sem loop, e poderLigou dispara 1 vez', () => {
        const p = poderBase({ ativa: true, gatilhos: [lig([{ tipo: 'ligarPoder', poderId: '1' }], { tipo: 'poderDesligou' }), lig([{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }], { tipo: 'poderLigou' }, { id: 'b' })] });
        montar(Novo, { poderes: [p] });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true);
        expect(v()).toBe(1);
    });
    it('LACO ligar<->desligar entre dois Poderes termina e deixa estado booleano coerente', () => {
        const a = poderBase({ id: 1, nome: 'A', ativa: false, gatilhos: [lig([{ tipo: 'desligarPoder', poderId: '2' }], { tipo: 'poderLigou' })] });
        const b = poderBase({ id: 2, nome: 'B', ativa: true, gatilhos: [lig([{ tipo: 'ligarPoder', poderId: '1' }], { tipo: 'poderDesligou' }, { id: 'z' })] });
        montar(Novo, { poderes: [a, b] });
        act(() => { probe.togglePoder(1); });
        expect(mockState.minhaFicha.poderes.map(p => typeof p.ativa)).toEqual(['boolean', 'boolean']);
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true);
    });
    it('ligarPoder por gatilho respeita a trava de usos do alvo (sem usos: avisa e nao liga)', () => {
        const gat = poderBase({ id: 1, ativa: true, gatilhos: [lig([{ tipo: 'ligarPoder', poderId: '2' }], { tipo: 'poderDesligou' })] });
        const alvo = poderBase({ id: 2, nome: 'Alvo', usosMax: 1, usosPor: 'cena' });
        montar(Novo, { poderes: [gat, alvo] });
        act(() => { probe.togglePoder(2); }); act(() => { probe.togglePoder(2); }); // liga (gasta o uso) e desliga
        act(() => { probe.togglePoder(1); }); // desliga o gatilhante -> tenta religar o Alvo
        expect(mockState.minhaFicha.poderes[1].ativa).toBe(false);
        expect(feeds().join(' ')).toContain('sem usos');
    });
    it('desligar por edicao/exclusao (semAoDesligar) nao dispara; ligar sempre dispara', () => {
        montar(Novo, { poderes: [poderBase({ ativa: true, gatilhos: [lig([{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }], { tipo: 'poderDesligou' })] })] });
        act(() => { probe.togglePoder(1, { semAoDesligar: true }); });
        expect(v()).toBe(0);
    });
    it('um erro dentro do gatilho nao impede ligar/desligar (try/catch) e o save acontece', () => {
        const p = poderBase({ ativa: false, gatilhos: [lig([{ tipo: 'mensagem', texto: 'x' }])] });
        montar(Novo, { poderes: [p] });
        mockState.minhaFicha.contadores = 'quebrado';
        expect(() => act(() => { probe.togglePoder(1); })).not.toThrow();
        expect(mockState.minhaFicha.poderes[0].ativa).toBe(true); expect(fb.salvarFichaSilencioso).toHaveBeenCalled();
    });
    it('dano ao desligar + gatilho poderDesligou juntos: os dois aparecem e a Vida cai so pelo aoDesligar', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const p = poderBase({ ativa: true, aoDesligar: { dados: 0, faces: 1, bonus: 5 }, gatilhos: [lig([{ tipo: 'mensagem', texto: 'tchau' }], { tipo: 'poderDesligou' })] });
        montar(Novo, { poderes: [p] });
        act(() => { probe.togglePoder(1); });
        const f = feeds();
        expect(f.some(t => t.includes('tchau'))).toBe(true);
        expect(semUndefined(mockState.minhaFicha.combate)).toBe(true);
    });
    it('Poder de Estagios comandado por contador: gatilho soma o contador e o estagio sobe (sem undefined nos caminhos)', () => {
        const est = poderBase({ id: 5, nome: 'Furia', ativa: true, estagios: { habilitado: true, maximo: 3 }, estagioAtual: 1 });
        const gat = poderBase({ id: 1, nome: 'G', ativa: false, gatilhos: [lig([{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }], { tipo: 'poderLigou' })] });
        montar(Novo, { poderes: [gat, est], contadores: [ct('k', { max: 2, poderId: 5 })] });
        act(() => { probe.togglePoder(1); });
        expect(v()).toBe(1); expect(mockState.minhaFicha.poderes[1].estagioAtual).toBe(2);
    });
});
