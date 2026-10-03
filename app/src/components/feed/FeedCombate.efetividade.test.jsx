import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FeedCombate from './FeedCombate';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA - FeedCombate: o dano recalculado pela Disputa de Poder e so do Mestre. O jogador ve
// "Golpe em <alvo>!" e, com Percepcao de Poder >= 30, a frase de efetividade (sem numeros).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));

const FICHA_PERCEPCAO_30 = { passivas: [{ efeitos: [{ atributo: 'percepcao_poder', valor: 30 }] }] };
const FICHA_PERCEPCAO_29 = { passivas: [{ efeitos: [{ atributo: 'percepcao_poder', valor: 29 }] }] };

function montar({ feed, isMestre = false, minhaFicha = {} }) {
    const state = { feedCombate: feed, isMestre, minhaFicha };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(state) : state));
    return render(<FeedCombate />);
}

const danoUnico = (extra = {}) => ({
    tipo: 'dano', nome: 'Ana', dano: 1000, danoAplicado: 2000, letalidade: 0, atributosUsados: 'Força',
    alvoNome: 'Goblin', alvoSobreviveu: true, overkill: 0,
    textoDisputa: '⚖️ Disputa de Poder: atacante mais forte', efetividade: 'alta', ...extra,
});

const danoArea = (extra = {}) => ({
    tipo: 'dano', nome: 'Ana', dano: 1000, letalidade: 0, atributosUsados: 'Força',
    detalheDisputa: '⚖️ Disputa de Poder (dano em cada alvo): Goblin: 2.000 · Orc: 0',
    efetividadeAlvos: [{ nome: 'Goblin', efetividade: 'alta' }, { nome: 'Orc', efetividade: 'nula' }], ...extra,
});

afterEach(() => cleanup());

describe('FeedCombate - dano em alvo unico', () => {
    it('Mestre ve o dano aplicado, textoDisputa, rolagem->aplicado e overkill', () => {
        const { container } = montar({ isMestre: true, feed: [danoUnico({ overkill: 500 })] });
        const t = container.textContent;
        expect(t).toContain('Causou 2.000 de dano em Goblin!');
        expect(t).toContain('Disputa de Poder: atacante mais forte');
        expect(t).toContain('🔒 Rolagem 1.000 → aplicado 2.000');
        expect(t).toContain('OVERKILL: +500');
        expect(t).not.toContain('Golpe em Goblin');
        // Mestre nao recebe a frase qualitativa (ja tem os numeros)
        expect(container.querySelector('.feed-efetividade')).toBeNull();
    });

    it('Mestre sem disputa (danoAplicado igual ao dano): sem a linha "Rolagem -> aplicado"', () => {
        const { container } = montar({ isMestre: true, feed: [danoUnico({ danoAplicado: 1000, textoDisputa: undefined, efetividade: undefined })] });
        expect(container.textContent).toContain('Causou 1.000 de dano em Goblin!');
        expect(container.textContent).not.toContain('Rolagem 1.000 → aplicado');
    });

    it('Mestre sem danoAplicado cai no dano da rolagem', () => {
        const { container } = montar({ isMestre: true, feed: [danoUnico({ danoAplicado: undefined, textoDisputa: undefined })] });
        expect(container.textContent).toContain('Causou 1.000 de dano em Goblin!');
    });

    it('Mestre com danoAplicado 0 (golpe anulado) ve "Causou 0" e a linha de aplicado', () => {
        const { container } = montar({ isMestre: true, feed: [danoUnico({ danoAplicado: 0, efetividade: 'nula' })] });
        expect(container.textContent).toContain('Causou 0 de dano em Goblin!');
        expect(container.textContent).toContain('aplicado 0');
    });

    it('jogador sem Percepcao: so "Golpe em Goblin!" - sem aplicado, textoDisputa, overkill nem efetividade', () => {
        const { container } = montar({ isMestre: false, minhaFicha: {}, feed: [danoUnico({ overkill: 500 })] });
        const t = container.textContent;
        expect(t).toContain('🩸 Golpe em Goblin!');
        expect(t).not.toContain('Causou');
        expect(t).not.toContain('2.000');
        expect(t).not.toContain('Disputa de Poder');
        expect(t).not.toContain('OVERKILL');
        expect(t).not.toContain('🔒');
        expect(t).not.toContain('Golpe muito efetivo');
        expect(container.querySelector('.feed-efetividade')).toBeNull();
        // a rolagem (numero grande do dano) continua publica
        expect(container.querySelector('.damage-number').textContent).toBe('1.000');
    });

    it('jogador com Percepcao 29 (abaixo do limiar) nao ve a efetividade', () => {
        const { container } = montar({ minhaFicha: FICHA_PERCEPCAO_29, feed: [danoUnico()] });
        expect(container.querySelector('.feed-efetividade')).toBeNull();
        expect(container.textContent).toContain('Golpe em Goblin!');
    });

    it('jogador com Percepcao 30 ve a frase de efetividade com a classe do nivel, mas nenhum numero recalculado', () => {
        const { container } = montar({ minhaFicha: FICHA_PERCEPCAO_30, feed: [danoUnico({ overkill: 500 })] });
        const ef = container.querySelector('.feed-efetividade.feed-efetividade--alta');
        expect(ef).not.toBeNull();
        expect(ef.textContent).toBe('Golpe muito efetivo');
        const t = container.textContent;
        expect(t).not.toContain('2.000');
        expect(t).not.toContain('Disputa de Poder');
        expect(t).not.toContain('OVERKILL');
        expect(t).not.toContain('Causou');
    });

    it.each([
        ['alta', 'Golpe muito efetivo'], ['normal', 'Golpe efetivo'],
        ['reduzida', 'Golpe pouco efetivo'], ['nula', 'Golpe sem efeito'],
    ])('jogador com Percepcao 30: categoria %s -> "%s"', (cat, frase) => {
        const { container } = montar({ minhaFicha: FICHA_PERCEPCAO_30, feed: [danoUnico({ efetividade: cat })] });
        const ef = container.querySelector(`.feed-efetividade--${cat}`);
        expect(ef).not.toBeNull();
        expect(ef.textContent).toBe(frase);
    });

    it('jogador com Percepcao 30 mas SEM disputa (efetividade ausente ou desconhecida): nada extra', () => {
        const a = montar({ minhaFicha: FICHA_PERCEPCAO_30, feed: [danoUnico({ efetividade: undefined, textoDisputa: undefined })] });
        expect(a.container.querySelector('.feed-efetividade')).toBeNull();
        cleanup();
        const b = montar({ minhaFicha: FICHA_PERCEPCAO_30, feed: [danoUnico({ efetividade: 'invalida' })] });
        expect(b.container.querySelector('.feed-efetividade')).toBeNull();
    });

    it('jogador: "(MORTO!)" continua aparecendo quando o alvo nao sobreviveu', () => {
        const { container } = montar({ feed: [danoUnico({ alvoSobreviveu: false })] });
        expect(container.textContent).toContain('Golpe em Goblin!');
        expect(container.textContent).toContain('MORTO');
    });

    it('jogador: ataque sem alvoNome nao mostra bloco de alvo', () => {
        const { container } = montar({ feed: [danoUnico({ alvoNome: undefined })] });
        expect(container.textContent).not.toContain('Golpe em');
    });

    it('Mestre em Modo Jogador (isMestre=false) com Percepcao 30 e tratado como jogador', () => {
        const { container } = montar({ isMestre: false, minhaFicha: FICHA_PERCEPCAO_30, feed: [danoUnico()] });
        expect(container.textContent).not.toContain('Causou');
        expect(container.querySelector('.feed-efetividade')).not.toBeNull();
    });

    it('minhaFicha nula nao quebra o feed (jogador sem ficha)', () => {
        expect(() => montar({ minhaFicha: null, feed: [danoUnico()] })).not.toThrow();
    });
});

describe('FeedCombate - dano em area', () => {
    it('Mestre ve o detalheDisputa com 🔒 e nao as frases de efetividade', () => {
        const { container } = montar({ isMestre: true, feed: [danoArea()] });
        const el = container.querySelector('.feed-disputa-poder');
        expect(el).not.toBeNull();
        expect(el.textContent).toContain('🔒');
        expect(el.textContent).toContain('Goblin: 2.000 · Orc: 0');
        expect(container.querySelector('.feed-efetividade')).toBeNull();
    });

    it('jogador sem Percepcao: nem detalheDisputa nem efetividade por alvo', () => {
        const { container } = montar({ feed: [danoArea()] });
        expect(container.querySelector('.feed-disputa-poder')).toBeNull();
        expect(container.querySelector('.feed-efetividade')).toBeNull();
        expect(container.textContent).not.toContain('2.000');
        expect(container.textContent).not.toContain('Disputa de Poder');
    });

    it('jogador com Percepcao 30: uma frase por alvo ("Nome: frase"), sem numeros e sem detalheDisputa', () => {
        const { container } = montar({ minhaFicha: FICHA_PERCEPCAO_30, feed: [danoArea()] });
        const itens = [...container.querySelectorAll('.feed-efetividade')];
        expect(itens.map(i => i.textContent)).toEqual(['Goblin: Golpe muito efetivo', 'Orc: Golpe sem efeito']);
        expect(itens[0].classList.contains('feed-efetividade--alta')).toBe(true);
        expect(itens[1].classList.contains('feed-efetividade--nula')).toBe(true);
        expect(container.querySelector('.feed-disputa-poder')).toBeNull();
        expect(container.textContent).not.toContain('2.000');
    });

    it('efetividadeAlvos vazio, ausente ou nao-array nao quebra', () => {
        [[], undefined, 'texto', null].forEach(v => {
            const { container } = montar({ minhaFicha: FICHA_PERCEPCAO_30, feed: [danoArea({ efetividadeAlvos: v })] });
            expect(container.querySelector('.feed-efetividade')).toBeNull();
            cleanup();
        });
    });

    it('alvo com categoria desconhecida e omitido, os demais continuam', () => {
        const { container } = montar({
            minhaFicha: FICHA_PERCEPCAO_30,
            feed: [danoArea({ efetividadeAlvos: [{ nome: 'X', efetividade: 'zzz' }, { nome: 'Y', efetividade: 'normal' }] })],
        });
        const itens = [...container.querySelectorAll('.feed-efetividade')];
        expect(itens.map(i => i.textContent)).toEqual(['Y: Golpe efetivo']);
    });
});

describe('FeedCombate - mensagens de sistema com textoMestre', () => {
    const sistema = { tipo: 'sistema', nome: 'SISTEMA', texto: '⚔️ O Mestre aplicou dano em Orc!', textoMestre: 'Aplicado: 110 (digitado 100)' };

    it('Mestre ve o texto publico e a linha "🔒 ..." com o textoMestre', () => {
        const { container } = montar({ isMestre: true, feed: [sistema] });
        expect(container.textContent).toContain('O Mestre aplicou dano em Orc!');
        const el = container.querySelector('.feed-texto-mestre');
        expect(el).not.toBeNull();
        expect(el.textContent).toBe('🔒 Aplicado: 110 (digitado 100)');
    });

    it('jogador ve so o texto publico', () => {
        const { container } = montar({ isMestre: false, feed: [sistema] });
        expect(container.textContent).toContain('O Mestre aplicou dano em Orc!');
        expect(container.querySelector('.feed-texto-mestre')).toBeNull();
        expect(container.textContent).not.toContain('110');
        expect(container.textContent).not.toContain('digitado');
    });

    it('Mestre com sistema SEM textoMestre: nenhuma linha extra', () => {
        const { container } = montar({ isMestre: true, feed: [{ tipo: 'sistema', nome: 'SISTEMA', texto: 'Fim do turno' }] });
        expect(container.querySelector('.feed-texto-mestre')).toBeNull();
    });
});

describe('FeedCombate - estados basicos', () => {
    it('feed vazio mostra o placeholder, sem quebrar', () => {
        expect(() => montar({ feed: [] })).not.toThrow();
    });
    it('entradas do feed aparecem da mais nova para a mais antiga', () => {
        const { container } = montar({
            isMestre: true,
            feed: [
                { tipo: 'sistema', nome: 'S', texto: 'PRIMEIRA' },
                { tipo: 'sistema', nome: 'S', texto: 'SEGUNDA' },
            ],
        });
        const t = container.textContent;
        expect(t.indexOf('SEGUNDA')).toBeLessThan(t.indexOf('PRIMEIRA'));
    });
});
