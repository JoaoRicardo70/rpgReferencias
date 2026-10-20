import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoderesFormProvider, usePoderesForm } from './PoderesFormContext';
import useStore from '../../stores/useStore';
import { getReacoesDosEfeitos } from '../../core/reacoes';

// QA - Reacao de Poderes/Formas/Habilidades e um EFEITO como qualquer outro (atributo reacao_<gatilho> +
// propriedade = o que faz + valor). O editor NAO tem mais os campos reacaoGatilho/reacaoEfeito/reacaoValor
// nem tipoAcao 'reacao' guarda configuracao.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState; let probe;
function Harness() { probe = usePoderesForm(); return null; }
function montarStore(poderes = [], extra = {}) {
    mockState = {
        minhaFicha: { poderes }, meuNome: 'Heroi', isMestre: true,
        updateFicha: vi.fn((cb) => cb(mockState.minhaFicha)),
        efeitosTemp: [], setEfeitosTemp: vi.fn((v) => { mockState.efeitosTemp = v; }),
        efeitosTempPassivos: [], setEfeitosTempPassivos: vi.fn((v) => { mockState.efeitosTempPassivos = v; }),
        poderEditandoId: null, setPoderEditandoId: vi.fn((id) => { mockState.poderEditandoId = id; }),
        ...extra,
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(mockState) : mockState));
    render(<PoderesFormProvider><Harness /></PoderesFormProvider>);
}
const efR = (gatilho, efeito, valor, nome = 'Reagir') => ({ nome, atributo: `reacao_${gatilho}`, propriedade: efeito, valor });
const base = (over = {}) => ({ id: 1, nome: 'A', categoria: 'poder', ativa: false, efeitos: [], efeitosPassivos: [], ...over });

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

describe('PoderesFormContext - Reacao como efeito', () => {
    it('o editor nao expoe mais os campos reacaoGatilho/reacaoEfeito/reacaoValor', () => {
        montarStore();
        ['reacaoGatilho', 'reacaoEfeito', 'reacaoValor', 'setReacaoGatilho', 'setReacaoEfeito', 'setReacaoValor'].forEach(k => expect(probe[k]).toBeUndefined());
    });

    it.each(['poder', 'habilidade', 'forma'])('criar na aba %s salva o efeito reacao_* ativo como efeito normal, sem campos reacao*', async (aba) => {
        montarStore([], { efeitosTemp: [efR('sempre', 'reduzir_dano', '50')] });
        act(() => { probe.setAbaAtual(aba); probe.setNomePoder('Assassin'); probe.setDescricaoPoder('desc'); });
        await act(async () => { probe.salvarNovoPoder(); });
        const p = mockState.minhaFicha.poderes[0];
        expect(p.efeitos).toEqual([{ nome: 'Reagir', atributo: 'reacao_sempre', propriedade: 'reduzir_dano', valor: '50' }]);
        expect(p).not.toHaveProperty('reacaoGatilho');
        expect(p).not.toHaveProperty('reacaoEfeito');
        expect(p).not.toHaveProperty('reacaoValor');
        p.ativa = true;
        expect(getReacoesDosEfeitos(p)).toEqual([{ indice: 0, gatilho: 'sempre', efeito: 'reduzir_dano', valor: 50 }]);
    });

    it('efeito reacao_* passivo e salvo em efeitosPassivos e vale sem ligar a tecnica', async () => {
        montarStore([], { efeitosTempPassivos: [efR('acertou', 'contra_ataque', '0', 'Instinto')] });
        act(() => { probe.setNomePoder('Bestial'); probe.setDescricaoPoder('desc'); });
        await act(async () => { probe.salvarNovoPoder(); });
        const p = mockState.minhaFicha.poderes[0];
        expect(p.efeitos).toEqual([]);
        expect(p.efeitosPassivos[0]).toMatchObject({ atributo: 'reacao_acertou', propriedade: 'contra_ataque' });
        expect(getReacoesDosEfeitos(p)).toHaveLength(1);
    });

    it('addEfeitoTemp aceita atributo reacao_* com propriedade de reacao', () => {
        montarStore();
        act(() => { probe.setNomeEfeito('Proteger'); probe.setNovoAtr('reacao_aliado'); probe.setNovoProp('aumentar_ca'); probe.setNovoVal('3'); });
        act(() => { probe.addEfeitoTemp(); });
        expect(mockState.setEfeitosTemp).toHaveBeenCalledWith([{ nome: 'Proteger', atributo: 'reacao_aliado', propriedade: 'aumentar_ca', valor: '3' }]);
    });

    it('editarPoder carrega o efeito reacao_* para a lista de efeitos em edicao (copia profunda)', () => {
        const ef = efR('errou', 'atacar_atacante', 0);
        montarStore([base({ efeitos: [ef] })]);
        act(() => { probe.editarPoder(1); });
        expect(mockState.setEfeitosTemp).toHaveBeenLastCalledWith([ef]);
        expect(mockState.setEfeitosTemp.mock.calls.at(-1)[0][0]).not.toBe(ef);
    });

    it('salvar a edicao atualiza os efeitos do mesmo poder (sem duplicar)', async () => {
        montarStore([base({ efeitos: [efR('errou', 'atacar_atacante', 0)] })]);
        act(() => { probe.editarPoder(1); });
        mockState.efeitosTemp = [efR('sempre', 'reduzir_dano', '30')];
        act(() => { probe.setDescricaoPoder('desc'); });
        await act(async () => { probe.salvarNovoPoder(); });
        expect(mockState.minhaFicha.poderes).toHaveLength(1);
        expect(mockState.minhaFicha.poderes[0].id).toBe(1);
        expect(mockState.minhaFicha.poderes[0].efeitos[0]).toMatchObject({ atributo: 'reacao_sempre', propriedade: 'reduzir_dano', valor: '30' });
    });

    it('tipoAcao reacao no Poder nao gera Reacao sozinho (so efeito reacao_*)', async () => {
        montarStore();
        act(() => { probe.setNomePoder('Sem efeito'); probe.setDescricaoPoder('desc'); probe.setTipoAcao('reacao'); });
        await act(async () => { probe.salvarNovoPoder(); });
        const p = mockState.minhaFicha.poderes[0];
        expect(p.tipoAcao).toBe('reacao');
        p.ativa = true;
        expect(getReacoesDosEfeitos(p)).toEqual([]);
    });
});
