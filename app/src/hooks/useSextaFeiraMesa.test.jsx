import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const listeners = {};
const unsubs = [];
const mockSet = vi.fn();

vi.mock('firebase/database', () => ({
    ref: vi.fn((db, path) => path),
    query: vi.fn((r) => r),
    limitToLast: vi.fn((n) => ({ limitToLast: n })),
    onValue: vi.fn((path, cb) => {
        listeners[path] = cb;
        const un = vi.fn();
        unsubs.push(un);
        return un;
    }),
    set: (...args) => mockSet(...args),
}));
vi.mock('../services/firebase-config', () => ({ db: {}, functions: {}, auth: {} }));

import useSextaFeiraMesa from './useSextaFeiraMesa';
import useStore, { loreCapitulosPresentePadrao, loreCapitulosFuturoPadrao } from '../stores/useStore';

const snap = (v) => ({ val: () => v });
const pathReg = (m) => `mesas/${m}/sextaFeira/registros`;
const pathCfg = (m) => `mesas/${m}/sextaFeira/config`;
const remoto = (titulo = 'Remoto') => ({
    presente: [{ id: 5, titulo, arcos: [{ id: 51, titulo: 'A', texto: 'txt' }], tierList: [] }],
    futuro: [{ id: 6, titulo: 'F', arcos: [{ id: 61, titulo: 'FA', texto: 'fut' }], tierList: [] }],
});
const editarLore = (texto) => act(() => {
    const st = useStore.getState();
    const caps = st.loreCapitulosPresente.map(c => ({ ...c, arcos: c.arcos.map(a => ({ ...a, texto })) }));
    st.setLoreCapitulosPresente(caps);
});

beforeEach(() => {
    vi.useFakeTimers();
    Object.keys(listeners).forEach(k => delete listeners[k]);
    unsubs.length = 0;
    mockSet.mockReset();
    mockSet.mockResolvedValue(undefined);
    localStorage.clear();
    useStore.setState({
        mesaId: 'M1', isMestre: true, meuNome: 'Mestre', sextaFeiraConfig: null, registrosCompartilhados: false,
        loreCapitulosPresente: loreCapitulosPresentePadrao, loreCapitulosFuturo: loreCapitulosFuturoPadrao,
        loreCapituloAtivoId: 1, loreArcoAtivoIdPresente: 11, loreCapFuturoAtivoId: 100, loreArcoAtivoIdFuturo: 101,
    });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useSextaFeiraMesa - config', () => {
    it('listener de config atualiza o store e limpa no unmount', () => {
        const { unmount } = renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathCfg('M1')](snap({ chaveGemini: 'k', modelo: 'm' })));
        expect(useStore.getState().sextaFeiraConfig).toEqual({ chaveGemini: 'k', modelo: 'm' });
        act(() => listeners[pathCfg('M1')](snap(null)));
        expect(useStore.getState().sextaFeiraConfig).toBeNull();
        act(() => listeners[pathCfg('M1')](snap({ chaveGemini: 'k' })));
        unmount();
        expect(useStore.getState().sextaFeiraConfig).toBeNull();
        unsubs.forEach(u => expect(u).toHaveBeenCalled());
    });
    it('sem mesa nao registra listeners', () => {
        useStore.setState({ mesaId: '' });
        renderHook(() => useSextaFeiraMesa());
        expect(Object.keys(listeners)).toHaveLength(0);
    });
});

describe('useSextaFeiraMesa - registros remotos', () => {
    it('aplica registros normalizados e marca compartilhado, corrigindo ids ativos', () => {
        useStore.setState({ isMestre: false });
        renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap({
            presente: { 0: { id: 5, titulo: 'Remoto', arcos: { 0: { id: 51, titulo: 'A', texto: 'txt' } } } },
            futuro: { 0: { id: 6, titulo: 'F' } },
        })));
        const s = useStore.getState();
        expect(s.registrosCompartilhados).toBe(true);
        expect(s.loreCapitulosPresente[0].titulo).toBe('Remoto');
        expect(s.loreCapitulosPresente[0].tierList).toEqual([]);
        expect(s.loreCapituloAtivoId).toBe(5);
        expect(s.loreArcoAtivoIdPresente).toBe(51);
        expect(s.loreCapFuturoAtivoId).toBe(6);
        expect(s.loreArcoAtivoIdFuturo).toBe(6001);
    });
    it('cria backup local uma unica vez', () => {
        localStorage.setItem('rpgSextaFeira_capitulos', 'ORIGINAL');
        useStore.setState({ isMestre: false });
        renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap(remoto())));
        const b1 = localStorage.getItem('rpgSextaFeira_backupLocal');
        expect(JSON.parse(b1).presente).toBe('ORIGINAL');
        localStorage.setItem('rpgSextaFeira_capitulos', 'OUTRO');
        act(() => listeners[pathReg('M1')](snap(remoto('Novo'))));
        expect(localStorage.getItem('rpgSextaFeira_backupLocal')).toBe(b1);
    });
    it('remoto so com futuro mantem presente padrao', () => {
        useStore.setState({ isMestre: false });
        renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap({ futuro: remoto().futuro })));
        expect(useStore.getState().loreCapitulosPresente).toEqual(loreCapitulosPresentePadrao);
        expect(useStore.getState().registrosCompartilhados).toBe(true);
    });
});

describe('useSextaFeiraMesa - gravacao pelo Mestre', () => {
    it('grava edicao apos 800ms de debounce (agrupando edicoes)', () => {
        renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap(remoto())));
        mockSet.mockClear();
        editarLore('um');
        act(() => { vi.advanceTimersByTime(500); });
        editarLore('dois');
        act(() => { vi.advanceTimersByTime(799); });
        expect(mockSet).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(1); });
        expect(mockSet).toHaveBeenCalledTimes(1);
        const [path, payload] = mockSet.mock.calls[0];
        expect(path).toBe(pathReg('M1'));
        expect(payload.presente[0].arcos[0].texto).toBe('dois');
        expect(payload.atualizadoPor).toBe('Mestre');
        expect(typeof payload.atualizadoEm).toBe('number');
    });
    it('nao grava o eco do que acabou de chegar nem estado inalterado', () => {
        renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap(remoto())));
        act(() => { vi.advanceTimersByTime(5000); });
        expect(mockSet).not.toHaveBeenCalled();
        // edita e volta ao mesmo conteudo antes do debounce
        const original = useStore.getState().loreCapitulosPresente;
        act(() => useStore.getState().setLoreCapitulosPresente([...original.map(c => ({ ...c }))]));
        act(() => { vi.advanceTimersByTime(5000); });
        expect(mockSet).not.toHaveBeenCalled();
    });
    it('nao regrava depois de gravar o mesmo conteudo', () => {
        renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap(remoto())));
        editarLore('x');
        act(() => { vi.advanceTimersByTime(800); });
        expect(mockSet).toHaveBeenCalledTimes(1);
        // eco do proprio dado
        const gravado = mockSet.mock.calls[0][1];
        act(() => listeners[pathReg('M1')](snap(gravado)));
        act(() => { vi.advanceTimersByTime(5000); });
        expect(mockSet).toHaveBeenCalledTimes(1);
    });
    it('nao-Mestre nunca grava', () => {
        useStore.setState({ isMestre: false });
        renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap(remoto())));
        editarLore('hack');
        act(() => { vi.advanceTimersByTime(5000); });
        act(() => listeners[pathReg('M1')](snap(null)));
        act(() => { vi.advanceTimersByTime(5000); });
        expect(mockSet).not.toHaveBeenCalled();
    });
    it('bootstrap: mesa sem Registros recebe a lore local do Mestre', () => {
        renderHook(() => useSextaFeiraMesa());
        editarLore('lore local');
        act(() => listeners[pathReg('M1')](snap(null)));
        expect(mockSet).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(800); });
        expect(mockSet).toHaveBeenCalledTimes(1);
        expect(mockSet.mock.calls[0][1].presente[0].arcos[0].texto).toBe('lore local');
        expect(useStore.getState().registrosCompartilhados).toBe(false);
    });
    it('nao grava antes do primeiro snapshot remoto chegar', () => {
        renderHook(() => useSextaFeiraMesa());
        editarLore('cedo');
        act(() => { vi.advanceTimersByTime(5000); });
        expect(mockSet).not.toHaveBeenCalled();
    });
    it('trocar para mesa sem Registros reseta aos padroes e nao sobe a lore da outra mesa', () => {
        const { rerender } = renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap(remoto('Da M1'))));
        expect(useStore.getState().loreCapitulosPresente[0].titulo).toBe('Da M1');
        mockSet.mockClear();
        act(() => useStore.setState({ mesaId: 'M2' }));
        rerender();
        expect(useStore.getState().registrosCompartilhados).toBe(false);
        act(() => listeners[pathReg('M2')](snap(null)));
        act(() => { vi.advanceTimersByTime(5000); });
        const s = useStore.getState();
        expect(s.loreCapitulosPresente).toEqual(loreCapitulosPresentePadrao);
        expect(s.loreCapitulosFuturo).toEqual(loreCapitulosFuturoPadrao);
        expect(s.registrosCompartilhados).toBe(false);
        expect(mockSet).not.toHaveBeenCalled();
        // primeira edicao do Mestre cria os Registros da M2
        editarLore('nova M2');
        act(() => { vi.advanceTimersByTime(800); });
        expect(mockSet).toHaveBeenCalledTimes(1);
        expect(mockSet.mock.calls[0][0]).toBe(pathReg('M2'));
    });
    it('gravacao que falha (rejeicao) nao entra em laco de reenvio', async () => {
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockSet.mockRejectedValue(new Error('permission_denied'));
        renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap(remoto())));
        editarLore('vai falhar');
        await act(async () => { vi.advanceTimersByTime(800); });
        expect(mockSet).toHaveBeenCalledTimes(1);
        expect(erro).toHaveBeenCalled();
        // o banco desfaz: listener dispara com dado antigo (sem Registros)
        await act(async () => { listeners[pathReg('M1')](snap(null)); });
        await act(async () => { vi.advanceTimersByTime(10000); });
        expect(mockSet).toHaveBeenCalledTimes(1);
        // nova edicao de verdade tenta de novo
        editarLore('outra tentativa');
        await act(async () => { vi.advanceTimersByTime(800); });
        expect(mockSet).toHaveBeenCalledTimes(2);
        erro.mockRestore();
    });
    it('set que lanca sincronamente tambem nao gera laco', () => {
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockSet.mockImplementation(() => { throw new Error('boom'); });
        renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap(remoto())));
        editarLore('x');
        act(() => { vi.advanceTimersByTime(800); });
        act(() => listeners[pathReg('M1')](snap(null)));
        act(() => { vi.advanceTimersByTime(10000); });
        expect(mockSet).toHaveBeenCalledTimes(1);
        erro.mockRestore();
    });
    it('unmount com edicao pendente grava uma vez e para de escutar', () => {
        const { unmount } = renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap(remoto())));
        editarLore('pendente');
        unmount();
        expect(mockSet).toHaveBeenCalledTimes(1);
        act(() => { vi.advanceTimersByTime(5000); });
        expect(mockSet).toHaveBeenCalledTimes(1);
    });
    it('deixar de ser Mestre com edicao pendente nao grava', () => {
        const { rerender } = renderHook(() => useSextaFeiraMesa());
        act(() => listeners[pathReg('M1')](snap(remoto())));
        editarLore('pendente');
        act(() => useStore.setState({ isMestre: false }));
        rerender();
        act(() => { vi.advanceTimersByTime(5000); });
        expect(mockSet).not.toHaveBeenCalled();
    });
});
