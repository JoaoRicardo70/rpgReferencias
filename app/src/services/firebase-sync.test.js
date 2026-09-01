import { describe, it, expect, vi, beforeEach } from 'vitest';
import { salvarFirebaseImediato, resetSincronizacaoFicha, iniciarListenerFichaPropria } from './firebase-sync';
import useStore from '../stores/useStore';
import { update, onValue } from 'firebase/database';

// Mocks rigorosos para não quebrar CI/CD
vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    set: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    get: vi.fn(),
    push: vi.fn(() => Promise.resolve()),
    remove: vi.fn(),
    onValue: vi.fn(),
    onChildAdded: vi.fn(),
    limitToLast: vi.fn(),
    query: vi.fn()
}));

vi.mock('./firebase-config', () => ({
    db: {} // Simula conexão ativa
}));

vi.mock('../stores/useStore', () => ({
    default: {
        getState: vi.fn()
    },
    sanitizarNome: vi.fn((n) => n)
}));

function fazerSnapshot(dados) { return { val: () => dados }; }

describe('Firebase Sync Service', () => {
    let estadoAtual;

    beforeEach(() => {
        vi.clearAllMocks();
        resetSincronizacaoFicha();
        // Simula o estado do Zustand (mutável, como o real: setMinhaFicha reflete no getState seguinte)
        estadoAtual = {
            meuNome: 'Heroi Teste',
            mesaId: 'mesa1',
            minhaFicha: { status: 'vivo', atributos: { forca: 10 } },
            setMinhaFicha: vi.fn((ficha) => { estadoAtual.minhaFicha = ficha; }),
        };
        useStore.getState.mockImplementation(() => estadoAtual);
    });

    it('deve criar um clone profundo e enviar para o Firebase sem erro de Read Only', async () => {
        estadoAtual.minhaFicha = Object.freeze({ status: 'vivo', atributos: { forca: 10 } });
        await salvarFirebaseImediato();

        // Sem baseline anterior (primeiro save), cada chave de topo ausente no
        // baseline vira uma entrada própria do diff (sem baseline para recursar).
        expect(update).toHaveBeenCalledTimes(1);
        const payloadEnviado = update.mock.calls[0][1];
        expect(payloadEnviado).toEqual({ status: 'vivo', atributos: { forca: 10 } });
        expect(Object.isFrozen(payloadEnviado)).toBe(false); // O clone não pode estar congelado
    });

    it('salvamentos seguintes só enviam os campos que realmente mudaram (update parcial, não a ficha inteira)', async () => {
        // A baseline só avança via o ECO do onValue (nunca pelo .then() do
        // próprio save — ver comentário em salvarFirebaseImediato), então
        // simula o Firebase confirmando o estado atual antes do 2º save.
        let onValueCallback;
        onValue.mockImplementation((_ref, cb) => { onValueCallback = cb; return () => {}; });
        iniciarListenerFichaPropria('Heroi Teste', () => {});
        onValueCallback(fazerSnapshot({ status: 'vivo', atributos: { forca: 10 } }));

        // Só "status" muda; "atributos.forca" continua igual ao último estado sincronizado.
        estadoAtual.minhaFicha = { status: 'morto', atributos: { forca: 10 } };
        await salvarFirebaseImediato();

        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][1]).toEqual({ status: 'morto' });
    });

    it('não chama o Firebase quando nada mudou desde o último save', async () => {
        let onValueCallback;
        onValue.mockImplementation((_ref, cb) => { onValueCallback = cb; return () => {}; });
        iniciarListenerFichaPropria('Heroi Teste', () => {});
        onValueCallback(fazerSnapshot({ status: 'vivo', atributos: { forca: 10 } }));

        await salvarFirebaseImediato();

        expect(update).not.toHaveBeenCalled();
    });

    it('uma atualização remota concorrente que chega ENQUANTO um save está em voo não apaga a edição local não salva', async () => {
        let onValueCallback;
        onValue.mockImplementation((_ref, cb) => { onValueCallback = cb; return () => {}; });
        iniciarListenerFichaPropria('Heroi Teste', () => {});
        onValueCallback(fazerSnapshot({ status: 'vivo', atributos: { forca: 10 }, vida: { atual: 100 } }));

        // Jogador edita vida.atual localmente, ainda não salvou.
        estadoAtual.minhaFicha = { status: 'vivo', atributos: { forca: 10 }, vida: { atual: 80 } };

        // Dispara o save mas segura a resolução do update() do Firebase, simulando
        // latência de rede — o diff já foi calculado de forma síncrona contra a
        // baseline de ANTES da mudança concorrente abaixo.
        let resolverUpdate;
        update.mockImplementationOnce(() => new Promise((resolve) => { resolverUpdate = resolve; }));
        const savePromise = salvarFirebaseImediato();

        // ENQUANTO o save está em voo, chega uma mudança remota concorrente
        // (ex: o Mestre alterando atributos.forca desta mesma ficha pelo Painel).
        onValueCallback(fazerSnapshot({ status: 'vivo', atributos: { forca: 15 }, vida: { atual: 100 } }));

        // A edição local não salva de vida.atual continua vencendo após o merge...
        expect(estadoAtual.minhaFicha.vida.atual).toBe(80);
        // ...e o campo intocado (atributos.forca) foi atualizado ao vivo pelo remoto.
        expect(estadoAtual.minhaFicha.atributos.forca).toBe(15);

        resolverUpdate();
        await savePromise;

        // O save em voo mandou exatamente o diff calculado no momento do disparo
        // (antes da mudança concorrente), sem incluir o campo do Mestre.
        expect(update.mock.calls[0][1]).toEqual({ 'vida/atual': 80 });

        // Como a baseline só avança pelo ECO do onValue (nunca pelo .then() do
        // próprio save), o próximo save ainda reenvia vida.atual (idempotente,
        // sem perda de dado) até que o eco desta escrita confirme a baseline.
        await salvarFirebaseImediato();
        expect(update.mock.calls[1][1]).toEqual({ 'vida/atual': 80 });
    });
});
