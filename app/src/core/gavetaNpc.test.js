import { describe, it, expect, vi } from 'vitest';
import {
    FAMILIA_SEM_CLA, ehNpc, getFamiliaNpc, agruparNpcsPorFamilia, getVidaMaxBrutaNpc,
    posicoesLivres, cenarioComTokensOcultos, montarDummieDeNpc,
} from './gavetaNpc';
import { FATOR_EXIBICAO_VITAIS } from './vitals';

// Poder e CA vem de campos falsos da ficha (__poder, __evasiva, __resistencia) para o teste controlar
// os numeros sem montar uma ficha completa. A Vida usa o calculo real.
vi.mock('./disputaPoder.js', () => ({
    getPoderParaDisputa: vi.fn((ficha) => (ficha && ficha.__poder !== undefined ? ficha.__poder : null)),
}));
vi.mock('./engine.js', () => ({
    calcularCA: vi.fn((ficha, tipo) => {
        if (ficha && ficha.__erroCA) throw new Error('falha');
        const v = tipo === 'evasiva' ? ficha?.__evasiva : ficha?.__resistencia;
        return v === undefined ? 10 : v;
    }),
}));

const statReal = (base) => ({ base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, reducaoCusto: 0, regeneracao: 0 });
const fichaComVida = (base, extra = {}) => ({
    isNPC: true,
    vida: { ...statReal(base), atual: base },
    poderes: [], inventario: [], passivas: [], combate: {}, dominios: {},
    ...extra,
});
const lore = (cla) => ({ nome: '📖 Linhagem & Lore', descricao: `Algo antes\nClã de Origem: ${cla}\nOutra linha` });

describe('ehNpc', () => {
    it('true com isNPC', () => { expect(ehNpc({ isNPC: true })).toBe(true); });
    it('true com bio.mesa === "npc"', () => { expect(ehNpc({ bio: { mesa: 'npc' } })).toBe(true); });
    it('false para jogador comum', () => {
        expect(ehNpc({ bio: { mesa: 'jogador' } })).toBe(false);
        expect(ehNpc({ isNPC: false })).toBe(false);
        expect(ehNpc({})).toBe(false);
    });
    it('false para null, undefined e valores nao-objeto', () => {
        expect(ehNpc(null)).toBe(false);
        expect(ehNpc(undefined)).toBe(false);
        expect(ehNpc('npc')).toBe(false);
    });
    it('retorna sempre booleano', () => {
        expect(typeof ehNpc(null)).toBe('boolean');
        expect(typeof ehNpc({ isNPC: 1 })).toBe('boolean');
    });
});

describe('getFamiliaNpc', () => {
    it('usa bio.afiliacao quando preenchida', () => {
        expect(getFamiliaNpc({ bio: { afiliacao: 'Uchiha' } })).toBe('Uchiha');
    });
    it('remove espacos nas pontas da afiliacao', () => {
        expect(getFamiliaNpc({ bio: { afiliacao: '  Uchiha  ' } })).toBe('Uchiha');
    });
    it('afiliacao tem prioridade sobre o Cla de Origem do Lore', () => {
        expect(getFamiliaNpc({ bio: { afiliacao: 'Uchiha' }, poderes: [lore('Hyuga')] })).toBe('Uchiha');
    });
    it('sem afiliacao, le "Clã de Origem:" do poder Linhagem & Lore', () => {
        expect(getFamiliaNpc({ bio: {}, poderes: [lore('Hyuga')] })).toBe('Hyuga');
        expect(getFamiliaNpc({ poderes: [lore('  Senju ')] })).toBe('Senju');
    });
    it('afiliacao so com espacos cai no Lore', () => {
        expect(getFamiliaNpc({ bio: { afiliacao: '   ' }, poderes: [lore('Hyuga')] })).toBe('Hyuga');
    });
    it('sem afiliacao nem Lore, usa o fallback FAMILIA_SEM_CLA', () => {
        expect(getFamiliaNpc({ bio: {} })).toBe(FAMILIA_SEM_CLA);
        expect(getFamiliaNpc({})).toBe(FAMILIA_SEM_CLA);
        expect(getFamiliaNpc(null)).toBe(FAMILIA_SEM_CLA);
        expect(getFamiliaNpc(undefined)).toBe(FAMILIA_SEM_CLA);
    });
    it('afiliacao "Nenhum" cai no fallback (quando o Lore nao ajuda)', () => {
        expect(getFamiliaNpc({ bio: { afiliacao: 'Nenhum' } })).toBe(FAMILIA_SEM_CLA);
    });
    it('Cla de Origem "Nenhum" no Lore tambem cai no fallback', () => {
        expect(getFamiliaNpc({ poderes: [lore('Nenhum')] })).toBe(FAMILIA_SEM_CLA);
    });
    it('Cla de Origem vazio no Lore cai no fallback', () => {
        expect(getFamiliaNpc({ poderes: [{ nome: '📖 Linhagem & Lore', descricao: 'Clã de Origem:   ' }] })).toBe(FAMILIA_SEM_CLA);
    });
    it('Lore sem descricao ou com outro nome e ignorado', () => {
        expect(getFamiliaNpc({ poderes: [{ nome: '📖 Linhagem & Lore' }] })).toBe(FAMILIA_SEM_CLA);
        expect(getFamiliaNpc({ poderes: [{ nome: 'Outro', descricao: 'Clã de Origem: X' }] })).toBe(FAMILIA_SEM_CLA);
    });
    it('poderes com entradas nulas nao quebram', () => {
        expect(getFamiliaNpc({ poderes: [null, undefined, lore('Hyuga')] })).toBe('Hyuga');
    });
});

describe('agruparNpcsPorFamilia', () => {
    const mesa = () => ({
        Zeca: { isNPC: true, bio: { afiliacao: 'Uchiha' } },
        Ana: { isNPC: true, bio: { afiliacao: 'Uchiha' } },
        Bia: { bio: { mesa: 'npc' }, poderes: [lore('Hyuga')] },
        Lobo: { isNPC: true },
        Heroi: { bio: { mesa: 'jogador', afiliacao: 'Uchiha' } },
    });
    const total = (g) => Object.values(g).reduce((n, l) => n + l.length, 0);

    it('agrupa so os NPCs por familia', () => {
        const g = agruparNpcsPorFamilia(mesa());
        expect(Object.keys(g).sort()).toEqual(['Hyuga', FAMILIA_SEM_CLA, 'Uchiha'].sort());
        expect(g.Uchiha.map(x => x.nome)).toEqual(['Ana', 'Zeca']);
        expect(g.Hyuga.map(x => x.nome)).toEqual(['Bia']);
        expect(g[FAMILIA_SEM_CLA].map(x => x.nome)).toEqual(['Lobo']);
    });
    it('cada item traz nome e a propria ficha', () => {
        const m = mesa();
        const g = agruparNpcsPorFamilia(m);
        expect(g.Uchiha[0].nome).toBe('Ana');
        expect(g.Uchiha[0].ficha).toBe(m.Ana);
    });
    it('ordena os nomes de cada familia com localeCompare pt-BR', () => {
        const g = agruparNpcsPorFamilia({ Zé: { isNPC: true }, Álvaro: { isNPC: true }, Bruno: { isNPC: true } });
        expect(g[FAMILIA_SEM_CLA].map(x => x.nome)).toEqual(['Álvaro', 'Bruno', 'Zé']);
    });
    it('filtra pela busca sem diferenciar maiusculas', () => {
        const g = agruparNpcsPorFamilia(mesa(), 'ZEC');
        expect(Object.keys(g)).toEqual(['Uchiha']);
        expect(g.Uchiha.map(x => x.nome)).toEqual(['Zeca']);
    });
    it('busca com espacos nas pontas e aparada', () => {
        expect(Object.keys(agruparNpcsPorFamilia(mesa(), '  lobo  '))).toEqual([FAMILIA_SEM_CLA]);
    });
    it('busca filtra pelo nome, nao pela familia', () => {
        expect(agruparNpcsPorFamilia(mesa(), 'Uchiha')).toEqual({});
    });
    it('busca sem resultado devolve objeto vazio (sem familias vazias)', () => {
        expect(agruparNpcsPorFamilia(mesa(), 'zzz')).toEqual({});
    });
    it('busca vazia, null ou undefined nao filtra', () => {
        expect(total(agruparNpcsPorFamilia(mesa(), ''))).toBe(4);
        expect(total(agruparNpcsPorFamilia(mesa(), null))).toBe(4);
        expect(total(agruparNpcsPorFamilia(mesa(), undefined))).toBe(4);
    });
    it('personagens null, undefined ou vazio devolvem {}', () => {
        expect(agruparNpcsPorFamilia(null)).toEqual({});
        expect(agruparNpcsPorFamilia(undefined)).toEqual({});
        expect(agruparNpcsPorFamilia({})).toEqual({});
    });
    it('mesa sem nenhum NPC devolve {}', () => {
        expect(agruparNpcsPorFamilia({ A: { bio: { mesa: 'jogador' } }, B: {} })).toEqual({});
    });
    it('nao muta o objeto de entrada', () => {
        const m = mesa();
        const copia = JSON.stringify(m);
        agruparNpcsPorFamilia(m, 'a');
        expect(JSON.stringify(m)).toBe(copia);
    });
});

describe('getVidaMaxBrutaNpc', () => {
    it('ficha null ou undefined devolve 0', () => {
        expect(getVidaMaxBrutaNpc(null)).toBe(0);
        expect(getVidaMaxBrutaNpc(undefined)).toBe(0);
    });
    it('ficha sem vida devolve 0 (nunca NaN)', () => {
        expect(getVidaMaxBrutaNpc({})).toBe(0);
    });
    it('ficha com Vida base positiva devolve numero finito positivo', () => {
        const v = getVidaMaxBrutaNpc(fichaComVida(1000000));
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
    });
    it('mais Vida base resulta em mais Vida maxima', () => {
        expect(getVidaMaxBrutaNpc(fichaComVida(5000000))).toBeGreaterThan(getVidaMaxBrutaNpc(fichaComVida(1000000)));
    });
    it('Vida base 0 devolve 0', () => {
        expect(getVidaMaxBrutaNpc(fichaComVida(0))).toBe(0);
    });
    it('ficha malformada nao lanca e devolve 0', () => {
        const ruim = { vida: 'quebrado', poderes: 5, inventario: 'x' };
        expect(() => getVidaMaxBrutaNpc(ruim)).not.toThrow();
        expect(getVidaMaxBrutaNpc(ruim)).toBe(0);
    });
});

describe('posicoesLivres', () => {
    it('sem ocupadas devolve as primeiras casas varrendo linha a linha', () => {
        expect(posicoesLivres([], 3)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
    });
    it('pula casas ocupadas', () => {
        expect(posicoesLivres([{ x: 0, y: 0 }, { x: 2, y: 0 }], 3)).toEqual([{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]);
    });
    it('quebra para a proxima linha ao fim do tamanho', () => {
        expect(posicoesLivres([], 3, 2)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
    });
    it('quantidade 0 devolve lista vazia', () => {
        expect(posicoesLivres([], 0)).toEqual([]);
    });
    it('ignora entradas nulas, indefinidas e sem x', () => {
        expect(posicoesLivres([null, undefined, {}, { y: 3 }], 1)).toEqual([{ x: 0, y: 0 }]);
    });
    it('ocupadas null ou undefined equivale a lista vazia', () => {
        expect(posicoesLivres(null, 2)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
        expect(posicoesLivres(undefined, 1)).toEqual([{ x: 0, y: 0 }]);
    });
    it('posicao (0,0) numerica conta como ocupada', () => {
        expect(posicoesLivres([{ x: 0, y: 0 }], 1)).toEqual([{ x: 1, y: 0 }]);
    });
    it('grade cheia: as casas que faltam caem em (0,0)', () => {
        const ocupadas = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
        expect(posicoesLivres(ocupadas, 2, 2)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    });
    it('grade quase cheia: usa a livre e completa o resto com (0,0)', () => {
        const ocupadas = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
        expect(posicoesLivres(ocupadas, 3, 2)).toEqual([{ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 0, y: 0 }]);
    });
    it('sempre devolve exatamente a quantidade pedida', () => {
        expect(posicoesLivres([], 10)).toHaveLength(10);
        expect(posicoesLivres([], 5, 1)).toHaveLength(5);
    });
    it('tamanho padrao 30: a casa (29,0) existe e a seguinte vai para a linha de baixo', () => {
        const r = posicoesLivres([], 31);
        expect(r[29]).toEqual({ x: 29, y: 0 });
        expect(r[30]).toEqual({ x: 0, y: 1 });
    });
    it('nao devolve posicoes repetidas enquanto houver casas livres', () => {
        const r = posicoesLivres([{ x: 1, y: 0 }], 8);
        expect(new Set(r.map(p => `${p.x},${p.y}`)).size).toBe(8);
    });
});

describe('cenarioComTokensOcultos', () => {
    it('adiciona os ids em tokensOcultos', () => {
        expect(cenarioComTokensOcultos({ ativa: 'a', tokensOcultos: ['x'] }, ['d1', 'd2']).tokensOcultos).toEqual(['x', 'd1', 'd2']);
    });
    it('preserva os outros campos do cenario', () => {
        const novo = cenarioComTokensOcultos({ ativa: 'a', lista: { a: { nome: 'A' } } }, ['d1']);
        expect(novo.ativa).toBe('a');
        expect(novo.lista).toEqual({ a: { nome: 'A' } });
    });
    it('e pura: nao muta o cenario de entrada nem a lista original', () => {
        const entrada = { ativa: 'a', tokensOcultos: ['x'], lista: { a: { nome: 'A' } } };
        const copia = JSON.parse(JSON.stringify(entrada));
        const novo = cenarioComTokensOcultos(entrada, ['d1']);
        expect(entrada).toEqual(copia);
        expect(novo).not.toBe(entrada);
        expect(novo.tokensOcultos).not.toBe(entrada.tokensOcultos);
        expect(novo.lista).not.toBe(entrada.lista);
    });
    it('deduplica ids ja ocultos', () => {
        expect(cenarioComTokensOcultos({ tokensOcultos: ['d1'] }, ['d1', 'd2']).tokensOcultos).toEqual(['d1', 'd2']);
    });
    it('deduplica ids repetidos dentro da propria lista', () => {
        expect(cenarioComTokensOcultos({}, ['d1', 'd1', 'd1']).tokensOcultos).toEqual(['d1']);
    });
    it('funciona quando tokensOcultos nao existe', () => {
        expect(cenarioComTokensOcultos({ ativa: 'a' }, ['d1']).tokensOcultos).toEqual(['d1']);
    });
    it('tokensOcultos que nao e array e substituido por array', () => {
        expect(cenarioComTokensOcultos({ tokensOcultos: 'quebrado' }, ['d1']).tokensOcultos).toEqual(['d1']);
    });
    it('cenario null ou undefined devolve cenario novo so com tokensOcultos', () => {
        expect(cenarioComTokensOcultos(null, ['d1'])).toEqual({ tokensOcultos: ['d1'] });
        expect(cenarioComTokensOcultos(undefined, ['d1'])).toEqual({ tokensOcultos: ['d1'] });
    });
    it('ids vazio, null ou undefined mantem a lista e cria o campo', () => {
        expect(cenarioComTokensOcultos({}, []).tokensOcultos).toEqual([]);
        expect(cenarioComTokensOcultos({ tokensOcultos: ['x'] }, null).tokensOcultos).toEqual(['x']);
        expect(cenarioComTokensOcultos({}, undefined).tokensOcultos).toEqual([]);
    });
    it('ignora ids falsy (null, undefined, string vazia)', () => {
        expect(cenarioComTokensOcultos({}, [null, undefined, '', 'd1']).tokensOcultos).toEqual(['d1']);
    });
});

describe('montarDummieDeNpc', () => {
    const opts = (extra = {}) => ({ divisorPoderMesa: 1, cenaId: 'cena_x', posicao: { x: 3, y: 4 }, visibilidadeHp: 'mestre', numero: 2, ...extra });
    const ficha = (extra = {}) => fichaComVida(2000000, { __poder: 1234.5678, __evasiva: 12, __resistencia: 8, ...extra });
    const camposUndefined = (obj) => Object.entries(obj).filter(([, v]) => v === undefined).map(([k]) => k);

    it('o nome vira "Nome #numero"', () => {
        expect(montarDummieDeNpc('Goblin', ficha(), opts({ numero: 3 })).nome).toBe('Goblin #3');
    });
    it('numero padrao e 1', () => {
        expect(montarDummieDeNpc('Goblin', ficha(), { divisorPoderMesa: 1 }).nome).toBe('Goblin #1');
    });
    it('nome com acentos e espacos e preservado', () => {
        expect(montarDummieDeNpc('Lobo Cinzento ção', ficha(), opts()).nome).toBe('Lobo Cinzento ção #2');
    });
    it('hpMax e igual a hpAtual (Vida cheia) e sao a Vida bruta da ficha', () => {
        const f = ficha();
        const d = montarDummieDeNpc('Goblin', f, opts());
        expect(d.hpMax).toBe(d.hpAtual);
        expect(d.hpAtual).toBe(getVidaMaxBrutaNpc(f));
        expect(d.hpAtual).toBeGreaterThan(0);
    });
    it('sem Vida na ficha: hpMax = hpAtual = 100 * FATOR_EXIBICAO_VITAIS (escala bruta)', () => {
        const d = montarDummieDeNpc('Goblin', { isNPC: true }, opts());
        expect(d.hpMax).toBe(100 * FATOR_EXIBICAO_VITAIS);
        expect(d.hpAtual).toBe(100000);
    });
    it('ficha null usa o mesmo fallback de Vida e nao lanca', () => {
        const d = montarDummieDeNpc('Fantasma', null, opts());
        expect(d.hpAtual).toBe(100000);
        expect(d.hpMax).toBe(100000);
    });
    it('Defesa: evasiva maior que resistencia usa evasiva', () => {
        const d = montarDummieDeNpc('G', ficha({ __evasiva: 30, __resistencia: 12 }), opts());
        expect(d.tipoDefesa).toBe('evasiva');
        expect(d.valorDefesa).toBe(30);
    });
    it('Defesa: resistencia maior que evasiva usa resistencia', () => {
        const d = montarDummieDeNpc('G', ficha({ __evasiva: 12, __resistencia: 40 }), opts());
        expect(d.tipoDefesa).toBe('resistencia');
        expect(d.valorDefesa).toBe(40);
    });
    it('Defesa: empate fica com evasiva', () => {
        const d = montarDummieDeNpc('G', ficha({ __evasiva: 20, __resistencia: 20 }), opts());
        expect(d.tipoDefesa).toBe('evasiva');
        expect(d.valorDefesa).toBe(20);
    });
    it('Defesa: calcularCA lancando erro cai na CA padrao 10 (evasiva)', () => {
        const d = montarDummieDeNpc('G', ficha({ __erroCA: true }), opts());
        expect(d.tipoDefesa).toBe('evasiva');
        expect(d.valorDefesa).toBe(10);
    });
    it('Defesa: valor 0 cai em 10 (nunca defesa zerada)', () => {
        const d = montarDummieDeNpc('G', ficha({ __evasiva: 0, __resistencia: 0 }), opts());
        expect(d.valorDefesa).toBe(10);
    });
    it('poderCalculado existe quando o Poder e conhecido, arredondado a 2 casas', () => {
        expect(montarDummieDeNpc('G', ficha(), opts()).poderCalculado).toBe(1234.57);
    });
    it('Poder 0 e conhecido: poderCalculado 0 e gravado', () => {
        const d = montarDummieDeNpc('G', ficha({ __poder: 0 }), opts());
        expect('poderCalculado' in d).toBe(true);
        expect(d.poderCalculado).toBe(0);
    });
    it('Poder desconhecido (null): o campo poderCalculado nao existe', () => {
        const d = montarDummieDeNpc('G', fichaComVida(2000000), opts());
        expect('poderCalculado' in d).toBe(false);
    });
    it('fichaOrigem e o nome do NPC (sem o numero)', () => {
        expect(montarDummieDeNpc('Goblin', ficha(), opts()).fichaOrigem).toBe('Goblin');
    });
    it('repassa cenaId, posicao e visibilidadeHp', () => {
        const d = montarDummieDeNpc('G', ficha(), opts());
        expect(d.cenaId).toBe('cena_x');
        expect(d.posicao).toEqual({ x: 3, y: 4 });
        expect(d.visibilidadeHp).toBe('mestre');
    });
    it('padroes: cenaId default, posicao (0,0), visibilidadeHp todos', () => {
        const d = montarDummieDeNpc('G', ficha(), { divisorPoderMesa: 1 });
        expect(d.cenaId).toBe('default');
        expect(d.posicao).toEqual({ x: 0, y: 0 });
        expect(d.visibilidadeHp).toBe('todos');
    });
    it('sem objeto de opcoes tambem funciona', () => {
        expect(montarDummieDeNpc('G', ficha()).nome).toBe('G #1');
    });
    it('nenhum campo fica undefined (Firebase rejeita undefined)', () => {
        expect(camposUndefined(montarDummieDeNpc('G', ficha(), opts()))).toEqual([]);
        expect(camposUndefined(montarDummieDeNpc('G', null, opts({ posicao: undefined, cenaId: undefined })))).toEqual([]);
        expect(camposUndefined(montarDummieDeNpc('G', fichaComVida(100), {}))).toEqual([]);
    });
    it('o resultado e serializavel em JSON sem perder campos', () => {
        const d = montarDummieDeNpc('G', ficha(), opts());
        expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    });
    it('nao muta a ficha de origem', () => {
        const f = ficha();
        const copia = JSON.stringify(f);
        montarDummieDeNpc('G', f, opts());
        expect(JSON.stringify(f)).toBe(copia);
    });
});
