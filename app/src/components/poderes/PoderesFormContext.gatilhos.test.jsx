import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';

// Gatilhos no editor de Poderes: salvar, editar, remover, ficha antiga e o interruptor do Mestre.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
    enviarParaFeed: vi.fn(),
}));

let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__U__' : v)).includes('__U__');

function montar(poderes = [], isMestre = false) {
    mockState = {
        minhaFicha: { poderes }, meuNome: 'Heroi', isMestre,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn(), efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null, setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    return render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Poderes - gatilhos no editor', () => {
    it('cria um Poder com gatilho (normalizado, sem undefined), edita e remove', async () => {
        montar();
        act(() => { probe.setAbaAtual('poder'); probe.setNomePoder('Tec'); probe.setDescricaoPoder('d'); probe.setGatilhosPoder([NEGAR, { nome: 'lixo', evento: { tipo: 'xyz' }, acoes: [] }]); });
        await act(async () => { probe.salvarNovoPoder(); });
        const p = mockState.minhaFicha.poderes[0];
        expect(p.gatilhos).toHaveLength(1);
        expect(p.gatilhos[0]).toMatchObject({ id: 'nm', fase: 'antes', modo: 'automatico' });
        expect(semUndefined(p)).toBe(true);
        act(() => { probe.editarPoder(p.id); });
        expect(probe.gatilhosPoder).toHaveLength(1);
        act(() => { probe.setGatilhosPoder([]); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect('gatilhos' in mockState.minhaFicha.poderes[0]).toBe(false);
    });
    it('Poder sem gatilhos (ficha antiga) salva sem criar a chave', async () => {
        montar();
        act(() => { probe.setAbaAtual('poder'); probe.setNomePoder('Tec'); probe.setDescricaoPoder('d'); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect('gatilhos' in mockState.minhaFicha.poderes[0]).toBe(false);
    });
    it('Mestre desliga e religa um gatilho (mestreDesligou)', () => {
        montar([{ id: 1, nome: 'P', categoria: 'poder', ativa: true, efeitos: [], efeitosPassivos: [], gatilhos: [NEGAR] }], true);
        act(() => { probe.alternarGatilhoMestre(1, 'nm'); });
        expect(mockState.minhaFicha.poderes[0].gatilhos[0].mestreDesligou).toBe(true);
        act(() => { probe.alternarGatilhoMestre(1, 'nm'); });
        expect('mestreDesligou' in mockState.minhaFicha.poderes[0].gatilhos[0]).toBe(false);
    });
});

describe('Poderes - alternarGatilhoMestre exige Mestre', () => {
    it('jogador comum nao consegue desligar o gatilho pelo callback', () => {
        montar([{ id: 1, nome: 'P', categoria: 'poder', ativa: true, efeitos: [], efeitosPassivos: [], gatilhos: [NEGAR] }], false);
        act(() => { probe.alternarGatilhoMestre(1, 'nm'); });
        expect('mestreDesligou' in mockState.minhaFicha.poderes[0].gatilhos[0]).toBe(false);
    });
});
