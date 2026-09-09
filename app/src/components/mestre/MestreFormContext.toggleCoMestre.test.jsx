import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MestreFormProvider, useMestreForm } from './MestreFormContext';
import useStore from '../../stores/useStore';
import { ref, set, remove } from 'firebase/database';

// ---------------------------------------------------------------------------
// QA — MestreFormContext.jsx > toggleCoMestre(nomeAmigo): dois bugs corrigidos
// nesta sessão:
//
// 1) Caminho ERRADO no Firebase: escrevia em "mesas/{mesaId}/mestres/{nick}"
//    (árvore de dados de JOGO), mas App.jsx > iniciarListenerMestres (o código
//    que REALMENTE decide se alguém é Mestre) lê de
//    "index_mesas/{mesaId}/mestres" -- corrigido para escrever no MESMO
//    caminho que é lido.
//
// 2) Chave da chave (nick) computada com uma regex PRÓPRIA
//    (toLowerCase().replace(/[^a-z0-9]/g,'')), diferente de sanitizarNome()
//    (stores/useStore.js), que é a função que App.jsx usa pra decidir
//    isMestre de verdade. Qualquer nome com maiúscula/acento/espaço gerava
//    uma chave que NUNCA batia com a chave real usada em outro lugar do app
//    -- a promoção "funcionava" (alerta de sucesso, sem erro), mas NUNCA
//    concedia permissão de Mestre de verdade. Corrigido usando
//    sanitizarNome(nomeAmigo) diretamente.
//
// Usa vi.mock com importOriginal para preservar a IMPLEMENTAÇÃO REAL de
// sanitizarNome (não uma reimplementação no mock, que poderia mascarar uma
// regressão) -- só o `default` (o hook useStore) é substituído por um mock
// controlável, no mesmo padrão de RelicarioPanel.toggleEquiparById.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        default: vi.fn(),
    };
});

vi.mock('firebase/database', () => ({
    // Retorna o próprio path (string) para permitir assertar exatamente
    // qual caminho foi construído por toggleCoMestre.
    ref: vi.fn((db, path) => path),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../services/firebase-config', () => ({
    db: { __isMock: true },
}));

vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    apagarFicha: vi.fn(),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        personagens: {},
        isMestre: true,
        meuNome: 'Dono',
        // 🔥 A guarda de permissão de toggleCoMestre() compara userLogado (login de verdade) com
        // mesaCriador -- NÃO meuNome (personagem ativo, que pode ser diferente do login). Por
        // padrão este helper representa "estou logado como o Dono da mesa" (o cenário mais comum
        // nos testes abaixo), então userLogado começa igual a mesaCriador; overrides que querem
        // testar "NÃO sou o Dono" devem sobrescrever userLogado explicitamente (ver os testes de
        // guarda de permissão e o de regressão do bug real).
        userLogado: 'Dono',
        mesaId: 'MESA-X',
        mesaCriador: 'Dono',
        mesaMestres: {},
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = useMestreForm();
    return null;
}

function montar() {
    render(<MestreFormProvider><Harness /></MestreFormProvider>);
}

beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
});
afterEach(() => { cleanup(); });

describe('MestreFormContext — toggleCoMestre(): guarda de permissão (só o Dono da mesa pode promover/rebaixar)', () => {
    it('quem NÃO é o criador da mesa recebe alerta e NÃO toca o Firebase', async () => {
        // meuNome aqui é irrelevante pra guarda de permissão (é userLogado que decide) -- fica
        // diferente de propósito só pra não mascarar acidentalmente um bug onde a guarda ainda
        // comparasse meuNome.
        montarStore({ meuNome: 'Jogador1', userLogado: 'Jogador1', mesaCriador: 'Dono' });
        montar();

        await act(async () => { await probe.toggleCoMestre('OutroJogador'); });

        expect(window.alert).toHaveBeenCalledWith('Apenas o Mestre Supremo (Dono da Sala) pode nomear Co-Mestres.');
        expect(set).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
    });

    it('tentar alterar o próprio Dono da mesa é bloqueado com alerta, sem tocar o Firebase', async () => {
        montarStore({ meuNome: 'Dono', mesaCriador: 'Dono' });
        montar();

        await act(async () => { await probe.toggleCoMestre('Dono'); });

        expect(window.alert).toHaveBeenCalledWith('Esta pessoa já é o Dono da mesa!');
        expect(set).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
    });

    // 🔥 Regressão do bug real corrigido nesta sessão: o Dono de verdade (userLogado === mesaCriador)
    // jogando com um PERSONAGEM ATIVO cujo nome NÃO bate com mesaCriador (cenário normal -- login
    // "kiriya", personagem "Kiriya D Zoldyck") tinha a promoção bloqueada antes da correção, porque
    // a guarda comparava meuNome (personagem) em vez de userLogado (login) com mesaCriador. Este
    // teste falharia com a guarda antiga (`meuNome !== mesaCriador`) e só passa com a guarda
    // corrigida (`userLogado !== mesaCriador`).
    it('userLogado === mesaCriador (dono de verdade logado) promove com sucesso mesmo com meuNome (personagem ativo) DIFERENTE de mesaCriador', async () => {
        montarStore({
            userLogado: 'kiriya',
            mesaCriador: 'kiriya',
            meuNome: 'Kiriya D Zoldyck',
            mesaId: 'MESA-X',
            mesaMestres: {},
        });
        montar();

        await act(async () => { await probe.toggleCoMestre('joao'); });

        expect(window.alert).not.toHaveBeenCalledWith('Apenas o Mestre Supremo (Dono da Sala) pode nomear Co-Mestres.');
        expect(set).toHaveBeenCalledWith('index_mesas/MESA-X/mestres/joao', true);
        expect(window.alert).toHaveBeenCalledWith('joao foi promovido a Co-Mestre!');
    });

    it('userLogado DIFERENTE de mesaCriador continua bloqueado mesmo quando meuNome (personagem ativo) coincide com mesaCriador (prova que a checagem usa userLogado, não meuNome)', async () => {
        montarStore({
            userLogado: 'Jogador1',
            mesaCriador: 'kiriya',
            meuNome: 'kiriya',
            mesaId: 'MESA-X',
            mesaMestres: {},
        });
        montar();

        await act(async () => { await probe.toggleCoMestre('joao'); });

        expect(window.alert).toHaveBeenCalledWith('Apenas o Mestre Supremo (Dono da Sala) pode nomear Co-Mestres.');
        expect(set).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
    });
});

describe('MestreFormContext — toggleCoMestre(): caminho correto no Firebase (bug #1)', () => {
    it('promover escreve em "index_mesas/{mesaId}/mestres/{nick}" -- NUNCA em "mesas/{mesaId}/mestres/..."', async () => {
        montarStore({ meuNome: 'Dono', mesaCriador: 'Dono', mesaId: 'MESA-X', mesaMestres: {} });
        montar();

        await act(async () => { await probe.toggleCoMestre('joao'); });

        expect(ref).toHaveBeenCalledWith(expect.anything(), 'index_mesas/MESA-X/mestres/joao');
        expect(set).toHaveBeenCalledWith('index_mesas/MESA-X/mestres/joao', true);

        // Garante explicitamente que NENHUMA chamada usou a árvore errada.
        const caminhosUsados = ref.mock.calls.map(([, path]) => path);
        caminhosUsados.forEach((p) => expect(p.startsWith('mesas/')).toBe(false));
    });
});

describe('MestreFormContext — toggleCoMestre(): chave usa sanitizarNome() de verdade (bug #2 — regressão crítica)', () => {
    it('nome com maiúscula, acento e espaço ("João Silva") gera a chave via sanitizarNome, NÃO via toLowerCase+remover não-alfanumérico', async () => {
        montarStore({ meuNome: 'Dono', mesaCriador: 'Dono', mesaId: 'MESA-X', mesaMestres: {} });
        montar();

        await act(async () => { await probe.toggleCoMestre('João Silva'); });

        // sanitizarNome real só troca .#$[]/ e dá trim -- não mexe em maiúscula/acento/espaço.
        // A regex antiga (toLowerCase + remover tudo que não for a-z0-9) produziria "joosilva".
        expect(set).toHaveBeenCalledWith('index_mesas/MESA-X/mestres/João Silva', true);
        expect(set).not.toHaveBeenCalledWith(expect.stringContaining('joosilva'), expect.anything());
    });

    it('nome com espaço simples ("Ana Maria") preserva maiúsculas e o espaço na chave gravada', async () => {
        montarStore({ meuNome: 'Dono', mesaCriador: 'Dono', mesaId: 'MESA-X', mesaMestres: {} });
        montar();

        await act(async () => { await probe.toggleCoMestre('Ana Maria'); });

        expect(set).toHaveBeenCalledWith('index_mesas/MESA-X/mestres/Ana Maria', true);
    });
});

describe('MestreFormContext — toggleCoMestre(): caminho de rebaixar (já é Co-Mestre)', () => {
    it('nome já presente em mesaMestres (com a chave sanitizada) chama remove() (não set()) e mostra alerta de rebaixado', async () => {
        montarStore({
            meuNome: 'Dono',
            mesaCriador: 'Dono',
            mesaId: 'MESA-X',
            mesaMestres: { 'João Silva': true },
        });
        montar();

        await act(async () => { await probe.toggleCoMestre('João Silva'); });

        expect(remove).toHaveBeenCalledWith('index_mesas/MESA-X/mestres/João Silva');
        expect(set).not.toHaveBeenCalled();
        expect(window.alert).toHaveBeenCalledWith('João Silva foi rebaixado a Jogador comum.');
    });

    it('nome AUSENTE de mesaMestres (mesmo com outras chaves lá dentro) promove via set(), não remove()', async () => {
        montarStore({
            meuNome: 'Dono',
            mesaCriador: 'Dono',
            mesaId: 'MESA-X',
            mesaMestres: { 'OutraPessoa': true },
        });
        montar();

        await act(async () => { await probe.toggleCoMestre('João Silva'); });

        expect(set).toHaveBeenCalledWith('index_mesas/MESA-X/mestres/João Silva', true);
        expect(remove).not.toHaveBeenCalled();
        expect(window.alert).toHaveBeenCalledWith('João Silva foi promovido a Co-Mestre!');
    });
});

describe('MestreFormContext — toggleCoMestre(): tratamento de erro do Firebase', () => {
    it('set() rejeitando mostra alerta de erro de permissão e não deixa a Promise rejeitar sem tratamento', async () => {
        set.mockImplementationOnce(() => Promise.reject(new Error('PERMISSION_DENIED')));
        montarStore({ meuNome: 'Dono', mesaCriador: 'Dono', mesaId: 'MESA-X', mesaMestres: {} });
        montar();

        await expect(act(async () => { await probe.toggleCoMestre('joao'); })).resolves.not.toThrow();

        expect(window.alert).toHaveBeenCalledWith('Erro de permissão. Apenas o Dono da sala tem acesso a esta função no Firebase.');
    });

    it('remove() rejeitando (fluxo de rebaixar) também mostra alerta de erro de permissão', async () => {
        remove.mockImplementationOnce(() => Promise.reject(new Error('PERMISSION_DENIED')));
        montarStore({
            meuNome: 'Dono',
            mesaCriador: 'Dono',
            mesaId: 'MESA-X',
            mesaMestres: { 'joao': true },
        });
        montar();

        await expect(act(async () => { await probe.toggleCoMestre('joao'); })).resolves.not.toThrow();

        expect(window.alert).toHaveBeenCalledWith('Erro de permissão. Apenas o Dono da sala tem acesso a esta função no Firebase.');
    });
});
