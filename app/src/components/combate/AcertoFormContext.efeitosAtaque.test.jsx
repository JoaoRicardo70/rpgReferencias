import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcertoFormProvider, useAcertoForm } from './AcertoFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { marcaNaturalAcerto } from '../../core/disputaPoder';

// QA - efeitos desvantagem_atacante e acerto_automatico no fluxo real do AcertoFormContext (engine real, Math.random controlado).

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
}));

const ef = (atributo, valor = 1, extra = {}) => ({ nome: 'E', atributo, propriedade: 'base', valor, ...extra });
const comEfeito = (...efeitos) => ({ passivas: [{ id: 1, efeitos }] });
const fichaBase = (extra = {}) => ({
    forca: { base: 100 }, destreza: { base: 100 }, inteligencia: { base: 100 }, sabedoria: { base: 100 },
    energiaEsp: { base: 100 }, carisma: { base: 100 }, stamina: { base: 100 }, constituicao: { base: 100 },
    ascensaoBase: 1, inventario: [], poderes: [], ataquesElementais: [], proficienciaBase: 0, passivas: [],
    iniciativa: 10, posicao: { x: 0, y: 0, z: 0, cenaId: 'c' }, ...extra,
});
const sequencia = (valores) => { let i = 0; vi.spyOn(Math, 'random').mockImplementation(() => valores[i++ % valores.length]); };

let probe;
function Harness() { probe = useAcertoForm(); return null; }

function montar({ minha = fichaBase(), alvoSelecionado = null, personagens = {}, dummies = {}, isMestre = true } = {}) {
    const state = {
        minhaFicha: minha, meuNome: 'Heroi', personagens, dummies, alvoSelecionado, isMestre, divisorPoderMesa: 1,
        setAbaAtiva: vi.fn(), updateFicha: vi.fn((cb) => cb(minha)),
        cenario: { ativa: 'c', lista: { c: { escala: 1.5 } }, zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    render(<AcertoFormProvider><Harness /></AcertoFormProvider>);
    return state;
}
const feed = () => enviarParaFeed.mock.calls.at(-1)[0];

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AcertoFormContext - desvantagem_atacante do alvo-personagem', () => {
    const ana = (...efeitos) => fichaBase(comEfeito(...efeitos));

    it('alvo com o efeito: rolagem 3d20 (menor vale), numero no feed e texto no profBonusTexto', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: ana(ef('desvantagem_atacante', 2)) } });
        sequencia([0.9, 0.5, 0.1]);
        act(() => { probe.rolarAcerto(); });
        const f = feed();
        expect(f.desvantagemDoAlvo).toBe(2);
        expect(f.dadoNatural).toBe(3);
        expect(f.rolagem).toContain('DESVANTAGEM');
        expect(f.profBonusTexto).toContain('Ana impõe 2 dado(s) de desvantagem');
    });
    it('alvo sem o efeito: comportamento antigo (1d20, sem campos novos)', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: ana() } });
        sequencia([0.9]);
        act(() => { probe.rolarAcerto(); });
        const f = feed();
        expect(f.desvantagemDoAlvo).toBeUndefined();
        expect(f.acertoAutomatico).toBeUndefined();
        expect(f.rolagem).not.toContain('DESVANTAGEM');
    });
    it('Dummie selecionado nao impoe nada', () => {
        montar({ alvoSelecionado: 'd1', dummies: { d1: { nome: 'Saco', valorDefesa: 10, cenaId: 'c', posicao: { x: 1, y: 0, z: 0 } } } });
        act(() => { probe.rolarAcerto(); });
        expect(feed().desvantagemDoAlvo).toBeUndefined();
    });
    it('sem alvo (rolagem livre) nao impoe nada', () => {
        montar({ personagens: { Ana: ana(ef('desvantagem_atacante', 3)) } });
        act(() => { probe.rolarAcerto(); });
        expect(feed().desvantagemDoAlvo).toBeUndefined();
    });
    it('vantagem marcada pelo atacante cancela a desvantagem imposta (1 x 1)', () => {
        montar({ minha: fichaBase({ ataqueConfig: { vantagens: 1, desvantagens: 0 } }), alvoSelecionado: 'pj:Ana', personagens: { Ana: ana(ef('desvantagem_atacante', 1)) } });
        sequencia([0.9]);
        act(() => { probe.rolarAcerto(); });
        const f = feed();
        expect(f.rolagem).not.toContain('VANTAGEM');
        expect(f.rolagem).not.toContain('DESVANTAGEM');
    });
    it('valores invalidos (NaN, negativo, string) no alvo sao ignorados; enorme limita a 10', () => {
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: ana(ef('desvantagem_atacante', NaN), ef('desvantagem_atacante', -3), ef('desvantagem_atacante', 'abc')) } });
        act(() => { probe.rolarAcerto(); });
        expect(feed().desvantagemDoAlvo).toBeUndefined();
        cleanup(); vi.clearAllMocks();
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: ana(ef('desvantagem_atacante', 999999)) } });
        act(() => { probe.rolarAcerto(); });
        expect(feed().desvantagemDoAlvo).toBe(10);
    });
    it('golpe em area: a desvantagem do alvo-personagem nao vale (sem alvo unico)', () => {
        const minha = fichaBase({ inventario: [{ tipo: 'arma', equipado: true, area: 2, alcance: 10 }] });
        montar({ minha, alvoSelecionado: 'pj:Ana', personagens: { Ana: ana(ef('desvantagem_atacante', 2)) } });
        act(() => { probe.setOrigemArea('self'); });
        act(() => { probe.rolarAcerto(); });
        expect(feed().desvantagemDoAlvo).toBeUndefined();
    });
    it('quando do efeito usa o atacante como "alvo": so impoe se o atacante tem o estado', () => {
        const defensor = ana(ef('desvantagem_atacante', 2, { quando: 'alvo_com_estado:surpreso' }));
        montar({ alvoSelecionado: 'pj:Ana', personagens: { Ana: defensor } });
        act(() => { probe.rolarAcerto(); });
        expect(feed().desvantagemDoAlvo).toBeUndefined();
        cleanup(); vi.clearAllMocks();
        montar({ minha: fichaBase({ condicoes: [{ id: 'surpreso', stacks: 1 }] }), alvoSelecionado: 'pj:Ana', personagens: { Ana: defensor } });
        act(() => { probe.rolarAcerto(); });
        expect(feed().desvantagemDoAlvo).toBe(2);
    });
});

describe('AcertoFormContext - acerto_automatico', () => {
    const dummie = (extra = {}) => ({ nome: 'Muralha', valorDefesa: 999999, cenaId: 'c', posicao: { x: 1, y: 0, z: 0 }, ...extra });
    const auto = (...extra) => fichaBase(comEfeito(ef('acerto_automatico'), ...extra));

    it('alvo unico: ignora a CA altissima e marca automatico', () => {
        montar({ minha: auto(), alvoSelecionado: 'd1', dummies: { d1: dummie() } });
        act(() => { probe.rolarAcerto(); });
        const [a] = feed().alvosArea;
        expect(a).toMatchObject({ nome: 'Muralha', acertou: true, automatico: true, dummieId: 'd1' });
        expect(feed().acertoAutomatico).toBe(true);
        expect(marcaNaturalAcerto(a)).toContain('acerto autom');
    });
    it('sem o efeito: CA altissima erra (comportamento antigo)', () => {
        montar({ alvoSelecionado: 'd1', dummies: { d1: dummie() } });
        sequencia([0.5]); // d20 = 11 (nem 20 nem 1 natural)
        act(() => { probe.rolarAcerto(); });
        const [a] = feed().alvosArea;
        expect(a.acertou).toBe(false);
        expect(a.automatico).toBeUndefined();
    });
    it('acerta mesmo com 1 natural', () => {
        montar({ minha: auto(), alvoSelecionado: 'd1', dummies: { d1: dummie() } });
        sequencia([0]); // d20 = 1
        act(() => { probe.rolarAcerto(); });
        expect(feed().naturalD20).toBe(1);
        expect(feed().alvosArea[0].acertou).toBe(true);
    });
    it('alvo-personagem com CA altissima tambem e atingido', () => {
        const anaAlta = fichaBase({ destreza: { base: 1e12 } });
        montar({ minha: auto(), alvoSelecionado: 'pj:Ana', personagens: { Ana: anaAlta } });
        act(() => { probe.rolarAcerto(); });
        expect(feed().alvosArea[0]).toMatchObject({ nome: 'Ana', acertou: true, automatico: true });
    });
    it('alvo unico com quando que depende do alvo: so vale contra alvo com o estado', () => {
        const f = fichaBase(comEfeito(ef('acerto_automatico', 1, { quando: 'alvo_com_estado:surpreso' })));
        montar({ minha: f, alvoSelecionado: 'd1', dummies: { d1: dummie() } });
        act(() => { probe.rolarAcerto(); });
        expect(feed().alvosArea[0].acertou).toBe(false);
        cleanup(); vi.clearAllMocks();
        montar({ minha: f, alvoSelecionado: 'd1', dummies: { d1: dummie({ condicoes: [{ id: 'surpreso', stacks: 1 }] }) } });
        act(() => { probe.rolarAcerto(); });
        expect(feed().alvosArea[0]).toMatchObject({ acertou: true, automatico: true });
    });
    it('area: sem condicao todos os atingidos acertam automaticamente', () => {
        const minha = auto(); minha.inventario = [{ tipo: 'arma', equipado: true, area: 2, alcance: 10 }];
        montar({ minha, dummies: { a: dummie(), b: dummie({ nome: 'Outra', posicao: { x: 0, y: 1, z: 0 } }) } });
        act(() => { probe.setOrigemArea('livre'); });
        act(() => { probe.rolarAcerto(); });
        const alvos = feed().alvosArea;
        expect(alvos.map(a => a.nome)).toEqual(expect.arrayContaining(['Muralha', 'Outra']));
        alvos.forEach(a => expect(a).toMatchObject({ acertou: true, automatico: true }));
    });
    it('area: quando dependente do alvo nao vale (nao ha alvo unico)', () => {
        const minha = fichaBase(comEfeito(ef('acerto_automatico', 1, { quando: 'alvo_com_estado:surpreso' })));
        minha.inventario = [{ tipo: 'arma', equipado: true, area: 2, alcance: 10 }];
        montar({ minha, dummies: { a: dummie({ condicoes: [{ id: 'surpreso', stacks: 1 }] }) } });
        act(() => { probe.setOrigemArea('livre'); });
        act(() => { probe.rolarAcerto(); });
        expect(feed().alvosArea[0].acertou).toBe(false);
    });
    it('desvantagem_atacante do alvo e acerto_automatico do atacante coexistem', () => {
        const ana = fichaBase({ destreza: { base: 1e12 }, ...comEfeito(ef('desvantagem_atacante', 1)) });
        montar({ minha: auto(), alvoSelecionado: 'pj:Ana', personagens: { Ana: ana } });
        sequencia([0.9, 0.2]);
        act(() => { probe.rolarAcerto(); });
        expect(feed().desvantagemDoAlvo).toBe(1);
        expect(feed().alvosArea[0].acertou).toBe(true);
    });
});
