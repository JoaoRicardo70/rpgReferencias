import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClassificacaoPanel from './ClassificacaoPanel';
import useStore from '../../stores/useStore';
import { aplicarModeloNaFicha } from '../../core/modelosPoder';

// QA - ClassificacaoPanel (Marcadores & Adaptacao): linha "Verg Avesta controla o crescimento" so com poder Verg que LIGOU o mUnico automatico.
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn() }));

function montar(ficha) {
    const estado = { minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)), isMestre: false };
    useStore.mockImplementation((sel) => (sel ? sel(estado) : estado));
    return estado;
}
const irParaAdaptacao = () => fireEvent.change(screen.getByRole('combobox'), { target: { value: 'acumulativo' } });
const verg = (adaptacao, origem, extra = {}) => ({ id: 'v1', nome: 'Verg Avesta', modelo: { id: 'vergAvesta', partes: ['acumuloDeDano', 'crescimentoAdaptacao'], params: {}, ...(adaptacao ? { adaptacao } : {}) }, ...(origem ? { origem } : {}), ...extra });
const nota = () => screen.queryByText(/Verg Avesta \(origem/);
const abrir = (ficha) => { montar(ficha); render(<ClassificacaoPanel />); irParaAdaptacao(); };

describe('ClassificacaoPanel: linha da Adaptacao controlada pelo Verg Avesta', () => {
    beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
    afterEach(cleanup);

    it('sem poderes: sem a linha', () => {
        abrir({ combate: {}, poderes: [] });
        expect(nota()).toBeNull();
    });
    it('poderes ausente / nao-array / itens nulos nao quebram e nao mostram a linha', () => {
        for (const poderes of [undefined, null, 'x', 5, {}, [null, undefined, 3]]) {
            cleanup();
            expect(() => abrir({ combate: {}, poderes })).not.toThrow();
            expect(nota()).toBeNull();
        }
    });
    it('Verg SEM adaptacao registrada (parte desmarcada / poder antigo): sem a linha', () => {
        abrir({ combate: { adaptacaoLigada: true }, poderes: [verg(null, { tipo: 'herdada', fonte: 'Reid' })] });
        expect(nota()).toBeNull();
    });
    it('adaptacao.ligou false (interruptor ja estava ligado a mao): sem a linha', () => {
        abrir({ combate: { adaptacaoLigada: true, adaptacaoFracao: 5 }, poderes: [verg({ ligou: false, fracao: 5 }, { tipo: 'herdada', fonte: 'Reid' })] });
        expect(nota()).toBeNull();
    });
    it.each(['true', 1, 'sim', null, undefined])('adaptacao.ligou %j (nao e exatamente true): sem a linha', (v) => {
        abrir({ combate: { adaptacaoLigada: true }, poderes: [verg({ ligou: v, fracao: 5 })] });
        expect(nota()).toBeNull();
    });
    it('modelo de outro id com adaptacao.ligou: sem a linha', () => {
        const p = verg({ ligou: true, fracao: 5 }); p.modelo.id = 'egoSuperior';
        abrir({ combate: { adaptacaoLigada: true }, poderes: [p] });
        expect(nota()).toBeNull();
    });
    it('ligou true + origem herdada: mostra ser de origem e a taxa', () => {
        abrir({ combate: { adaptacaoLigada: true, adaptacaoFracao: 5 }, poderes: [verg({ ligou: true, fracao: 5 }, { tipo: 'herdada', fonte: 'Reid' })] });
        const el = nota();
        expect(el).not.toBeNull();
        expect(el.textContent).toBe('🧬 Verg Avesta (origem: herdada de Reid) controla a Adaptação: fração de 5% da diferença');
    });
    it('origem herdada sem fonte ou sem origem: "herdada de um ser"', () => {
        abrir({ combate: { adaptacaoLigada: true, adaptacaoFracao: 5 }, poderes: [verg({ ligou: true, fracao: 5 }, { tipo: 'herdada', fonte: '' })] });
        expect(nota().textContent).toContain('origem: herdada de um ser');
        cleanup();
        abrir({ combate: { adaptacaoLigada: true, adaptacaoFracao: 5 }, poderes: [verg({ ligou: true, fracao: 5 })] });
        expect(nota().textContent).toContain('origem: herdada de um ser');
    });
    it('origem independente: "independente" (sem "herdada")', () => {
        abrir({ combate: { adaptacaoLigada: true, adaptacaoFracao: 5 }, poderes: [verg({ ligou: true, fracao: 5 }, { tipo: 'independente', fonte: '' })] });
        expect(nota().textContent).toContain('origem: independente');
        expect(nota().textContent).not.toContain('herdada');
    });
    it('mostra o adaptacaoFracao ATUAL (editado a mao, decimal em pt-BR), nao a taxa registrada no modelo', () => {
        abrir({ combate: { adaptacaoLigada: true, adaptacaoFracao: 12.5 }, poderes: [verg({ ligou: true, fracao: 5 }, { tipo: 'independente' })] });
        expect(nota().textContent).toContain('fração de 12,5% da diferença');
        expect(nota().textContent).not.toContain('fração de 5% da diferença');
    });
    it('adaptacaoFracao ausente: usa o padrao 50 da tela', () => {
        abrir({ combate: { adaptacaoLigada: true }, poderes: [verg({ ligou: true, fracao: 9 }, { tipo: 'independente' })] });
        expect(nota().textContent).toContain('fração de 50% da diferença');
    });
    it('mesmo com o interruptor desligado depois, a linha continua informando (e so informativa)', () => {
        const est = montar({ combate: { adaptacaoLigada: false, adaptacaoFracao: 7 }, poderes: [verg({ ligou: true, fracao: 7 }, { tipo: 'independente' })] });
        render(<ClassificacaoPanel />); irParaAdaptacao();
        expect(nota()).not.toBeNull();
        expect(est.updateFicha).not.toHaveBeenCalled(); // renderizar nao grava
    });
    it('varios poderes: acha o Verg que ligou mesmo atras de outros poderes', () => {
        abrir({ combate: { adaptacaoLigada: true, adaptacaoFracao: 5 }, poderes: [{ id: 'x', nome: 'Outro' }, verg({ ligou: false, fracao: 5 }), { ...verg({ ligou: true, fracao: 5 }, { tipo: 'herdada', fonte: 'Aria' }), id: 'v2' }] });
        expect(nota().textContent).toContain('herdada de Aria');
    });
    it('o interruptor e o campo da taxa continuam existindo e editaveis a mao', () => {
        abrir({ combate: { adaptacaoLigada: true, adaptacaoFracao: 5 }, poderes: [verg({ ligou: true, fracao: 5 }, { tipo: 'independente' })] });
        expect(screen.getByLabelText(/Ligar Adaptação/)).toBeTruthy();
        expect(screen.getByLabelText(/Ligar Adaptação/).checked).toBe(true);
    });
    it('ponta a ponta: aplicar o modelo na ficha liga a linha; desmarcar a parte (ficha desligada pelo modelo) some', () => {
        const ficha = { combate: { adaptacaoLigada: false }, poderes: [], contadores: [] };
        aplicarModeloNaFicha(ficha, { isMestre: true, modeloId: 'vergAvesta', selecao: ['acumuloDeDano', 'crescimentoAdaptacao'], params: { fracaoDaDiferenca: 8 }, opcoes: { origem: { tipo: 'herdada', fonte: 'Verg' } }, id: 'p1' });
        abrir(ficha);
        expect(nota().textContent).toBe('🧬 Verg Avesta (origem: herdada de Verg) controla a Adaptação: fração de 8% da diferença');
        cleanup();
        aplicarModeloNaFicha(ficha, { isMestre: true, modeloId: 'vergAvesta', selecao: ['acumuloDeDano'], params: {}, id: 'p1' });
        abrir(ficha);
        expect(nota()).toBeNull();
    });
});
