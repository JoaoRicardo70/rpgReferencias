import React from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ComboPrompt from './ComboPrompt';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';
import { normalizarCombo, normalizarFollowUp, estadoDeCombo, efeitosDeCombos } from '../../core/combos';

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
    passos: [{ nome: 'Giro', acao: 'bonus', buffs: [buff('dano', 10)] }, { nome: 'Estocada', acao: 'padrao', buffs: [buff('dano', 20)] }]
});
const seguir = normalizarFollowUp({ id: 'fu1', nome: 'Perseguição', acao: 'reacao', quando: 'qualquer', acoesPermitidas: ['reacao', 'bonus'], niveis: [{ combos: 0, buffs: [buff('dano', 3)] }] });
const acoes = () => ({ padrao: { max: 2, atual: 2, extra: 0 }, bonus: { max: 2, atual: 2, extra: 0 }, reacao: { max: 2, atual: 2, extra: 0 } });
const meuAcerto = (over = {}) => ({ tipo: 'acerto', nome: 'Heroi', ts: Date.now(), alvosArea: [{ nome: 'Dummie', acertou: true }], ...over });

function montar({ feed = [], combos = [combo], followUps = [], comboEstado, iniciativa = 5 } = {}) {
    ficha = { combos, followUps, acoes: acoes(), iniciativa, combate: comboEstado ? { comboEstado } : {} };
    state = {
        feedCombate: feed, meuNome: 'Heroi', minhaFicha: ficha,
        updateFicha: vi.fn((cb) => cb(ficha)), adicionarAviso: vi.fn()
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    return render(<ComboPrompt />);
}
const dialogo = () => screen.queryByRole('dialog');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('ComboPrompt - quando abre', () => {
    it('golpe meu que acerta abre com o iniciador do Combo', () => {
        montar({ feed: [meuAcerto()] });
        expect(dialogo()).not.toBeNull();
        expect(screen.getByText(/Iniciar o Combo "Dança das Lâminas" com Corte Rasante/)).toBeTruthy();
    });

    it('quem não criou Combos nunca vê o aviso', () => {
        montar({ feed: [meuAcerto()], combos: [], followUps: [] });
        expect(dialogo()).toBeNull();
    });

    it('golpe de outra pessoa, histórico antigo e golpe que errou não abrem', () => {
        montar({ feed: [meuAcerto({ nome: 'Vilao' })] });
        expect(dialogo()).toBeNull();
        cleanup();
        montar({ feed: [meuAcerto({ ts: Date.now() - 60000 })] });
        expect(dialogo()).toBeNull();
        cleanup();
        montar({ feed: [meuAcerto({ alvosArea: [{ nome: 'Dummie', acertou: false }] })] });
        expect(dialogo()).toBeNull();
    });

    it('golpe que errou com um Combo em andamento só avisa para interromper', () => {
        montar({ feed: [meuAcerto({ alvosArea: [{ nome: 'D', acertou: false }] })], comboEstado: { ativo: { comboId: 'cmb1', passo: 0 } } });
        expect(dialogo()).toBeNull();
        expect(state.adicionarAviso).toHaveBeenCalledWith(expect.stringContaining('errou'), 'alerta');
    });

    it('sem alvo marcado ainda pergunta (o jogador confirma)', () => {
        montar({ feed: [meuAcerto({ alvosArea: [] })] });
        expect(dialogo()).not.toBeNull();
    });
});

describe('ComboPrompt - escolhas', () => {
    it('confirmar o iniciador começa o Combo, soma o buff, gasta a Ação e avisa no feed', () => {
        montar({ feed: [meuAcerto()] });
        fireEvent.click(screen.getByRole('radio'));
        fireEvent.click(screen.getByRole('button', { name: /CONFIRMAR/ }));
        expect(estadoDeCombo(ficha).ativo).toEqual({ comboId: 'cmb1', passo: 0 });
        expect(efeitosDeCombos(ficha).filter(e => e.atributo === 'dano').reduce((s, e) => s + e.valor, 0)).toBe(5);
        expect(ficha.acoes.padrao.atual).toBe(1);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'sistema', texto: expect.stringContaining('iniciou o Combo') }));
        expect(dialogo()).toBeNull();
    });

    it('com Combo em andamento oferece o próximo golpe e ele avança (gastando Ação Bônus)', () => {
        montar({ feed: [meuAcerto()], comboEstado: { ativo: { comboId: 'cmb1', passo: 0 } } });
        expect(screen.getByText(/Golpe 2 do Combo "Dança das Lâminas": Giro/)).toBeTruthy();
        expect(screen.queryByText(/Iniciar o Combo/)).toBeNull();
        fireEvent.click(screen.getByRole('radio'));
        fireEvent.click(screen.getByRole('button', { name: /CONFIRMAR/ }));
        expect(estadoDeCombo(ficha).ativo.passo).toBe(1);
        expect(ficha.acoes.bonus.atual).toBe(1);
    });

    it('o último golpe conclui o Combo e os buffs ficam no máximo', () => {
        montar({ feed: [meuAcerto()], comboEstado: { ativo: { comboId: 'cmb1', passo: 1 } } });
        expect(screen.getByText(/conclui o Combo/)).toBeTruthy();
        fireEvent.click(screen.getByRole('radio'));
        fireEvent.click(screen.getByRole('button', { name: /CONFIRMAR/ }));
        const e = estadoDeCombo(ficha);
        expect(e.ativo).toBeNull();
        expect(e.finalizados).toBe(1);
        expect(efeitosDeCombos(ficha).filter(x => x.atributo === 'dano').reduce((s, x) => s + x.valor, 0)).toBe(35);
    });

    it('desmarcar "gastar" registra o progresso sem cobrar Ação', () => {
        montar({ feed: [meuAcerto()] });
        fireEvent.click(screen.getByRole('radio'));
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: /CONFIRMAR/ }));
        expect(ficha.acoes.padrao.atual).toBe(2);
        expect(estadoDeCombo(ficha).ativo).not.toBeNull();
    });

    it('Follow Up deixa escolher com que Ação pagar', () => {
        montar({ feed: [meuAcerto()], combos: [], followUps: [seguir] });
        fireEvent.click(screen.getByRole('radio'));
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bonus' } });
        fireEvent.click(screen.getByRole('button', { name: /CONFIRMAR/ }));
        expect(ficha.acoes.bonus.atual).toBe(1);
        expect(ficha.acoes.reacao.atual).toBe(2);
        expect(efeitosDeCombos(ficha).some(e => e.valor === 3)).toBe(true);
    });

    it('"Foi um golpe comum" fecha sem mudar nada', () => {
        montar({ feed: [meuAcerto()] });
        fireEvent.click(screen.getByRole('button', { name: /golpe comum/ }));
        expect(dialogo()).toBeNull();
        expect(estadoDeCombo(ficha).ativo).toBeNull();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('o botão Confirmar só vale com uma escolha', () => {
        montar({ feed: [meuAcerto()] });
        expect(screen.getByRole('button', { name: /CONFIRMAR/ }).disabled).toBe(true);
    });
});

describe('ComboPrompt - fim do combate', () => {
    it('quando a iniciativa volta a 0 os Combos zeram', () => {
        const r = montar({ comboEstado: { ativo: { comboId: 'cmb1', passo: 1 }, finalizados: 2, concluidos: ['cmb1'] }, iniciativa: 7 });
        expect(state.updateFicha).not.toHaveBeenCalled();
        ficha.iniciativa = 0;
        state = { ...state, minhaFicha: { ...ficha } };
        r.rerender(<ComboPrompt />);
        expect(state.updateFicha).toHaveBeenCalled();
        expect(estadoDeCombo(ficha)).toMatchObject({ ativo: null, finalizados: 0, concluidos: [] });
    });
});
