import { describe, it, expect } from 'vitest';
import { getLimitePadraoSegurar, getLimiteSegurar, getAcoesSeguradas, podeSegurarAcao, segurarAcao, usarAcaoSegurada, soltarAcaoSegurada } from './segurarAcao.js';
import { criarAcoesIniciais, getAcoesExibicao, alternarAcao, restaurarAcoes } from './acoes.js';
import { acoesEmFalta } from './acoesTecnica.js';

const fichaBase = () => ({ acoes: criarAcoesIniciais(), combate: {} });

describe('limite de Ações seguradas (definido pelo Mestre)', () => {
    it('sem configuração vale 1', () => {
        expect(getLimitePadraoSegurar({})).toBe(1);
        expect(getLimitePadraoSegurar(null)).toBe(1);
        expect(getLimitePadraoSegurar({ segurarAcaoMax: '' })).toBe(1);
    });
    it('usa o padrão da mesa, com 0 desligando e teto de 5', () => {
        expect(getLimitePadraoSegurar({ segurarAcaoMax: 3 })).toBe(3);
        expect(getLimitePadraoSegurar({ segurarAcaoMax: 0 })).toBe(0);
        expect(getLimitePadraoSegurar({ segurarAcaoMax: 99 })).toBe(5);
    });
    it('o limite do personagem vence o da mesa; vazio cai no da mesa', () => {
        const f = fichaBase();
        expect(getLimiteSegurar(f, { segurarAcaoMax: 2 })).toBe(2);
        f.combate.segurarAcaoMax = 4;
        expect(getLimiteSegurar(f, { segurarAcaoMax: 2 })).toBe(4);
        f.combate.segurarAcaoMax = '';
        expect(getLimiteSegurar(f, { segurarAcaoMax: 2 })).toBe(2);
        f.combate.segurarAcaoMax = 0;
        expect(getLimiteSegurar(f, { segurarAcaoMax: 2 })).toBe(0);
    });
});

describe('segurar, usar e soltar', () => {
    it('segurar gasta 1 Ação do turno e guarda o gatilho', () => {
        const f = fichaBase();
        const r = segurarAcao(f, '  quando o goblin sair  ', 2, 1000);
        expect(r.ok).toBe(true);
        expect(getAcoesExibicao(f).padrao.atual).toBe(1);
        expect(getAcoesSeguradas(f)).toHaveLength(1);
        expect(getAcoesSeguradas(f)[0].gatilho).toBe('quando o goblin sair');
    });

    it('respeita o limite do Mestre', () => {
        const f = fichaBase();
        expect(segurarAcao(f, 'a', 1).ok).toBe(true);
        const r = segurarAcao(f, 'b', 1);
        expect(r.ok).toBe(false);
        expect(r.motivo).toMatch(/máximo/);
        expect(getAcoesSeguradas(f)).toHaveLength(1);
    });

    it('limite 0 desliga a regra', () => {
        const f = fichaBase();
        expect(podeSegurarAcao(f, 0).ok).toBe(false);
    });

    it('sem Ação disponível não dá pra segurar', () => {
        const f = fichaBase();
        alternarAcao(f, 'padrao', true);
        alternarAcao(f, 'padrao', true);
        expect(podeSegurarAcao(f, 3).ok).toBe(false);
    });

    it('usar a segurada paga a próxima Ação sem mexer no contador do turno', () => {
        const f = fichaBase();
        const { entrada } = segurarAcao(f, 'x', 2);
        expect(getAcoesExibicao(f).padrao.atual).toBe(1);
        expect(usarAcaoSegurada(f, entrada.id).id).toBe(entrada.id);
        expect(getAcoesSeguradas(f)).toHaveLength(0);
        alternarAcao(f, 'padrao', true);
        expect(getAcoesExibicao(f).padrao.atual).toBe(1);
        alternarAcao(f, 'padrao', true);
        expect(getAcoesExibicao(f).padrao.atual).toBe(0);
    });

    it('o crédito conta como Ação disponível ao checar falta de Ação', () => {
        const f = fichaBase();
        const { entrada } = segurarAcao(f, '', 2);
        alternarAcao(f, 'padrao', true);
        expect(acoesEmFalta(f, ['padrao'])).toEqual(['Ação']);
        usarAcaoSegurada(f, entrada.id);
        expect(acoesEmFalta(f, ['padrao'])).toEqual([]);
    });

    it('segurar com crédito em uso não gasta o crédito', () => {
        const f = fichaBase();
        const { entrada } = segurarAcao(f, 'a', 3);
        usarAcaoSegurada(f, entrada.id);
        segurarAcao(f, 'b', 3);
        expect(f.combate.acaoSeguradaCredito).toBe(1);
        expect(getAcoesExibicao(f).padrao.atual).toBe(0);
    });

    it('soltar devolve a Ação', () => {
        const f = fichaBase();
        const { entrada } = segurarAcao(f, 'x', 2);
        soltarAcaoSegurada(f, entrada.id);
        expect(getAcoesSeguradas(f)).toHaveLength(0);
        expect(getAcoesExibicao(f).padrao.atual).toBe(2);
    });

    it('usar/soltar id desconhecido não faz nada', () => {
        const f = fichaBase();
        expect(usarAcaoSegurada(f, 'nada')).toBeNull();
        expect(soltarAcaoSegurada(f, 'nada')).toBeNull();
    });
});

describe('expiração', () => {
    it('Ações seguradas e crédito somem ao começar o próximo turno', () => {
        const f = fichaBase();
        const { entrada } = segurarAcao(f, 'x', 3);
        segurarAcao(f, 'y', 3);
        usarAcaoSegurada(f, entrada.id);
        restaurarAcoes(f);
        expect(getAcoesSeguradas(f)).toHaveLength(0);
        expect(f.combate.acaoSeguradaCredito).toBe(0);
        expect(getAcoesExibicao(f).padrao.atual).toBe(2);
    });
});
