import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import IdentificacaoAtaque from './IdentificacaoAtaque';
import useStore from '../../stores/useStore';

// QA - IdentificacaoAtaque: avisa so para Dano NOVO contra mim e so se tenho a tecnica de identificacao.
vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, default: vi.fn() };
});

let state;
const passivo = (...atributos) => ({ id: 1, nome: 'Olho', ativa: false, efeitosPassivos: atributos.map(atributo => ({ atributo, propriedade: 'base', valor: 1 })), efeitos: [] });
const ativo = (ativa, atributo = 'identificar_tipo_ataque') => ({ id: 2, nome: 'Sentido', ativa, efeitosPassivos: [], efeitos: [{ atributo, propriedade: 'base', valor: 1 }] });
const dano = (over = {}) => ({ tipo: 'dano', nome: 'Vilao', ts: Date.now(), alvoNome: 'Heroi', tipoAtaque: 'Elemental (Fogo)', energiasUsadas: ['mana'], ...over });

function montar({ feed = [], poderes = [], meuNome = 'Heroi' } = {}) {
    state = { feedCombate: feed, meuNome, minhaFicha: { poderes }, adicionarAviso: vi.fn() };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    return render(<IdentificacaoAtaque />);
}
const avisos = () => state.adicionarAviso.mock.calls;

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('IdentificacaoAtaque', () => {
    it('avisa tipo e energia quando o Dano novo mira em mim (alvoNome)', () => {
        montar({ feed: [dano()], poderes: [passivo('identificar_tipo_ataque', 'identificar_energia')] });
        expect(avisos()).toHaveLength(1);
        expect(avisos()[0][0]).toBe('🔍 Vilao: ataque Elemental (Fogo) · Energia: Mana');
        expect(avisos()[0][1]).toBe('info');
    });

    it('avisa quando estou em alvosAplicados (area)', () => {
        montar({ feed: [dano({ alvoNome: undefined, alvosAplicados: ['Outro', 'Heroi'] })], poderes: [passivo('identificar_tipo_ataque')] });
        expect(avisos()).toHaveLength(1);
        expect(avisos()[0][0]).toContain('ataque Elemental (Fogo)');
        expect(avisos()[0][0]).not.toContain('Energia');
    });

    it('compara pelo nome sanitizado', () => {
        montar({ meuNome: 'Her.oi', feed: [dano({ alvoNome: 'Her_oi' })], poderes: [passivo('identificar_tipo_ataque')] });
        expect(avisos()).toHaveLength(1);
    });

    it('sem a tecnica nao avisa', () => {
        montar({ feed: [dano()], poderes: [] });
        expect(avisos()).toHaveLength(0);
    });

    it('entrada antiga (ts velho) nao avisa; dentro da folga de 5 s avisa', () => {
        montar({ feed: [dano({ ts: Date.now() - 60000 })], poderes: [passivo('identificar_tipo_ataque')] });
        expect(avisos()).toHaveLength(0);
        cleanup();
        montar({ feed: [dano({ ts: Date.now() - 3000 })], poderes: [passivo('identificar_tipo_ataque')] });
        expect(avisos()).toHaveLength(1);
    });

    it('entrada sem ts nao avisa', () => {
        const e = dano(); delete e.ts;
        montar({ feed: [e], poderes: [passivo('identificar_tipo_ataque')] });
        expect(avisos()).toHaveLength(0);
    });

    it('ataque do proprio jogador nao avisa', () => {
        montar({ feed: [dano({ nome: 'Heroi' })], poderes: [passivo('identificar_tipo_ataque')] });
        expect(avisos()).toHaveLength(0);
    });

    it('mirando outro alvo nao avisa', () => {
        montar({ feed: [dano({ alvoNome: 'Outro' }), dano({ ts: Date.now() + 1, alvoNome: undefined, alvosAplicados: ['Outro'] }), dano({ ts: Date.now() + 2, alvoNome: undefined })], poderes: [passivo('identificar_tipo_ataque')] });
        expect(avisos()).toHaveLength(0);
    });

    it('outros tipos de feed nao avisam', () => {
        montar({ feed: [dano({ tipo: 'acerto' }), dano({ tipo: 'sistema', ts: Date.now() + 1 })], poderes: [passivo('identificar_tipo_ataque')] });
        expect(avisos()).toHaveLength(0);
    });

    it('nao duplica o aviso em rerender com a mesma entrada', () => {
        const e = dano();
        const { rerender } = montar({ feed: [e], poderes: [passivo('identificar_tipo_ataque')] });
        state = { ...state, feedCombate: [{ ...e }] };
        rerender(<IdentificacaoAtaque />);
        state = { ...state, feedCombate: [{ ...e }, dano({ ts: e.ts + 1 })] };
        rerender(<IdentificacaoAtaque />);
        expect(avisos()).toHaveLength(2);
    });

    it('tecnica ativa so avisa ligada', () => {
        montar({ feed: [dano()], poderes: [ativo(false)] });
        expect(avisos()).toHaveLength(0);
        cleanup();
        montar({ feed: [dano()], poderes: [ativo(true)] });
        expect(avisos()).toHaveLength(1);
    });

    it('golpe sem energia com identificar_energia: "sem Energia"', () => {
        montar({ feed: [dano({ energiasUsadas: undefined })], poderes: [passivo('identificar_energia')] });
        expect(avisos()[0][0]).toBe('🔍 Vilao: sem Energia');
    });

    it('feed nao-array ou sem meuNome nao quebra', () => {
        expect(() => montar({ feed: null, poderes: [passivo('identificar_tipo_ataque')] })).not.toThrow();
        cleanup();
        montar({ feed: [dano()], meuNome: '', poderes: [passivo('identificar_tipo_ataque')] });
        expect(avisos()).toHaveLength(0);
    });
});
