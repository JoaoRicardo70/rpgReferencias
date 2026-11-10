import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Novo from './MapaFormContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';

// QA - troca de cena ativa (ativarCena) encerra o "combate" da cena que saiu: fimDeLuta + Imunidade total; encerrarCombate inalterado.
vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), uploadImagem: vi.fn(),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()), zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
}));

const vital = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: base, regeneracao: 0 });
const ct = (id, extra = {}) => ({ id, nome: id, valor: 0, min: 0, max: 100, ...extra });
const marca = () => [ct('marca', { valor: 4, reset: 'cena' }), ct('perm', { valor: 4 })];
const G = (g) => ({ nome: 'g', ...g });
const FIM = (acoes, nome = 'Fim') => G({ nome, evento: { tipo: 'fimDeLuta' }, acoes });
const ficha = (extra = {}) => ({
    iniciativa: 10, posicao: { x: 0, y: 0, z: 0 }, posicoes: { A: { x: 0, y: 0, z: 0, cenaId: 'A' } },
    acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
    vida: vital(1000000000), mana: vital(1000000), aura: vital(1000000), chakra: vital(1000000), corpo: vital(1000000),
    forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 }, sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 },
    carisma: { base: 1000000 }, stamina: { base: 1000000 }, constituicao: { base: 1000000 },
    multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {}, poderes: [], inventario: [], passivas: [], combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
    ...extra,
});
const noA = (extra) => ficha(extra);
const noB = (extra) => ficha({ posicoes: { B: { x: 0, y: 0, z: 0, cenaId: 'B' } }, ...extra });
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');

let storeState; let probe;
function montar(state) {
    storeState = state;
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(storeState) : storeState));
    useStore.getState = () => storeState;
    const Harness = () => { probe = Novo.useMapaForm(); return null; };
    render(<Novo.MapaFormProvider><Harness /></Novo.MapaFormProvider>);
}
const estado = (eu, extra = {}) => ({
    minhaFicha: eu, meuNome: 'Mestre', personagens: {}, updateFicha: vi.fn((cb) => cb(eu)), feedCombate: [],
    isMestre: true, mesaCriador: 'Mestre', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
    cenario: { ativa: 'A', lista: { A: { nome: 'Alfa', escala: 1.5 }, B: { nome: 'Beta', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [] },
    ...extra,
});
const feeds = () => fb.enviarParaFeed.mock.calls.map((c) => String(c[0].texto));
const SINO = '\u{1F514}';
const campos = (n) => (fb.salvarCamposPersonagem.mock.calls.find((c) => c[0] === n) || [null, null])[1];
const todosCampos = (n) => fb.salvarCamposPersonagem.mock.calls.filter((c) => c[0] === n).map((c) => c[1]);
const ativar = (id) => act(() => { probe.ativarCena(id); });

beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); vi.spyOn(Math, 'random').mockReturnValue(0); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ativarCena: troca de cena encerra o combate da que saiu', () => {
    it('troca A->B: contadores cena zeram em mim e em outro jogador na A; permanentes ficam', () => {
        const eu = noA({ contadores: marca() }); const vilao = noA({ contadores: marca() });
        montar(estado(eu, { personagens: { Vilao: vilao } }));
        ativar('B');
        expect(eu.contadores.map((c) => c.valor)).toEqual([0, 4]);
        expect(campos('Vilao')['contadores/0/valor']).toBe(0);
        expect(Object.keys(campos('Vilao')).some((k) => k.startsWith('contadores/1'))).toBe(false);
        expect(vilao.contadores[0].valor).toBe(4);
    });
    it('troca grava o novo cenario ativo e o feed de mudanca, e NAO zera iniciativa', () => {
        const eu = noA(); const vilao = noA();
        montar(estado(eu, { personagens: { Vilao: vilao } }));
        ativar('B');
        expect(fb.salvarCenarioCompleto.mock.calls[0][0].ativa).toBe('B');
        expect(feeds().some((t) => t.includes('Beta'))).toBe(true);
        expect(eu.iniciativa).toBe(10); expect(vilao.iniciativa).toBe(10);
        expect(fb.zerarIniciativaGlobal).not.toHaveBeenCalled();
        expect(fb.salvarDummie).not.toHaveBeenCalled();
    });
    it('mesma cena ativa: nao dispara nada', () => {
        const eu = noA({ contadores: marca() }); const vilao = noA({ contadores: marca() });
        montar(estado(eu, { personagens: { Vilao: vilao } }));
        ativar('A');
        expect(eu.contadores.map((c) => c.valor)).toEqual([4, 4]);
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(feeds().some((t) => t.includes(SINO))).toBe(false);
    });
    it('cenario.ativa ausente conta como default; posicao legada sem cenaId = default', () => {
        const eu = ficha({ posicoes: undefined, posicao: { x: 0, y: 0 }, contadores: marca() });
        const st = estado(eu); st.cenario = { lista: { default: { nome: 'D' }, B: { nome: 'Beta' } }, turnoAtualIndex: 0, zonas: [] };
        montar(st);
        ativar('B');
        expect(eu.contadores.map((c) => c.valor)).toEqual([0, 4]);
    });
    it('quem nao esta na cena que saiu NAO recebe: sem iniciativa, iniciativa negativa, ou posicao em outra cena', () => {
        const eu = noA();
        const semIni = noA({ iniciativa: 0, contadores: marca() });
        const emB = noB({ contadores: marca() });
        const negIni = noA({ iniciativa: -1, contadores: marca() });
        montar(estado(eu, { personagens: { SemIni: semIni, EmB: emB, Neg: negIni } }));
        ativar('B');
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(semIni.contadores[0].valor).toBe(4); expect(emB.contadores[0].valor).toBe(4);
    });
    it('eu em outra cena (fora da A): minha ficha nao e mexida, os da A sim', () => {
        const eu = noB({ contadores: marca() });
        montar(estado(eu, { personagens: { Vilao: noA({ contadores: marca() }) } }));
        ativar('B');
        expect(eu.contadores.map((c) => c.valor)).toEqual([4, 4]);
        expect(campos('Vilao')).not.toBeNull();
    });
    it('posicao legada com cenaId da cena que saiu conta; com cenaId de outra nao', () => {
        const leg = ficha({ posicoes: undefined, posicao: { x: 0, y: 0, cenaId: 'A' }, contadores: marca() });
        const legOutra = ficha({ posicoes: undefined, posicao: { x: 0, y: 0, cenaId: 'B' }, contadores: marca() });
        montar(estado(noA(), { personagens: { Leg: leg, LegB: legOutra } }));
        ativar('B');
        expect(campos('Leg')).not.toBeNull(); expect(campos('LegB')).toBeNull();
    });
    it('Dummies nao recebem gatilho nem quebram', () => {
        const eu = noA({ contadores: marca() });
        montar(estado(eu, { dummies: { d1: { nome: 'D', iniciativa: 5, cenaId: 'A', hpAtual: 10 } } }));
        expect(() => ativar('B')).not.toThrow();
        expect(eu.contadores[0].valor).toBe(0);
        expect(fb.salvarDummie).not.toHaveBeenCalled();
    });
    it('Imunidade total acaba em mim e nos outros na cena; so quem tinha gera gravacao', () => {
        const imu = () => ({ fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0, imunidadeTotal: { turnosRestantes: 3, origem: 'x' } });
        const eu = noA({ combate: imu() }); const v1 = noA({ combate: imu() }); const v2 = noA();
        montar(estado(eu, { personagens: { V1: v1, V2: v2 } }));
        ativar('B');
        expect('imunidadeTotal' in eu.combate).toBe(false);
        expect(todosCampos('V1').some((c) => c['combate/imunidadeTotal'] === null)).toBe(true);
        expect(todosCampos('V2').some((c) => 'combate/imunidadeTotal' in c)).toBe(false);
    });
    it('Imunidade total de quem esta em OUTRA cena nao e removida', () => {
        const v = noB({ combate: { fadigaTurnos: 0, imunidadeTotal: { turnosRestantes: 3 } } });
        montar(estado(noA(), { personagens: { V: v } }));
        ativar('B');
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('gatilho fimDeLuta de outro jogador: grava caminhos sem undefined e feed com nome', () => {
        const vilao = noA({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [FIM([{ tipo: 'mensagem', texto: 'acabou' }, { tipo: 'contador', id: 'k', op: 'zerar' }])] }], contadores: [ct('k', { valor: 3 })] });
        montar(estado(noA(), { personagens: { Vilao: vilao } }));
        ativar('B');
        const c = campos('Vilao');
        expect(c['contadores/0/valor']).toBe(0);
        expect(Object.values(c).every((v) => v !== undefined)).toBe(true);
        expect(feeds().some((t) => t.startsWith(SINO + ' Vilao:') && t.includes('acabou'))).toBe(true);
    });
    it('gatilho fimDeLuta meu: dispara 1 vez, feed com meu nome, ficha sem undefined', () => {
        const eu = noA({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [FIM([{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }, { tipo: 'mensagem', texto: 'fim' }])] }], contadores: [ct('k')] });
        montar(estado(eu));
        ativar('B');
        expect(eu.contadores[0].valor).toBe(1);
        expect(feeds().filter((t) => t.startsWith(SINO + ' Mestre:')).length).toBe(1);
        expect(semUndefined(eu)).toBe(true);
    });
    it('limite "por turno" de usosPoderes zera na troca', () => {
        const eu = noA({ combate: { fadigaTurnos: 0, usosPoderes: { 'p1:k': { n: 1, cena: 'A', turno: true }, p2: { n: 1, cena: 'A' } } } });
        montar(estado(eu));
        ativar('B');
        expect(Object.keys(eu.combate.usosPoderes)).toEqual(['p2']);
    });
    it('ficha minima (sem contadores/combate/poderes) nao quebra', () => {
        const eu = { iniciativa: 10, posicoes: { A: { x: 0, y: 0, cenaId: 'A' } } };
        montar(estado(eu, { personagens: { V: { iniciativa: 5, posicoes: { A: { x: 0, y: 0, cenaId: 'A' } } } } }));
        expect(() => ativar('B')).not.toThrow();
        expect(eu.iniciativa).toBe(10);
    });
    it('troca B->A depois: processa a cena B (quem esta em B recebe)', () => {
        const eu = noA({ contadores: marca() }); const vb = noB({ contadores: marca() });
        const st = estado(eu, { personagens: { VB: vb } });
        st.cenario.ativa = 'B';
        montar(st);
        ativar('A');
        expect(campos('VB')).not.toBeNull();
        expect(eu.contadores.map((c) => c.valor)).toEqual([4, 4]);
    });
    it('troca para id inexistente na lista: nao quebra e ainda encerra a cena anterior', () => {
        const eu = noA({ contadores: marca() });
        montar(estado(eu));
        expect(() => ativar('Z')).not.toThrow();
        expect(eu.contadores[0].valor).toBe(0);
    });
});

describe('encerrarCombate (refatorado): comportamento antigo mantido', () => {
    it('zera iniciativa, contadores cena em mim/outro na cena, nao toca quem esta fora', () => {
        const eu = noA({ contadores: marca() }); const vilao = noA({ contadores: marca() }); const fora = noA({ iniciativa: 0, contadores: marca() }); const emB = noB({ contadores: marca() });
        montar(estado(eu, { personagens: { Vilao: vilao, Fora: fora, EmB: emB } }));
        act(() => { probe.encerrarCombate(); });
        expect(eu.iniciativa).toBe(0);
        expect(eu.contadores.map((c) => c.valor)).toEqual([0, 4]);
        expect(campos('Vilao')['contadores/0/valor']).toBe(0);
        expect(campos('Fora')).toBeNull(); expect(campos('EmB')).toBeNull();
        expect(fb.zerarIniciativaGlobal).toHaveBeenCalledWith(['Mestre', 'Vilao']);
        expect(fb.salvarCenarioCompleto).toHaveBeenCalled();
    });
    it('cancelado nao faz nada', () => {
        window.confirm = vi.fn(() => false);
        const eu = noA({ contadores: marca() });
        montar(estado(eu));
        act(() => { probe.encerrarCombate(); });
        expect(eu.contadores[0].valor).toBe(4); expect(eu.iniciativa).toBe(10); expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('Imunidade total some em mim e nos outros; fimDeLuta de outro dispara uma unica vez', () => {
        const mk = () => noA({ combate: { fadigaTurnos: 0, imunidadeTotal: { turnosRestantes: 2 } }, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [FIM([{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }])] }], contadores: [ct('k')] });
        const eu = mk(); const vilao = mk();
        montar(estado(eu, { personagens: { Vilao: vilao } }));
        act(() => { probe.encerrarCombate(); });
        expect('imunidadeTotal' in eu.combate).toBe(false);
        expect(eu.contadores[0].valor).toBe(1);
        expect(todosCampos('Vilao').some((c) => c['combate/imunidadeTotal'] === null)).toBe(true);
        expect(fb.salvarCamposPersonagem.mock.calls.filter((c) => c[0] === 'Vilao' && 'contadores/0/valor' in c[1]).length).toBe(1);
    });
    it('eu fora da cena: encerrarCombate ainda zera minha iniciativa como antes', () => {
        const eu = noB({ iniciativa: 7, contadores: marca() });
        montar(estado(eu, { personagens: { Vilao: noA({ contadores: marca() }) } }));
        act(() => { probe.encerrarCombate(); });
        expect(eu.iniciativa).toBe(0);
        expect(campos('Vilao')).not.toBeNull();
    });
});
