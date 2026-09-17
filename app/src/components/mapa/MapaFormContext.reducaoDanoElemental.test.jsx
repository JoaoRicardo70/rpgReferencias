import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso, enviarParaFeed, salvarDummie, aplicarDanoDireto, aplicarFadigaDireta, aplicarElementoDireto, aplicarElementoNivelDireto } from '../../services/firebase-sync';
import { calcularReducaoDanoElemental } from '../../core/dominios';
import { FATOR_EXIBICAO_VITAIS } from '../../core/vitals';

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

        // calcularReducaoDanoElemental(10,0) = 0.75 -> valor = floor(1000*0.25) = 250 (exibido) ->
        // valorRaw = 250 * FATOR_EXIBICAO_VITAIS (1000) = 250.000 bruto, subtraídos do default de
        // fichaVidaLimpa (1.000.000) -> 750.000. Não clampa (250.000 < 1.000.000), então o fixture
        // não precisou ser alterado, só o valor esperado (que antes ignorava a escala bruta).
        expect(minhaFicha.vida.atual).toBe(1000000 - 250000);
    });

    it('sem NENHUM Domínio registrado nesse elemento, o dano passa integral (sem redução)', () => {
        // 🔥 Sem redução, valorRaw = 1000 (exibido) * FATOR_EXIBICAO_VITAIS (1000) = 1.000.000
        // bruto — igual ao default de fichaVidaLimpa (1.000.000), o que clamparia a vida pra 0 e
        // perderia o sentido de "dano passa integral" (queremos ver a SUBTRAÇÃO, não só um clamp).
        // Por isso a vida bruta deste teste é elevada pra 5.000.000, mantendo o cenário de dano
        // parcial pedido no nome do teste.
        const minhaFicha = fichaVidaLimpa({
            dominios: {},
            vida: { base: 5000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 5000000, regeneracao: 0 },
        });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo'); });

        expect(minhaFicha.vida.atual).toBe(5000000 - 1000000); // 5000000 - 1000*1000
    });

    it('nivelDominioAtacante >= nível do defensor cancela a redução por completo (dano integral atravessa)', () => {
        // Mesmo raciocínio de escala do teste "sem NENHUM Domínio" acima: redução cancelada ->
        // dano integral (1000*1000 = 1.000.000 bruto) -> vida elevada pra preservar o cenário
        // de dano parcial em vez de um clamp em 0.
        const minhaFicha = fichaVidaLimpa({
            dominios: { Fogo: { nivel: 6 } },
            vida: { base: 5000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 5000000, regeneracao: 0 },
        });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo', undefined, 6); });

        expect(minhaFicha.vida.atual).toBe(5000000 - 1000000); // 5000000 - 1000*1000
    });

    it('nivelDominioAtacante MAIOR que o defensor também cancela a redução (0%, nunca negativo)', () => {
        // Mesmo raciocínio de escala dos dois testes acima.
        const minhaFicha = fichaVidaLimpa({
            dominios: { Fogo: { nivel: 3 } },
            vida: { base: 5000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 5000000, regeneracao: 0 },
        });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo', undefined, 9); });

        expect(minhaFicha.vida.atual).toBe(5000000 - 1000000); // 5000000 - 1000*1000
    });

    it('o override "Domínio Alvo" do Mestre (nivelDominioOverride) tem precedência sobre ficha.dominios real pro cálculo de redução de DANO, não só pra Fadiga', () => {
        // Ficha real tem Domínio 1 (redução pequena), mas o Mestre sobrescreve pra 10 (redução máxima).
        const minhaFicha = fichaVidaLimpa({ dominios: { Fogo: { nivel: 1 } } });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo', 10); });

        // calcularReducaoDanoElemental(10,0) = 0.75 -> valor = 250 (exibido) -> valorRaw = 250.000
        // bruto (NÃO os ~925.000 que o nível 1 real daria). 250.000 < default de 1.000.000, não
        // clampa -> fixture inalterado, só o valor esperado corrigido pra escala bruta.
        expect(minhaFicha.vida.atual).toBe(1000000 - 250000);
    });

    it('override explícito de 0 ("Domínio Alvo"=0) ignora um Domínio real alto e não reduz o dano', () => {
        // Sem redução (override=0) -> dano integral -> mesmo raciocínio de escala dos testes
        // "cancela a redução" acima: vida elevada pra preservar o cenário de dano parcial.
        const minhaFicha = fichaVidaLimpa({
            dominios: { Fogo: { nivel: 10 } },
            vida: { base: 5000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 5000000, regeneracao: 0 },
        });
        const state = baseState({ minhaFicha, updateFicha: vi.fn((callback) => callback(minhaFicha)) });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Mestre', nome: 'Mestre', ficha: minhaFicha, isDummie: false }, 1000, 'Fogo', 0); });

        expect(minhaFicha.vida.atual).toBe(5000000 - 1000000); // 5000000 - 1000*1000
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
        // não depender de arredondamento manual de ponto flutuante aqui) -> depois multiplicado por
        // FATOR_EXIBICAO_VITAIS (1000) pra virar o dano BRUTO de fato gravado em vida.atual (mesma
        // conversão aplicada dentro de aplicarDanoRapido desde a correção de escala). 399.000 bruto
        // < default de fichaVidaLimpa (1.000.000), não clampa -> fixture inalterado.
        const reducao = calcularReducaoDanoElemental(8, 0);
        const valorEsperado = Math.max(0, Math.floor(1000 * (1 - reducao)));
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 1000000 - valorEsperado * FATOR_EXIBICAO_VITAIS);
    });

    it('nivelDominioAtacante >= Domínio do outro jogador cancela a redução (dano integral via aplicarDanoDireto)', () => {
        // Sem redução -> dano integral -> valorRaw = 1000*1000 = 1.000.000, igual ao default de
        // fichaVidaLimpa -> clamparia pra 0 e perderia o cenário de dano parcial. Vida elevada pra
        // 5.000.000, mesmo raciocínio já usado nos testes equivalentes do branch SELF acima.
        const outroJogador = fichaVidaLimpa({
            dominios: { Agua: { nivel: 8 } },
            vida: { base: 5000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 5000000, regeneracao: 0 },
        });
        const state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: outroJogador, isDummie: false }, 1000, 'Agua', undefined, 8); });

        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 5000000 - 1000000); // 5000000 - 1000*1000
    });

    it('override "Domínio Alvo" do Mestre também tem precedência sobre o Domínio real de OUTRO jogador', () => {
        const outroJogador = fichaVidaLimpa({ dominios: { Agua: { nivel: 1 } } });
        const state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: outroJogador } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: outroJogador, isDummie: false }, 1000, 'Agua', 10); });

        // calcularReducaoDanoElemental(10,0) = 0.75 -> valor = 250 (exibido) -> valorRaw = 250.000
        // bruto, < default de 1.000.000 -> não clampa, fixture inalterado.
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Vilao', 1000000 - 250000);
    });
});

describe('MapaFormContext — aplicarDanoRapido(): DUMMIE nunca recebe redução de dano elemental, mesmo com elemento marcado', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('dummie com elemento marcado (e mesmo se, hipoteticamente, tivesse um campo "dominios") sempre toma o dano BRUTO integral', () => {
        // 🔥 hpAtual bruto elevado pra 500.000 — 300 (exibido) * FATOR_EXIBICAO_VITAIS (1000) =
        // 300.000 bruto; o antigo hpAtual de 1000 clamparia pra 0 e perderia o cenário de dano
        // parcial que este teste quer exercitar.
        const state = baseState({ isMestre: true, dummies: { goblin: { nome: 'Goblin', hpAtual: 500000, cenaId: 'default', dominios: { Fogo: { nivel: 10 } } } } });
        montarComEstado(state);

        act(() => { probe.aplicarDanoRapido({ id: 'goblin', nome: 'Goblin', ficha: state.dummies.goblin, isDummie: true }, 300, 'Fogo', 10); });

        expect(salvarDummie).toHaveBeenCalledTimes(1);
        const dadosSalvos = salvarDummie.mock.calls[0][1];
        expect(dadosSalvos.hpAtual).toBe(200000); // 500000 - 300*1000, SEM nenhuma redução
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

    // 🔥 Vida bruta elevada pra 1 bilhão nos 4 fichaVidaLimpa() abaixo — dano digitado de 300000
    // (exibido) vira 300000*FATOR_EXIBICAO_VITAIS (1000) = 300.000.000 bruto; com o default de
    // 1.000.000 da fábrica isso zerava (clampava) a vida nos DOIS cenários (com e sem redução),
    // fazendo a comparação "vidaComReducao > vidaSemReducao" falhar (0 não é maior que 0). Em 1
    // bilhão, 300.000.000 bruto continua sendo só uma fração da vida total nos dois cenários,
    // preservando a comparação relativa que este bloco de testes verifica.
    const VIDA_BRUTA_TESTE_FADIGA = { base: 1000000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1000000000, regeneracao: 0 };

    it('BRANCH SELF: com o MESMO Domínio real (mesma Resistência Elemental de Fadiga em ambos os cenários), menos dano efetivo (redução ativa) gera fadigaExtra estritamente MENOR do que dano integral (redução cancelada por nivelDominioAtacante igual)', () => {
        // Cenário A: atacante SEM Domínio -> redução de 30% aplicada (defensor 4 vs atacante 0).
        const fichaComReducao = fichaVidaLimpa({ dominios: { Fogo: { nivel: 4 } }, vida: { ...VIDA_BRUTA_TESTE_FADIGA } });
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
        const fichaSemReducao = fichaVidaLimpa({ dominios: { Fogo: { nivel: 4 } }, vida: { ...VIDA_BRUTA_TESTE_FADIGA } });
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
        const alvoComReducao = fichaVidaLimpa({ dominios: { Fogo: { nivel: 4 } }, vida: { ...VIDA_BRUTA_TESTE_FADIGA } });
        let state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: alvoComReducao } });
        montarComEstado(state);
        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: alvoComReducao, isDummie: false }, 300000, 'Fogo'); });
        const fadigaComReducao = aplicarFadigaDireta.mock.calls[0][1];

        cleanup();
        vi.clearAllMocks();

        const alvoSemReducao = fichaVidaLimpa({ dominios: { Fogo: { nivel: 4 } }, vida: { ...VIDA_BRUTA_TESTE_FADIGA } });
        state = baseState({ isMestre: true, meuNome: 'Mestre', personagens: { Vilao: alvoSemReducao } });
        montarComEstado(state);
        act(() => { probe.aplicarDanoRapido({ id: 'Vilao', nome: 'Vilao', ficha: alvoSemReducao, isDummie: false }, 300000, 'Fogo', undefined, 4); });
        const fadigaSemReducao = aplicarFadigaDireta.mock.calls[0][1];

        expect(fadigaComReducao).toBeLessThan(fadigaSemReducao);
    });
});
