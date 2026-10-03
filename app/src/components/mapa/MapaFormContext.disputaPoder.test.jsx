import React from 'react';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import { MapaMestreDanoRapido } from './MapaFerramentasMestre';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed, aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto, aplicarElementoNivelDireto, salvarFichaSilencioso } from '../../services/firebase-sync';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';
import { calcularPoderAtual } from '../../core/poder';

// ---------------------------------------------------------------------------
// QA - Disputa de Poder no Mapa:
//  * aplicarDanoRapido(alvo, dano, elemento, nivelDominio, nivelAtacante, atacante)
//  * Zonas: getDanoDinamicoZona / dispararEfeitoDaZona (via avancarTurno) / processarEntradaNaZona
//    (via handleCellClick).
// O Poder de fichas vem do campo falso __poder (mock de getPoderParaDisputa); dummies usam
// poderCalculado (getPoderDummie real).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(() => Promise.resolve()),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn((ficha) => (ficha && ficha.__poder !== undefined ? ficha.__poder : null)) };
});

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function fichaVida(poder, vida = 5000000) {
    return {
        __poder: poder,
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0, cenaId: 'default' },
        vida: { base: vida, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: vida, regeneracao: 0 },
        combate: {}, dominios: {}, poderes: [], inventario: [], passivas: [],
    };
}

// Ficha COMPLETA de verdade: aplicarDanoRapido resolve o Poder de jogadores por getPoderDeEntidade
// (chamada interna do modulo, que o mock de getPoderParaDisputa nao intercepta), entao esses
// testes usam o calculo real e derivam o Poder dos dummies a partir dele.
const STATUS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
const statReal = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 });
function fichaReal(extra = {}) {
    const f = {
        ascensaoBase: 1,
        posicao: { x: 0, y: 0, z: 0, cenaId: 'default' },
        vida: { ...statReal(100000000), atual: 5000000 },
        mana: statReal(10000000), aura: statReal(10000000), chakra: statReal(10000000), corpo: statReal(10000000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        divisorPoder: 0, supressaoPoder: 100, limiteSupressao: 1,
        combate: {}, dominios: {}, poderes: [], inventario: [], passivas: [],
    };
    STATUS.forEach(k => { f[k] = statReal(100000); });
    return { ...f, ...extra };
}
const poderReal = (f) => calcularPoderAtual(f, 1).poderExato;

function baseState(overrides = {}) {
    const minhaFicha = overrides.minhaFicha || fichaVida(1000);
    return {
        minhaFicha, meuNome: 'Mestre', personagens: {}, divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(minhaFicha)),
        feedCombate: [], isMestre: true, mesaCriador: 'Mestre', dummies: {},
        alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...overrides,
    };
}

let probe;
function Harness() { probe = useMapaForm(); return null; }
function montar(state) {
    mockUseStore(state);
    probe = undefined;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}

const jogador = (nome, ficha) => ({ id: nome, nome, ficha, isDummie: false });
const entidade = (id, d) => ({ id, nome: d.nome, ficha: d, isDummie: true });
const textoFeed = () => enviarParaFeed.mock.calls.at(-1)[0].texto;

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('aplicarDanoRapido com atacante - alvo e dummie', () => {
    const dummieAlvo = (poder) => ({ nome: 'Orc', cenaId: 'default', hpAtual: 1000000, hpMax: 1000000, ...(poder !== undefined ? { poderCalculado: poder } : {}) });

    it('atacante dummie 1100 vs alvo dummie 1000: dano digitado x1,1', () => {
        const orc = dummieAlvo(1000);
        const boss = { nome: 'Boss', cenaId: 'default', hpAtual: 1, hpMax: 1, poderCalculado: 1100 };
        montar(baseState({ dummies: { orc, boss } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 100, null, null, 0, entidade('boss', boss)); });

        expect(salvarDummie).toHaveBeenCalledWith('orc', expect.objectContaining({ hpAtual: 1000000 - 110 * FATOR_EXIBICAO_VITAIS }));
        expect(textoFeed()).toContain('aplicou 110 de dano em Orc (golpe de Boss)');
        expect(textoFeed()).toContain('(digitado: 100)');
        expect(textoFeed()).toContain('Disputa de Poder');
    });
    it('atacante mais fraco (1000 vs alvo 1250): x0,75', () => {
        const orc = dummieAlvo(1250);
        const boss = { nome: 'Boss', poderCalculado: 1000 };
        montar(baseState({ dummies: { orc, boss } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 100, null, null, 0, entidade('boss', boss)); });
        expect(salvarDummie).toHaveBeenCalledWith('orc', expect.objectContaining({ hpAtual: 1000000 - 75 * FATOR_EXIBICAO_VITAIS }));
    });
    it('atacante jogador (ficha) contra dummie: usa o Poder da ficha', () => {
        const heroi = fichaReal();
        const orc = dummieAlvo(poderReal(heroi) / 3);
        montar(baseState({ dummies: { orc } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 10, null, null, 0, jogador('Heroi', heroi)); });
        expect(salvarDummie).toHaveBeenCalledWith('orc', expect.objectContaining({ hpAtual: 1000000 - 30 * FATOR_EXIBICAO_VITAIS }));
    });
    it('SEM atacante: dano entra como digitado (x1) e o feed nao menciona golpe nem disputa', () => {
        const orc = dummieAlvo(1000);
        montar(baseState({ dummies: { orc } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 100); });
        expect(salvarDummie).toHaveBeenCalledWith('orc', expect.objectContaining({ hpAtual: 1000000 - 100 * FATOR_EXIBICAO_VITAIS }));
        expect(textoFeed()).toBe('⚔️ O Mestre aplicou 100 de dano em Orc!');
    });
    it('atacante sem Poder definido (dummie sem poderCalculado): sem disputa, mas cita o golpe', () => {
        const orc = dummieAlvo(1000);
        const boss = { nome: 'Boss' };
        montar(baseState({ dummies: { orc, boss } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 100, null, null, 0, entidade('boss', boss)); });
        expect(salvarDummie).toHaveBeenCalledWith('orc', expect.objectContaining({ hpAtual: 1000000 - 100 * FATOR_EXIBICAO_VITAIS }));
        expect(textoFeed()).toContain('(golpe de Boss)');
        expect(textoFeed()).not.toContain('Disputa de Poder');
    });
    it('Poder igual: x1 com disputa registrada no feed', () => {
        const orc = dummieAlvo(500);
        const boss = { nome: 'Boss', poderCalculado: 500 };
        montar(baseState({ dummies: { orc, boss } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 40, null, null, 0, entidade('boss', boss)); });
        expect(textoFeed()).toContain('aplicou 40 de dano');
        expect(textoFeed()).toContain('Poder igual');
    });
});

describe('aplicarDanoRapido - anulado pela disputa (retorno antecipado)', () => {
    it('alvo dummie com o dobro do Poder: so avisa no feed, sem salvarDummie', () => {
        const orc = { nome: 'Orc', hpAtual: 1000000, poderCalculado: 2000 };
        const fraco = { nome: 'Fraco', poderCalculado: 1000 };
        montar(baseState({ dummies: { orc, fraco } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 100, 'Fogo', 0, 0, entidade('fraco', fraco)); });

        expect(salvarDummie).not.toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        expect(textoFeed()).toContain('O golpe de Fraco em Orc não surtiu efeito');
        expect(textoFeed()).toContain('(digitado: 100)');
    });
    it('alvo e a propria ficha do Mestre: nao mexe em vida, fadiga nem elemento (updateFicha e salvar nao chamados)', () => {
        const minhaFicha = fichaReal();
        const state = baseState({ minhaFicha });
        const fraco = { nome: 'Fraco', poderCalculado: poderReal(minhaFicha) / 2.5 };
        state.dummies = { fraco };
        montar(state);
        act(() => { probe.aplicarDanoRapido(jogador('Mestre', minhaFicha), 100, 'Fogo', 0, 0, entidade('fraco', fraco)); });

        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(minhaFicha.vida.atual).toBe(5000000);
        expect(minhaFicha.combate.ultimoElementoRecebido).toBeUndefined();
        expect(textoFeed()).toContain('não surtiu efeito');
    });
    it('alvo e OUTRO jogador: nao chama aplicarDanoDireto/Fadiga/Elemento/ElementoNivel', () => {
        const outro = fichaReal();
        const fraco = { nome: 'Fraco', poderCalculado: poderReal(outro) / 2.5 };
        montar(baseState({ personagens: { Outro: outro }, dummies: { fraco } }));
        act(() => { probe.aplicarDanoRapido(jogador('Outro', outro), 100, 'Fogo', 0, 0, entidade('fraco', fraco)); });

        expect(aplicarDanoDireto).not.toHaveBeenCalled();
        expect(aplicarFadigaDireta).not.toHaveBeenCalled();
        expect(aplicarElementoDireto).not.toHaveBeenCalled();
        expect(aplicarElementoNivelDireto).not.toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
    });
    it('dano digitado 0 retorna sem feed algum (mesmo com atacante)', () => {
        const orc = { nome: 'Orc', hpAtual: 100, poderCalculado: 10 };
        const boss = { nome: 'Boss', poderCalculado: 20 };
        montar(baseState({ dummies: { orc, boss } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 0, null, null, 0, entidade('boss', boss)); });
        expect(enviarParaFeed).not.toHaveBeenCalled();
        expect(salvarDummie).not.toHaveBeenCalled();
    });
    it('sem disputa ativa e dano 0 pelo arredondamento nao e tratado como anulado (cai no fluxo normal)', () => {
        // Sem atacante nao existe disputa: o ramo "anulado" exige disputa.ativa.
        const orc = { nome: 'Orc', hpAtual: 1000000 };
        montar(baseState({ dummies: { orc } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 1); });
        expect(salvarDummie).toHaveBeenCalledTimes(1);
    });
    it('nao-Mestre nao aplica nada, nem com atacante', () => {
        const orc = { nome: 'Orc', hpAtual: 1000000, poderCalculado: 10 };
        montar(baseState({ isMestre: false, dummies: { orc } }));
        act(() => { probe.aplicarDanoRapido(entidade('orc', orc), 100, null, null, 0, entidade('x', { nome: 'X', poderCalculado: 99 })); });
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
});

describe('aplicarDanoRapido com atacante - alvo e a ficha do proprio Mestre', () => {
    it('atacante dummie mais forte (1,5x o Poder): vida cai 1,5x e o Poder do alvo vem de minhaFicha', () => {
        const minhaFicha = fichaReal();
        const boss = { nome: 'Boss', poderCalculado: poderReal(minhaFicha) * 1.5 };
        montar(baseState({ minhaFicha, dummies: { boss } }));
        // a ficha do alvo e a do store (minhaFicha), mesmo que o objeto "alvo" traga outra copia
        act(() => { probe.aplicarDanoRapido(jogador('Mestre', fichaReal({ ascensaoBase: 1 })), 100, null, null, 0, entidade('boss', boss)); });
        expect(minhaFicha.vida.atual).toBe(5000000 - 150 * FATOR_EXIBICAO_VITAIS);
        expect(textoFeed()).toContain('aplicou 150 de dano em Mestre (golpe de Boss)');
    });
});

describe('aplicarDanoRapido com atacante - alvo e outro jogador', () => {
    it('usa o Poder ao vivo do alvo e grava a vida via aplicarDanoDireto', () => {
        const outro = fichaReal();
        const boss = { nome: 'Boss', poderCalculado: poderReal(outro) * 2 };
        montar(baseState({ personagens: { Outro: outro }, dummies: { boss } }));
        act(() => { probe.aplicarDanoRapido(jogador('Outro', outro), 10, null, null, 0, entidade('boss', boss)); });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Outro', 5000000 - 20 * FATOR_EXIBICAO_VITAIS);
    });
});

describe('MapaMestreDanoRapido (UI) - seletor de atacante', () => {
    function montarUI(dummies) {
        mockUseStore(baseState({ dummies, minhaFicha: { ...fichaVida(1000), posicao: { x: 0, y: 0, z: 0, cenaId: 'default' } } }));
        render(<MapaFormProvider><MapaMestreDanoRapido /></MapaFormProvider>);
    }
    const dummiesUI = () => ({
        orc: { nome: 'Orc', cenaId: 'default', hpAtual: 1000000, hpMax: 1000000, poderCalculado: 1000 },
        boss: { nome: 'Boss', cenaId: 'default', hpAtual: 1000000, hpMax: 1000000, poderCalculado: 1100 },
    });
    const selects = () => screen.getAllByRole('combobox');
    const selectAtacante = () => selects().find(s => Array.from(s.options).some(o => /Golpe de: ninguém/.test(o.textContent)));
    const selectAlvo = () => selects()[0];

    it('o seletor de atacante lista os outros alvos e comeca em "ninguem (sem Disputa)"', () => {
        montarUI(dummiesUI());
        expect(selectAtacante().value).toBe('');
        expect(Array.from(selectAtacante().options).map(o => o.textContent).some(t => t.includes('Boss'))).toBe(true);
    });
    it('escolher alvo e atacante e aplicar chama o dano com a disputa (x1,1)', () => {
        montarUI(dummiesUI());
        fireEvent.change(selectAlvo(), { target: { value: 'orc' } });
        fireEvent.change(selectAtacante(), { target: { value: 'boss' } });
        fireEvent.click(screen.getByText('💥 Aplicar Dano'));
        // valor padrao do campo Dano = 10 -> 11
        expect(salvarDummie).toHaveBeenCalledWith('orc', expect.objectContaining({ hpAtual: 1000000 - 11 * FATOR_EXIBICAO_VITAIS }));
    });
    it('o atacante nao pode ser o proprio alvo (some da lista de atacantes)', () => {
        montarUI(dummiesUI());
        fireEvent.change(selectAlvo(), { target: { value: 'orc' } });
        const opcoes = Array.from(selectAtacante().options).map(o => o.value);
        expect(opcoes).not.toContain('orc');
        expect(opcoes).toContain('boss');
    });
    it('sem atacante, aplicar nao muda o dano digitado', () => {
        montarUI(dummiesUI());
        fireEvent.change(selectAlvo(), { target: { value: 'orc' } });
        fireEvent.click(screen.getByText('💥 Aplicar Dano'));
        expect(salvarDummie).toHaveBeenCalledWith('orc', expect.objectContaining({ hpAtual: 1000000 - 10 * FATOR_EXIBICAO_VITAIS }));
    });
});

// ---------------------------------------------------------------------------
// Zonas
// ---------------------------------------------------------------------------
describe('Zona - dispararEfeitoDaZona (tick em avancarTurno) com Disputa de Poder', () => {
    function estadoZona({ poderConjurador = 1000, dummies, extras = {} }) {
        const zona = { id: 'z1', nome: 'Chamas', cenaId: 'cena_x', conjurador: 'Conj', duracao: 3, danoOriginal: 100, x: 5, y: 5, z: 0, raio: 2 };
        const minhaFicha = { ...fichaVida(1000), posicao: { x: 50, y: 50, z: 0, cenaId: 'cena_x' } };
        return baseState({
            minhaFicha,
            personagens: { Conj: { __poder: poderConjurador } },
            dummies: {
                a: { nome: 'A', iniciativa: 20, cenaId: 'cena_x', hpAtual: 10 },
                conj: { nome: 'Conj', iniciativa: 10, cenaId: 'cena_x', hpAtual: 10 },
                ...dummies,
            },
            cenario: { ativa: 'cena_x', lista: { cena_x: { nome: 'X', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [zona] },
            ...extras,
        });
    }
    const alvoDummie = (poder) => ({ nome: 'Alvo', iniciativa: 0, cenaId: 'cena_x', hpAtual: 1000, posicao: { x: 5, y: 6, z: 0 }, ...(poder !== undefined ? { poderCalculado: poder } : {}) });

    it('conjurador 1100 vs dummie 1000: dano da zona x1,1', () => {
        montar(estadoZona({ poderConjurador: 1100, dummies: { alvo: alvoDummie(1000) } }));
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.find(c => c[0] === 'alvo')[1].hpAtual).toBe(1000 - 110);
        expect(textoFeedContendo('castigou')).toContain('Alvo (110, x1,1)');
        expect(textoFeedContendo('castigou')).toContain('Disputa de Poder');
    });
    it('conjurador 1000 vs dummie com o dobro do Poder: nao causa dano (hp inalterado)', () => {
        montar(estadoZona({ poderConjurador: 1000, dummies: { alvo: alvoDummie(2000) } }));
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.find(c => c[0] === 'alvo')[1].hpAtual).toBe(1000);
        expect(textoFeedContendo('castigou')).toContain('Alvo (0, x0)');
    });
    it('dummie sem Poder: dano integral e feed sem anotacao de disputa', () => {
        montar(estadoZona({ poderConjurador: 1100, dummies: { alvo: alvoDummie() } }));
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.find(c => c[0] === 'alvo')[1].hpAtual).toBe(900);
        const t = textoFeedContendo('castigou');
        expect(t).toContain('castigou Alvo com 100 de Dano');
        expect(t).not.toContain('Disputa de Poder');
    });
    it('conjurador sem ficha conhecida (fora de personagens): sem Poder, dano integral', () => {
        montar(estadoZona({ dummies: { alvo: alvoDummie(5) }, extras: { personagens: {} } }));
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.find(c => c[0] === 'alvo')[1].hpAtual).toBe(900);
    });
    it('dois dummies na zona: cada um recebe seu proprio fator', () => {
        montar(estadoZona({
            poderConjurador: 1000,
            dummies: { fraco: { ...alvoDummie(500), nome: 'Fraco' }, forte: { ...alvoDummie(1250), nome: 'Forte' } },
        }));
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.find(c => c[0] === 'fraco')[1].hpAtual).toBe(1000 - 200);
        expect(salvarDummie.mock.calls.find(c => c[0] === 'forte')[1].hpAtual).toBe(1000 - 75);
        expect(textoFeedContendo('castigou')).toContain('Fraco (200, x2)');
        expect(textoFeedContendo('castigou')).toContain('Forte (75, x0,75)');
    });
    it('o dano da zona NAO usa mais os buffs multiplicadores do conjurador', () => {
        const buffs = { __poder: 1000, poderes: [{ ativa: true, efeitos: [{ atributo: 'dano', propriedade: 'mgeral', valor: 5 }], efeitosPassivos: [] }] };
        montar(estadoZona({ dummies: { alvo: alvoDummie() }, extras: { personagens: { Conj: buffs } } }));
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.find(c => c[0] === 'alvo')[1].hpAtual).toBe(900);
    });
    it('Dano Bruto novo do conjurador ainda soma no dano da zona (antes da disputa)', () => {
        const caster = { __poder: 1000, poderes: [], inventario: [{ equipado: true, efeitos: [{ propriedade: 'dano_bruto', valor: 50 }] }] };
        const state = estadoZona({ dummies: { alvo: alvoDummie(1000) }, extras: { personagens: { Conj: caster } } });
        state.cenario.zonas[0].danoBrutoOriginal = 10; // diffBruto = 50 - 10 = +40
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.find(c => c[0] === 'alvo')[1].hpAtual).toBe(1000 - 140);
    });
    it('zona antiga com multiplicadorOriginal guarda dano ja multiplicado: divide de volta ao dano puro', () => {
        const state = estadoZona({ dummies: { alvo: alvoDummie() }, extras: { personagens: { Conj: { __poder: 1000, poderes: [] } } } });
        state.cenario.zonas[0].danoOriginal = 400;
        state.cenario.zonas[0].multiplicadorOriginal = 4;
        montar(state);
        act(() => { probe.avancarTurno(); });
        expect(salvarDummie.mock.calls.find(c => c[0] === 'alvo')[1].hpAtual).toBe(1000 - 100);
    });
    function textoFeedContendo(trecho) {
        const c = enviarParaFeed.mock.calls.map(x => x[0].texto).find(t => t.includes(trecho));
        return c || '';
    }
});

describe('Zona - processarEntradaNaZona (mover o token para dentro) com Disputa de Poder', () => {
    function estadoEntrada(extras = {}) {
        const zona = { id: 'z1', nome: 'Gelo', cenaId: 'default', conjurador: 'Conj', duracao: 3, danoOriginal: 100, x: 5, y: 5, z: 0, raio: 1 };
        return baseState({
            personagens: { Conj: { __poder: 1000 } },
            cenario: { ativa: 'default', lista: { default: { nome: 'C', escala: 1.5 } }, turnoAtualIndex: 0, zonas: [zona] },
            ...extras,
        });
    }

    it('Mestre move dummie mais fraco (500) para dentro: dano x2 e feed com a disputa', () => {
        const d = { nome: 'Alvo', cenaId: 'default', hpAtual: 1000, posicao: { x: 0, y: 0, z: 0 }, poderCalculado: 500 };
        montar(estadoEntrada({ dummies: { alvo: d }, alvoSelecionado: 'alvo' }));
        act(() => { probe.handleCellClick(5, 5); });

        const hpFinal = salvarDummie.mock.calls.filter(c => c[0] === 'alvo').map(c => c[1].hpAtual);
        expect(hpFinal).toContain(1000 - 200);
        expect(textoFeed()).toContain('Alvo pisou na área de [Gelo] e sofreu 200 de Dano');
        expect(textoFeed()).toContain('Disputa de Poder');
    });
    it('dummie com o dobro do Poder: sofre 0 de dano', () => {
        const d = { nome: 'Alvo', cenaId: 'default', hpAtual: 1000, posicao: { x: 0, y: 0, z: 0 }, poderCalculado: 2000 };
        montar(estadoEntrada({ dummies: { alvo: d }, alvoSelecionado: 'alvo' }));
        act(() => { probe.handleCellClick(5, 5); });
        expect(salvarDummie.mock.calls.filter(c => c[0] === 'alvo').map(c => c[1].hpAtual)).toContain(1000);
        expect(textoFeed()).toContain('sofreu 0 de Dano');
    });
    it('dummie sem Poder: dano integral e feed sem disputa', () => {
        const d = { nome: 'Alvo', cenaId: 'default', hpAtual: 1000, posicao: { x: 0, y: 0, z: 0 } };
        montar(estadoEntrada({ dummies: { alvo: d }, alvoSelecionado: 'alvo' }));
        act(() => { probe.handleCellClick(5, 5); });
        expect(salvarDummie.mock.calls.filter(c => c[0] === 'alvo').map(c => c[1].hpAtual)).toContain(900);
        expect(textoFeed()).not.toContain('Disputa de Poder');
    });
    it('o proprio jogador entra na zona: usa o Poder dele (minhaFicha) contra o do conjurador', () => {
        // posicoes[cena] e SUBSTITUIDO (nao mutado) por handleCellClick, entao oldPos continua valendo
        const minhaFicha = { ...fichaVida(500, 100000), posicao: undefined, posicoes: { default: { x: 0, y: 0, z: 0, cenaId: 'default' } } };
        const state = estadoEntrada({ minhaFicha, isMestre: false });
        montar(state);
        act(() => { probe.handleCellClick(5, 5); });
        // conjurador 1000 vs eu 500: x2 -> 200
        expect(minhaFicha.vida.atual).toBe(100000 - 200);
        expect(textoFeed()).toContain('Mestre pisou na área de [Gelo] e sofreu 200 de Dano');
    });
    it('quem ja estava dentro da zona nao recebe dano de novo', () => {
        const d = { nome: 'Alvo', cenaId: 'default', hpAtual: 1000, posicao: { x: 5, y: 5, z: 0 }, poderCalculado: 500 };
        montar(estadoEntrada({ dummies: { alvo: d }, alvoSelecionado: 'alvo' }));
        act(() => { probe.handleCellClick(5, 6); });
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
    it('mover para fora da zona nao causa dano', () => {
        const d = { nome: 'Alvo', cenaId: 'default', hpAtual: 1000, posicao: { x: 0, y: 0, z: 0 }, poderCalculado: 500 };
        montar(estadoEntrada({ dummies: { alvo: d }, alvoSelecionado: 'alvo' }));
        act(() => { probe.handleCellClick(1, 1); });
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });
});
