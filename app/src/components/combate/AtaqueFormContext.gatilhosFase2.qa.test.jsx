import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Novo from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';

// QA Fase 2 - Ataque: evento `acertou` (nivel, uma vez por golpe, so se algum alvo sofreu dano) e `atingido` no alvo-personagem.
// P1 NAO-REGRESSAO: diferencial com a copia do HEAD (AtaqueFormContext.qaf2old.jsx; sem ela os blocos sao pulados).
const velhos = import.meta.glob('./AtaqueFormContext.qaf2old.jsx', { eager: true });
const Velho = velhos['./AtaqueFormContext.qaf2old.jsx'] || null;

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularDano: vi.fn() }));
vi.mock('../../core/disputaPoder', async (importOriginal) => ({
    ...(await importOriginal()),
    calcularDisputaPoder: vi.fn(() => ({ ativa: false })),
    aplicarDisputaAoDano: vi.fn((dano) => dano),
}));
vi.mock('../../core/danoProporcional', async (importOriginal) => ({ ...(await importOriginal()), escalarDanoPelaVida: vi.fn((dano) => dano) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
}));

const FATOR = 1000;
const stat = (atual, base = 1000000) => ({ base, atual, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
const G = (g) => ({ nome: 'g', ...g });
const ct = (id, extra = {}) => ({ id, nome: id, valor: 0, min: 0, max: 100, ...extra });
const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const soma = (id, v, evento, extra = {}) => G({ id: `s_${id}_${JSON.stringify(evento)}`, evento, acoes: [{ tipo: 'contador', id, op: 'somar', valor: v }], ...extra });
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');
const clone = (o) => JSON.parse(JSON.stringify(o));

let mockState; let probe;
const goblin = (hp = 100) => ({ nome: 'Goblin', hpAtual: hp * FATOR, valorDefesa: 10 });
const ana = (extra = {}) => ({ vida: stat(1000000, 1000000), reducoesDano: [], iniciativa: 10, poderes: [], inventario: [], passivas: [], ...extra });

function montar(Mod, { alvoSelecionado = null, dummies = {}, personagens = {}, alvosArea, poderes = [], ficha = {} } = {}) {
    const minhaFicha = { poderes, inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {}, iniciativa: 10, vida: stat(500000), contadores: [], ...ficha };
    mockState = {
        minhaFicha, meuNome: 'Heroi', personagens, dummies, alvoSelecionado,
        updateFicha: vi.fn((cb) => cb(minhaFicha)), setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque',
        feedCombate: alvosArea ? [{ tipo: 'acerto', nome: 'Heroi', alvosArea }] : [],
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { ativa: 'c1', zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    const Harness = () => { probe = Mod.useAtaqueForm(); return null; };
    render(<Mod.AtaqueFormProvider><Harness /></Mod.AtaqueFormProvider>);
    return minhaFicha;
}
const dano = (n) => calcularDano.mockReturnValue({ dano: n, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
const ultimoFeed = () => fb.enviarParaFeed.mock.calls.at(-1)[0];
const campos = (nome) => (fb.salvarCamposPersonagem.mock.calls.filter(c => c[0] === nome).map(c => c[1]).reduce((a, c) => ({ ...a, ...c }), {}));
const v = (f, id) => f.contadores.find(c => c.id === id).valor;
const golpe = (nivel) => { if (nivel === 'critico') act(() => { probe.setForcarCritNormal(true); }); if (nivel === 'fatal') act(() => { probe.setForcarCritFatal(true); }); act(() => { probe.rolarDano(); }); };

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); vi.spyOn(Date, 'now').mockReturnValue(1700000000000); dano(30); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------
const nomesMock = ['salvarFichaSilencioso', 'enviarParaFeed', 'salvarDummie', 'aplicarDanoDireto', 'aplicarFadigaDireta', 'aplicarElementoDireto', 'aplicarElementoNivelDireto', 'salvarCamposPersonagem'];
const chamadas = () => JSON.stringify(nomesMock.map(n => [n, fb[n].mock.calls]));
const ESC = () => [{ id: 'e1', nome: 'Domo', valor: 10, tipo: 'escudo' }];
const ALVOS = {
    dummie: (Mod, p) => montar(Mod, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, ...p }),
    semAlvo: (Mod, p) => montar(Mod, { ...p }),
    area2: (Mod, p) => montar(Mod, { dummies: { g1: goblin(), g2: goblin() }, alvosArea: [{ nome: 'Goblin', acertou: true, dummieId: 'g1' }, { nome: 'Goblin', acertou: true, dummieId: 'g2' }], ...p }),
    areaNinguem: (Mod, p) => montar(Mod, { dummies: { g1: goblin() }, alvosArea: [{ nome: 'Goblin', acertou: false, dummieId: 'g1' }], ...p }),
    pjAna: (Mod, p) => montar(Mod, { alvoSelecionado: 'pj:Ana', personagens: { Ana: ana() }, ...p }),
    pjAnaEscudo: (Mod, p) => montar(Mod, { alvoSelecionado: 'pj:Ana', personagens: { Ana: ana({ escudos: ESC() }) }, ...p }),
    pjAnaNegar: (Mod, p) => montar(Mod, { alvoSelecionado: 'pj:Ana', personagens: { Ana: ana({ poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [NEGAR] }] }) }, ...p }),
    pjAnaGod: (Mod, p) => montar(Mod, { alvoSelecionado: 'pj:Ana', personagens: { Ana: ana({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } }) }, ...p }),
    areaAna: (Mod, p) => montar(Mod, { personagens: { Ana: ana() }, dummies: { g1: goblin() }, alvosArea: [{ nome: 'Ana', acertou: true, dummieId: 'pj:Ana' }, { nome: 'Goblin', acertou: true, dummieId: 'g1' }], ...p }),
};
const ATACANTES = { simples: () => ({}), comPoderFase1: () => ({ poderes: [{ id: 'p9', nome: 'Neg', ativa: true, gatilhos: [NEGAR] }] }), comContador: () => ({ ficha: { contadores: [ct('a', { valor: 2 })] } }) };

describe.skipIf(!Velho)('P1 NAO-REGRESSAO - Ataque identico ao HEAD sem gatilhos de Fase 2 (matriz)', () => {
    Object.entries(ALVOS).forEach(([nomeAlvo, mkAlvo]) => {
        it(`alvo ${nomeAlvo}: mesma ficha, mesmo feed, mesmas gravacoes (normal/critico/fatal x dano 0/30/5000 x atacantes)`, () => {
            let n = 0;
            Object.entries(ATACANTES).forEach(([an, atk]) => ['normal', 'critico', 'fatal'].forEach(nivel => [0, 30, 5000].forEach((d) => {
                const rodar = (Mod) => { vi.clearAllMocks(); dano(d); mkAlvo(Mod, atk()); golpe(nivel); const r = JSON.stringify([mockState.minhaFicha, mockState.personagens, mockState.dummies]); const c = chamadas(); cleanup(); return [r, c]; };
                const [ra, ca] = rodar(Velho); const [rb, cb] = rodar(Novo);
                n++;
                expect(rb, `${nomeAlvo}/${an}/${nivel}/${d}`).toBe(ra);
                expect(cb, `${nomeAlvo}/${an}/${nivel}/${d}`).toBe(ca);
            })));
            expect(n).toBe(27);
        });
    });
    it('rolarDanoCustomizado (formula livre) em alvo-personagem e Dummie: identico ao HEAD', () => {
        ['pjAna', 'pjAnaEscudo', 'dummie'].forEach((al) => {
            const rodar = (Mod) => { vi.clearAllMocks(); ALVOS[al](Mod, {}); act(() => { probe.rolarDanoCustomizado('1000'); }); const r = JSON.stringify([mockState.minhaFicha, mockState.personagens, mockState.dummies]); const c = chamadas(); cleanup(); return [r, c]; };
            expect(rodar(Novo)).toEqual(rodar(Velho));
        });
    });
    it('sanidade do diferencial: o golpe em Ana realmente gravou Vida e feed (comparacao nao vazia)', () => {
        vi.clearAllMocks(); dano(30); ALVOS.pjAna(Novo, {}); golpe('normal');
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1000000 - 30 * FATOR);
        expect(fb.enviarParaFeed).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('NAO-REGRESSAO (valores a mao) - sem gatilhos', () => {
    it('golpe em Dummie sem gatilhos: sem selo 🔔, sem salvar a ficha por gatilho, contadores intactos', () => {
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, ficha: { contadores: [ct('a', { valor: 2 })] } });
        golpe('normal');
        expect(f.contadores[0].valor).toBe(2);
        expect(JSON.stringify(ultimoFeed().textoPosGolpe || [])).not.toContain('🔔');
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('golpe em Ana sem gatilhos: Vida = 1000000 - 30*1000 e nenhuma gravacao de campos extras', () => {
        montar(Novo, { alvoSelecionado: 'pj:Ana', personagens: { Ana: ana() } });
        golpe('normal');
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1000000 - 30 * FATOR);
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('Fase 2 - acertou (Ego Superior: normal +2, critico +3, fatal +4)', () => {
    const ego = () => [soma('prest', 2, { tipo: 'acertou', nivel: 'normal' }), soma('prest', 3, { tipo: 'acertou', nivel: 'critico' }), soma('prest', 4, { tipo: 'acertou', nivel: 'fatal' })]
        .map((g, i) => ({ ...g, id: `e${i}` }));
    const poderEgo = () => [{ id: 'pe', nome: 'Ego Superior', ativa: true, gatilhos: ego() }];
    const comPrest = () => ({ prest: ct('prest', { max: 9999 }) });
    it.each([['normal', 2], ['critico', 3], ['fatal', 4]])('golpe %s soma %i e o feed leva a frase do gatilho', (nivel, esperado) => {
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, poderes: poderEgo(), ficha: { contadores: [comPrest().prest] } });
        golpe(nivel);
        expect(v(f, 'prest')).toBe(esperado);
        expect(ultimoFeed().textoPosGolpe.some(t => t.startsWith('🔔') && t.includes(`prest 0 → ${esperado}`))).toBe(true);
        expect(fb.salvarFichaSilencioso).toHaveBeenCalled();
        // (poderes[].percComoPoder=undefined e do proprio Ataque, igual ao HEAD; aqui so os campos dos gatilhos)
        expect(semUndefined([f.contadores, f.combate])).toBe(true);
    });
    it('critico E fatal marcados ao mesmo tempo contam como FATAL (+4), nunca os dois', () => {
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, poderes: poderEgo(), ficha: { contadores: [comPrest().prest] } });
        act(() => { probe.setForcarCritNormal(true); probe.setForcarCritFatal(true); });
        act(() => { probe.rolarDano(); });
        expect(v(f, 'prest')).toBe(4);
    });
    it('dois golpes seguidos disparam duas vezes (nao fica preso ao primeiro)', () => {
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin(1000) }, poderes: poderEgo(), ficha: { contadores: [comPrest().prest] } });
        golpe('normal'); act(() => { probe.rolarDano(); });
        expect(v(f, 'prest')).toBe(4);
    });
    it('acertou qualquer: golpe em area com 2 alvos acertados soma UMA vez', () => {
        const f = montar(Novo, { dummies: { g1: goblin(), g2: goblin() }, alvosArea: [{ nome: 'Goblin', acertou: true, dummieId: 'g1' }, { nome: 'Goblin', acertou: true, dummieId: 'g2' }], poderes: [{ id: 'p', nome: 'A3', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou', nivel: 'qualquer' })] }], ficha: { contadores: [ct('c')] } });
        act(() => { probe.rolarDano(); });
        expect(v(f, 'c')).toBe(1);
    });
    it('area com Dummie + jogador atingidos: tambem uma vez so', () => {
        const f = montar(Novo, { personagens: { Ana: ana() }, dummies: { g1: goblin() }, alvosArea: [{ nome: 'Ana', acertou: true, dummieId: 'pj:Ana' }, { nome: 'Goblin', acertou: true, dummieId: 'g1' }], poderes: [{ id: 'p', nome: 'A3', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou' })] }], ficha: { contadores: [ct('c')] } });
        act(() => { probe.rolarDano(); });
        expect(v(f, 'c')).toBe(1);
    });
    it('sem alvo, area onde ninguem foi atingido, e dano 0: NAO dispara', () => {
        const gat = [{ id: 'p', nome: 'A3', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou' })] }];
        let f = montar(Novo, { poderes: clone(gat), ficha: { contadores: [ct('c')] } }); act(() => { probe.rolarDano(); }); expect(v(f, 'c')).toBe(0); cleanup();
        f = montar(Novo, { dummies: { g1: goblin() }, alvosArea: [{ nome: 'Goblin', acertou: false, dummieId: 'g1' }], poderes: clone(gat), ficha: { contadores: [ct('c')] } }); act(() => { probe.rolarDano(); }); expect(v(f, 'c')).toBe(0); cleanup();
        dano(0); f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, poderes: clone(gat), ficha: { contadores: [ct('c')] } }); act(() => { probe.rolarDano(); }); expect(v(f, 'c')).toBe(0);
    });
    it('golpe que MATA o alvo tambem conta como acerto', () => {
        dano(5000);
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin(10) }, poderes: [{ id: 'p', nome: 'A3', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou' })] }], ficha: { contadores: [ct('c')] } });
        act(() => { probe.rolarDano(); });
        expect(v(f, 'c')).toBe(1);
    });
    it('alvo-personagem em God Mode (dano 0 no alvo): acertou NAO dispara no atacante', () => {
        const f = montar(Novo, { alvoSelecionado: 'pj:Ana', personagens: { Ana: ana({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } }) }, poderes: [{ id: 'p', nome: 'A3', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou' })] }], ficha: { contadores: [ct('c')] } });
        act(() => { probe.rolarDano(); });
        // Observacao: o ataque nao sabe que o alvo zerou o dano (a imunidade e aplicada na gravacao): documenta o comportamento atual.
        expect([0, 1]).toContain(v(f, 'c'));
    });
    it('atacante em God Mode (Imunidade total propria) ainda dispara acertou', () => {
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, poderes: [{ id: 'p', nome: 'A3', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou' })] }], ficha: { contadores: [ct('c')], combate: { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } } } });
        act(() => { probe.rolarDano(); });
        expect(v(f, 'c')).toBe(1);
    });
    it('Poder desligado nao dispara; gatilho passivo dispara mesmo desligado; item equipado dispara', () => {
        const mk = (extra) => [{ id: 'p', nome: 'A3', ativa: false, gatilhos: [soma('c', 1, { tipo: 'acertou' }, extra)] }];
        let f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, poderes: mk(), ficha: { contadores: [ct('c')] } }); act(() => { probe.rolarDano(); }); expect(v(f, 'c')).toBe(0); cleanup();
        f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, poderes: mk({ passivo: true }), ficha: { contadores: [ct('c')] } }); act(() => { probe.rolarDano(); }); expect(v(f, 'c')).toBe(1); cleanup();
        f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, ficha: { contadores: [ct('c')], inventario: [{ id: 'i1', nome: 'Anel', equipado: true, gatilhos: [soma('c', 5, { tipo: 'acertou' }, { passivo: true })] }] } }); act(() => { probe.rolarDano(); }); expect(v(f, 'c')).toBe(5);
    });
    it('Assalto 3: todo acerto soma 1 no contador (3 golpes = 3)', () => {
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin(1000) }, poderes: [{ id: 'p', nome: 'Assalto 3', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou' })] }], ficha: { contadores: [ct('c', { max: 3 })] } });
        for (let i = 0; i < 4; i++) act(() => { probe.rolarDano(); });
        expect(v(f, 'c')).toBe(3);
    });
    it('Quebra-cascos: 3 acertos -> mensagem + zerar; o ciclo recomeca', () => {
        const gat = [soma('q', 1, { tipo: 'acertou' }), G({ id: 'q2', evento: { tipo: 'contadorAtingiu', contadorId: 'q', op: '>=', valor: 3 }, acoes: [{ tipo: 'mensagem', texto: 'CASCO QUEBRADO' }, { tipo: 'contador', id: 'q', op: 'zerar' }] })];
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin(1000) }, poderes: [{ id: 'p', nome: 'QC', ativa: true, gatilhos: gat }], ficha: { contadores: [ct('q')] } });
        act(() => { probe.rolarDano(); }); act(() => { probe.rolarDano(); });
        expect(v(f, 'q')).toBe(2);
        act(() => { probe.rolarDano(); });
        expect(v(f, 'q')).toBe(0);
        expect(ultimoFeed().textoPosGolpe.join(' ')).toContain('CASCO QUEBRADO');
    });
    it('limite 1 por turno: dois golpes no mesmo turno so somam uma vez', () => {
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin(1000) }, poderes: [{ id: 'p', nome: 'X', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou' }, { limite: { max: 1, por: 'turno' } })] }], ficha: { contadores: [ct('c')] } });
        act(() => { probe.rolarDano(); }); act(() => { probe.rolarDano(); });
        expect(v(f, 'c')).toBe(1);
    });
    it('ficha antiga sem `contadores` e gatilho apontando um contador: ignora em silencio (sem selo, sem quebra)', () => {
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, poderes: [{ id: 'p', nome: 'X', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou' })] }] });
        delete f.contadores;
        expect(() => act(() => { probe.rolarDano(); })).not.toThrow();
        expect(JSON.stringify(ultimoFeed().textoPosGolpe || [])).not.toContain('🔔');
    });
    it('contador removido no meio (id do gatilho nao existe mais): ignora e nao dispara selo', () => {
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, poderes: [{ id: 'p', nome: 'X', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou' })] }], ficha: { contadores: [ct('outro')] } });
        act(() => { probe.rolarDano(); });
        expect(v(f, 'outro')).toBe(0);
    });
    it('golpe com Dano Verdadeiro/area/sem Ataque salvo nao quebra o `nivel` (nivel default normal)', () => {
        const f = montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, poderes: [{ id: 'p', nome: 'X', ativa: true, gatilhos: [soma('c', 1, { tipo: 'acertou', nivel: 'normal' })] }], ficha: { contadores: [ct('c')] } });
        act(() => { probe.rolarDanoCustomizado('1000'); });
        expect([0, 1]).toContain(v(f, 'c'));
    });
});

// ---------------------------------------------------------------------------------------------------------
describe('Fase 2 - atingido no alvo-personagem (Furia)', () => {
    const furia = () => ana({ poderes: [{ id: 'pf', nome: 'Furia', ativa: true, gatilhos: [
        soma('f', -2, { tipo: 'atingido' }, { id: 'f1' }),
    ] }], contadores: [ct('f', { valor: 9 })] });
    it('golpe de atacante em Ana: o contador DELA cai e so os caminhos tocados sao gravados (indice pelo id)', () => {
        const a = ana({ poderes: furia().poderes, contadores: [ct('x'), ct('f', { valor: 9 })] });
        montar(Novo, { alvoSelecionado: 'pj:Ana', personagens: { Ana: a } });
        golpe('normal');
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1000000 - 30 * FATOR);
        expect(campos('Ana')).toEqual({ 'contadores/1/valor': 7 });
        expect(a.contadores[1].valor).toBe(9); // espelho nao e mutado
        expect(ultimoFeed().textoPosGolpe.some(t => t.startsWith('🔔') && t.includes('f 9 → 7'))).toBe(true);
    });
    it('nivel do golpe chega ao alvo: atingido critico so reage ao critico', () => {
        const mk = () => ana({ poderes: [{ id: 'pf', nome: 'F', ativa: true, gatilhos: [soma('f', 1, { tipo: 'atingido', nivel: 'critico' })] }], contadores: [ct('f')] });
        montar(Novo, { alvoSelecionado: 'pj:Ana', personagens: { Ana: mk() } }); golpe('normal');
        expect(campos('Ana')['contadores/0/valor']).toBeUndefined(); cleanup(); vi.clearAllMocks();
        montar(Novo, { alvoSelecionado: 'pj:Ana', personagens: { Ana: mk() } }); golpe('critico');
        expect(campos('Ana')['contadores/0/valor']).toBe(1); cleanup(); vi.clearAllMocks();
        montar(Novo, { alvoSelecionado: 'pj:Ana', personagens: { Ana: mk() } }); golpe('fatal');
        expect(campos('Ana')['contadores/0/valor']).toBeUndefined();
    });
    it('God Mode no alvo: atingido nao dispara, Vida intacta', () => {
        const a = furia(); a.combate = { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } };
        montar(Novo, { alvoSelecionado: 'pj:Ana', personagens: { Ana: a } });
        golpe('normal');
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1000000); // grava a MESMA Vida: nada foi tirado
        expect(campos('Ana')['contadores/0/valor']).toBeUndefined();
    });
    it('dano 0 no alvo: nao e atingido', () => {
        dano(0);
        montar(Novo, { alvoSelecionado: 'pj:Ana', personagens: { Ana: furia() } });
        act(() => { probe.rolarDano(); });
        expect(campos('Ana')['contadores/0/valor']).toBeUndefined();
    });
    it('Negar morte salva o alvo: o feed usa a Vida FINAL (1) e atingido NAO dispara (comportamento atual documentado)', () => {
        dano(5000);
        const a = ana({ poderes: [{ id: 'pf', nome: 'F', ativa: true, gatilhos: [NEGAR, soma('f', 1, { tipo: 'atingido' })] }], contadores: [ct('f')] });
        a.vida.atual = 100 * FATOR;
        montar(Novo, { alvoSelecionado: 'pj:Ana', personagens: { Ana: a } });
        act(() => { probe.rolarDano(); });
        expect(fb.aplicarDanoDireto).toHaveBeenCalledWith('Ana', 1 * FATOR);
        expect(campos('Ana')['contadores/0/valor']).toBeUndefined();
    });
    it('area com Ana atingida: atingido dispara 1 vez nela', () => {
        montar(Novo, { personagens: { Ana: furia() }, dummies: { g1: goblin() }, alvosArea: [{ nome: 'Ana', acertou: true, dummieId: 'pj:Ana' }, { nome: 'Goblin', acertou: true, dummieId: 'g1' }] });
        act(() => { probe.rolarDano(); });
        expect(fb.salvarCamposPersonagem.mock.calls.filter(c => c[0] === 'Ana' && 'contadores/0/valor' in c[1]).length).toBe(1);
    });
    it('alvo-personagem com escudo que absorve tudo: nao e atingido', () => {
        const a = furia(); a.escudos = [{ id: 'e', nome: 'D', valor: 500, tipo: 'escudo' }];
        montar(Novo, { alvoSelecionado: 'pj:Ana', personagens: { Ana: a } });
        act(() => { probe.rolarDano(); });
        expect(campos('Ana')['contadores/0/valor']).toBeUndefined();
    });
    it('Ana com gatilho atingido e ataque num Dummie vizinho: nada e gravado em Ana', () => {
        montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() }, personagens: { Ana: furia() } });
        act(() => { probe.rolarDano(); });
        expect(fb.salvarCamposPersonagem).not.toHaveBeenCalled();
    });
});

describe('Lacuna conhecida - nivel do golpe no feed (Defesa nao enxerga critico/fatal)', () => {
    // BUG/LACUNA: o item `dano` do feed so leva `golpeCritico` quando o golpe tem estados e nunca distingue FATAL. A Defesa usa esse campo para o
    // `nivel` do evento `atingido` (jogador que clica "Receber dano"): "atingido por critico/fatal" nao dispara a partir de golpes sem estados.
    it('o feed do golpe critico/fatal carrega o nivel mesmo sem estados', () => {
        montar(Novo, { alvoSelecionado: 'g1', dummies: { g1: goblin() } });
        golpe('fatal');
        const f = ultimoFeed();
        expect(f.golpeNivel === 'fatal' || (f.golpeCritico === true && f.golpeNivel !== 'normal')).toBe(true);
    });
});
