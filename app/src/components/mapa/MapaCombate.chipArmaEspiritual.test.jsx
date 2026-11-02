import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtaqueArma } from './MapaCombate';
import { AtaqueFormProvider } from '../combate/AtaqueFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn(() => ({ dano: 10, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' })) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montar(ficha, extra = {}) {
    mockState = {
        minhaFicha: { poderes: [], inventario: [], ...ficha },
        meuNome: 'Heroi',
        isMestre: true,
        personagens: {},
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        setAbaAtiva: vi.fn(),
        abaAtiva: 'aba-mapa',
        feedCombate: [],
        alvoSelecionado: null,
        dummies: {},
        efeitosTemp: [], setEfeitosTemp: vi.fn(),
        efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn(),
        itemEditandoId: null, setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [], setEfeitosTempArsenal: vi.fn(),
        efeitosTempPassivosArsenal: [], setEfeitosTempPassivosArsenal: vi.fn(),
        elemEditandoId: null, setElemEditandoId: vi.fn(),
        ignorarTravaAcerto: false,
        setIgnorarTravaAcerto: vi.fn(),
        pastasFechadasMapaTecnicas: {},
        setPastasFechadasMapaTecnicas: vi.fn(),
        ...extra,
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    useStore.getState = () => mockState;
    return render(<AtaqueFormProvider><MapaAtaqueArma /></AtaqueFormProvider>);
}
const chip = (c) => c.queryByText(/\(EA\)/);

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('MapaAtaqueArma - chip (EA)', () => {
    it('aparece com acesso a Arma Espiritual e mostra o nome', () => {
        const c = montar({ armaEspiritual: { acessoArma: true, nome: 'Excalibur' } });
        expect(chip(c)).toBeTruthy();
        expect(chip(c).textContent).toContain('Excalibur');
    });
    it('sem nome usa "Arma Espiritual"', () => {
        const c = montar({ armaEspiritual: { acessoArma: true } });
        expect(chip(c).textContent).toContain('Arma Espiritual (EA)');
    });
    it('NAO aparece sem acesso (acessoArma false, ficha sem EA)', () => {
        expect(chip(montar({ armaEspiritual: { acessoArma: false, nome: 'X' } }))).toBeNull();
        cleanup();
        expect(chip(montar({}))).toBeNull();
    });
    it('padrao e equipada (aria-pressed true); equipada false mostra desligada', () => {
        const c = montar({ armaEspiritual: { acessoArma: true } });
        expect(chip(c).closest('button').getAttribute('aria-pressed')).toBe('true');
        cleanup();
        const d = montar({ armaEspiritual: { acessoArma: true, equipada: false } });
        expect(chip(d).closest('button').getAttribute('aria-pressed')).toBe('false');
    });
    it('clicar desequipa e salva; clicar de novo reequipa', () => {
        const c = montar({ armaEspiritual: { acessoArma: true } });
        act(() => { chip(c).closest('button').click(); });
        expect(mockState.updateFicha).toHaveBeenCalledTimes(1);
        expect(mockState.minhaFicha.armaEspiritual.equipada).toBe(false);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        act(() => { chip(c).closest('button').click(); });
        expect(mockState.minhaFicha.armaEspiritual.equipada).toBe(true);
    });
    it('trancada e nao-Mestre: desabilitado e clique nao altera', () => {
        const c = montar({ armaEspiritual: { acessoArma: true, trancadaParaJogador: true } }, { isMestre: false });
        const b = chip(c).closest('button');
        expect(b.disabled).toBe(true);
        act(() => { b.click(); });
        expect(mockState.updateFicha).not.toHaveBeenCalled();
        expect(mockState.minhaFicha.armaEspiritual.equipada).toBeUndefined();
    });
    it('trancada mas Mestre: habilitado e alterna', () => {
        const c = montar({ armaEspiritual: { acessoArma: true, trancadaParaJogador: true } }, { isMestre: true });
        const b = chip(c).closest('button');
        expect(b.disabled).toBe(false);
        act(() => { b.click(); });
        expect(mockState.minhaFicha.armaEspiritual.equipada).toBe(false);
    });
    it('nao trancada e jogador comum: habilitado', () => {
        const c = montar({ armaEspiritual: { acessoArma: true } }, { isMestre: false });
        expect(chip(c).closest('button').disabled).toBe(false);
    });
});
