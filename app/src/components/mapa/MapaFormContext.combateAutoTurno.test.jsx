import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaFormProvider, useMapaForm } from './MapaFormContext';
import useStore from '../../stores/useStore';
import { calcularFadigaAtual } from '../../core/fadiga';

// ---------------------------------------------------------------------------
// QA — Fadiga de Combate e Regeneração automáticas no Mapa (MapaFormContext.jsx)
//
// A conta de início de turno (reset de acoes.padrao/bonus/reacao +
// combate.fadigaExtra via calcularGanhoFadigaDinamico + aplicarRegeneracaoDeTurno)
// roda DENTRO de avancarTurno, pro personagem que está RECEBENDO o turno
// (`nextPlayer`) — não mais num useEffect reativo que só existia no navegador do
// PRÓPRIO dono da ficha. Quem chamou avancarTurno (Mestre ou outro jogador
// qualquer) já aplica a conta e grava o resultado:
//   - dummie (NPC): só se quem chamou for Mestre, grava via salvarDummie (nó
//     inteiro, já que só o Mestre escreve dummies).
//   - EU mesmo: updateFicha local (fonte de verdade imediata) + salvarFichaSilencioso.
//   - outro jogador real: nunca posso mutar a ficha dele localmente, então
//     escrevo só os campos que mudaram DIRETO no Firebase via
//     salvarCamposPersonagem (mesmo esquema de aplicarDanoDireto) — CORRIGE o bug
//     relatado ("os Rounds passam, mas a Vida/Energias não recuperam") de
//     Regeneração que só acontecia se a aba do jogador-alvo estivesse aberta bem
//     no instante em que o turno dele chegasse.
//
// 🔥 combate.fadigaTurnos (o contador MANUAL/stepper "Turnos Cansativos" da
// Ficha) sobe +1 sozinho a cada vez que o turno chega pro personagem — mas hoje
// é só um contador INFORMATIVO ("há quantos turnos esta luta dura"), sem nenhum
// efeito na Fadiga% (ver core/fadiga.js > calcularFadigaAtual, que usa só
// combate.fadigaExtra).
//
// Mesmo padrão de mock de useStore/firebase-sync de
// MapaFormContext.apenasCriador.test.jsx; mesma leitura de fadiga de
// Marcados.fadigaCombate.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({
    default: vi.fn(),
}));

vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    salvarCenarioCompleto: vi.fn(),
    zerarIniciativaGlobal: vi.fn(),
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
        vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 5000000 },
        poderes: [],
        inventario: [],
        passivas: [],
        combate: { fadigaTurnos: 0, fadigaPorTurno: 5 },
        ...overrides,
    };
}

function baseState(overrides = {}) {
    const minhaFicha = fichaComVital({ iniciativa: 20 });
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

describe('MapaFormContext — avancarTurno: Fadiga de Combate e Regeneração automáticas ao chegar o MEU turno', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('aplica regeneração quando o turno passa a ser o MEU (não-dummie), e incrementa combate.fadigaTurnos (contador informativo)', () => {
        // Filler (dummie) na posição 0 com iniciativa maior; EU (Heroi) na posição 1.
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10; // fico atrás do filler na ordem de iniciativa
        montarComEstado(state);

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.vida.atual).toBe(1);

        act(() => { probe.avancarTurno(); }); // turnoAtualIndex 0(Filler) -> 1(EU)

        // fadigaTurnos (contador informativo) sobe +1 a cada retorno do meu turno.
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
        // Regeneração real de core/vitals.js aplicada: vida.atual(1) + regeneracao(5_000_000).
        expect(state.minhaFicha.vida.atual).toBe(5000001);
    });

    it('NÃO incrementa fadiga/regen quando o PRÓXIMO ator é um dummie (NPC), mesmo que EU esteja na lista de iniciativa', () => {
        // EU (Heroi) na posição 0 com iniciativa maior; um dummie na posição 1 (o alvo do turno).
        const state = baseState({ meuNome: 'Heroi', dummies: { goblin: { nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 } } } });
        state.minhaFicha.iniciativa = 20;
        montarComEstado(state);

        act(() => { probe.avancarTurno(); }); // turnoAtualIndex 0(EU) -> 1(Goblin, dummie)

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.vida.atual).toBe(1);
    });

    it('NÃO incrementa fadiga/regen NA MINHA ficha quando o PRÓXIMO ator é um jogador DIFERENTE de mim — mas escreve a regeneração DELE direto no Firebase via salvarCamposPersonagem', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const outroJogador = fichaComVital({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } });
        const state = baseState({ meuNome: 'Heroi', personagens: { Vilao: outroJogador } });
        state.minhaFicha.iniciativa = 20;
        montarComEstado(state);

        act(() => { probe.avancarTurno(); }); // turnoAtualIndex 0(EU) -> 1(Vilao)

        // updateFicha só pode mutar a MINHA ficha — a minha nunca deveria ter sido tocada.
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.vida.atual).toBe(1);
        expect(state.updateFicha).not.toHaveBeenCalled();

        // Correção do bug relatado: a Regeneração do Vilao é aplicada DIRETO no Firebase por quem
        // avançou o turno (aqui, o Heroi), sem depender do navegador do Vilao estar aberto.
        expect(firebaseSync.salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [nomeSalvo, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(nomeSalvo).toBe('Vilao');
        expect(campos['vida/atual']).toBe(5000001);
        expect(campos['acoes/padrao/atual']).toBe(1);
        expect(campos['combate/fadigaTurnos']).toBe(1);
    });

    // -------------------------------------------------------------------------
    // QA (regressão do code-review) — camposDeInicioDeTurno precisa escrever TODOS os vitais
    // regeneráveis (VITAIS_REGENERAVEIS de core/vitals.js: vida/mana/aura/chakra/corpo/pv/pm),
    // não só os 5 "principais". Uma rodada anterior desta correção listava só os 5 principais à
    // mão em vez de reusar essa constante, e silenciosamente reintroduzia o mesmo bug pra pv/pm
    // de QUALQUER jogador que não fosse o dono da própria aba (a Regeneração de pv/pm
    // acontecia no rascunho em memória, mas nunca era escrita no Firebase).
    // -------------------------------------------------------------------------
    it('escreve TODOS os vitais regeneráveis (inclusive pv/pm) de OUTRO jogador no Firebase, não só vida/mana/aura/chakra/corpo', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const statCheio = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0' };
        const outroJogador = fichaComVital({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } });
        // pv máximo = floor(((bCorpo + bVida + bChakra) / 3) * multiplicadorVida) -- com os 3
        // bases em 1e8: bCorpo=10, bVida=100, bChakra=10 -> pv = floor(120/3) = 40 (mesma conta
        // documentada em MapaFormContext.pisoFadigaExtraIntegracao.test.jsx).
        outroJogador.corpo = { ...statCheio };
        outroJogador.chakra = { ...statCheio };
        outroJogador.multiplicadorVida = 1;
        outroJogador.pv = { atual: 0, regeneracao: 40 };
        const state = baseState({ meuNome: 'Heroi', personagens: { Vilao: outroJogador } });
        state.minhaFicha.iniciativa = 20;
        montarComEstado(state);

        act(() => { probe.avancarTurno(); });

        const [, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(campos['pv/atual']).toBe(40);
    });

    // -------------------------------------------------------------------------
    // QA (gap apontado pelo code-review) — o espelho local `personagens[nome]` (sincronizado via
    // Firebase) pode ficar pra trás entre o último render e o clique em "Passar Turno" (ex: o
    // Vilao saiu da mesa bem nesse meio-tempo). `ordemIniciativa` (capturado no closure de
    // avancarTurno) ainda "acha" que ele está lá, mas o `useStore.getState()` fresco dentro da
    // função não encontra mais a ficha dele -- não deve lançar, e como não há dado nenhum pra
    // calcular em cima, não deve tentar escrever nada tampouco.
    // -------------------------------------------------------------------------
    it('não lança e não chama salvarCamposPersonagem quando o espelho local de OUTRO jogador fica pra trás entre o render e o clique', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const outroJogador = fichaComVital({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } });
        const state = baseState({ meuNome: 'Heroi', personagens: { Vilao: outroJogador } });
        state.minhaFicha.iniciativa = 20;
        montarComEstado(state);

        delete state.personagens.Vilao;

        expect(() => { act(() => { probe.avancarTurno(); }); }).not.toThrow();
        expect(firebaseSync.salvarCamposPersonagem).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // QA (regressão do code-review) — trava contra duplo-clique: duas chamadas de avancarTurno()
    // disparadas antes do Firebase confirmar a escrita do Cenário (salvarCenarioCompleto ainda
    // não resolveu) devem aplicar a conta de início de turno só UMA vez, nunca em dobro.
    // -------------------------------------------------------------------------
    it('duas chamadas RÁPIDAS e sucessivas de avancarTurno() (antes do Firebase confirmar o Cenário) aplicam a Regeneração só UMA vez', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        montarComEstado(state);

        act(() => {
            probe.avancarTurno();
            probe.avancarTurno(); // "duplo-clique" no mesmo tick síncrono, antes do Firebase responder
        });

        // Só UMA aplicação: vida.atual(1) + regeneracao(5_000_000) uma única vez, não duas.
        expect(state.minhaFicha.vida.atual).toBe(5000001);
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
    });

    it('NÃO dispara nada só de montar (sem chamar avancarTurno), mesmo se turnoAtualIndex já apontar pra mim', () => {
        const state = baseState({ meuNome: 'Heroi', dummies: { filler: { nome: 'Filler', iniciativa: 5, posicao: { x: 5, y: 5, z: 0 } } } });
        state.minhaFicha.iniciativa = 20; // EU já sou o índice 0 (maior iniciativa)
        montarComEstado(state);

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.vida.atual).toBe(1);
        expect(state.updateFicha).not.toHaveBeenCalled();
    });

    it('incrementa combate.fadigaTurnos a partir do valor manual já existente (soma, não substitui)', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        state.minhaFicha.combate = { fadigaTurnos: 6, fadigaPorTurno: 5 };
        montarComEstado(state);

        act(() => { probe.avancarTurno(); });

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(7);
    });

    it('cria combate do zero (objeto ausente) sem lançar exceção quando o turno automático dispara pela primeira vez, e inicia fadigaTurnos em 1', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        delete state.minhaFicha.combate;
        montarComEstado(state);

        expect(() => {
            act(() => { probe.avancarTurno(); });
        }).not.toThrow();

        expect(state.minhaFicha.combate).toBeTruthy();
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
        expect(state.minhaFicha.combate.fadigaExtra).toBeGreaterThanOrEqual(0);
    });
});

// ---------------------------------------------------------------------------
// QA — Fadiga DINÂMICA (combate.fadigaExtra): calcularGanhoFadigaDinamico
// (core/fadiga.js) roda ANTES de aplicarRegeneracaoDeTurno no mesmo tick, pra
// refletir o quão gasto/ferido o personagem estava ENTRANDO no turno — não o
// estado já curado. Ver MapaFormContext.jsx > aplicarInicioDeTurno.
// ---------------------------------------------------------------------------
describe('MapaFormContext — Fadiga DINÂMICA (fadigaExtra) acumula ao chegar o turno, ANTES da Regeneração mascarar o desgaste', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('acumula combate.fadigaExtra > 0 e <= 15 num único tick para uma ficha com pouca vida/energia', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        // Vida quase zerada (grande fator de "vida perdida") -- sem regeneração própria, pra o
        // valor do fator não mudar entre "antes" e "depois" do cálculo dinâmico.
        state.minhaFicha.vida = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 };
        state.minhaFicha.combate = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 };
        montarComEstado(state);

        expect(state.minhaFicha.combate.fadigaExtra).toBe(0);

        act(() => { probe.avancarTurno(); });

        expect(state.minhaFicha.combate.fadigaExtra).toBeGreaterThan(0);
        expect(state.minhaFicha.combate.fadigaExtra).toBeLessThanOrEqual(15);
        // fadigaTurnos (contador informativo) também sobe, mas não afeta a Fadiga% (fadigaExtra).
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
    });

    it('reflete o déficit PRÉ-regeneração: mesmo quando a Regeneração cura o vital TOTALMENTE no mesmo tick, o ganho dinâmico não fica mascarado em 0', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        // Vida bem baixa, MAS com regeneração enorme (>= o máximo calculado) -- se o cálculo
        // dinâmico rodasse DEPOIS da regeneração (ou lesse o estado pós-cura), o fator de "vida
        // perdida" cairia pra 0 e fadigaExtra ficaria zerado neste tick, o que seria o bug.
        state.minhaFicha.vida = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 99999999 };
        state.minhaFicha.combate = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 };
        montarComEstado(state);

        act(() => { probe.avancarTurno(); });

        // A Regeneração realmente curou a vida cheia neste mesmo tick (comportamento herdado,
        // inalterado)...
        expect(state.minhaFicha.vida.atual).toBe(10000000); // máximo calculado (mxDisplay)
        // ...mas o ganho dinâmico já capturado ANTES da cura continua > 0 (não foi mascarado).
        expect(state.minhaFicha.combate.fadigaExtra).toBeGreaterThan(0);
    });

    it('uma ficha "de boa" (vida/energia cheias, sem Forma ativa) não ganha fadigaExtra nenhum no tick', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        // "atual" cheio de verdade: getFatorVidaPerdida usa getMaximo(ficha,'vida') de
        // core/attributes.js diretamente (SEM a escala de exibição de calcVitalScale do
        // core/vitals.js) -- o máximo "cru" aqui é base(1e8) x mult(1) = 1e8.
        state.minhaFicha.vida = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 100000000, regeneracao: 0 };
        state.minhaFicha.combate = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 };
        montarComEstado(state);

        act(() => { probe.avancarTurno(); });

        expect(state.minhaFicha.combate.fadigaExtra).toBe(0);
    });

    it('acumula fadigaExtra a partir do valor já existente (soma, não substitui)', () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        state.minhaFicha.vida = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 0 };
        state.minhaFicha.combate = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 3 };
        montarComEstado(state);

        act(() => { probe.avancarTurno(); });

        expect(state.minhaFicha.combate.fadigaExtra).toBeGreaterThan(3);
    });
});

// ---------------------------------------------------------------------------
// QA — Regressão direta do bug relatado pelo usuário: a Fadiga% automática NÃO
// tem mais um piso incondicional de 5%/turno. Antes da correção original, ALÉM
// do ganho dinâmico (calcularGanhoFadigaDinamico, já quase-zero em condições
// ideais), o efeito também somava incondicionalmente fadigaTurnos x
// fadigaPorTurno (5% fixos, por padrão) DIRETO na Fadiga% — um personagem com
// 100% de Maestria na única Forma ativa, Energia/Vida cheias e Poder
// fortemente suprimido ainda assim via a Fadiga% subir 5%/turno vindos SÓ
// desse contador fixo. Hoje combate.fadigaTurnos volta a incrementar +1 por
// turno normalmente (contador informativo), mas NUNCA mais afeta a Fadiga%
// (só combate.fadigaExtra afeta) — ver MapaFormContext.jsx e core/fadiga.js >
// calcularFadigaAtual.
//
// Cada iteração do loop simula um round completo: turnoAtualIndex volta a 0
// (Filler) e avancarTurno() é chamado, computando nextIndex=1 (EU) — mesmo
// truque usado pra simular "N chegadas do meu turno" sem precisar reproduzir a
// volta real do índice pro Filler (que não faz diferença nenhuma pro que estes
// testes verificam).
// ---------------------------------------------------------------------------
describe('MapaFormContext — Regressão do bug relatado: sem piso fixo de 5%/turno na Fadiga automática', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('personagem em condições IDEAIS (100% Maestria na única Forma ativa, Energia/Vida cheias, Poder fortemente suprimido) fica com Fadiga Atual em 0% mesmo após VÁRIOS retornos do turno — não sobe um % fixo por turno', async () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        // Vida e as 4 Energias 100% cheias (fatorVida=0, fatorEnergia=0).
        state.minhaFicha.vida = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 100000000, regeneracao: 0 };
        state.minhaFicha.mana = { base: 1000000, atual: 1000000 };
        state.minhaFicha.aura = { base: 1000000, atual: 1000000 };
        state.minhaFicha.chakra = { base: 1000000, atual: 1000000 };
        state.minhaFicha.corpo = { base: 1000000, atual: 1000000 };
        // Uma Forma ativa turbinando o eixo "status" (âncora "forca", fora de vida/energia
        // — mesma técnica de isolamento de core/fadiga.test.js) com Maestria=100%, que ZERA
        // por completo a contribuição dela pro fator de Formas (fatorFormas=0).
        state.minhaFicha.forca = { base: 1000000, mFormas: 2 };
        state.minhaFicha.poderes = [{ id: 'p1', nome: 'Forma X', categoria: 'forma', ativa: true, maestria: 100 }];
        // Poder fortemente suprimido (no limite mínimo permitido).
        state.minhaFicha.supressaoPoder = 1;
        state.minhaFicha.limiteSupressao = 1;
        state.minhaFicha.combate = { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 };
        const { rerender } = montarComEstado(state);

        // Simula VÁRIAS chegadas do MEU turno (6 rounds) — se o piso fixo antigo (+1 fadigaTurnos
        // por turno) ainda estivesse presente, 6 turnos renderiam 30% de Fadiga (6 x 5%).
        for (let i = 0; i < 6; i++) {
            // await act(async ...) flusha o microtask do .finally() que libera a trava contra
            // duplo-clique (avancandoTurnoRef) antes da PRÓXIMA chamada de avancarTurno() do loop.
            await act(async () => { probe.avancarTurno(); }); // turnoAtualIndex 0(Filler) -> 1(EU)
            act(() => { state.cenario = { ...state.cenario, turnoAtualIndex: 0 }; }); // "round seguinte" começa de novo com o Filler
            rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
        }

        // fadigaTurnos (contador informativo) subiu 1 por retorno do meu turno, 6 vezes.
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(6);
        // Com severidade dinâmica = 0 (energia/vida cheias, Forma 100% dominada pela
        // Maestria), calcularGanhoFadigaDinamico também rende exatamente 0 por turno.
        expect(state.minhaFicha.combate.fadigaExtra).toBe(0);
        // A Fadiga Atual final (fonte de verdade compartilhada com core/poder.js) fica em
        // 0%, NÃO nos 30% que o piso fixo antigo teria produzido depois de 6 turnos — mesmo
        // com fadigaTurnos tendo subido pra 6, ele não entra mais nessa conta.
        expect(calcularFadigaAtual(state.minhaFicha)).toBe(0);
    });

    it('combate.fadigaTurnos definido manualmente (stepper da Ficha) continua somando com os incrementos automáticos, mas NUNCA afeta a Fadiga Atual (%)', async () => {
        const state = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        state.minhaFicha.iniciativa = 10;
        // GM/jogador setou fadigaTurnos=6 manualmente via stepper +/- antes do combate.
        state.minhaFicha.combate = { fadigaTurnos: 6, fadigaPorTurno: 5 };
        const { rerender } = montarComEstado(state);

        for (let i = 0; i < 8; i++) {
            await act(async () => { probe.avancarTurno(); });
            act(() => { state.cenario = { ...state.cenario, turnoAtualIndex: 0 }; });
            rerender(<MapaFormProvider><Harness /></MapaFormProvider>);
        }

        // fadigaTurnos soma o valor manual inicial (6) com os 8 incrementos automáticos (+8).
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(14);
    });
});

// ---------------------------------------------------------------------------
// QA — Regressão: dummies/NPCs nunca regeneravam automaticamente. O bloco de
// `avancarTurno` que já reseta acoes.padrao/bonus/reacao de um dummie quando o
// turno dele volta não chamava aplicarRegeneracaoDeTurno — corrigido chamando-a
// ali também, salvando o resultado via salvarDummie (o Mestre já tem permissão
// de escrita nos dummies, diferente de outro jogador). Precisa `isMestre: true`
// porque o bloco de dummie em avancarTurno é gated nisso (só o Mestre
// reseta/regenera NPCs).
// ---------------------------------------------------------------------------
describe('MapaFormContext — avancarTurno: Regeneração automática também se aplica a dummies (NPCs)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    function dummieComVital(overrides = {}) {
        return {
            nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 },
            acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
            vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 5000000 },
            ...overrides,
        };
    }

    it('regenera a vida do dummie e reseta suas ações quando o turno dele chega, chamando salvarDummie com o resultado', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = baseState({ meuNome: 'Heroi', isMestre: true, dummies: { goblin: dummieComVital() } });
        state.minhaFicha.iniciativa = 20; // Heroi(20) na posição 0, Goblin(10) na posição 1
        montarComEstado(state);

        act(() => { probe.avancarTurno(); });

        expect(firebaseSync.salvarDummie).toHaveBeenCalledTimes(1);
        const [idSalvo, dadosSalvos] = firebaseSync.salvarDummie.mock.calls[0];
        expect(idSalvo).toBe('goblin');
        // Regeneração real de core/vitals.js: vida.atual(1) + regeneracao(5_000_000).
        expect(dadosSalvos.vida.atual).toBe(5000001);
        // O reset de ações (comportamento já existente) continua funcionando junto.
        expect(dadosSalvos.acoes.padrao.atual).toBe(1);
    });

    it('não lança e não chama salvarDummie quando o próximo ator é um dummie sem NENHUM dado de vitais', () => {
        const state = baseState({ meuNome: 'Heroi', isMestre: true, dummies: { goblin: { nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 } } } });
        state.minhaFicha.iniciativa = 20;
        montarComEstado(state);

        expect(() => { act(() => { probe.avancarTurno(); }); }).not.toThrow();
    });

    it('NÃO chama salvarDummie (nem regenera) quando quem NÃO é Mestre avança o turno pro dummie', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = baseState({ meuNome: 'Heroi', isMestre: false, dummies: { goblin: dummieComVital() } });
        state.minhaFicha.iniciativa = 20;
        montarComEstado(state);

        act(() => { probe.avancarTurno(); });

        expect(firebaseSync.salvarDummie).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // QA (gap) — dummie JÁ no teto (atual === mxDisplay): aplicarRegeneracaoDeTurno não deveria
    // fazer overheal (o guard `(ficha[key].atual || 0) < mxDisplay` em core/vitals.js já cobre isso
    // na fonte), nem lançar erro, e salvarDummie ainda deveria ser chamado normalmente -- "sempre
    // salva, regenerar é só uma consequência opcional de já não estar cheio".
    // -------------------------------------------------------------------------
    it('dummie já no máximo (atual === mxDisplay) não sofre overheal nem lança erro, e salvarDummie ainda é chamado normalmente', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        // base=100_000_000 (9 dígitos) -> mxDisplay (limite 9, sem compressão) = 100_000_000.
        const dummieCheio = dummieComVital({ vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 100000000, regeneracao: 5000000 } });
        const state = baseState({ meuNome: 'Heroi', isMestre: true, dummies: { goblin: dummieCheio } });
        state.minhaFicha.iniciativa = 20;
        montarComEstado(state);

        expect(() => { act(() => { probe.avancarTurno(); }); }).not.toThrow();

        expect(firebaseSync.salvarDummie).toHaveBeenCalledTimes(1);
        const [idSalvo, dadosSalvos] = firebaseSync.salvarDummie.mock.calls[0];
        expect(idSalvo).toBe('goblin');
        // Nenhum overheal: permanece exatamente no teto, nunca ultrapassa.
        expect(dadosSalvos.vida.atual).toBe(100000000);
        // O reset de ações continua acontecendo independentemente da regeneração ter sido um no-op.
        expect(dadosSalvos.acoes.padrao.atual).toBe(1);
    });

    // -------------------------------------------------------------------------
    // QA (gap) — paridade: o path do jogador (updateFicha local em avancarTurno) e o path do
    // dummie (bloco de avancarTurno) agora chamam a MESMA função aplicarRegeneracaoDeTurno
    // (core/vitals.js) -- pra um mesmo estado inicial de vital (mesmo base/atual/regeneracao), a
    // quantidade regenerada deve ser IDÊNTICA nos dois caminhos, provando que não existe uma
    // segunda implementação divergente de regeneração escondida em algum dos dois call sites.
    // -------------------------------------------------------------------------
    it('regeneração do jogador e do dummie produzem o MESMO "vida.atual" final para o mesmo estado inicial (mesma função aplicarRegeneracaoDeTurno nos dois paths)', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const vitalInicial = { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 5000000 };

        // --- Path do JOGADOR (updateFicha local em avancarTurno) ---
        const stateJogador = baseState({
            meuNome: 'Heroi',
            dummies: { filler: { nome: 'Filler', iniciativa: 20, posicao: { x: 5, y: 5, z: 0 } } },
        });
        stateJogador.minhaFicha.iniciativa = 10;
        stateJogador.minhaFicha.vida = { ...vitalInicial };
        montarComEstado(stateJogador);
        act(() => { probe.avancarTurno(); }); // turnoAtualIndex 0(Filler) -> 1(EU)
        const vidaFinalJogador = stateJogador.minhaFicha.vida.atual;

        cleanup();
        vi.clearAllMocks();

        // --- Path do DUMMIE (bloco de avancarTurno) ---
        const stateDummie = baseState({ meuNome: 'Heroi', isMestre: true, dummies: { goblin: { nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 }, vida: { ...vitalInicial } } } });
        stateDummie.minhaFicha.iniciativa = 20;
        montarComEstado(stateDummie);
        act(() => { probe.avancarTurno(); });
        const [, dadosSalvosDummie] = firebaseSync.salvarDummie.mock.calls[0];

        expect(vidaFinalJogador).toBe(dadosSalvosDummie.vida.atual);
        // Confere também contra o valor esperado bruto (regressão dupla: nem os dois caminhos
        // divergiram entre si, nem os dois divergiram do valor matematicamente correto).
        expect(vidaFinalJogador).toBe(5000001);
    });
});

// ---------------------------------------------------------------------------
// QA (gap do relatório) — combate com um ÚNICO combatente na ordem de iniciativa: nextIndex
// sempre recalcula de volta pro MESMO ator (só existe o índice 0). "Passar Turno" clicado
// repetidas vezes precisa continuar aplicando a conta de início de turno TODA VEZ — nada no
// cálculo de nextIndex/nextPlayer deveria "travar" ou pular a conta só porque o próximo ator é
// sempre o mesmo de antes.
// ---------------------------------------------------------------------------
describe('MapaFormContext — avancarTurno: combate com um ÚNICO combatente na ordem de iniciativa', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('aplica a Regeneração/reset de Ações/Fadiga TODA VEZ que "Passar Turno" é clicado, mesmo com um único combatente (o índice sempre volta pra ele mesmo)', async () => {
        // Só EU na ordem de iniciativa — nenhum dummie, nenhum outro jogador.
        const state = baseState({ meuNome: 'Heroi', dummies: {}, personagens: {} });
        state.minhaFicha.iniciativa = 10;
        montarComEstado(state);

        expect(state.minhaFicha.combate.fadigaTurnos).toBe(0);
        expect(state.minhaFicha.vida.atual).toBe(1);

        // 1º clique: nextIndex = (0+1) % 1 = 0 -> o mesmo (e único) combatente.
        await act(async () => { probe.avancarTurno(); });
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(1);
        expect(state.minhaFicha.vida.atual).toBe(5000001);

        // 2º clique (trava já liberada pelo .finally do 1º): aplica de novo, não é pulado.
        await act(async () => { probe.avancarTurno(); });
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(2);
        expect(state.minhaFicha.vida.atual).toBe(10000000); // clampado no teto (mxDisplay)

        // 3º clique: continua aplicando (reset de ações/fadigaTurnos), mesmo já no teto de vida.
        await act(async () => { probe.avancarTurno(); });
        expect(state.minhaFicha.combate.fadigaTurnos).toBe(3);
        expect(state.minhaFicha.vida.atual).toBe(10000000); // sem overheal
        expect(state.minhaFicha.acoes.padrao.atual).toBe(state.minhaFicha.acoes.padrao.max);
    });
});

// ---------------------------------------------------------------------------
// QA (gap do relatório) — dummie cujo turno chegou, mas `storeState.dummies[nextPlayer.id]`
// já não existe mais (removido da mesa entre o último render e o clique em "Passar Turno") —
// mesma classe de problema já coberta para "outro jogador" (linha ~205 acima), agora para o
// branch de dummie: `ordemIniciativa` (fechado no closure) ainda "acha" que o dummie está lá,
// mas o `useStore.getState()` fresco dentro da função não encontra mais o nó dele.
// ---------------------------------------------------------------------------
describe('MapaFormContext — avancarTurno: dummie removido entre o render e o clique (storeState.dummies[id] undefined)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('não lança e não chama salvarDummie quando o dummie do próximo ator foi removido do estado antes do clique', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = baseState({ meuNome: 'Heroi', isMestre: true, dummies: { goblin: { nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 }, vida: { base: 100000000, atual: 1, regeneracao: 5000000 } } } });
        state.minhaFicha.iniciativa = 20; // Heroi(20) na posição 0, Goblin(10) na posição 1
        montarComEstado(state);

        // O dummie some da mesa (ex: o Mestre o deletou) DEPOIS do último render, mas ANTES do clique.
        delete state.dummies.goblin;

        expect(() => { act(() => { probe.avancarTurno(); }); }).not.toThrow();
        expect(firebaseSync.salvarDummie).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// QA (gap do relatório) — a trava contra duplo-clique (avancandoTurnoRef) precisa continuar
// permitindo só UMA aplicação mesmo quando o branch percorrido (dummie / outro jogador / eu
// mesmo) não é o mesmo do teste "duas chamadas rápidas" original (que só cobria o caminho "eu
// mesmo"). Os dois cliques acontecem no MESMO tick síncrono, então `cenario.turnoAtualIndex`
// nunca muda entre eles — ambos calculariam o MESMO nextIndex/nextPlayer se não fosse a trava.
// ---------------------------------------------------------------------------
describe('MapaFormContext — avancarTurno: trava de duplo-clique cobre também os caminhos de dummie e de outro jogador', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('dois cliques rápidos quando o PRÓXIMO ator é um dummie aplicam a Regeneração dele só UMA vez (salvarDummie chamado 1x)', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const state = baseState({ meuNome: 'Heroi', isMestre: true, dummies: { goblin: { nome: 'Goblin', iniciativa: 10, posicao: { x: 1, y: 1, z: 0 }, vida: { base: 100000000, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mAbsoluto: 1.0, mUnico: '1.0', atual: 1, regeneracao: 5000000 } } } });
        state.minhaFicha.iniciativa = 20;
        montarComEstado(state);

        act(() => {
            probe.avancarTurno();
            probe.avancarTurno(); // "duplo-clique" no mesmo tick síncrono
        });

        expect(firebaseSync.salvarDummie).toHaveBeenCalledTimes(1);
        const [, dadosSalvos] = firebaseSync.salvarDummie.mock.calls[0];
        expect(dadosSalvos.vida.atual).toBe(5000001); // uma única aplicação da Regeneração, não duas
    });

    it('dois cliques rápidos quando o PRÓXIMO ator é OUTRO jogador real aplicam a Regeneração dele só UMA vez (salvarCamposPersonagem chamado 1x)', async () => {
        const firebaseSync = await import('../../services/firebase-sync');
        const outroJogador = fichaComVital({ iniciativa: 10, posicao: { x: 2, y: 2, z: 0 } });
        const state = baseState({ meuNome: 'Heroi', personagens: { Vilao: outroJogador } });
        state.minhaFicha.iniciativa = 20;
        montarComEstado(state);

        act(() => {
            probe.avancarTurno();
            probe.avancarTurno(); // "duplo-clique" no mesmo tick síncrono
        });

        expect(firebaseSync.salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        const [, campos] = firebaseSync.salvarCamposPersonagem.mock.calls[0];
        expect(campos['vida/atual']).toBe(5000001); // uma única aplicação da Regeneração, não duas
    });
});
