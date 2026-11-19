import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    aplicarDanoDireto, aplicarFadigaDireta, salvarDummie, salvarFirebaseImediato, resetSincronizacaoFicha,
    iniciarListenerFichaPropria, confirmarLeituraRemota, remotoConfirmado, deletarPersonagem, salvarFichaSilencioso,
} from './firebase-sync';
import useStore from '../stores/useStore';
import { ref, set, update, runTransaction, onValue, remove } from 'firebase/database';

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    set: vi.fn(() => Promise.resolve()),
    update: vi.fn(() => Promise.resolve()),
    runTransaction: vi.fn(() => Promise.resolve({})),
    get: vi.fn(),
    push: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    onValue: vi.fn(),
    onChildAdded: vi.fn(),
    onChildChanged: vi.fn(),
    onDisconnect: vi.fn(() => ({ remove: () => Promise.resolve() })),
    limitToLast: vi.fn(),
    query: vi.fn(),
}));
vi.mock('./firebase-config', () => ({ db: {} }));
vi.mock('../stores/useStore', () => ({
    default: { getState: vi.fn() },
    sanitizarNome: vi.fn((n) => String(n).replace(/[.#$[\]/]/g, '_')),
    registrarAoDescartarFicha: vi.fn(),
}));

let estado;
const cbDe = (i = 0) => runTransaction.mock.calls[i][1];
const optsDe = (i = 0) => runTransaction.mock.calls[i][2];
let relogio = 3_000_000_000_000;
const esperar = (ms = 10) => new Promise(r => setTimeout(r, ms));

beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    relogio += 60_000; // o anti-spam de avisos e global do modulo: cada teste avanca 1 min
    vi.spyOn(Date, 'now').mockImplementation(() => relogio);
    resetSincronizacaoFicha();
    estado = {
        mesaId: 'm1', meuNome: 'Eu', minhaFicha: { vida: { atual: 5 } },
        personagens: { Ana: { vida: { atual: 50 } }, Bia: { vida: { atual: 10 } } }, dummies: {},
        adicionarAviso: vi.fn(), setMinhaFicha: vi.fn(), carregarDadosFicha: vi.fn(), fichaDono: '',
    };
    useStore.getState.mockImplementation(() => estado);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

describe('aplicarDanoDireto / somarDeltaTransacional', () => {
    it('com base: transacao com applyLocally:false no caminho de vida/atual (nao usa set)', () => {
        aplicarDanoDireto('Ana', 30, { base: 50, max: 100 });
        expect(set).not.toHaveBeenCalled();
        expect(runTransaction).toHaveBeenCalledTimes(1);
        expect(ref).toHaveBeenCalledWith({}, 'mesas/m1/personagens/Ana/vida/atual');
        expect(optsDe()).toEqual({ applyLocally: false });
    });
    it('callback com null usa o fallback (base), nao 0', () => {
        aplicarDanoDireto('Ana', 30, { base: 50, max: 100 });
        expect(cbDe()(null)).toBe(30);
    });
    it('undefined/NaN/string invalida tambem usam o fallback', () => {
        aplicarDanoDireto('Ana', 30, { base: 50, max: 100 });
        [undefined, NaN, 'abc'].forEach(v => expect(cbDe()(v)).toBe(30));
    });
    it('valor atual numerico + delta (dois danos se somam sobre o valor do servidor)', () => {
        aplicarDanoDireto('Ana', 30, { base: 50, max: 100 });
        expect(cbDe()(40)).toBe(20);
    });
    it('delta negativo nunca passa de 0', () => {
        aplicarDanoDireto('Ana', 0, { base: 50, max: 100 });
        expect(cbDe()(10)).toBe(0);
        expect(cbDe()(null)).toBe(0);
    });
    it('cura respeita o teto', () => {
        aplicarDanoDireto('Ana', 90, { base: 50, max: 100 });
        expect(cbDe()(80)).toBe(100);
        expect(cbDe()(null)).toBe(90);
    });
    it('cura nunca reduz Vida que ja estava acima do maximo', () => {
        aplicarDanoDireto('Ana', 60, { base: 50, max: 100 });
        expect(cbDe()(150)).toBe(150);
        expect(cbDe()(95)).toBe(100);
    });
    it('sem max valido a cura nao e limitada', () => {
        aplicarDanoDireto('Ana', 90, { base: 50 });
        expect(cbDe()(80)).toBe(120);
    });
    it('delta 0 nao grava nada', () => {
        aplicarDanoDireto('Ana', 50, { base: 50, max: 100 });
        expect(runTransaction).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });
    it('novo negativo e tratado como 0 (delta = -base)', () => {
        aplicarDanoDireto('Ana', -9, { base: 50 });
        expect(cbDe()(50)).toBe(0);
    });
    it('callback reexecutavel e puro', () => {
        aplicarDanoDireto('Ana', 30, { base: 50, max: 100 });
        const cb = cbDe();
        expect([cb(null), cb(null), cb(70), cb(70), cb(null)]).toEqual([30, 30, 50, 50, 30]);
    });
    it('nunca devolve undefined com personagem presente no store', () => {
        aplicarDanoDireto('Ana', 30, { base: 50 });
        [null, undefined, NaN, 0, 12].forEach(v => expect(cbDe()(v)).not.toBeUndefined());
    });
    it('no apagado (some do store) e valor ausente: ABORTA (undefined), sem no parcial', () => {
        aplicarDanoDireto('Ana', 30, { base: 50 });
        delete estado.personagens.Ana;
        expect(cbDe()(null)).toBeUndefined();
        expect(cbDe()(undefined)).toBeUndefined();
    });
    it('valor existente no servidor: ainda soma mesmo se sumiu do store', () => {
        aplicarDanoDireto('Ana', 30, { base: 50 });
        delete estado.personagens.Ana;
        expect(cbDe()(40)).toBe(20);
    });
    it('store de personagens vazio/nao carregado = nao sabe = nao aborta', () => {
        aplicarDanoDireto('Ana', 30, { base: 50 });
        estado.personagens = {};
        expect(cbDe()(null)).toBe(30);
    });
    it('nome com caracteres invalidos: sanitiza o path e acha pelo nome original', () => {
        estado.personagens = { 'A.B': { vida: {} } };
        aplicarDanoDireto('A.B', 1, { base: 5 });
        expect(ref).toHaveBeenCalledWith({}, 'mesas/m1/personagens/A_B/vida/atual');
        expect(cbDe()(null)).toBe(1);
    });
    it('sem base: set absoluto (compat), com piso 0', () => {
        aplicarDanoDireto('Ana', 70);
        aplicarDanoDireto('Ana', -5);
        expect(runTransaction).not.toHaveBeenCalled();
        expect(set.mock.calls.map(c => c[1])).toEqual([70, 0]);
    });
    it('base nao numerica cai no set absoluto', () => {
        aplicarDanoDireto('Ana', 7, { base: 'x' });
        aplicarDanoDireto('Ana', 8, { base: undefined });
        expect(runTransaction).not.toHaveBeenCalled();
        expect(set).toHaveBeenCalledTimes(2);
    });
    it('sem mesa / sem nome: nada grava', () => {
        estado.mesaId = '';
        aplicarDanoDireto('Ana', 1, { base: 5 });
        estado.mesaId = 'm1';
        aplicarDanoDireto('', 1, { base: 5 });
        expect(runTransaction).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });
    it('falha da transacao avisa (nao engole), 1 aviso por 5 s', async () => {
        runTransaction.mockRejectedValue(new Error('PERMISSION_DENIED'));
        aplicarDanoDireto('Zed', 1, { base: 5 });
        aplicarDanoDireto('Zed', 2, { base: 5 });
        aplicarDanoDireto('Zed', 3, { base: 5 });
        await esperar();
        expect(console.warn).toHaveBeenCalledTimes(3);
        expect(estado.adicionarAviso).toHaveBeenCalledTimes(1);
        expect(estado.adicionarAviso.mock.calls[0][0]).toContain('Zed');
    });
    it('falha do set absoluto tambem avisa', async () => {
        set.mockRejectedValueOnce(new Error('offline'));
        aplicarDanoDireto('Yan', 10);
        await esperar();
        expect(estado.adicionarAviso).toHaveBeenCalledTimes(1);
    });
    it('apos 5 s um novo aviso e permitido', async () => {
        runTransaction.mockRejectedValue(new Error('x'));
        const t0 = 1_900_000_000_000;
        const spy = vi.spyOn(Date, 'now').mockReturnValue(t0);
        aplicarDanoDireto('Kim', 1, { base: 5 });
        await esperar(5);
        spy.mockReturnValue(t0 + 5001);
        aplicarDanoDireto('Kim', 1, { base: 5 });
        await esperar(5);
        expect(estado.adicionarAviso).toHaveBeenCalledTimes(2);
    });
});

describe('aplicarFadigaDireta', () => {
    it('com base: transacao em fadigaExtra, soma so o ganho, sem teto', () => {
        aplicarFadigaDireta('Ana', 8, { base: 5 });
        expect(ref).toHaveBeenCalledWith({}, 'mesas/m1/personagens/Ana/combate/fadigaExtra');
        expect(cbDe()(10)).toBe(13);
        expect(cbDe()(null)).toBe(8);
        expect(optsDe()).toEqual({ applyLocally: false });
    });
    it('fadiga nunca fica negativa', () => {
        aplicarFadigaDireta('Ana', 0, { base: 5 });
        expect(cbDe()(2)).toBe(0);
    });
    it('delta 0 nao grava', () => {
        aplicarFadigaDireta('Ana', 5, { base: 5 });
        expect(runTransaction).not.toHaveBeenCalled();
    });
    it('sem base: set absoluto (compat)', () => {
        aplicarFadigaDireta('Ana', 4);
        expect(set.mock.calls[0][1]).toBe(4);
        expect(runTransaction).not.toHaveBeenCalled();
    });
    it('personagem sumido do store: aborta, sem no parcial', () => {
        aplicarFadigaDireta('Ana', 8, { base: 5 });
        delete estado.personagens.Ana;
        expect(cbDe()(null)).toBeUndefined();
    });
    it('falha avisa', async () => {
        runTransaction.mockRejectedValue(new Error('x'));
        aplicarFadigaDireta('Fadi', 8, { base: 5 });
        await esperar();
        expect(estado.adicionarAviso).toHaveBeenCalledTimes(1);
    });
});

describe('salvarDummie', () => {
    const D = () => ({ nome: 'Boneco', hpAtual: 100, hpMax: 100, x: 1, y: 2 });
    beforeEach(() => { estado.dummies = { d1: D() }; });

    it('criacao (sem dummy no store): set do objeto inteiro', () => {
        salvarDummie('novo', { nome: 'N', hpAtual: 5 });
        expect(set).toHaveBeenCalledWith('mesas/m1/dummies/novo', { nome: 'N', hpAtual: 5 });
        expect(runTransaction).not.toHaveBeenCalled();
    });
    it('objeto identico nao grava nada', () => {
        salvarDummie('d1', D(), { baseHp: 100, hpMax: 100 });
        salvarDummie('d1', D());
        expect(runTransaction).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });
    it('so campos alterados: transacao no no; demais campos preservados do servidor', () => {
        salvarDummie('d1', { ...D(), x: 9 });
        expect(runTransaction).toHaveBeenCalledTimes(1);
        expect(set).not.toHaveBeenCalled();
        expect(ref).toHaveBeenCalledWith({}, 'mesas/m1/dummies/d1');
        const servidor = { nome: 'Boneco', hpAtual: 40, hpMax: 100, x: 1, y: 77 };
        expect(cbDe()(servidor)).toEqual({ nome: 'Boneco', hpAtual: 40, hpMax: 100, x: 9, y: 77 });
        expect(optsDe()).toEqual({ applyLocally: false });
    });
    it('campo ausente no novo objeto vira remocao; valor null tambem remove', () => {
        salvarDummie('d1', { nome: 'Boneco', hpAtual: 100, hpMax: 100, y: null });
        const r = cbDe()({ ...D() });
        expect('x' in r).toBe(false);
        expect('y' in r).toBe(false);
    });
    it('hpAtual por delta: servidor 60, golpe de 30 sobre base 100 => 30', () => {
        salvarDummie('d1', { ...D(), hpAtual: 70 }, { baseHp: 100, hpMax: 100 });
        expect(cbDe()({ ...D(), hpAtual: 60 }).hpAtual).toBe(30);
    });
    it('dois danos em sequencia somam (nao sobrescrevem)', () => {
        salvarDummie('d1', { ...D(), hpAtual: 70 }, { baseHp: 100, hpMax: 100 });
        salvarDummie('d1', { ...D(), hpAtual: 80 }, { baseHp: 100, hpMax: 100 });
        let servidor = D();
        servidor = cbDe(0)(servidor);
        servidor = cbDe(1)(servidor);
        expect(servidor.hpAtual).toBe(50);
    });
    it('so o delta de Vida mudando ainda grava', () => {
        salvarDummie('d1', { ...D(), hpAtual: 90 }, { baseHp: 100, hpMax: 100 });
        expect(runTransaction).toHaveBeenCalledTimes(1);
    });
    it('piso 0 e teto hpMax na cura; nunca reduz acima do maximo', () => {
        salvarDummie('d1', { ...D(), hpAtual: 100 }, { baseHp: 60, hpMax: 100 });
        expect(cbDe()({ ...D(), hpAtual: 80 }).hpAtual).toBe(100);
        expect(cbDe()({ ...D(), hpAtual: 130 }).hpAtual).toBe(130);
        salvarDummie('d1', { ...D(), hpAtual: 0 }, { baseHp: 100, hpMax: 100 });
        expect(cbDe(1)({ ...D(), hpAtual: 20 }).hpAtual).toBe(0);
    });
    it('servidor sem hpAtual valido usa baseHp', () => {
        salvarDummie('d1', { ...D(), hpAtual: 70 }, { baseHp: 100, hpMax: 100 });
        expect(cbDe()({ nome: 'Boneco', hpMax: 100, x: 1, y: 2 }).hpAtual).toBe(70);
    });
    it('dummie apagado (no ausente e fora do store): aborta sem criar no parcial', () => {
        salvarDummie('d1', { ...D(), hpAtual: 70 }, { baseHp: 100, hpMax: 100 });
        estado.dummies = { outro: D() };
        expect(cbDe()(null)).toBeUndefined();
    });
    it('primeiro passo com cache vazio mas dummie ainda no store: parte do que o cliente conhecia', () => {
        salvarDummie('d1', { ...D(), hpAtual: 70, x: 5 }, { baseHp: 100, hpMax: 100 });
        expect(cbDe()(null)).toEqual({ nome: 'Boneco', hpAtual: 70, hpMax: 100, x: 5, y: 2 });
    });
    it('callback reexecutavel nao muta o dummie do store', () => {
        salvarDummie('d1', { ...D(), hpAtual: 70, x: 5 }, { baseHp: 100, hpMax: 100 });
        const cb = cbDe();
        cb(null); cb(null);
        expect(estado.dummies.d1).toEqual(D());
    });
    it('sem baseHp: hpAtual e campo comum (valor absoluto)', () => {
        salvarDummie('d1', { ...D(), hpAtual: 10 });
        expect(cbDe()({ ...D(), hpAtual: 55 }).hpAtual).toBe(10);
    });
    it('falha avisa (transacao e set de criacao)', async () => {
        runTransaction.mockRejectedValue(new Error('x'));
        salvarDummie('d1', { ...D(), x: 3 });
        await esperar();
        expect(estado.adicionarAviso).toHaveBeenCalledTimes(1);
        set.mockRejectedValueOnce(new Error('y'));
        salvarDummie('criar-outro', { nome: 'Z' });
        await esperar();
        expect(console.warn.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
});

describe('salvarFirebaseImediato com fichaDono', () => {
    beforeEach(() => {
        estado.minhaFicha = { vida: { atual: 7 } };
        confirmarLeituraRemota({ vida: { atual: 5 } });
    });
    it('fichaDono diferente do meuNome: nao grava no Firebase nem no localStorage do nome ativo', async () => {
        const ls = vi.spyOn(Storage.prototype, 'setItem');
        estado.fichaDono = 'Outro';
        await salvarFirebaseImediato();
        expect(update).not.toHaveBeenCalled();
        expect(ls.mock.calls.some(c => String(c[0]).startsWith('rpgFicha_Eu'))).toBe(false);
    });
    it('fichaDono igual: grava o diff', async () => {
        estado.fichaDono = 'Eu';
        await salvarFirebaseImediato();
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][0]).toBe('mesas/m1/personagens/Eu');
    });
    it('fichaDono vazio (primeira criacao): grava, nao bloqueia', async () => {
        estado.fichaDono = '';
        await salvarFirebaseImediato();
        expect(update).toHaveBeenCalledTimes(1);
    });
    it('console.warn de bloqueio limitado a 1 a cada 10 s', async () => {
        estado.fichaDono = 'Outro';
        const t0 = relogio + 1_000_000;
        const spy = vi.spyOn(Date, 'now').mockReturnValue(t0);
        const conta = () => console.warn.mock.calls.filter(c => String(c[0]).includes('Salvamento bloqueado')).length;
        await salvarFirebaseImediato();
        await salvarFirebaseImediato();
        spy.mockReturnValue(t0 + 9000);
        await salvarFirebaseImediato();
        expect(conta()).toBe(1);
        spy.mockReturnValue(t0 + 11000);
        await salvarFirebaseImediato();
        expect(conta()).toBe(2);
    });
});

describe('trava "no sumiu" no listener da ficha propria', () => {
    const snap = (d) => ({ val: () => d });
    let handler;
    beforeEach(() => {
        estado.fichaDono = 'Eu';
        iniciarListenerFichaPropria('Eu', vi.fn());
        handler = onValue.mock.calls[onValue.mock.calls.length - 1][1];
        handler(snap({ vida: { atual: 5 } }));
        estado.minhaFicha = { vida: { atual: 9 } };
    });
    it('no some depois de existir: bloqueia envio e avisa "apagado por outra pessoa"', async () => {
        handler(snap(null));
        expect(remotoConfirmado()).toBe(false);
        expect(estado.adicionarAviso).toHaveBeenCalledTimes(1);
        expect(estado.adicionarAviso.mock.calls[0][0]).toMatch(/apagado por outra pessoa/);
        await salvarFirebaseImediato();
        expect(update).not.toHaveBeenCalled();
    });
    it('envio bloqueado depois do sumico usa a mensagem de apagado', async () => {
        handler(snap(null));
        estado.adicionarAviso.mockClear();
        await salvarFirebaseImediato();
        expect(estado.adicionarAviso.mock.calls[0][0]).toMatch(/apagado do servidor por outra pessoa/);
    });
    it('debounce pendente e cancelado quando o no some', () => {
        vi.useFakeTimers();
        salvarFichaSilencioso();
        handler(snap(null));
        vi.advanceTimersByTime(1000);
        expect(update).not.toHaveBeenCalled();
    });
    it('no volta com dados: reconfirma, nova baseline e libera o envio', async () => {
        handler(snap(null));
        handler(snap({ vida: { atual: 20 } }));
        expect(remotoConfirmado()).toBe(true);
        expect(estado.carregarDadosFicha).toHaveBeenCalledWith({ vida: { atual: 20 } }, 'Eu');
        estado.minhaFicha = { vida: { atual: 21 } };
        await salvarFirebaseImediato();
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][1]).toEqual({ 'vida/atual': 21 });
    });
    it('dados normais (sem sumico) seguem o merge de sempre, sem aviso', () => {
        handler(snap({ vida: { atual: 6 } }));
        expect(estado.setMinhaFicha).toHaveBeenCalled();
        expect(estado.adicionarAviso).not.toHaveBeenCalled();
        expect(remotoConfirmado()).toBe(true);
    });
    it('deletarPersonagem do proprio: o sumico nao dispara o aviso', async () => {
        await deletarPersonagem('Eu');
        expect(remove).toHaveBeenCalledWith('mesas/m1/personagens/Eu');
        handler(snap(null));
        expect(estado.adicionarAviso).not.toHaveBeenCalled();
    });
    it('deletarPersonagem de OUTRO nao mexe na confirmacao do proprio', async () => {
        await deletarPersonagem('Ana');
        expect(remotoConfirmado()).toBe(true);
    });
    it('resetSincronizacaoFicha limpa apagadoNaNuvem', async () => {
        handler(snap(null));
        resetSincronizacaoFicha();
        confirmarLeituraRemota({ vida: { atual: 1 } });
        resetSincronizacaoFicha();
        estado.adicionarAviso.mockClear();
        await salvarFirebaseImediato();
        expect(estado.adicionarAviso.mock.calls[0][0]).toMatch(/ainda não sincronizou/);
    });
    it('sumico repetido avisa 1x (janela de 5 s)', () => {
        handler(snap(null));
        handler(snap(null));
        expect(estado.adicionarAviso).toHaveBeenCalledTimes(1);
    });
});
