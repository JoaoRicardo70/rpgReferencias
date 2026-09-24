import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    iniciarSincronizacaoFichaAlvo,
    pararSincronizacaoFichaAlvo,
    salvarFichaAlvoImediato,
    salvarFichaAlvoSilencioso,
    mesclarPersonagensRemotos,
    resetSincronizacaoFicha,
} from './firebase-sync';
import useStore from '../stores/useStore';
import { update } from 'firebase/database';

// ---------------------------------------------------------------------------
// QA — Grimório da Entidade: sincronização por-entidade (firebase-sync.js)
//
// 1) Cross-talk safety na persistência: salvarFichaAlvoImediato(nome) escreve
//    em mesas/{mesaId}/personagens/{nome} para uma entidade alheia, mas
//    delega pro caminho normal (self) quando o nome é o do próprio jogador
//    logado.
//
// 2) Regressão do bug de perda silenciosa de dados: pararSincronizacaoFichaAlvo
//    agora ACHATA (flush) uma edição pendente do debounce ANTES de cancelar o
//    timer/baseline -- fechar o Grimório logo após editar um campo não pode
//    mais descartar essa edição em silêncio.
//
// 3) mesclarPersonagensRemotos: merge 3 vias só pra entidades com baseline
//    ativa (Grimório aberto); qualquer outra entidade continua sendo
//    sobrescrita cegamente pelo snapshot remoto, como sempre foi.
//
// Mesmo padrão de mock de firebase-sync.test.js / firebase-sync.cenario.test.js.
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

vi.mock('./firebase-config', () => ({ db: {} }));

vi.mock('../stores/useStore', () => ({
    default: { getState: vi.fn() },
    sanitizarNome: vi.fn((n) => n),
}));

let estadoAtual;
function montarEstado(overrides = {}) {
    estadoAtual = {
        meuNome: 'Kiriya',
        mesaId: 'mesa1',
        minhaFicha: { vida: { atual: 100 } },
        personagens: {},
        setMinhaFicha: vi.fn((f) => { estadoAtual.minhaFicha = f; }),
        ...overrides,
    };
    useStore.getState.mockImplementation(() => estadoAtual);
    return estadoAtual;
}

beforeEach(() => {
    vi.clearAllMocks();
    resetSincronizacaoFicha();
    montarEstado();
});

describe('salvarFichaAlvoImediato — cross-talk safety de persistência', () => {
    it('para uma entidade que NÃO é o jogador logado, escreve em mesas/{mesaId}/personagens/{nome} (não no caminho do próprio jogador)', async () => {
        montarEstado({ personagens: { 'NPC Sombrio': { vida: { atual: 500 } } } });

        await salvarFichaAlvoImediato('NPC Sombrio');

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][0]).toBe('mesas/mesa1/personagens/NPC Sombrio');
        expect(update.mock.calls[0][0]).not.toBe('mesas/mesa1/personagens/Kiriya');
        expect(update.mock.calls[0][1]).toEqual({ vida: { atual: 500 } });
    });

    it('para a entidade cujo nome é IGUAL ao do jogador logado, delega ao caminho normal (self-save) e ignora personagens[nome]', async () => {
        montarEstado({
            meuNome: 'Kiriya',
            minhaFicha: { vida: { atual: 77 } },
            // Existe uma entrada em personagens com o mesmo nome -- NÃO deveria ser usada.
            personagens: { 'Kiriya': { vida: { atual: 999 } } },
        });

        await salvarFichaAlvoImediato('Kiriya');

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][0]).toBe('mesas/mesa1/personagens/Kiriya');
        // O payload reflete minhaFicha (o caminho self), não personagens['Kiriya'].
        expect(update.mock.calls[0][1]).toEqual({ vida: { atual: 77 } });
    });

    it('sem entidade correspondente em personagens (Grimório nunca abriu pra ela), não chama o Firebase', async () => {
        montarEstado({ personagens: {} });

        await salvarFichaAlvoImediato('NPC Fantasma');

        expect(update).not.toHaveBeenCalled();
    });

    it('sem mesaId, não chama o Firebase (no-op seguro)', async () => {
        montarEstado({ mesaId: '', personagens: { 'NPC Sombrio': { vida: { atual: 500 } } } });

        await salvarFichaAlvoImediato('NPC Sombrio');

        expect(update).not.toHaveBeenCalled();
    });
});

describe('pararSincronizacaoFichaAlvo — fix da perda silenciosa de dados (flush do debounce pendente antes de fechar)', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('uma edição agendada (salvarFichaAlvoSilencioso) que ainda não disparou é enviada ao Firebase quando o Grimório fecha', async () => {
        montarEstado({ personagens: { 'EntidadeB': { vida: { atual: 500 } } } });
        iniciarSincronizacaoFichaAlvo('EntidadeB'); // baseline = {vida:{atual:500}}

        // Edição de campo -> blur agenda o debounce de 500ms (nunca chega a disparar).
        estadoAtual.personagens['EntidadeB'] = { vida: { atual: 250 } };
        salvarFichaAlvoSilencioso('EntidadeB');

        // Fecha o Grimório (desmonta o Provider) ANTES dos 500ms passarem.
        pararSincronizacaoFichaAlvo('EntidadeB');
        // O flush é síncrono até o ponto do update() ser chamado -- só a Promise resolve depois.
        await Promise.resolve();

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][0]).toBe('mesas/mesa1/personagens/EntidadeB');
        expect(update.mock.calls[0][1]).toEqual({ 'vida/atual': 250 });

        // Avançar o tempo não dispara um segundo envio -- o timer do debounce foi cancelado.
        await vi.advanceTimersByTimeAsync(600);
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('sem nenhuma edição pendente desde a baseline (nada agendado), fechar o Grimório NÃO gera nenhuma chamada extra ao Firebase', async () => {
        montarEstado({ personagens: { 'EntidadeC': { vida: { atual: 500 } } } });
        iniciarSincronizacaoFichaAlvo('EntidadeC');

        // Nenhuma edição, nenhum salvarFichaAlvoSilencioso chamado -- fecha direto.
        pararSincronizacaoFichaAlvo('EntidadeC');
        await Promise.resolve();

        expect(update).not.toHaveBeenCalled();
    });
});

describe('mesclarPersonagensRemotos — merge 3 vias só para entidades com baseline ativa (Grimório aberto)', () => {
    it('sem nenhuma baseline ativa, devolve o snapshot remoto sem qualquer alteração (mesma referência)', () => {
        const remoto = { 'NPC Sombrio': { vida: { atual: 500 } } };
        const resultado = mesclarPersonagensRemotos({}, remoto);

        expect(resultado).toBe(remoto);
    });

    it('com baseline ativa para UMA entidade, uma edição local concorrente sobrevive a um snapshot remoto que ainda não a inclui, enquanto uma entidade DIFERENTE sem baseline continua sendo sobrescrita cegamente', () => {
        montarEstado({ personagens: { 'NPC Sombrio': { vida: { atual: 500 }, mana: { atual: 50 } } } });
        iniciarSincronizacaoFichaAlvo('NPC Sombrio'); // baseline = {vida:{atual:500}, mana:{atual:50}}

        const personagensLocais = {
            'NPC Sombrio': { vida: { atual: 350 }, mana: { atual: 50 } }, // edição local não salva em vida
            'Outra Entidade': { hp: 10 },
        };
        const personagensRemotos = {
            'NPC Sombrio': { vida: { atual: 500 }, mana: { atual: 50 } }, // ainda não recebeu a edição local
            'Outra Entidade': { hp: 99 }, // mudou remotamente, ninguém está editando-a pelo Grimório
        };

        const resultado = mesclarPersonagensRemotos(personagensLocais, personagensRemotos);

        // NPC Sombrio: campo editado localmente (vida) sobrevive; campo intocado (mana) segue o remoto.
        expect(resultado['NPC Sombrio']).toEqual({ vida: { atual: 350 }, mana: { atual: 50 } });

        // Outra Entidade NÃO tem baseline ativa -- continua sendo sobrescrita cegamente pelo remoto,
        // exatamente como já acontecia antes desta funcionalidade existir.
        expect(resultado['Outra Entidade']).toEqual({ hp: 99 });
        expect(resultado['Outra Entidade']).toBe(personagensRemotos['Outra Entidade']);

        // Limpeza: não deixa a baseline vazar pro próximo teste do arquivo.
        pararSincronizacaoFichaAlvo('NPC Sombrio');
    });
});
