import React from 'react';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CombosPanel from './CombosPanel';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';
import { normalizarCombo, normalizarFollowUp, estadoDeCombo, exportarCombos } from '../../core/combos';

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});
vi.mock('../../services/firebase-sync', () => ({ enviarParaFeed: vi.fn(), salvarFichaSilencioso: vi.fn() }));

let state; let ficha;
const buff = (atributo, valor) => ({ atributo, propriedade: 'base', valor });
const combo = normalizarCombo({
    id: 'cmb1', nome: 'Dança das Lâminas',
    iniciador: { nome: 'Corte Rasante', acao: 'padrao', buffs: [buff('dano', 5)] },
    passos: [{ nome: 'Giro', acao: 'bonus', buffs: [buff('dano', 10)] }]
});
const seguir = normalizarFollowUp({ id: 'fu1', nome: 'Perseguição', acao: 'reacao', quando: 'qualquer', niveis: [{ combos: 0, buffs: [buff('dano', 1)] }, { combos: 1, buffs: [buff('dano', 4)] }] });
const acoes = () => ({ padrao: { max: 2, atual: 2, extra: 0 }, bonus: { max: 2, atual: 2, extra: 0 }, reacao: { max: 2, atual: 2, extra: 0 } });

function montar({ combos = [], followUps = [], comboEstado } = {}) {
    ficha = { combos, followUps, acoes: acoes(), poderes: [], ataquesElementais: [], inventario: [], combate: comboEstado ? { comboEstado } : {} };
    state = { minhaFicha: ficha, meuNome: 'Heroi', updateFicha: vi.fn((cb) => cb(ficha)), adicionarAviso: vi.fn() };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    return render(<CombosPanel />);
}

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('CombosPanel - criar', () => {
    it('sem Combos mostra a explicação opcional e deixa criar um novo', () => {
        montar();
        expect(screen.getByText(/É opcional/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Novo Combo/ }));
        expect(screen.getByRole('group', { name: 'Editor de Combo' })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Salvar Combo/ }).disabled).toBe(true);
    });

    it('monta um Combo com iniciador, buff e um golpe e salva na ficha', () => {
        montar();
        fireEvent.click(screen.getByRole('button', { name: /Novo Combo/ }));
        fireEvent.change(screen.getByLabelText('Nome do Combo'), { target: { value: 'Tempestade' } });
        const nomes = screen.getAllByLabelText('Nome do golpe');
        fireEvent.change(nomes[0], { target: { value: 'Abertura' } });
        fireEvent.change(nomes[1], { target: { value: 'Final' } });
        const valores = screen.getAllByLabelText('Valor do buff');
        fireEvent.change(valores[0], { target: { value: '7' } });
        fireEvent.click(screen.getAllByRole('button', { name: /➕ Buff/ })[0]);
        fireEvent.click(screen.getByRole('button', { name: /Salvar Combo/ }));
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(ficha.combos).toHaveLength(1);
        expect(ficha.combos[0]).toMatchObject({ nome: 'Tempestade', iniciador: { nome: 'Abertura' } });
        expect(ficha.combos[0].iniciador.buffs).toEqual([{ nome: '', atributo: 'dano', propriedade: 'base', valor: 7 }]);
        expect(ficha.combos[0].passos[0].nome).toBe('Final');
    });

    it('cancelar a edição não grava nada', () => {
        montar();
        fireEvent.click(screen.getByRole('button', { name: /Novo Combo/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
        expect(ficha.combos).toEqual([]);
        expect(screen.queryByRole('group', { name: 'Editor de Combo' })).toBeNull();
    });
});

describe('CombosPanel - em combate', () => {
    it('inicia um Combo pelo painel, soma os buffs e mostra o próximo golpe', () => {
        montar({ combos: [combo] });
        fireEvent.click(screen.getByRole('button', { name: /Iniciar Dança das Lâminas/ }));
        expect(estadoDeCombo(ficha).ativo).toEqual({ comboId: 'cmb1', passo: 0 });
        expect(enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'sistema' }));
        expect(ficha.acoes.padrao.atual).toBe(1);
    });

    it('com Combo em andamento mostra o próximo, avança e conclui', () => {
        montar({ combos: [combo], comboEstado: { ativo: { comboId: 'cmb1', passo: 0 } } });
        expect(screen.getByText(/Próximo:/).textContent).toMatch(/Giro/);
        fireEvent.click(screen.getByRole('button', { name: /Acertou: Giro/ }));
        expect(estadoDeCombo(ficha)).toMatchObject({ ativo: null, finalizados: 1, concluidos: ['cmb1'] });
    });

    it('interromper perde o Combo em andamento', () => {
        montar({ combos: [combo], comboEstado: { ativo: { comboId: 'cmb1', passo: 0 } } });
        fireEvent.click(screen.getByRole('button', { name: /Interromper Combo/ }));
        expect(estadoDeCombo(ficha).ativo).toBeNull();
        expect(estadoDeCombo(ficha).concluidos).toEqual([]);
    });

    it('lista os buffs ativos e o fim do combate zera tudo', () => {
        montar({ combos: [combo], comboEstado: { ativo: { comboId: 'cmb1', passo: 0 }, finalizados: 3, concluidos: [] } });
        expect(screen.getByText(/dano \(base\) \+5/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /Fim do combate/ }));
        expect(estadoDeCombo(ficha)).toMatchObject({ ativo: null, finalizados: 0 });
    });

    it('Follow Up: mostra o nível, ajusta manualmente e usa pagando a Ação escolhida', () => {
        const r = montar({ followUps: [seguir], comboEstado: { finalizados: 1 } });
        expect(screen.getByText(/Nível 2\/2/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Diminuir o nível de Perseguição' }));
        state = { ...state, minhaFicha: { ...ficha } };
        r.rerender(<CombosPanel />);
        expect(screen.getByText(/Nível 1\/2/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /↪ Usar/ }));
        expect(estadoDeCombo(ficha).followUps.fu1).toEqual({ usos: 1, ativo: true });
        expect(ficha.acoes.reacao.atual).toBe(1);
    });

    it('pergunta antes de gastar uma Ação que não existe mais e respeita a recusa', () => {
        montar({ combos: [combo] });
        ficha.acoes.padrao.atual = 0;
        window.confirm.mockReturnValue(false);
        fireEvent.click(screen.getByRole('button', { name: /Iniciar Dança das Lâminas/ }));
        expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Sem Ação'));
        expect(estadoDeCombo(ficha).ativo).toBeNull();
    });
});

describe('CombosPanel - importar e exportar', () => {
    it('importa o texto exportado de outra ficha, com ids novos', () => {
        montar();
        const pacote = JSON.stringify(exportarCombos({ combos: [combo], followUps: [seguir] }));
        fireEvent.change(screen.getByLabelText('Texto dos Combos (JSON)'), { target: { value: pacote } });
        fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
        expect(ficha.combos).toHaveLength(1);
        expect(ficha.combos[0].id).not.toBe('cmb1');
        expect(ficha.followUps).toHaveLength(1);
    });

    it('texto inválido não importa e mostra o aviso', () => {
        montar();
        fireEvent.change(screen.getByLabelText('Texto dos Combos (JSON)'), { target: { value: 'oi' } });
        fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
        expect(ficha.combos).toEqual([]);
        expect(screen.getByText(/não é um JSON válido/)).toBeTruthy();
    });

    it('exportar coloca o JSON na caixa', () => {
        montar({ combos: [combo] });
        fireEvent.click(screen.getByRole('button', { name: /Exportar os meus/ }));
        expect(screen.getByLabelText('Texto dos Combos (JSON)').value).toContain('"rpg-combos"');
    });
});

describe('CombosPanel - excluir', () => {
    it('excluir um Combo em andamento também interrompe', () => {
        montar({ combos: [combo], comboEstado: { ativo: { comboId: 'cmb1', passo: 0 } } });
        const lista = screen.getByRole('region', { name: 'Meus Combos' });
        fireEvent.click(within(lista).getByRole('button', { name: /Excluir o Combo Dança das Lâminas/ }));
        expect(ficha.combos).toEqual([]);
        expect(estadoDeCombo(ficha).ativo).toBeNull();
    });
});
