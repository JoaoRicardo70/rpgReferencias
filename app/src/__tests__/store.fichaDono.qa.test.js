import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path), set: vi.fn(() => Promise.resolve()), update: vi.fn(() => Promise.resolve()),
    runTransaction: vi.fn(() => Promise.resolve({})), get: vi.fn(), push: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()), onValue: vi.fn(), onChildAdded: vi.fn(), onChildChanged: vi.fn(),
    onDisconnect: vi.fn(() => ({ remove: () => Promise.resolve() })), limitToLast: vi.fn(), query: vi.fn(),
}));
vi.mock('../services/firebase-config', () => ({ db: {}, auth: {}, storage: {} }));
vi.mock('firebase/auth', () => ({
    createUserWithEmailAndPassword: vi.fn(), signInWithEmailAndPassword: vi.fn(), signOut: vi.fn(), onAuthStateChanged: vi.fn(),
}));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));

import useStore, { registrarAoDescartarFicha } from '../stores/useStore';
import { update } from 'firebase/database';
import { salvarFirebaseImediato, salvarFichaSilencioso, resetSincronizacaoFicha, confirmarLeituraRemota } from '../services/firebase-sync';

const fichaComVida = (n) => ({ vida: { atual: n, max: n } });

beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    useStore.setState({ meuNome: '', mesaId: 'mesaT', fichaDono: '' });
    useStore.getState().resetFicha();
    resetSincronizacaoFicha();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('store: fichaDono', () => {
    it('estado inicial: fichaDono vazio', () => {
        expect(useStore.getState().fichaDono).toBe('');
    });
    it('carregarDadosFicha carimba o dono passado', () => {
        useStore.getState().setMeuNome('Ana');
        useStore.getState().carregarDadosFicha({ nivel: 3, vida: { atual: 9 } }, 'Bia');
        expect(useStore.getState().fichaDono).toBe('Bia');
    });
    it('carregarDadosFicha sem dono usa o nome ativo', () => {
        useStore.getState().setMeuNome('Ana');
        useStore.getState().carregarDadosFicha({ vida: { atual: 9 } });
        expect(useStore.getState().fichaDono).toBe('Ana');
    });
    it('carregarDadosFicha sem dono e sem nome ativo: nao carimba (fica vazio)', () => {
        useStore.getState().carregarDadosFicha({ vida: { atual: 9 } });
        expect(useStore.getState().fichaDono).toBe('');
    });
    it('carregarDadosFicha(null) nao altera nada', () => {
        useStore.setState({ fichaDono: 'X' });
        useStore.getState().carregarDadosFicha(null, 'Y');
        expect(useStore.getState().fichaDono).toBe('X');
    });
    it('resetFicha limpa fichaDono e devolve a ficha padrao', () => {
        useStore.getState().carregarDadosFicha({ vida: { atual: 9 } }, 'Ana');
        useStore.getState().resetFicha();
        expect(useStore.getState().fichaDono).toBe('');
    });
});

describe('store: setMeuNome', () => {
    it('com ficha de outro dono: descarta a ficha (volta a padrao), zera fichaDono e troca o nome', () => {
        const s = useStore.getState();
        s.setMeuNome('Ana');
        s.carregarDadosFicha({ nivel: 7, vida: { atual: 123 } }, 'Ana');
        const padrao = JSON.stringify((() => { useStore.getState().resetFicha(); return useStore.getState().minhaFicha; })());
        useStore.getState().carregarDadosFicha({ nivel: 7, vida: { atual: 123 } }, 'Ana');
        expect(JSON.stringify(useStore.getState().minhaFicha)).not.toBe(padrao);
        useStore.getState().setMeuNome('Bia');
        expect(useStore.getState().meuNome).toBe('Bia');
        expect(useStore.getState().fichaDono).toBe('');
        expect(JSON.stringify(useStore.getState().minhaFicha)).toBe(padrao);
    });
    it('com o MESMO dono: nao descarta e nao chama o gancho', () => {
        const gancho = vi.fn();
        registrarAoDescartarFicha(gancho);
        useStore.getState().setMeuNome('Ana');
        useStore.getState().carregarDadosFicha({ nivel: 7 }, 'Ana');
        const antes = JSON.stringify(useStore.getState().minhaFicha);
        useStore.getState().setMeuNome('Ana');
        expect(gancho).not.toHaveBeenCalled();
        expect(useStore.getState().fichaDono).toBe('Ana');
        expect(JSON.stringify(useStore.getState().minhaFicha)).toBe(antes);
        registrarAoDescartarFicha(() => resetSincronizacaoFicha());
    });
    it('fichaDono vazio (ficha padrao): trocar de nome nao descarta nem chama o gancho', () => {
        const gancho = vi.fn();
        registrarAoDescartarFicha(gancho);
        useStore.getState().setMeuNome('Ana');
        useStore.getState().setMeuNome('Bia');
        expect(gancho).not.toHaveBeenCalled();
        expect(useStore.getState().meuNome).toBe('Bia');
        registrarAoDescartarFicha(() => resetSincronizacaoFicha());
    });
    it('descartar chama o gancho exatamente 1 vez, e depois do nome ja trocado', () => {
        let nomeNoGancho = null;
        const gancho = vi.fn(() => { nomeNoGancho = useStore.getState().meuNome; });
        registrarAoDescartarFicha(gancho);
        useStore.getState().setMeuNome('Ana');
        useStore.getState().carregarDadosFicha({ nivel: 2 }, 'Ana');
        useStore.getState().setMeuNome('Bia');
        expect(gancho).toHaveBeenCalledTimes(1);
        expect(nomeNoGancho).toBe('Bia');
        registrarAoDescartarFicha(() => resetSincronizacaoFicha());
    });
    it('gancho que lanca excecao nao quebra a troca de nome', () => {
        registrarAoDescartarFicha(() => { throw new Error('boom'); });
        useStore.getState().setMeuNome('Ana');
        useStore.getState().carregarDadosFicha({ nivel: 2 }, 'Ana');
        expect(() => useStore.getState().setMeuNome('Bia')).not.toThrow();
        expect(useStore.getState().meuNome).toBe('Bia');
        registrarAoDescartarFicha(() => resetSincronizacaoFicha());
    });
    it('trocar para nome vazio (logout) com ficha de dono tambem descarta', () => {
        useStore.getState().setMeuNome('Ana');
        useStore.getState().carregarDadosFicha({ nivel: 2 }, 'Ana');
        useStore.getState().setMeuNome('');
        expect(useStore.getState().fichaDono).toBe('');
    });
});

describe('integracao store + firebase-sync: troca de personagem nao grava ficha em branco nem ficha alheia', () => {
    it('debounce pendente do personagem antigo e cancelado ao descartar a ficha; rpgFicha_<novo> nao e criado em branco', () => {
        vi.useFakeTimers();
        const s = useStore.getState();
        s.setMeuNome('Ana');
        s.carregarDadosFicha(fichaComVida(80), 'Ana');
        confirmarLeituraRemota({ vida: { atual: 1 } });
        useStore.getState().setMinhaFicha({ ...useStore.getState().minhaFicha, nivel: 99 });
        salvarFichaSilencioso();
        useStore.getState().setMeuNome('Bia'); // descarta + gancho -> resetSincronizacaoFicha cancela o timer
        vi.advanceTimersByTime(2000);
        expect(update).not.toHaveBeenCalled();
        expect(localStorage.getItem('rpgFicha_Bia')).toBeNull();
    });
    it('salvarFirebaseImediato: fichaDono diferente do meuNome nao grava (copia local do nome ativo intacta)', async () => {
        useStore.getState().setMeuNome('Ana');
        useStore.getState().carregarDadosFicha(fichaComVida(80), 'Ana');
        confirmarLeituraRemota({ vida: { atual: 1 } });
        useStore.setState({ meuNome: 'Bia' }); // nome mudou sem passar pelo setMeuNome (corrida)
        confirmarLeituraRemota({ vida: { atual: 1 } });
        await salvarFirebaseImediato();
        expect(update).not.toHaveBeenCalled();
        expect(localStorage.getItem('rpgFicha_Bia')).toBeNull();
    });
    it('salvarFirebaseImediato: dono coincide grava no caminho do dono e na copia local', async () => {
        useStore.getState().setMeuNome('Ana');
        useStore.getState().carregarDadosFicha(fichaComVida(80), 'Ana');
        confirmarLeituraRemota({ vida: { atual: 1 } });
        await salvarFirebaseImediato();
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][0]).toBe('mesas/mesaT/personagens/Ana');
        expect(localStorage.getItem('rpgFicha_Ana')).not.toBeNull();
    });
    it('primeira criacao (fichaDono vazio, nome ativo): grava', async () => {
        useStore.getState().setMeuNome('Nova');
        expect(useStore.getState().fichaDono).toBe('');
        confirmarLeituraRemota(null);
        useStore.getState().setMinhaFicha({ ...useStore.getState().minhaFicha, nivel: 5 });
        await salvarFirebaseImediato();
        expect(update).toHaveBeenCalledTimes(1);
        expect(update.mock.calls[0][0]).toBe('mesas/mesaT/personagens/Nova');
    });
    it('carga tardia: carregarDadosFicha com dono antigo e nome ja trocado fica bloqueada no salvamento', async () => {
        useStore.getState().setMeuNome('Bia');
        useStore.getState().carregarDadosFicha(fichaComVida(80), 'Ana'); // leitura atrasada de Ana chegou depois da troca
        confirmarLeituraRemota({ vida: { atual: 1 } });
        await salvarFirebaseImediato();
        expect(update).not.toHaveBeenCalled();
    });
});
