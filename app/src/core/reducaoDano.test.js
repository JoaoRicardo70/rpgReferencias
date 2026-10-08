import { describe, it, expect } from 'vitest';
import { getPassosReducaoDano, aplicarReducoesSequenciais, descreverReducoes, limitarPercentualReducao, alternarAlvoReducao } from './reducaoDano.js';

describe('aplicarReducoesSequenciais', () => {
    it('exemplo do pedido: 100 → -20% → 80 → -30% → 56', () => {
        const r = aplicarReducoesSequenciais(100, [{ nome: 'Geral', percentual: 20 }, { nome: 'Fogo', percentual: 30 }]);
        expect(r.final).toBe(56);
        expect(r.detalhe.map(d => d.depois)).toEqual([80, 56]);
    });

    it('é sequencial, não soma: 50% + 50% deixa 25%, nunca zera', () => {
        expect(aplicarReducoesSequenciais(1000, [{ percentual: 50 }, { percentual: 50 }]).final).toBe(250);
        expect(aplicarReducoesSequenciais(1000, [{ percentual: 90 }, { percentual: 90 }, { percentual: 90 }]).final).toBe(1);
    });

    it('100% (imunidade) zera o dano', () => {
        expect(aplicarReducoesSequenciais(500, [{ percentual: 20 }, { percentual: 100 }]).final).toBe(0);
    });

    it('percentual negativo (vulnerável) aumenta o dano', () => {
        expect(aplicarReducoesSequenciais(100, [{ percentual: -100 }]).final).toBe(200);
    });

    it('sem passos devolve o dano e nenhum detalhe; entradas inválidas são ignoradas', () => {
        expect(aplicarReducoesSequenciais(77, []).final).toBe(77);
        expect(aplicarReducoesSequenciais(77, null).final).toBe(77);
        expect(aplicarReducoesSequenciais(77, [null, { percentual: 'abc' }, { percentual: 0 }]).detalhe).toEqual([]);
        expect(aplicarReducoesSequenciais(-5, [{ percentual: 10 }]).final).toBe(0);
    });

    it('arredonda para baixo só no fim', () => {
        expect(aplicarReducoesSequenciais(10, [{ percentual: 25 }, { percentual: 25 }]).final).toBe(5);
    });
});

describe('getPassosReducaoDano', () => {
    const ficha = {
        reducoesDano: [
            { id: 'a', nome: 'Armadura', percentual: 20, elemento: 'todos' },
            { id: 'b', nome: 'Pele de Magma', percentual: 30, elemento: 'fogo' },
            { id: 'c', nome: 'Zerada', percentual: 0, elemento: 'todos' },
        ],
        afinidades: { resistencias: ['gelo'], vulnerabilidades: ['raio'], imunidades: ['luz'], absorcoes: [] },
    };

    it('contra fogo: Redução geral e depois a de Fogo, na ordem', () => {
        const passos = getPassosReducaoDano(ficha, 'fogo');
        expect(passos.map(p => p.nome)).toEqual(['Armadura', 'Pele de Magma']);
        expect(aplicarReducoesSequenciais(100, passos).final).toBe(56);
    });

    it('contra dano físico/sem elemento: só as reduções gerais', () => {
        expect(getPassosReducaoDano(ficha, '').map(p => p.nome)).toEqual(['Armadura']);
        expect(getPassosReducaoDano(ficha, 'fisico').map(p => p.nome)).toEqual(['Armadura']);
    });

    it('redução marcada como Físico vale também quando o elemento chega vazio/null (Mapa)', () => {
        const f = { reducoesDano: [{ id: 'x', nome: 'Pele', percentual: 40, elemento: 'fisico' }] };
        expect(getPassosReducaoDano(f, null)).toHaveLength(1);
        expect(getPassosReducaoDano(f, 'fogo')).toHaveLength(0);
    });

    it('afinidades entram como passos (50 / -100 / 100)', () => {
        expect(getPassosReducaoDano(ficha, 'gelo').map(p => p.percentual)).toEqual([20, 50]);
        expect(getPassosReducaoDano(ficha, 'raio').map(p => p.percentual)).toEqual([20, -100]);
        expect(getPassosReducaoDano(ficha, 'luz').map(p => p.percentual)).toEqual([20, 100]);
    });

    it('efeitos ativos com REDUCAO_DANO viram um passo cada, e inativos não contam', () => {
        const f = {
            poderes: [
                { id: 'p1', nome: 'Barreira', ativa: true, efeitos: [{ atributo: 'reducao_dano', propriedade: 'base', valor: 10, nome: 'Barreira' }] },
                { id: 'p2', nome: 'Inativo', ativa: false, efeitos: [{ atributo: 'reducao_dano', propriedade: 'base', valor: 40 }] },
            ],
        };
        const passos = getPassosReducaoDano(f, '');
        expect(passos).toHaveLength(1);
        expect(passos[0].percentual).toBe(10);
    });

    it('ficha ausente ou sem nada devolve lista vazia', () => {
        expect(getPassosReducaoDano(null, 'fogo')).toEqual([]);
        expect(getPassosReducaoDano({}, 'fogo')).toEqual([]);
    });
});

describe('descreverReducoes / limitarPercentualReducao', () => {
    it('monta o texto do feed', () => {
        const r = aplicarReducoesSequenciais(100, [{ nome: 'A', percentual: 20 }, { nome: 'B', percentual: 30 }]);
        expect(descreverReducoes(r)).toBe('100 → −20% A → 80 → −30% B → 56');
        expect(descreverReducoes(aplicarReducoesSequenciais(100, []))).toBe('');
    });

    it('limita a 100 e trata lixo como 0', () => {
        expect(limitarPercentualReducao(250)).toBe(100);
        expect(limitarPercentualReducao('x')).toBe(0);
    });
});

describe('habilidades de redução por polaridade e ativa/desativada', () => {
    const ficha = {
        reducoesDano: [
            { id: 'a', nome: 'Véu Yin', percentual: 30, elemento: 'pol:yin' },
            { id: 'b', nome: 'Escudo Yang', percentual: 50, elemento: 'pol:yang' },
            { id: 'c', nome: 'Aguas Calmas', percentual: 10, elemento: 'pol:neutro' },
            { id: 'd', nome: 'Desligada', percentual: 90, elemento: 'todos', ativa: false },
        ],
    };

    it('vale só contra elementos da polaridade escolhida', () => {
        expect(getPassosReducaoDano(ficha, 'fogo').map(p => p.nome)).toEqual(['Véu Yin']);
        expect(getPassosReducaoDano(ficha, 'Raio Verdadeiro').map(p => p.nome)).toEqual(['Véu Yin']);
        expect(getPassosReducaoDano(ficha, 'vento').map(p => p.nome)).toEqual(['Escudo Yang']);
        expect(getPassosReducaoDano(ficha, 'Agua').map(p => p.nome)).toEqual(['Aguas Calmas']);
    });

    it('não vale contra físico, sem elemento ou elemento sem polaridade', () => {
        expect(getPassosReducaoDano(ficha, '')).toEqual([]);
        expect(getPassosReducaoDano(ficha, 'fisico')).toEqual([]);
        expect(getPassosReducaoDano(ficha, 'Aura Pura')).toEqual([]);
    });

    it('habilidade com ativa:false é ignorada; sem o campo conta como ativa', () => {
        expect(getPassosReducaoDano(ficha, 'fogo').some(p => p.nome === 'Desligada')).toBe(false);
        const f = { reducoesDano: [{ id: 'x', nome: 'Antiga', percentual: 20, elemento: 'todos' }] };
        expect(getPassosReducaoDano(f, 'fogo')).toHaveLength(1);
    });

    it('combina com redução geral em sequência (Yin 30% depois geral 20%)', () => {
        const f = { reducoesDano: [{ id: 'g', nome: 'Geral', percentual: 20, elemento: 'todos' }, ficha.reducoesDano[0]] };
        expect(aplicarReducoesSequenciais(100, getPassosReducaoDano(f, 'fogo')).final).toBe(56);
    });
});

describe('vários tipos, passivas e elementos novos', () => {
    it('uma habilidade com Fogo e Água vale contra os dois e não contra Terra', () => {
        const f = { reducoesDano: [{ id: 'm', nome: 'Pele Úmida', percentual: 40, elementos: ['fogo', 'agua'] }] };
        expect(getPassosReducaoDano(f, 'fogo')).toHaveLength(1);
        expect(getPassosReducaoDano(f, 'Água')).toHaveLength(1);
        expect(getPassosReducaoDano(f, 'Fogo Verdadeiro')).toHaveLength(1);
        expect(getPassosReducaoDano(f, 'terra')).toHaveLength(0);
    });

    it('mistura polaridade e elemento na mesma habilidade', () => {
        const f = { reducoesDano: [{ id: 'm', nome: 'Mista', percentual: 25, elementos: ['pol:yang', 'lava'] }] };
        expect(getPassosReducaoDano(f, 'vento')).toHaveLength(1);
        expect(getPassosReducaoDano(f, 'Elemento Lava')).toHaveLength(1);
        expect(getPassosReducaoDano(f, 'fogo')).toHaveLength(0);
    });

    it('passiva vale sempre, mesmo com ativa:false; ativa desligada não vale', () => {
        const f = { reducoesDano: [
            { id: 'p', nome: 'P', percentual: 10, tipo: 'passiva', ativa: false },
            { id: 'a', nome: 'A', percentual: 10, tipo: 'ativa', ativa: false },
        ] };
        expect(getPassosReducaoDano(f, 'fogo').map(p => p.nome)).toEqual(['P']);
    });

    it('formato antigo (elemento) continua valendo; elementos novos casam por nome e id', () => {
        const f = { reducoesDano: [{ id: 'o', nome: 'Antiga', percentual: 10, elemento: 'madeira' }] };
        expect(getPassosReducaoDano(f, 'Elemento Madeira')).toHaveLength(1);
        expect(getPassosReducaoDano(f, 'madeira')).toHaveLength(1);
    });

    it('afinidades casam por chave (nome com acento/Verdadeiro)', () => {
        const f = { afinidades: { resistencias: ['vacuo'], vulnerabilidades: [], imunidades: [], absorcoes: [] } };
        expect(getPassosReducaoDano(f, 'Vácuo').map(p => p.nome)).toEqual(['RESISTENTE']);
    });

    it('alternarAlvoReducao: todos é exclusivo, sem duplicar, vazio volta a todos', () => {
        expect(alternarAlvoReducao(['todos'], 'fogo', true)).toEqual(['fogo']);
        expect(alternarAlvoReducao(['fogo'], 'fogo', true)).toEqual(['fogo']);
        expect(alternarAlvoReducao(['fogo', 'agua'], 'todos', true)).toEqual(['todos']);
        expect(alternarAlvoReducao(['fogo'], 'fogo', false)).toEqual(['todos']);
    });
});
