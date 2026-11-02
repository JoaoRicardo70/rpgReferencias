import { describe, it, expect, vi, beforeEach } from 'vitest';
import { salvarFirebaseImediato, resetSincronizacaoFicha, iniciarListenerFichaPropria, confirmarLeituraRemota, remotoConfirmado, lerFichaDoFirebaseSeguro } from './firebase-sync';
import useStore from '../stores/useStore';
import { update, onValue, get } from 'firebase/database';

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

// 🔒 Trava contra sobrescrever a ficha da nuvem com uma cópia velha (o app abre com a cópia local antes de ler o servidor).
describe('Firebase Sync Service - trava de leitura confirmada', () => {
    let estadoAtual;
    beforeEach(() => {
        vi.clearAllMocks();
        resetSincronizacaoFicha();
        estadoAtual = {
            meuNome: 'Natsu', mesaId: 'mesa1',
            minhaFicha: { poderes: [{ id: 1, nome: 'Antigo' }], vida: { atual: 5 } },
            setMinhaFicha: vi.fn((f) => { estadoAtual.minhaFicha = f; }),
            adicionarAviso: vi.fn(),
        };
        useStore.getState.mockImplementation(() => estadoAtual);
    });

    it('sem ter lido o servidor, NENHUM envio sai (nem a ficha inteira velha) e o usuário é avisado', async () => {
        expect(remotoConfirmado()).toBe(false);
        await salvarFirebaseImediato();
        expect(update).not.toHaveBeenCalled();
        expect(estadoAtual.adicionarAviso).toHaveBeenCalledTimes(1);
    });

    it('o aviso não se repete a cada tentativa (anti-spam)', async () => {
        await salvarFirebaseImediato();
        await salvarFirebaseImediato();
        await salvarFirebaseImediato();
        expect(estadoAtual.adicionarAviso).toHaveBeenCalledTimes(1);
    });

    it('a cópia local continua sendo salva mesmo com o envio bloqueado', async () => {
        await salvarFirebaseImediato();
        expect(JSON.parse(localStorage.getItem('rpgFicha_Natsu'))).toMatchObject({ vida: { atual: 5 } });
    });

    it('leitura confirmada com a ficha da nuvem: a baseline passa a ser a nuvem e só o que MUDOU sai', async () => {
        confirmarLeituraRemota({ poderes: [{ id: 1, nome: 'Antigo' }, { id: 2, nome: 'Novo da nuvem' }], vida: { atual: 5 } });
        expect(remotoConfirmado()).toBe(true);
        estadoAtual.minhaFicha = { poderes: [{ id: 1, nome: 'Antigo' }, { id: 2, nome: 'Novo da nuvem' }], vida: { atual: 9 } };
        await salvarFirebaseImediato();
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][1]).toEqual({ 'vida/atual': 9 });
    });

    it('servidor respondeu que não há ficha (personagem novo): o primeiro envio é liberado', async () => {
        confirmarLeituraRemota(null);
        await salvarFirebaseImediato();
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('trocar de personagem/mesa (reset) volta a exigir uma nova leitura', async () => {
        confirmarLeituraRemota(null);
        resetSincronizacaoFicha();
        expect(remotoConfirmado()).toBe(false);
        await salvarFirebaseImediato();
        expect(update).not.toHaveBeenCalled();
    });

    it('o listener em tempo real confirma na primeira resposta: com a ficha existente', async () => {
        iniciarListenerFichaPropria('Natsu', vi.fn());
        const handler = onValue.mock.calls[onValue.mock.calls.length - 1][1];
        handler(fazerSnapshot({ vida: { atual: 5 }, poderes: [{ id: 1, nome: 'Antigo' }] }));
        expect(remotoConfirmado()).toBe(true);
    });

    it('o listener em tempo real confirma na primeira resposta: sem ficha (nova)', async () => {
        iniciarListenerFichaPropria('Natsu', vi.fn());
        const handler = onValue.mock.calls[onValue.mock.calls.length - 1][1];
        handler(fazerSnapshot(null));
        expect(remotoConfirmado()).toBe(true);
    });

    it('lerFichaDoFirebaseSeguro distingue "não existe" de "falhou ao ler"', async () => {
        get.mockResolvedValueOnce({ exists: () => false, val: () => null });
        expect(await lerFichaDoFirebaseSeguro('Natsu')).toEqual({ ok: true, dados: null });
        get.mockResolvedValueOnce({ exists: () => true, val: () => ({ vida: { atual: 1 } }) });
        expect(await lerFichaDoFirebaseSeguro('Natsu')).toEqual({ ok: true, dados: { vida: { atual: 1 } } });
        get.mockRejectedValueOnce(new Error('offline'));
        expect(await lerFichaDoFirebaseSeguro('Natsu')).toEqual({ ok: false, dados: null });
    });

    it('a confirmação vale SÓ para o personagem lido: trocar o nome na hora invalida (sem esperar o React)', async () => {
        confirmarLeituraRemota({ vida: { atual: 5 } }); // Natsu
        expect(remotoConfirmado()).toBe(true);
        estadoAtual.meuNome = 'Outro'; // setMeuNome acontece antes do efeito que reseta a sincronização
        expect(remotoConfirmado()).toBe(false);
        await salvarFirebaseImediato();
        expect(update).not.toHaveBeenCalled();
    });

    it('leitura que demora e termina DEPOIS da troca de personagem não libera o personagem novo', async () => {
        estadoAtual.meuNome = 'Novo';
        confirmarLeituraRemota({ vida: { atual: 5 } }, 'Natsu'); // leitura atrasada do personagem anterior
        expect(remotoConfirmado()).toBe(false);
    });

    it('trocar de mesa também invalida', async () => {
        confirmarLeituraRemota({ vida: { atual: 5 } });
        estadoAtual.mesaId = 'mesa2';
        expect(remotoConfirmado()).toBe(false);
    });

    it('reset + salvamento imediato (reentrar no mesmo nome) não envia ficha em branco por cima da nuvem', async () => {
        confirmarLeituraRemota({ vida: { atual: 5 }, poderes: [{ id: 1 }] });
        resetSincronizacaoFicha();
        estadoAtual.minhaFicha = { vida: { atual: 0 } }; // ficha em branco depois do resetFicha()
        await salvarFirebaseImediato();
        expect(update).not.toHaveBeenCalled();
    });

    it('primeira resposta do listener é para o personagem do listener (chave mesa/nome)', async () => {
        iniciarListenerFichaPropria('Natsu', vi.fn());
        const handler = onValue.mock.calls[onValue.mock.calls.length - 1][1];
        handler(fazerSnapshot({ vida: { atual: 5 } }));
        expect(remotoConfirmado()).toBe(true);
        estadoAtual.meuNome = 'Outro';
        expect(remotoConfirmado()).toBe(false);
    });

    it('sem mesa selecionada a leitura NÃO conta como confirmada', async () => {
        estadoAtual.mesaId = '';
        expect(await lerFichaDoFirebaseSeguro('Natsu')).toEqual({ ok: false, dados: null });
    });
});

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
        confirmarLeituraRemota(null); // o servidor respondeu que o personagem ainda não existe
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
