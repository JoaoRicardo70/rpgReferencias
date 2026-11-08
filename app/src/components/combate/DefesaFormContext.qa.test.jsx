import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Novo from './DefesaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';
// Copia do HEAD para o diferencial (git show HEAD:<arquivo> > DefesaFormContext.qaold.js[x]); sem ela os blocos P1 sao pulados.
const caminhoAntigo = './DefesaFormContext.qaold';
const Velho = await import(/* @vite-ignore */ caminhoAntigo).catch(() => null);
const temAntigo = !!Velho;

// QA - Defesa > Receber Dano (sofrerDanoBruto). P1: diferencial HEAD x working tree. P2: gatilhos e God Mode.

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn() }));
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularCA: vi.fn(() => 10) }));
vi.mock('../../core/disputaPoder', async (importOriginal) => ({ ...(await importOriginal()), getPoderParaDisputa: vi.fn(() => null) }));

const FATOR = 1000;
const VIDA_BASE = 200000000;
const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const GOD = { turnosRestantes: 1, origem: 'Teste' };

function fichaReal(extra = {}) {
    return {
        vida: { base: VIDA_BASE, atual: VIDA_BASE, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' },
        mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: { vida: 0.0001 }, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        afinidades: {}, inventario: [], poderes: [],
        ...extra,
    };
}
const blindada = () => fichaReal({
    reducoesDano: [{ id: 'a', nome: 'Armadura', percentual: 50, elemento: 'todos' }],
    afinidades: { resistencias: ['fogo'], imunidades: ['gelo'] },
    poderes: [{ id: 'p', nome: 'Barreira', ativa: true, efeitos: [{ atributo: 'reducao_dano', propriedade: 'base', valor: 20, nome: 'Barreira' }] }],
});
const ESC = [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }, { id: 'b', nome: 'Falsa', valor: 50, tipo: 'vidaTemporaria' }];

function executar(Mod, ficha, { dano, elemento = 'fisico', verdadeiro = false }) {
    let probe;
    const Harness = () => { probe = Mod.useDefesaForm(); return null; };
    const state = {
        minhaFicha: ficha, meuNome: 'Eu', personagens: {}, dummies: {}, feedCombate: [], divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(ficha)), setAbaAtiva: vi.fn(), cenario: { ativa: 'cena1', zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    vi.clearAllMocks();
    render(<Mod.DefesaFormProvider><Harness /></Mod.DefesaFormProvider>);
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    act(() => { probe.setElementoInc(elemento); });
    act(() => { probe.setDanoVerdadeiro(verdadeiro); });
    act(() => { probe.sofrerDanoBruto(); });
    const saida = { ficha: JSON.stringify(ficha), feed: JSON.stringify(enviarParaFeed.mock.calls), salvou: salvarFichaSilencioso.mock.calls.length, alertas: window.alert.mock.calls.length };
    cleanup();
    return saida;
}
const feed = () => enviarParaFeed.mock.calls.at(-1)[0];

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); });
afterEach(() => cleanup());

describe.skipIf(!temAntigo)('P1 - Defesa: identico ao HEAD sem gatilhos e sem God Mode', () => {
    const FICHAS = {
        simples: () => fichaReal(),
        escudos: () => fichaReal({ escudos: JSON.parse(JSON.stringify(ESC)) }),
        blindada: blindada,
        blindadaComEscudo: () => ({ ...blindada(), escudos: JSON.parse(JSON.stringify(ESC)) }),
        vidaZero: () => { const f = fichaReal(); f.vida.atual = 0; return f; },
        vidaBaixa: () => { const f = fichaReal(); f.vida.atual = 777; return f; },
        poderComGatilhoDesligado: () => fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: false, gatilhos: [NEGAR] }] }),
        gatilhoOpcional: () => fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [{ ...NEGAR, modo: 'opcional' }] }] }),
        gatilhoMestreDesligou: () => fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [{ ...NEGAR, mestreDesligou: true }] }] }),
        poderSemGatilhos: () => fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [] }] }),
        godVencido: () => fichaReal({ combate: { imunidadeTotal: { turnosRestantes: 0 } } }),
    };
    const DANOS = [1, 7, 100, 299, 300, 301, 349, 350, 351, 1000, 199999, 200000, 200001, 5000000, 999999999];
    it('mesma Vida final, mesmo feed, mesmos campos gravados e mesmo numero de saves (matriz)', () => {
        let n = 0;
        Object.entries(FICHAS).forEach(([nome, mk]) => DANOS.forEach((dano) => [
            { elemento: 'fisico' }, { elemento: 'fogo' }, { elemento: 'gelo' }, { elemento: 'fogo', verdadeiro: true }, { elemento: 'gelo', verdadeiro: true },
        ].forEach((opc) => {
            const a = executar(Velho, mk(), { dano, ...opc });
            const b = executar(Novo, mk(), { dano, ...opc });
            n++;
            expect(b, `${nome} dano=${dano} ${JSON.stringify(opc)}`).toEqual(a);
        })));
        expect(n).toBe(Object.keys(FICHAS).length * DANOS.length * 5);
    });
    it('dano invalido (0, texto) alerta igual e nao grava', () => {
        ['0', 'abc', '-5', ''].forEach((dano) => {
            const a = executar(Velho, fichaReal(), { dano });
            const b = executar(Novo, fichaReal(), { dano });
            expect(b).toEqual(a);
            expect(b.alertas).toBe(1);
        });
    });
    it('ficha sem vida: igual ao HEAD (nada absorve nem grava vida)', () => {
        const mk = () => { const f = fichaReal({ escudos: JSON.parse(JSON.stringify(ESC)) }); delete f.vida; return f; };
        expect(executar(Novo, mk(), { dano: 100 })).toEqual(executar(Velho, mk(), { dano: 100 }));
    });
    it('a ficha nao ganha a chave `combate` nem `gatilhos` quando nada dispara', () => {
        const f = fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [NEGAR] }] });
        executar(Novo, f, { dano: 100 });
        expect('combate' in f).toBe(false);
    });
});

describe('P2 - Defesa: gatilhos e God Mode', () => {
    it('Negar morte + Dano Verdadeiro: DV ignora reducao mas NAO ignora o gatilho de morte', () => {
        const f = { ...blindada(), poderes: [...blindada().poderes, { id: 'p2', nome: 'Poder', ativa: true, gatilhos: [NEGAR] }] };
        executar(Novo, f, { dano: 999999999, elemento: 'fogo', verdadeiro: true });
        expect(f.vida.atual).toBe(1 * FATOR);
        expect(feed().texto).toContain('Negar morte segurou em 1 de vida');
        expect(feed().texto).toContain('Dano Verdadeiro');
    });
    it('God Mode vs Dano Verdadeiro: DV tambem vira 0; escudo intacto; feed diz', () => {
        const f = fichaReal({ combate: { imunidadeTotal: { ...GOD } }, escudos: JSON.parse(JSON.stringify(ESC)) });
        executar(Novo, f, { dano: 5000, verdadeiro: true });
        expect(f.vida.atual).toBe(VIDA_BASE);
        expect(f.escudos).toEqual(ESC);
        expect(feed().texto).toBe('Eu está com Imunidade total: o golpe não surtiu efeito');
        expect(feed().texto).not.toContain('Recebeu');
    });
    it('gatilho dispara so uma vez por golpe: um unico selo 🔔 na frase', () => {
        const f = fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [NEGAR] }] });
        executar(Novo, f, { dano: 999999999 });
        expect((feed().texto.match(/🔔/g) || []).length).toBe(1);
    });
    it('escudo + Negar morte: escudo absorve primeiro e o gatilho so vê o resto; frase tem escudo e gatilho', () => {
        const f = fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [NEGAR] }], escudos: [{ id: 'a', nome: 'Domo', valor: 300, tipo: 'escudo' }] });
        f.vida.atual = 100 * FATOR;
        executar(Novo, f, { dano: 400 }); // 300 pro escudo, 100 pra Vida = zera
        expect(f.vida.atual).toBe(1 * FATOR);
        expect(f.escudos).toBeUndefined();
        expect(feed().texto).toMatch(/🛡️ Eu absorveu 300.*🔔 Negar morte/);
    });
    it('Vida 0 e Negar morte: golpe nao ressuscita', () => {
        const f = fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [NEGAR] }] });
        f.vida.atual = 0;
        executar(Novo, f, { dano: 100 });
        expect(f.vida.atual).toBe(0);
    });
    it('faixa de Vida: golpe que cruza varias faixas dispara so a final e mostra uma frase', () => {
        const faixas = [
            { id: 'f1', nome: 'F90', evento: { tipo: 'vidaAbaixoDe', de: 90, ate: 80 }, acoes: [{ tipo: 'mensagem', texto: 'noventa' }] },
            { id: 'f2', nome: 'F50', evento: { tipo: 'vidaAbaixoDe', de: 50, ate: 40 }, acoes: [{ tipo: 'mensagem', texto: 'cinquenta' }] },
            { id: 'f3', nome: 'F10', evento: { tipo: 'vidaAbaixoDe', de: 10, ate: 0 }, acoes: [{ tipo: 'mensagem', texto: 'dez' }] },
        ];
        const f = fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: faixas }] });
        executar(Novo, f, { dano: 190000 }); // 200000 -> 10000 (5%)
        expect(feed().texto).toContain('F10: dez');
        expect(feed().texto).not.toContain('noventa');
        expect(feed().texto).not.toContain('cinquenta');
    });
    it('Vida real (ficha com Vida de verdade, sem vidaMaxBruta no ctx): a Vida maxima da ficha e usada para as faixas', () => {
        const g = { id: 'f', nome: 'Meio', evento: { tipo: 'vidaAbaixoDe', de: 50, ate: 0 }, acoes: [{ tipo: 'mensagem', texto: 'metade' }] };
        const f = fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [g] }] });
        executar(Novo, f, { dano: 100001 }); // 200000 exibidos -> 99999 (<50%)
        expect(feed().texto).toContain('Meio: metade');
        const h = fichaReal({ poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [g] }] });
        executar(Novo, h, { dano: 98000 }); // 51%: fora da faixa (50,0005% ja conta como 50)
        expect(feed().texto).not.toContain('metade');
    });
});
