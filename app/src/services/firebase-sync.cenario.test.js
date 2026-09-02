import { describe, it, expect, vi, beforeEach } from 'vitest';
import { salvarCenarioCompleto, resetSincronizacaoCenario, iniciarListenerCenario } from './firebase-sync';
import useStore from '../stores/useStore';
import { update, set, onValue } from 'firebase/database';

// ---------------------------------------------------------------------------
// QA — "esmagamento de Locais": salvarCenarioCompleto/iniciarListenerCenario
//
// Antes, salvarCenarioCompleto fazia `set()` da árvore `cenario` INTEIRA a cada
// chamada. Se dois jogadores criassem Cenas (Locais) DIFERENTES quase ao mesmo
// tempo, cada um partia de um `cenario.lista` local sem a Cena do outro (que
// ainda não tinha chegado pelo listener) e escrevia a árvore inteira de volta
// — quem escrevesse por último apagava a Cena que o outro tinha acabado de
// criar, mesmo tendo IDs diferentes.
//
// A correção usa o mesmo mecanismo já comprovado para a ficha própria
// (calcularDiffFirebase + update() multi-path, ver firebase-sync.test.js):
// só os caminhos que realmente mudaram desde a última sincronização são
// enviados, então duas Cenas novas com IDs diferentes viram dois updates
// independentes (`lista/cenaA`, `lista/cenaB`) que o Firebase mescla no
// servidor sem um apagar o outro.
// ---------------------------------------------------------------------------

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    set: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    get: vi.fn(),
    push: vi.fn(() => Promise.resolve()),
    remove: vi.fn(),
    onValue: vi.fn(),
    onChildAdded: vi.fn(),
    onDisconnect: vi.fn(() => ({ remove: () => Promise.resolve() })),
    limitToLast: vi.fn(),
    query: vi.fn(),
}));

vi.mock('./firebase-config', () => ({
    db: {}, // Simula conexão ativa
}));

vi.mock('../stores/useStore', () => ({
    default: {
        getState: vi.fn(),
    },
    sanitizarNome: vi.fn((n) => n),
}));

function fazerSnapshot(dados) { return { val: () => dados }; }

const CENARIO_INICIAL = { ativa: 'default', lista: { default: { nome: 'Cenário Inicial', img: '', escala: 1.5, unidade: 'm' } } };

describe('firebase-sync — Cenário (Locais/Mundo): update() parcial em vez de set() da árvore inteira', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetSincronizacaoCenario();
        useStore.getState.mockReturnValue({ mesaId: 'mesa1' });
    });

    it('primeiro save (sem baseline) manda o Cenário inteiro via update(), não via set()', async () => {
        const ok = await salvarCenarioCompleto(CENARIO_INICIAL);

        expect(ok).toBe(true);
        expect(set).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][1]).toEqual(CENARIO_INICIAL);
    });

    it('criar uma Cena nova manda só o caminho lista/<novoId> (não a lista inteira)', async () => {
        let onValueCallback;
        onValue.mockImplementation((_ref, cb) => { onValueCallback = cb; return () => {}; });
        iniciarListenerCenario(() => {});
        onValueCallback(fazerSnapshot(CENARIO_INICIAL));

        const novaCena = { nome: '[Noxus] Capital', img: '', escala: 1.5, unidade: 'm' };
        const cenarioComNovaCena = {
            ...CENARIO_INICIAL,
            ativa: 'noxus_capital',
            lista: { ...CENARIO_INICIAL.lista, noxus_capital: novaCena },
        };

        await salvarCenarioCompleto(cenarioComNovaCena);

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][1]).toEqual({
            ativa: 'noxus_capital',
            'lista/noxus_capital': novaCena,
        });
        // A Cena "default" pré-existente NÃO aparece no payload — não foi reenviada.
        expect(update.mock.calls[0][1]).not.toHaveProperty('lista/default');
        expect(update.mock.calls[0][1]).not.toHaveProperty('lista');
    });

    it('não chama o Firebase quando o Cenário não mudou desde o último save', async () => {
        let onValueCallback;
        onValue.mockImplementation((_ref, cb) => { onValueCallback = cb; return () => {}; });
        iniciarListenerCenario(() => {});
        onValueCallback(fazerSnapshot(CENARIO_INICIAL));

        await salvarCenarioCompleto({ ...CENARIO_INICIAL });

        expect(update).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });

    it('editar só a imagem de uma Cena existente manda só lista/<id>/img, preservando nome/escala/unidade', async () => {
        let onValueCallback;
        onValue.mockImplementation((_ref, cb) => { onValueCallback = cb; return () => {}; });
        iniciarListenerCenario(() => {});
        onValueCallback(fazerSnapshot(CENARIO_INICIAL));

        const cenarioComImagemNova = {
            ...CENARIO_INICIAL,
            lista: { default: { ...CENARIO_INICIAL.lista.default, img: 'https://storage.exemplo.com/mapa.png' } },
        };
        await salvarCenarioCompleto(cenarioComImagemNova);

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][1]).toEqual({ 'lista/default/img': 'https://storage.exemplo.com/mapa.png' });
    });

    it('apagar uma Cena manda null pro caminho lista/<id> (delete atômico), sem tocar nas outras', async () => {
        const cenarioComDuasCenas = {
            ativa: 'default',
            lista: {
                default: { nome: 'Cenário Inicial', img: '', escala: 1.5, unidade: 'm' },
                extra: { nome: 'Sala Extra', img: '', escala: 1.5, unidade: 'm' },
            },
        };
        let onValueCallback;
        onValue.mockImplementation((_ref, cb) => { onValueCallback = cb; return () => {}; });
        iniciarListenerCenario(() => {});
        onValueCallback(fazerSnapshot(cenarioComDuasCenas));

        const cenarioSemExtra = { ativa: 'default', lista: { default: cenarioComDuasCenas.lista.default } };
        await salvarCenarioCompleto(cenarioSemExtra);

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][1]).toEqual({ 'lista/extra': null });
    });

    it('DOIS jogadores criando Cenas DIFERENTES "ao mesmo tempo" não esmagam uma a outra (cada save só toca sua própria chave)', async () => {
        // Simula o servidor: aplica cada update() recebido sobre um estado
        // remoto compartilhado, igual o Firebase faria de verdade com um
        // multi-path update — isso é o que prova que o esmagamento não
        // acontece mais (com set() da árvore inteira, o 2º save apagaria a
        // Cena criada pelo 1º).
        let estadoRemoto = JSON.parse(JSON.stringify(CENARIO_INICIAL));
        update.mockImplementation((_ref, patch) => {
            for (const [caminho, valor] of Object.entries(patch)) {
                const partes = caminho.split('/');
                let alvo = estadoRemoto;
                for (let i = 0; i < partes.length - 1; i++) {
                    if (!alvo[partes[i]] || typeof alvo[partes[i]] !== 'object') alvo[partes[i]] = {};
                    alvo = alvo[partes[i]];
                }
                const ultimaChave = partes[partes.length - 1];
                if (valor === null) delete alvo[ultimaChave];
                else alvo[ultimaChave] = valor;
            }
            return Promise.resolve();
        });

        let onValueCallback;
        onValue.mockImplementation((_ref, cb) => { onValueCallback = cb; return () => {}; });
        iniciarListenerCenario(() => {});
        onValueCallback(fazerSnapshot(CENARIO_INICIAL));

        // Jogador A lê o Cenário (só conhece "default") e cria "noxus_capital".
        const cenaA = { nome: '[Noxus] Capital', img: '', escala: 1.5, unidade: 'm' };
        const cenarioDoJogadorA = { ...CENARIO_INICIAL, ativa: 'noxus_capital', lista: { ...CENARIO_INICIAL.lista, noxus_capital: cenaA } };

        // Jogador B, SEM ter recebido ainda a Cena do Jogador A (mesma baseline "default"
        // apenas), cria "demacia_capital" ao mesmo tempo.
        const cenaB = { nome: '[Demacia] Capital', img: '', escala: 1.5, unidade: 'm' };
        const cenarioDoJogadorB = { ...CENARIO_INICIAL, ativa: 'demacia_capital', lista: { ...CENARIO_INICIAL.lista, demacia_capital: cenaB } };

        // Os dois saves "concorrentes" partem da MESMA baseline (nenhum viu o outro ainda).
        await Promise.all([
            salvarCenarioCompleto(cenarioDoJogadorA),
            salvarCenarioCompleto(cenarioDoJogadorB),
        ]);

        // As DUAS Cenas sobrevivem no "servidor" simulado — nenhuma apagou a outra.
        expect(estadoRemoto.lista.noxus_capital).toEqual(cenaA);
        expect(estadoRemoto.lista.demacia_capital).toEqual(cenaB);
        expect(estadoRemoto.lista.default).toEqual(CENARIO_INICIAL.lista.default);
    });

    it('resetSincronizacaoCenario() zera a baseline — o próximo save volta a mandar o Cenário inteiro', async () => {
        let onValueCallback;
        onValue.mockImplementation((_ref, cb) => { onValueCallback = cb; return () => {}; });
        iniciarListenerCenario(() => {});
        onValueCallback(fazerSnapshot(CENARIO_INICIAL));

        resetSincronizacaoCenario();

        await salvarCenarioCompleto(CENARIO_INICIAL);

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][1]).toEqual(CENARIO_INICIAL);
    });

    it('salvarCenarioCompleto nunca rejeita: resolve false (sem lançar) quando o Firebase recusa a escrita', async () => {
        update.mockRejectedValueOnce(new Error('permissão negada'));
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(salvarCenarioCompleto(CENARIO_INICIAL)).resolves.toBe(false);
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
    });

    it('sem mesaId, não chama o Firebase e resolve true (no-op seguro)', async () => {
        useStore.getState.mockReturnValue({ mesaId: '' });
        await expect(salvarCenarioCompleto(CENARIO_INICIAL)).resolves.toBe(true);
        expect(update).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });
});
