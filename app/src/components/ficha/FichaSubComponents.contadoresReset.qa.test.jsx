import React, { useState, useCallback } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaCondicoesEElementais } from './FichaSubComponents';
import { useFichaForm } from './FichaFormContext';
import { adicionarContador, removerContador, atualizarContador, mudarContador, resetarContadoresDeCena } from '../../core/contadores';
import { normalizarEstagios } from '../../core/estagios';

// QA Fase 2 - seletor de reinicio ('permanente' | 'cena') do contador na Ficha. Mesmo esquema do FichaSubComponents.contadores.test.jsx
// (handlers reais de core/contadores.js sobre um estado React).
vi.mock('./FichaFormContext', async (importOriginal) => ({ ...(await importOriginal()), useFichaForm: vi.fn() }));

let fichaAtual; let idSeq;
function Harness({ inicial }) {
    const [ficha, setFicha] = useState(inicial);
    const mutar = useCallback((fn) => setFicha(prev => { const c = structuredClone(prev); fn(c); return c; }), []);
    const ctx = {
        minhaFicha: ficha, modificarCondicao: vi.fn(), removerBuffTemporario: vi.fn(), toggleAfinidade: vi.fn(),
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
const montar = (ficha = {}) => render(<Harness inicial={{ contadores: [], poderes: [], condicoes: [], ...ficha }} />);
const ct = (extra = {}) => ({ id: 'a', nome: 'Arco', valor: 0, min: 0, max: 3, ...extra });
const seletor = (nome = 'Arco') => screen.getByLabelText(`Reinício de ${nome}`);

describe('Ficha - seletor de reinicio do contador', () => {
    beforeEach(() => { idSeq = 0; vi.clearAllMocks(); });
    afterEach(() => cleanup());

    it('contador sem o campo `reset` (ficha antiga) aparece como Permanente', () => {
        montar({ contadores: [ct()] });
        expect(seletor().value).toBe('permanente');
        expect(Array.from(seletor().querySelectorAll('option')).map(o => o.value)).toEqual(['permanente', 'cena']);
    });
    it('escolher "cena" grava reset: cena; voltar a Permanente REMOVE a chave (nada de undefined)', () => {
        montar({ contadores: [ct()] });
        fireEvent.change(seletor(), { target: { value: 'cena' } });
        expect(fichaAtual.contadores[0].reset).toBe('cena'); expect(seletor().value).toBe('cena');
        fireEvent.change(seletor(), { target: { value: 'permanente' } });
        expect('reset' in fichaAtual.contadores[0]).toBe(false);
        expect(JSON.stringify(fichaAtual.contadores, (k, v) => (v === undefined ? '__U__' : v))).not.toContain('__U__');
    });
    it('valor invalido vindo de fora ("xyz") cai em Permanente e o proximo patch limpa o campo', () => {
        montar({ contadores: [ct({ reset: 'xyz' })] });
        expect(seletor().value).toBe('permanente');
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        expect('reset' in fichaAtual.contadores[0]).toBe(false);
    });
    it('mexer em nome, valor e maximo NAO perde o reset de cena', () => {
        montar({ contadores: [ct({ reset: 'cena' })] });
        fireEvent.click(screen.getByLabelText('Aumentar Arco'));
        const nome = screen.getByLabelText('Nome do contador');
        fireEvent.change(nome, { target: { value: 'Marca' } }); fireEvent.blur(nome);
        const max = screen.getByLabelText('Máximo de Marca'); fireEvent.change(max, { target: { value: '9' } }); fireEvent.blur(max);
        expect(fichaAtual.contadores[0]).toMatchObject({ nome: 'Marca', valor: 1, max: 9, reset: 'cena' });
    });
    it('contador de cena ligado a um Poder de Estagios: trocar o reset nao mexe no estagio', () => {
        const p = { id: 'pe', nome: 'Furia', categoria: 'poder', ativa: false, estagioAtual: 3, efeitos: [], efeitosPassivos: [], estagios: normalizarEstagios({ habilitado: true, maximo: 5, crescimento: 100 }) };
        montar({ poderes: [p], contadores: [ct({ valor: 2, poderId: 'pe' })] });
        const antes = fichaAtual.poderes[0].estagioAtual;
        fireEvent.change(seletor(), { target: { value: 'cena' } });
        expect(fichaAtual.poderes[0].estagioAtual).toBe(antes); expect(fichaAtual.contadores[0]).toMatchObject({ poderId: 'pe', reset: 'cena' });
    });
    it('cada contador tem o seu seletor independente (dois contadores)', () => {
        montar({ contadores: [ct({ id: 'a', nome: 'A' }), ct({ id: 'b', nome: 'B', reset: 'cena' })] });
        expect(seletor('A').value).toBe('permanente'); expect(seletor('B').value).toBe('cena');
        fireEvent.change(seletor('A'), { target: { value: 'cena' } });
        expect(fichaAtual.contadores.map(c => c.reset)).toEqual(['cena', 'cena']);
    });
    it('integracao: o que o seletor grava e o que resetarContadoresDeCena entende', () => {
        montar({ contadores: [ct({ valor: 3 })] });
        fireEvent.change(seletor(), { target: { value: 'cena' } });
        const f = structuredClone(fichaAtual);
        expect(resetarContadoresDeCena(f)).toEqual([0]); expect(f.contadores[0].valor).toBe(0);
    });
});
