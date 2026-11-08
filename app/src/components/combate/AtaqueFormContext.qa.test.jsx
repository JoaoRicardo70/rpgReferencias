import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Novo from './AtaqueFormContext';
import useStore from '../../stores/useStore';
import * as fb from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';
// Copia do HEAD para o diferencial (git show HEAD:<arquivo> > AtaqueFormContext.qaold.js[x]); sem ela os blocos P1 sao pulados.
const caminhoAntigo = './AtaqueFormContext.qaold';
const Velho = await import(/* @vite-ignore */ caminhoAntigo).catch(() => null);
const temAntigo = !!Velho;

// QA - Ataque: Reflexo devolvido (P1 diferencial, P2 gatilhos) e golpe em jogador cujo gatilho salva (feed nao diz que morreu).

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularDano: vi.fn() }));
vi.mock('../../core/disputaPoder', async (importOriginal) => ({ ...(await importOriginal()), calcularDisputaPoder: vi.fn(() => ({ ativa: false })), aplicarDisputaAoDano: vi.fn((d) => d) }));
vi.mock('../../core/danoProporcional', async (importOriginal) => ({ ...(await importOriginal()), escalarDanoPelaVida: vi.fn((d) => d) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(), salvarCamposPersonagem: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const stat = (atual, base = 1000000) => ({ base, atual, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });

function rodar(Mod, { heroi = {}, ana = {}, alvo = 'pj:Ana', dano = 1000 }) {
    let probe;
    const Harness = () => { probe = Mod.useAtaqueForm(); return null; };
    const minhaFicha = { poderes: [], inventario: [], passivas: [], ataquesElementais: [], hierarquia: {}, combate: {}, iniciativa: 10, vida: stat(5000000), ...heroi };
    const anaF = { vida: stat(1000000), mana: stat(100000), reducoesDano: [], iniciativa: 10, destreza: { base: 50 }, poderes: [], ...ana };
    const state = {
        minhaFicha, meuNome: 'Heroi', personagens: { Ana: anaF }, dummies: {}, alvoSelecionado: alvo,
        updateFicha: vi.fn((cb) => cb(minhaFicha)), setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [],
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { ativa: 'c1', zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    vi.clearAllMocks();
    calcularDano.mockReturnValue({ dano, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
    render(<Mod.AtaqueFormProvider><Harness /></Mod.AtaqueFormProvider>);
    act(() => { probe.rolarDano(); });
    const saida = { minha: JSON.stringify(minhaFicha), feed: JSON.stringify(fb.enviarParaFeed.mock.calls).replace(/"ts":\d+/g, '"ts":0'), danoDireto: JSON.stringify(fb.aplicarDanoDireto.mock.calls), campos: JSON.stringify(fb.salvarCamposPersonagem.mock.calls) };
    Object.defineProperty(saida, 'ficha', { value: minhaFicha, enumerable: false });
    cleanup();
    return saida;
}
const ultimoFeed = (r) => JSON.parse(r.feed).at(-1)[0];
const REFLEXO = { id: 'r1', nome: 'Espelho', ativa: true, reflexo: { modo: 'devolver', mult: 100, automatico: true } };

beforeEach(() => { window.alert = vi.fn(); });
afterEach(() => cleanup());

describe.skipIf(!temAntigo)('P1 - Ataque: Reflexo e golpe em jogador identicos ao HEAD sem gatilhos', () => {
    it('matriz de danos x escudos do atacante x Vida', () => {
        let n = 0;
        [0.4, 33.7, 299, 300, 301, 700, 1000, 4999, 5000, 5001, 1e9].forEach((dano) => [undefined, [{ id: 'h', nome: 'Barreira', valor: 300, tipo: 'escudo' }], [{ id: 'h', nome: 'B', valor: 100, tipo: 'escudo' }, { id: 'v', nome: 'F', valor: 50, tipo: 'vidaTemporaria' }]].forEach((escudos) => [5000000, 0, 1000000].forEach((vida) => {
            const args = () => ({ dano, heroi: { ...(escudos ? { escudos: JSON.parse(JSON.stringify(escudos)) } : {}), vida: stat(vida) }, ana: { poderes: [REFLEXO] } });
            const a = rodar(Velho, args());
            const b = rodar(Novo, args());
            n++;
            for (const k of Object.keys(a)) expect(b[k], `${k} dano=${dano} vida=${vida} esc=${escudos ? escudos.length : 0}`).toEqual(a[k]);
        })));
        expect(n).toBe(99);
    });
    it('golpe em jogador sem Reflexo (escudo do alvo, reducoes): mesmas gravacoes e feed', () => {
        [1, 300, 5000, 1e9].forEach((dano) => {
            const args = () => ({ dano, ana: { escudos: [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }], reducoesDano: [{ id: 'r', nome: 'Arm', percentual: 20, elemento: 'todos' }] } });
            expect(rodar(Novo, args()), `dano=${dano}`).toEqual(rodar(Velho, args()));
        });
    });
});

describe('P2 - Ataque com gatilhos', () => {
    it('Negar morte do ALVO salva: feed nao diz que morreu (sobreviveu, overkill 0) e traz o selo do gatilho', () => {
        const r = rodar(Novo, { dano: 1000, ana: { vida: stat(1000000), poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [NEGAR] }] } });
        expect(JSON.parse(r.danoDireto)).toEqual([['Ana', 1000]]);
        const feed = ultimoFeed(r);
        expect(feed.alvoSobreviveu).toBe(true);
        expect(feed.overkill).toBe(0);
        expect((feed.textoPosGolpe || []).join(' ')).toContain('🔔 Negar morte segurou em 1 de vida');
    });
    it('controle: sem o gatilho o alvo morre com overkill', () => {
        const feed = ultimoFeed(rodar(Novo, { dano: 1500, ana: { vida: stat(1000000) } }));
        expect(feed.alvoSobreviveu).toBe(false);
        expect(feed.overkill).toBe(500);
    });
    it('gatilho do alvo ja usado nesta cena: morre normal', () => {
        const ana = { vida: stat(1000000), combate: { usosPoderes: { 'p1:nm': { n: 1, cena: 'c1' } } }, poderes: [{ id: 'p1', nome: 'P', ativa: true, gatilhos: [NEGAR] }] };
        expect(ultimoFeed(rodar(Novo, { dano: 1000, ana })).alvoSobreviveu).toBe(false);
    });
    it('Reflexo devolvido que zeraria o atacante: Negar morte dele segura e o texto aparece no Feed', () => {
        const r = rodar(Novo, { dano: 1000, heroi: { vida: stat(1000000), poderes: [{ id: 'h1', nome: 'P', ativa: true, gatilhos: [NEGAR] }] }, ana: { poderes: [REFLEXO] } });
        expect(r.ficha.vida.atual).toBe(1000);
        expect((ultimoFeed(r).textoPosGolpe || []).join(' ')).toContain('Negar morte segurou em 1 de vida');
        expect(r.ficha.combate.usosPoderes['h1:nm']).toEqual({ n: 1, cena: 'c1' });
    });
    it('Reflexo com God Mode no atacante: Vida intacta e texto de Imunidade total no Feed', () => {
        const r = rodar(Novo, { dano: 1000, heroi: { vida: stat(5000000), combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } }, ana: { poderes: [REFLEXO] } });
        expect(r.ficha.vida.atual).toBe(5000000);
        expect((ultimoFeed(r).textoPosGolpe || []).join(' ')).toContain('Imunidade total');
    });
    it('golpe em jogador com God Mode: Vida do alvo intacta', () => {
        const r = rodar(Novo, { dano: 5000, ana: { combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } } });
        expect(JSON.parse(r.danoDireto)).toEqual([['Ana', 1000000]]);
    });
});
