import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed, salvarDummie, aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto, aplicarElementoNivelDireto } from '../../services/firebase-sync';
import { calcularReducaoDanoElemental } from '../../core/dominios';

// ---------------------------------------------------------------------------
// QA — aplicarDanoRapido(): NOVO 5º parâmetro `nivelDominioAtacante` e integração com
// core/dominios.js > calcularReducaoDanoElemental (redução de DANO real, diferente da
// Resistência Elemental de Fadiga já coberta por MapaFormContext.nivelDominioOverride.test.jsx).
//
// Quando `elemento` é passado e o alvo NÃO é dummie, o dano BRUTO é pré-reduzido por
// calcularReducaoDanoElemental(nivelDefensor, nivelAtacante) ANTES de subtrair de vida.atual —
// nivelDefensor resolve pra nivelDominioOverride (se fornecido) ou getNivelDominio(ficha,
// elemento) (Domínio real do alvo). Mesmo padrão de mock/fixture de
// MapaFormContext.nivelDominioOverride.test.jsx.
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
    aplicarFadigaDireta: vi.fn(),
    aplicarElementoDireto: vi.fn(),
    aplicarElementoNivelDireto: vi.fn(),
}));

let storeState;
function mockUseStore(state) {
    storeState = state;
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(storeState) : storeState));
    useStore.getState = () => storeState;
}

function fichaVidaLimpa(overrides = {}) {
    return {
        iniciativa: 0,
        posicao: { x: 0, y: 0, z: 0 },
        acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
        vida: { base: 1000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 0 },
        mana: { base: 1000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 0 },
        aura: { base: 1000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 0 },
        chakra: { base: 1000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 0 },
        corpo: { base: 1000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000, regeneracao: 0 },
        forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 },
        sabedoria: { base: 1000000 }, energiaEsp: { base: 1000000 }, carisma: { base: 1000000 },
        stamina: { base: 1000000 }, constituicao: { base: 1000000 },
        multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {},
        poderes: [], inventario: [], passivas: [],
        dominios: {},
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
        ...overrides,
    };
}

function baseState(overrides = {}) {
    const minhaFicha = fichaVidaLimpa();
    return {
        minhaFicha,
        meuNome: 'Mestre',
        personagens: {},
        updateFicha: vi.fn((callback) => callback(minhaFicha)),
        feedCombate: [],
        isMestre: true,
        mesaCriador: 'Mestre',
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

describe('MapaFormContext — aplicarDanoRapido(): redução de dano real baseada no Domínio do alvo (branch SELF)', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('alvo (a própria ficha) com Domínio 10 registrado nesse elemento e sem nível de atacante informado (default 0) toma dano REDUZIDO (75%)', () => {
        const minhaFicha = fichaVidaLimpa({ dominios: { Fogo: { nivel: 10 } } });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo'); });

        // calcularReducaoDanoElemental(10,0) = 0.75 -> valor = floor(1000*0.25) = 250
        expect(minhaFicha.vida.atual).toBe(1000000 - 250);
    });

    it('sem NENHUM Domínio registrado nesse elemento, o dano passa integral (sem redução)', () => {
        const minhaFicha = fichaVidaLimpa({ dominios: {} });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo'); });

        expect(minhaFicha.vida.atual).toBe(1000000 - 1000);
    });

    it('nivelDominioAtacante >= nível do defensor cancela a redução por completo (dano integral atravessa)', () => {
        const minhaFicha = fichaVidaLimpa({ dominios: { Fogo: { nivel: 6 } } });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo', undefined, 6); });

        expect(minhaFicha.vida.atual).toBe(1000000 - 1000);
    });

    it('nivelDominioAtacante MAIOR que o defensor também cancela a redução (0%, nunca negativo)', () => {
        const minhaFicha = fichaVidaLimpa({ dominios: { Fogo: { nivel: 3 } } });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo', undefined, 9); });

        expect(minhaFicha.vida.atual).toBe(1000000 - 1000);
    });

    it('o override "Domínio Alvo" do Mestre (nivelDominioOverride) tem precedência sobre ficha.dominios real pro cálculo de redução de DANO, não só pra Fadiga', () => {
        // Ficha real tem Domínio 1 (redução pequena), mas o Mestre sobrescreve pra 10 (redução máxima).
        const minhaFicha = fichaVidaLimpa({ dominios: { Fogo: { nivel: 1 } } });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo', 10); });

        // calcularReducaoDanoElemental(10,0) = 0.75 -> valor = 250 (NÃO os ~925 que o nível 1 real daria)
        expect(minhaFicha.vida.atual).toBe(1000000 - 250);
    });

    it('override explícito de 0 ("Domínio Alvo"=0) ignora um Domínio real alto e não reduz o dano', () => {
        const minhaFicha = fichaVidaLimpa({ dominios: { Fogo: { nivel: 10 } } });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo', 0); });

        expect(minhaFicha.vida.atual).toBe(1000000 - 1000);
    });
});

describe('MapaFormContext — aplicarDanoRapido(): redução de dano real (branch OUTRO JOGADOR)', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('outro jogador com Domínio 8 registrado e atacante sem Domínio (default 0) recebe dano reduzido via aplicarDanoDireto', () => {
        const outroJogador = fichaVidaLimpa({ dominios: { Agua: { nivel: 8 } } });
        const state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: outroJogador, isDummie: false }, 1000, 'Agua'); });

        // calcularReducaoDanoElemental(8,0) ~= 0.6 -> valor = floor(1000*(1-reducao)) (usa a própria
        // função, já testada isoladamente em core/dominios.calcularReducaoDanoElemental.test.js, pra
        // não depender de arredondamento manual de ponto flutuante aqui).
        const reducao = calcularReducaoDanoElemental(8, 0);
        const valorEsperado = Math.max(0, Math.floor(1000 * (1 - reducao)));
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 1000000 - valorEsperado);
    });

    it('nivelDominioAtacante >= Domínio do outro jogador cancela a redução (dano integral via aplicarDanoDireto)', () => {
        const outroJogador = fichaVidaLimpa({ dominios: { Agua: { nivel: 8 } } });
        const state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: outroJogador, isDummie: false }, 1000, 'Agua', undefined, 8); });

        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 1000000 - 1000);
    });

    it('override "Domínio Alvo" do Mestre também tem precedência sobre o Domínio real de OUTRO jogador', () => {
        const outroJogador = fichaVidaLimpa({ dominios: { Agua: { nivel: 1 } } });
        const state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: outroJogador, isDummie: false }, 1000, 'Agua', 10); });

        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 1000000 - 250);
    });
});

describe('MapaFormContext — aplicarDanoRapido(): DUMMIE nunca recebe redução de dano elemental, mesmo com elemento marcado', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('dummie com elemento marcado (e mesmo se, hipoteticamente, tivesse um campo "dominios") sempre toma o dano BRUTO integral', () => {
        const state = baseState({ isMestre: true, dummies: { goblin: { nome: 'Goblin', hpAtual: 1000, cenaId: 'default', dominios: { Fogo: { nivel: 10 } } } } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'goblin', nome: 'Goblin', ficha: state.dummies.goblin, isDummie: true }, 300, 'Fogo', 10); });

        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const dadosSalvos = salvarDummie.mock.calls[0][1];
        expect(dadosSalvos.hpAtual).toBe(700); // 1000 - 300, SEM nenhuma redução
    });
});

describe('MapaFormContext — aplicarDanoRapido(): feed de combate inclui a redução (%) e o valor "bruto" só quando de fato houve redução', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('golpe COM redução real inclui o percentual e o texto "bruto" na mensagem do feed', () => {
        const minhaFicha = fichaVidaLimpa({ dominios: { Fogo: { nivel: 10 } } });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo'); });

        const texto = enviarParaFeed.mock.calls[0][0].texto;
        expect(texto).toContain('75%');
        expect(texto).toContain('bruto');
        expect(texto).toContain('1000'); // valor bruto original
    });

    it('golpe SEM nenhuma redução (sem Domínio registrado) NÃO menciona percentual/"bruto" no feed', () => {
        const minhaFicha = fichaVidaLimpa({ dominios: {} });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo'); });

        const texto = enviarParaFeed.mock.calls[0][0].texto;
        expect(texto).not.toContain('bruto');
        expect(texto).not.toContain('Resistência Elemental');
    });

    it('golpe sem elemento nenhum também não menciona redução/"bruto"', () => {
        const minhaFicha = fichaVidaLimpa({ dominios: { Fogo: { nivel: 10 } } });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, null); });

        const texto = enviarParaFeed.mock.calls[0][0].texto;
        expect(texto).not.toContain('bruto');
    });
});

describe('MapaFormContext — aplicarDanoRapido(): hit quase totalmente resistido (arredondamento pra 0) não lança e não gera Vida negativa/NaN', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('dano bruto pequeno (1) com redução máxima (75%) arredonda pra 0 de dano efetivo — Vida permanece exatamente igual, sem negativos/NaN', () => {
        const minhaFicha = fichaVidaLimpa({ dominios: { Fogo: { nivel: 10 } }, vida: { base: 1000000, atual: 5, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', regeneracao: 0 } });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        expect(() => {
            act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1, 'Fogo'); });
        }).not.toThrow();

        // floor(1 * 0.25) = 0 -> vida.atual não muda
        expect(minhaFicha.vida.atual).toBe(5);
        expect(minhaFicha.vida.atual).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(minhaFicha.vida.atual)).toBe(false);
    });

    it('mesmo um dano bruto maior, plenamente reduzido, nunca deixa vida.atual abaixo de 0', () => {
        const minhaFicha = fichaVidaLimpa({ dominios: { Fogo: { nivel: 10 } }, vida: { base: 1000000, atual: 0, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', regeneracao: 0 } });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        expect(() => {
            act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 100, 'Fogo'); });
        }).not.toThrow();

        expect(minhaFicha.vida.atual).toBeGreaterThanOrEqual(0);
        expect(Number.isNaN(minhaFicha.vida.atual)).toBe(false);
    });
});

describe('MapaFormContext — aplicarDanoRapido(): a Fadiga dinâmica gerada usa o dano JÁ REDUZIDO (novaVida pós-redução), não o dano bruto pré-redução', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('BRANCH SELF: com o MESMO Domínio real (mesma Resistência Elemental de Fadiga em ambos os cenários), menos dano efetivo (redução ativa) gera fadigaExtra estritamente MENOR do que dano integral (redução cancelada por nivelDominioAtacante igual)', () => {
        // Cenário A: atacante SEM Domínio -> redução de 30% aplicada (defensor 4 vs atacante 0).
        const fichaComReducao = fichaVidaLimpa({ dominios: { Fogo: { nivel: 4 } } });
        let state = baseState({ minhaFicha: fichaComReducao, updateFicha: vi.fn((callback) => callback(fichaComReducao)) });
        montarComEstado(state);
        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: fichaComReducao, isDummie: false }, 300000, 'Fogo'); });
        const fadigaComReducao = fichaComReducao.combate.fadigaExtra;
        const vidaComReducao = fichaComReducao.vida.atual;

        cleanup();
        vi.clearAllMocks();

        // Cenário B: MESMO Domínio real (4) mas nivelDominioAtacante=4 (igual) -> cancela a redução,
        // dano integral. A Resistência Elemental de Fadiga (getFracaoResistenciaElemental) lê o
        // MESMO Domínio real (4) nos dois cenários -> esse fator fica idêntico, isolando a diferença
        // pro dano efetivamente perdido.
        const fichaSemReducao = fichaVidaLimpa({ dominios: { Fogo: { nivel: 4 } } });
        state = baseState({ minhaFicha: fichaSemReducao, updateFicha: vi.fn((callback) => callback(fichaSemReducao)) });
        montarComEstado(state);
        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: fichaSemReducao, isDummie: false }, 300000, 'Fogo', undefined, 4); });
        const fadigaSemReducao = fichaSemReducao.combate.fadigaExtra;
        const vidaSemReducao = fichaSemReducao.vida.atual;

        // A vida perdida em B é maior que em A (prova que a redução de fato se aplicou só em A).
        expect(vidaComReducao).toBeGreaterThan(vidaSemReducao);
        // E a Fadiga gerada acompanha o dano JÁ REDUZIDO -> A gera MENOS fadiga que B.
        expect(fadigaComReducao).toBeLessThan(fadigaSemReducao);
    });

    it('BRANCH OUTRO JOGADOR: mesma lógica — aplicarFadigaDireta recebe um valor de fadiga MENOR quando a redução de dano está ativa, comparado ao dano integral (mesmo Domínio real nos dois casos)', () => {
        const alvoComReducao = fichaVidaLimpa({ dominios: { Fogo: { nivel: 4 } } });
        let state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: alvoComReducao } });
        montarComEstado(state);
        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: alvoComReducao, isDummie: false }, 300000, 'Fogo'); });
        const fadigaComReducao = aplicarFadigaDireta.mock.calls[0][1];

        cleanup();
        vi.clearAllMocks();

        const alvoSemReducao = fichaVidaLimpa({ dominios: { Fogo: { nivel: 4 } } });
        state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: alvoSemReducao } });
        montarComEstado(state);
        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: alvoSemReducao, isDummie: false }, 300000, 'Fogo', undefined, 4); });
        const fadigaSemReducao = aplicarFadigaDireta.mock.calls[0][1];

        expect(fadigaComReducao).toBeLessThan(fadigaSemReducao);
    });
});
