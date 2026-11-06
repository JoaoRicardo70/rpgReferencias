import React, { useState, useCallback } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaCondicoesEElementais } from './FichaSubComponents';
import { useFichaForm } from './FichaFormContext';
import {
    adicionarContador, removerContador, atualizarContador, mudarContador, LIMITE_CONTADORES,
} from '../../core/contadores';
import { normalizarEstagios } from '../../core/estagios';

// ---------------------------------------------------------------------------
// QA — seção "🔢 Contadores" de FichaCondicoesEElementais. useFichaForm é mockado, mas os
// handlers do contexto são reproduzidos com as funções puras REAIS de core/contadores.js
// (mesma ligação feita em FichaFormContext.jsx), sobre um estado React que re-renderiza.
// ---------------------------------------------------------------------------

vi.mock('./FichaFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useFichaForm: vi.fn() };
});

let fichaAtual;
let idSeq;

function Harness({ inicial }) {
    const [ficha, setFicha] = useState(inicial);
    const mutar = useCallback((fn) => setFicha(prev => { const c = structuredClone(prev); fn(c); return c; }), []);
    const ctx = {
        minhaFicha: ficha,
        modificarCondicao: vi.fn(), removerBuffTemporario: vi.fn(), toggleAfinidade: vi.fn(),
        condicoesDinamicas: [], elementosDinamicos: [], adicionarReducaoDano: vi.fn(),
        adicionarContadorFicha: () => mutar(f => { adicionarContador(f, { id: `t${++idSeq}` }); }),
        removerContadorFicha: (id) => mutar(f => { removerContador(f, id); }),
        atualizarContadorFicha: (id, patch) => mutar(f => { atualizarContador(f, id, patch); }),
        mudarContadorFicha: (id, d) => mutar(f => { mudarContador(f, id, d); }),
    };
    fichaAtual = ficha;
    useFichaForm.mockReturnValue(ctx);
    return <FichaCondicoesEElementais />;
}

const poderEst = (id, nome, extra = {}) => ({
    id, nome, categoria: 'poder', ativa: false, estagioAtual: 1, efeitos: [], efeitosPassivos: [],
    estagios: normalizarEstagios({ habilitado: true, maximo: 5, crescimento: 100 }), ...extra,
});

function montar(ficha = {}) {
    return render(<Harness inicial={{ contadores: [], poderes: [], condicoes: [], ...ficha }} />);
}
const ct = (extra = {}) => ({ id: 'a', nome: 'Arco', valor: 0, min: 0, max: 3, ...extra });
const blur = (el, valor) => { fireEvent.change(el, { target: { value: valor } }); fireEvent.blur(el); };

describe('FichaCondicoesEElementais — seção Contadores', () => {
    beforeEach(() => { idSeq = 0; vi.clearAllMocks(); });
    afterEach(() => { cleanup(); });

    it('mostra o título, a dica e o botão "+ Contador" sem contadores', () => {
        montar();
        expect(screen.getByText('🔢 Contadores')).toBeTruthy();
        expect(screen.getByText('+ Contador')).toBeTruthy();
        expect(screen.queryByLabelText('Nome do contador')).toBeNull();
    });

    it('renderiza sem quebrar quando ficha.contadores não existe', () => {
        render(<Harness inicial={{ poderes: [] }} />);
        expect(screen.getByText('+ Contador')).toBeTruthy();
    });

    it('clicar em "+ Contador" cria um contador padrão (nome Contador, valor 0, 0 a 5)', () => {
        montar();
        fireEvent.click(screen.getByText('+ Contador'));
        expect(screen.getByLabelText('Nome do contador').value).toBe('Contador');
        expect(screen.getByLabelText('Valor de Contador').textContent).toBe('0');
        expect(screen.getByLabelText('Mínimo de Contador').value).toBe('0');
        expect(screen.getByLabelText('Máximo de Contador').value).toBe('5');
        expect(fichaAtual.contadores).toHaveLength(1);
    });

    it('+ e − mudam o valor', () => {
        montar({ contadores: [ct()] });
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        expect(screen.getByLabelText('Valor de Arco').textContent).toBe('2');
        fireEvent.click(screen.getByLabelText('Diminuir Arco'));
        expect(screen.getByLabelText('Valor de Arco').textContent).toBe('1');
        expect(fichaAtual.contadores[0].valor).toBe(1);
    });

    it('− fica desabilitado no mínimo e + no máximo', () => {
        montar({ contadores: [ct({ valor: 0 })] });
        expect(screen.getByLabelText('Diminuir Arco').disabled).toBe(true);
        expect(screen.getByLabelText('Aumentar Arco').disabled).toBe(false);
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        expect(screen.getByLabelText('Valor de Arco').textContent).toBe('3');
        expect(screen.getByLabelText('Aumentar Arco').disabled).toBe(true);
        expect(screen.getByLabelText('Diminuir Arco').disabled).toBe(false);
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        expect(fichaAtual.contadores[0].valor).toBe(3);
    });

    it('editar o nome por blur salva; blur sem mudança não chama o handler', () => {
        montar({ contadores: [ct()] });
        const nome = screen.getByLabelText('Nome do contador');
        fireEvent.blur(nome);
        expect(fichaAtual.contadores[0].nome).toBe('Arco');
        blur(nome, 'Poeira');
        expect(fichaAtual.contadores[0].nome).toBe('Poeira');
        expect(screen.getByLabelText('Valor de Poeira')).toBeTruthy();
    });

    it('nome apagado volta a "Contador"', () => {
        montar({ contadores: [ct()] });
        blur(screen.getByLabelText('Nome do contador'), '   ');
        expect(fichaAtual.contadores[0].nome).toBe('Contador');
        expect(screen.getByLabelText('Nome do contador').value).toBe('Contador');
    });

    it('editar o máximo por blur reabilita o + e prende o valor ao reduzir', () => {
        montar({ contadores: [ct({ valor: 3 })] });
        expect(screen.getByLabelText('Aumentar Arco').disabled).toBe(true);
        blur(screen.getByLabelText('Máximo de Arco'), '8');
        expect(fichaAtual.contadores[0].max).toBe(8);
        expect(screen.getByLabelText('Aumentar Arco').disabled).toBe(false);
        blur(screen.getByLabelText('Máximo de Arco'), '1');
        expect(fichaAtual.contadores[0]).toMatchObject({ max: 1, valor: 1 });
        expect(screen.getByLabelText('Valor de Arco').textContent).toBe('1');
    });

    it('editar o mínimo por blur sobe o valor se ele ficar abaixo', () => {
        montar({ contadores: [ct({ valor: 1 })] });
        blur(screen.getByLabelText('Mínimo de Arco'), '2');
        expect(fichaAtual.contadores[0]).toMatchObject({ min: 2, valor: 2 });
        expect(screen.getByLabelText('Diminuir Arco').disabled).toBe(true);
    });

    it('mínimo maior que o máximo troca os dois; campo apagado não quebra e mantém min <= max', () => {
        montar({ contadores: [ct()] });
        blur(screen.getByLabelText('Mínimo de Arco'), '9');
        expect(fichaAtual.contadores[0].min).toBeLessThanOrEqual(fichaAtual.contadores[0].max);
        expect(fichaAtual.contadores[0]).toMatchObject({ min: 3, max: 9 });
        blur(screen.getByLabelText('Máximo de Arco'), '');
        // OBS: campo vazio vira 0 (Number('') === 0), não o padrão 10 de normalizarContador; depois min/max são trocados.
        const c = fichaAtual.contadores[0];
        expect(c.min).toBeLessThanOrEqual(c.max);
        expect(c.valor).toBeGreaterThanOrEqual(c.min);
        expect(c.valor).toBeLessThanOrEqual(c.max);
    });

    it('o seletor lista só Poderes com Estágios e começa em "sem Poder"', () => {
        montar({
            contadores: [ct()],
            poderes: [poderEst(1, 'Portões'), { id: 2, nome: 'Comum' }, poderEst(3, 'Kaioken')],
        });
        const sel = screen.getByLabelText('Poder ligado a Arco');
        expect(sel.value).toBe('');
        const opcoes = within(sel).getAllByRole('option').map(o => o.textContent);
        expect(opcoes).toEqual(['sem Poder', 'Portões', 'Kaioken']);
    });

    it('escolher um Poder liga o contador e define o estágio dele; mexer no valor acompanha', () => {
        montar({ contadores: [ct({ valor: 2, max: 4 })], poderes: [poderEst(1, 'Portões')] });
        fireEvent.change(screen.getByLabelText('Poder ligado a Arco'), { target: { value: '1' } });
        expect(String(fichaAtual.contadores[0].poderId)).toBe('1');
        expect(fichaAtual.poderes[0].estagioAtual).toBe(3);
        expect(screen.getByLabelText('Poder ligado a Arco').value).toBe('1');
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        expect(fichaAtual.poderes[0].estagioAtual).toBe(4);
        fireEvent.click(screen.getByLabelText('Diminuir Arco'));
        fireEvent.click(screen.getByLabelText('Diminuir Arco'));
        expect(fichaAtual.poderes[0].estagioAtual).toBe(2);
    });

    it('voltar para "sem Poder" desliga o contador e para de mexer no estágio', () => {
        montar({ contadores: [ct({ poderId: 1 })], poderes: [poderEst(1, 'Portões')] });
        fireEvent.change(screen.getByLabelText('Poder ligado a Arco'), { target: { value: '' } });
        expect('poderId' in fichaAtual.contadores[0]).toBe(false);
        fichaAtual.poderes[0].estagioAtual = 1;
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        expect(fichaAtual.poderes[0].estagioAtual).toBe(1);
    });

    it('✕ remove só o contador clicado', () => {
        montar({ contadores: [ct(), ct({ id: 'b', nome: 'Poeira' })] });
        fireEvent.click(screen.getByLabelText('Remover o contador Arco'));
        expect(screen.queryByLabelText('Valor de Arco')).toBeNull();
        expect(screen.getByLabelText('Valor de Poeira')).toBeTruthy();
        expect(fichaAtual.contadores.map(c => c.id)).toEqual(['b']);
    });

    it('esconde "+ Contador" no limite de 12 e volta ao remover um', () => {
        const lista = Array.from({ length: LIMITE_CONTADORES }, (_, i) => ct({ id: `c${i}`, nome: `C${i}` }));
        montar({ contadores: lista });
        expect(screen.queryByText('+ Contador')).toBeNull();
        fireEvent.click(screen.getByLabelText('Remover o contador C0'));
        expect(screen.getByText('+ Contador')).toBeTruthy();
    });

    it('clicar várias vezes em "+ Contador" cria contadores independentes', () => {
        montar();
        fireEvent.click(screen.getByText('+ Contador'));
        fireEvent.click(screen.getByText('+ Contador'));
        expect(screen.getAllByLabelText('Nome do contador')).toHaveLength(2);
        expect(new Set(fichaAtual.contadores.map(c => c.id)).size).toBe(2);
    });
});
