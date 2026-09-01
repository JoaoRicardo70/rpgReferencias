import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed, salvarDummie, aplicarDanoDireto } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — descansar() e aplicarDanoRapido() (MapaFormContext.jsx)
//
// Mesmo padrão de mock de useStore/firebase-sync de
// MapaFormContext.combateAutoTurno.test.jsx / MapaFormContext.apenasCriador.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
}));

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
    aplicarDanoDireto: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function fichaComVital(overrides = {}) {
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 },
        mana: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 },
        aura: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 },
        chakra: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 },
        corpo: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 },
        forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 },
        sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 }, carisma: { base: 1000000 },
        stamina: { base: 1000000 }, constituicao: { base: 1000000 },
        multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
        poderes: [],
        inventario: [],
        passivas: [],
        combate: { fadigaTurnos: 3, fadigaPorTurno: 5, fadigaExtra: 6, municoTurnos: 4, danoAbsorvido: 777, furiaMax: 42 },
        ...overrides,
    };
}

function baseState(overrides = {}) {
    const minhaFicha = fichaComVital();
    return {
        minhaFicha,
        meuNome: 'Heroi',
        personagens: {},
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        feedCombate: [],
        isMestre: false,
        mesaCriador: '',
        dummies: {},
        alvoSelecionado: null,
        abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
        ...overrides,
    };
}

let probe;
function Harness() {
    probe = useMapaForm();
    return null;
}

function montarComEstado(state) {
    mockUseStore(state);
    probe = undefined;
    return render(<MapaFormProvider><Harness /></MapaFormProvider>);
}

describe('MapaFormContext — descansar() (botão "💖 Descansar" do Mapa)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.confirm = vi.fn(() => true);
    });

    afterEach(() => {
        cleanup();
    });

    it('Happy Path: cura vida/mana/aura/chakra/corpo até o máximo e zera fadigaTurnos/fadigaExtra/municoTurnos (via descansarCompleto)', () => {
        const state = baseState();
        montarComEstado(state);

        act(() => { probe.descansar(); });

        expect(window.confirm).toHaveBeenCalledTimes(1);
        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach((k) => {
            expect(state.minhaFicha[k].atual).toBeGreaterThan(1);
        });
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.combate.fadigaExtra).toBe(0);
        expect(state.minhaFicha.combate.municoTurnos).toBe(0);
        // Campos não relacionados de combate.* sobrevivem intactos (descansarCompleto não mexe neles).
        expect(state.minhaFicha.combate.danoAbsorvido).toBe(777);
        expect(state.minhaFicha.combate.furiaMax).toBe(42);
    });

    it('chama salvarFichaSilencioso e posta uma mensagem no feed com o próprio nome', () => {
        const state = baseState({ meuNome: 'Heroi' });
        montarComEstado(state);

        act(() => { probe.descansar(); });

        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        const feedArg = enviarParaFeed.mock.calls[0][0];
        expect(feedArg.texto).toContain('Heroi');
        expect(feedArg.tipo).toBe('sistema');
    });

    it('Edge Case: cancelar o window.confirm() aborta a ação inteira (nada é curado, nada é salvo/postado)', () => {
        window.confirm = vi.fn(() => false);
        const state = baseState();
        montarComEstado(state);

        act(() => { probe.descansar(); });

        expect(state.minhaFicha.vida.atual).toBe(1);
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(3);
        expect(state.minhaFicha.combate.fadigaExtra).toBe(6);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('Regressão: descansar() nunca chama salvarDummie/aplicarDanoDireto — só mexe na PRÓPRIA ficha', () => {
        const state = baseState({
            dummies: { goblin: { nome: 'Goblin', hpAtual: 5 } },
            personagens: { Vilao: fichaComVital() },
        });
        montarComEstado(state);

        act(() => { probe.descansar(); });

        expect(salvarDummie).not.toHaveBeenCalled();
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
    });
});

describe('MapaFormContext — aplicarDanoRapido() (ferramenta "⚔️ Dano Rápido" do Mestre)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('Gate isMestre: um jogador comum (isMestre=false) chamando aplicarDanoRapido é um no-op completo', () => {
        const state = baseState({ isMestre: false, dummies: { goblin: { nome: 'Goblin', hpAtual: 50 } } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'goblin', nome: 'Goblin', ficha: state.dummies.goblin, isDummie: true }, 10); });

        expect(salvarDummie).not.toHaveBeenCalled();
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
        expect(state.updateFicha).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('Branch DUMMIE: chama salvarDummie com hpAtual reduzido, relendo os dados FRESCOS de useStore.getState().dummies (não o snapshot "ficha" passado)', () => {
        const state = baseState({ isMestre: true, dummies: { goblin: { nome: 'Goblin', hpAtual: 50, cenaId: 'default' } } });
        montarComEstado(state);

        // Snapshot desatualizado propositalmente passado como alvo.ficha -- a implementação deve
        // IGNORAR esse hpAtual velho e reler useStore.getState().dummies[id] na hora de aplicar.
        const alvoComSnapshotVelho = { id: 'goblin', nome: 'Goblin', ficha: { hpAtual: 999 }, isDummie: true };

        act(() => { probe.aplicarDanoRapido(alvoComSnapshotVelho, 15); });

        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const [idChamado, dadosChamados] = salvarDummie.mock.calls[0];
        expect(idChamado).toBe('goblin');
        expect(dadosChamados.hpAtual).toBe(35); // 50 (dado fresco do store) - 15, não 999-15
    });

    it('Branch DUMMIE: clampa hpAtual em 0 (nunca negativo) quando o dano excede o HP restante', () => {
        const state = baseState({ isMestre: true, dummies: { goblin: { nome: 'Goblin', hpAtual: 10, cenaId: 'default' } } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'goblin', nome: 'Goblin', ficha: state.dummies.goblin, isDummie: true }, 999); });

        expect(salvarDummie.mock.calls[0][1].hpAtual).toBe(0);
    });

    it('Branch AUTO (Mestre se auto-aplicando dano, alvo.nome === meuNome): usa o updateFicha LOCAL, vida flooreada em 0', () => {
        const state = baseState({ isMestre: true, meuNome: 'Mestre' });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: state.minhaFicha, isDummie: false }, 999); });

        expect(state.minhaFicha.vida.atual).toBe(0);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
        expect(salvarDummie).not.toHaveBeenCalled();
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
    });

    it('Branch OUTRO JOGADOR: chama a escrita cross-player aplicarDanoDireto(nome, ficha.vida.atual - dano), NUNCA salvarFichaSilencioso/updateFicha local', () => {
        const outroJogador = fichaComVital({ vida: { base: 100000000, atual: 80, regeneracao: 0 } });
        const state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: outroJogador, isDummie: false }, 30); });

        expect(aplicarDanoDireto).toHaveBeenCalledTimes(1);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 50); // 80 - 30
        // A ficha alheia nunca é gravada pelos caminhos "locais" (updateFicha só grava a MINHA ficha).
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
        expect(salvarDummie).not.toHaveBeenCalled();
        // A MINHA ficha (do Mestre) não foi tocada.
        expect(state.minhaFicha.vida.atual).toBe(1);
    });

    it('posta uma mensagem de feed com o valor de dano e o nome do alvo em todos os 3 branches', () => {
        const state = baseState({ isMestre: true, meuNome: 'Mestre', dummies: { goblin: { nome: 'Goblin', hpAtual: 50, cenaId: 'default' } } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'goblin', nome: 'Goblin', ficha: state.dummies.goblin, isDummie: true }, 15); });

        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        const feedArg = enviarParaFeed.mock.calls[0][0];
        expect(feedArg.texto).toContain('15');
        expect(feedArg.texto).toContain('Goblin');
    });

    describe('Edge Cases de aplicarDanoRapido', () => {
        it('dano <= 0 é um no-op completo (nenhuma escrita, nenhum feed)', () => {
            const state = baseState({ isMestre: true, dummies: { goblin: { nome: 'Goblin', hpAtual: 50, cenaId: 'default' } } });
            montarComEstado(state);

            act(() => { probe.aplicarDanoRapido({ id: 'goblin', nome: 'Goblin', ficha: state.dummies.goblin, isDummie: true }, 0); });
            act(() => { probe.aplicarDanoRapido({ id: 'goblin', nome: 'Goblin', ficha: state.dummies.goblin, isDummie: true }, -10); });

            expect(salvarDummie).not.toHaveBeenCalled();
            expect(enviarParaFeed).not.toHaveBeenCalled();
        });

        it('alvo null/undefined é um no-op completo, sem lançar exceção', () => {
            const state = baseState({ isMestre: true });
            montarComEstado(state);

            expect(() => { act(() => { probe.aplicarDanoRapido(null, 10); }); }).not.toThrow();
            expect(() => { act(() => { probe.aplicarDanoRapido(undefined, 10); }); }).not.toThrow();

            expect(salvarDummie).not.toHaveBeenCalled();
            expect(aplicarDanoDireto).not.toHaveBeenCalled();
            expect(enviarParaFeed).not.toHaveBeenCalled();
        });

        it('dummie inexistente no store (removido entre a UI listar e o clique) não lança e não escreve nada', () => {
            const state = baseState({ isMestre: true, dummies: {} });
            montarComEstado(state);

            expect(() => {
                act(() => { probe.aplicarDanoRapido({ id: 'fantasma', nome: 'Fantasma', ficha: { hpAtual: 10 }, isDummie: true }, 10); });
            }).not.toThrow();

            expect(salvarDummie).not.toHaveBeenCalled();
        });

        it('valor de dano fracionário é truncado (Math.floor) antes de aplicar', () => {
            const state = baseState({ isMestre: true, dummies: { goblin: { nome: 'Goblin', hpAtual: 50, cenaId: 'default' } } });
            montarComEstado(state);

            act(() => { probe.aplicarDanoRapido({ id: 'goblin', nome: 'Goblin', ficha: state.dummies.goblin, isDummie: true }, 15.9); });

            expect(salvarDummie.mock.calls[0][1].hpAtual).toBe(35); // 50 - floor(15.9)=15
        });
    });
});
