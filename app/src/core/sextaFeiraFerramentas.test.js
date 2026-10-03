import { describe, it, expect, vi } from 'vitest';
import {
    DECLARACOES_FERRAMENTAS, resolverPersonagem, resumoFichaDetalhado, executarFerramenta, montarContextoInicial,
} from './sextaFeiraFerramentas';
import { calcularPoderAtual } from './poder';
import { calcularFadigaAtual, calcularGanhoFadigaDinamico } from './fadiga';

const deepFreeze = (o) => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
    return o;
};

function fichaBase(over = {}) {
    return {
        bio: { raca: 'Humano', classe: 'Guerreiro' },
        vida: { base: 5000000, atual: 5000000 },
        mana: { base: 50000000, atual: 50000000 },
        aura: { base: 50000000, atual: 50000000 },
        chakra: { base: 50000000, atual: 50000000 },
        corpo: { base: 50000000, atual: 50000000 },
        forca: { base: 1000000 },
        poderes: [], inventario: [], passivas: [], seresSelados: [],
        combate: {}, supressaoPoder: 100,
        ...over,
    };
}

function estadoBase(over = {}) {
    return {
        meuNome: 'Ana', isMestre: false, podeVerFuturo: false,
        minhaFicha: fichaBase(),
        personagens: {
            Bruno: fichaBase({ bio: { raca: 'Elfo', classe: 'Mago' }, vida: { base: 5000000, atual: 2500000 } }),
            Brenda: fichaBase({ bio: { raca: 'Anao', classe: 'Ladino' } }),
        },
        dummies: {
            d1: { nome: 'Goblin', hpAtual: 500, hpMax: 1000, iniciativa: 7 },
        },
        resumoTurnoMapa: { ordem: [], turnoAtualIndex: 0 },
        cenario: { ativa: 'c1', lista: { c1: { nome: 'Floresta' } } },
        feedCombate: [],
        divisorPoderMesa: 1,
        capitulosPresente: [{ titulo: 'CapP', arcos: [{ titulo: 'ArcoP', texto: 'O dragao Zephyr vive na montanha\nOutra linha qualquer' }] }],
        capitulosFuturo: [{ titulo: 'CapF', arcos: [{ titulo: 'ArcoF', texto: 'Zephyr morrera no futuro' }] }],
        ...over,
    };
}

const chamar = (nome, args, estado, extra) => executarFerramenta(nome, args, estado, extra);

describe('DECLARACOES_FERRAMENTAS', () => {
    it('declara as 10 ferramentas com name/description/parameters', () => {
        expect(DECLARACOES_FERRAMENTAS.map(d => d.name)).toEqual([
            'listar_personagens', 'consultar_ficha', 'estado_combate', 'feed_recente',
            'buscar_lore', 'buscar_arvore', 'transcricoes_recentes', 'memorizar_fato', 'simular_prestigio', 'projetar_fadiga',
        ]);
        DECLARACOES_FERRAMENTAS.forEach(d => {
            expect(typeof d.description).toBe('string');
            expect(d.parameters.type).toBe('OBJECT');
        });
    });
});

describe('resolverPersonagem', () => {
    const st = estadoBase();
    it('vazio ou proprio nome devolve a propria ficha', () => {
        expect(resolverPersonagem(st, '').nome).toBe('Ana');
        expect(resolverPersonagem(st, undefined).ficha).toBe(st.minhaFicha);
        expect(resolverPersonagem(st, ' ana ').nome).toBe('Ana');
    });
    it('exato, case-insensitive e parcial unico', () => {
        expect(resolverPersonagem(st, 'Bruno').nome).toBe('Bruno');
        expect(resolverPersonagem(st, 'bRUNo').nome).toBe('Bruno');
        expect(resolverPersonagem(st, 'run').nome).toBe('Bruno');
    });
    it('parcial ambiguo ou inexistente devolve null', () => {
        expect(resolverPersonagem(st, 'br')).toBeNull();
        expect(resolverPersonagem(st, 'zzz')).toBeNull();
    });
    it('sem minhaFicha e nome vazio devolve null', () => {
        expect(resolverPersonagem(estadoBase({ minhaFicha: null }), '')).toBeNull();
    });
    it('ignora entradas nao-objeto', () => {
        expect(resolverPersonagem(estadoBase({ personagens: { X: null, Y: 'str' } }), 'x')).toBeNull();
    });
});

describe('listar_personagens', () => {
    it('jogador ve nomes e npcs so com nome e vida%', async () => {
        const r = await chamar('listar_personagens', {}, estadoBase());
        expect(r.voceE).toBe('Ana');
        expect(r.papel).toBe('Jogador');
        expect(r.jogadores).toEqual(['Ana', 'Bruno', 'Brenda']);
        expect(r.npcs).toEqual([{ nome: 'Goblin', tipo: 'NPC', vidaPorcentagem: 50 }]);
    });
    it('Mestre ve mais dados dos npcs', async () => {
        const r = await chamar('listar_personagens', {}, estadoBase({ isMestre: true }));
        expect(r.papel).toBe('Mestre');
        expect(r.npcs[0]).toMatchObject({ nome: 'Goblin', vidaPorcentagem: 50, vidaAtual: 0, vidaMaxima: 1, iniciativa: 7 });
    });
    it('nao duplica o proprio nome se tambem estiver em personagens', async () => {
        const st = estadoBase(); st.personagens.ana = fichaBase();
        const r = await chamar('listar_personagens', {}, st);
        expect(r.jogadores.filter(n => n.toLowerCase() === 'ana')).toHaveLength(1);
    });
    it('sem dummies/personagens nao quebra', async () => {
        const r = await chamar('listar_personagens', {}, estadoBase({ personagens: undefined, dummies: undefined }));
        expect(r.jogadores).toEqual(['Ana']);
        expect(r.npcs).toEqual([]);
    });
    it('vida do dummie fica em [0,100] e null sem hpMax', async () => {
        const st = estadoBase({ dummies: { a: { nome: 'A', hpAtual: 5000, hpMax: 1000 }, b: { nome: 'B', hpAtual: -50, hpMax: 1000 }, c: { nome: 'C', hpAtual: 5 }, d: null } });
        const r = await chamar('listar_personagens', {}, st);
        expect(r.npcs.map(n => n.vidaPorcentagem)).toEqual([100, 0, null]);
    });
    it('dummie sem nome usa o id', async () => {
        const r = await chamar('listar_personagens', {}, estadoBase({ dummies: { xyz: { hpAtual: 1, hpMax: 2 } } }));
        expect(r.npcs[0].nome).toBe('xyz');
    });
});

describe('consultar_ficha - permissoes', () => {
    it('jogador recebe a propria ficha completa (sem nome e com nome)', async () => {
        const a = await chamar('consultar_ficha', {}, estadoBase());
        const b = await chamar('consultar_ficha', { nome: 'ana' }, estadoBase());
        expect(a).toEqual(b);
        expect(a).toHaveProperty('poderCalculado');
        expect(a).toHaveProperty('vitais');
        expect(a).toHaveProperty('prestigio');
        expect(a.nome).toBe('Ana');
    });
    it('jogador so ve o publico de outro, mesmo com nome parcial', async () => {
        for (const nome of ['Bruno', 'bruno', 'run']) {
            const r = await chamar('consultar_ficha', { nome }, estadoBase());
            expect(Object.keys(r).sort()).toEqual(['classe', 'nome', 'observacao', 'raca', 'vidaPorcentagem']);
            expect(r).toMatchObject({ nome: 'Bruno', raca: 'Elfo', classe: 'Mago', vidaPorcentagem: 50 });
            expect(r.observacao).toMatch(/públicos/);
        }
    });
    it('Mestre ve ficha completa de outros', async () => {
        const r = await chamar('consultar_ficha', { nome: 'Bruno' }, estadoBase({ isMestre: true }));
        expect(r).toHaveProperty('poderCalculado');
        expect(r).toHaveProperty('prestigio');
        expect(r).not.toHaveProperty('observacao');
    });
    it('dummie: jogador so nome+vida%, Mestre mais', async () => {
        const j = await chamar('consultar_ficha', { nome: 'goblin' }, estadoBase());
        expect(j).toEqual({ nome: 'Goblin', tipo: 'NPC', vidaPorcentagem: 50 });
        const m = await chamar('consultar_ficha', { nome: 'Goblin' }, estadoBase({ isMestre: true }));
        expect(m).toHaveProperty('iniciativa', 7);
        expect(m).toHaveProperty('vidaMaxima');
    });
    it('nome inexistente ou ambiguo devolve erro', async () => {
        expect((await chamar('consultar_ficha', { nome: 'Fulano' }, estadoBase())).erro).toMatch(/Fulano/);
        expect((await chamar('consultar_ficha', { nome: 'br' }, estadoBase())).erro).toBeTruthy();
    });
    it('sem minhaFicha e sem nome devolve erro', async () => {
        expect((await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: null }))).erro).toBeTruthy();
    });
    it('vazamento: JSON do publico nao contem dados da ficha (poder, base)', async () => {
        const r = await chamar('consultar_ficha', { nome: 'Brenda' }, estadoBase());
        const s = JSON.stringify(r);
        expect(s).not.toMatch(/poderCalculado|prestigio|vitais|fadiga/i);
    });
});

describe('consultar_ficha - numeros batem com o motor', () => {
    it('poderCalculado = calcularPoderAtual(...).poderGlobal', async () => {
        const st = estadoBase({ divisorPoderMesa: 10 });
        const r = await chamar('consultar_ficha', {}, st);
        expect(r.poderCalculado).toBe(calcularPoderAtual(st.minhaFicha, 10).poderGlobal);
        expect(r.poderCalculado).toBeGreaterThan(0);
    });
    it('fadiga, supressao e ascensao', async () => {
        const ficha = fichaBase({ combate: { fadigaExtra: 37.26 }, supressaoPoder: 62.44, ascensaoBase: '3' });
        const r = await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: ficha }));
        expect(r.fadigaPorcentagem).toBe(Math.round(calcularFadigaAtual(ficha) * 10) / 10);
        expect(r.supressaoPoder).toBe(62.4);
        expect(r.ascensaoBase).toBe(3);
    });
    it('supressao ausente ou vazia = 100', async () => {
        const f = fichaBase(); delete f.supressaoPoder;
        expect((await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: f }))).supressaoPoder).toBe(100);
        expect((await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: fichaBase({ supressaoPoder: '' }) }))).supressaoPoder).toBe(100);
    });
    it('ascensaoBase invalida vira 1', async () => {
        expect((await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: fichaBase({ ascensaoBase: 'abc' }) }))).ascensaoBase).toBe(1);
    });
    it('prestigio lido com bases numericas', async () => {
        const r = await chamar('consultar_ficha', {}, estadoBase());
        expect(r.prestigio).toMatchObject({ vida: 5, mana: 5, aura: 5, chakra: 5, corpo: 5, status: 0 });
    });
    it('prestigio lido com bases em string com pontos ("5.000.000") igual ao numerico', async () => {
        const f = fichaBase({
            vida: { base: '5.000.000', atual: 5000000 },
            mana: { base: '50.000.000', atual: 50000000 },
            aura: { base: '50000000', atual: 50000000 },
        });
        const r = await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: f }));
        expect(r.prestigio.vida).toBe(5);
        expect(r.prestigio.mana).toBe(5);
        expect(r.prestigio.aura).toBe(5);
    });
    it('prestigio respeita divisores e status', async () => {
        const f = fichaBase({ divisores: { vida: 2 }, statusPrestigioAplicado: 12.9 });
        const r = await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: f }));
        expect(r.prestigio.vida).toBe(10);
        expect(r.prestigio.status).toBe(12);
    });
    it('base ausente = 0', async () => {
        const f = fichaBase({ vida: { atual: 10 } });
        expect((await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: f }))).prestigio.vida).toBe(0);
    });
    it('vitais: atual/maximo divididos por 1000 e porcentagem clampada em [0,100]', async () => {
        const f = fichaBase({ vida: { base: 5000000, atual: 999999999999 }, mana: { base: 50000000, atual: -5 } });
        const r = await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: f }));
        expect(r.vitais.vida.porcentagem).toBe(100);
        expect(r.vitais.mana.porcentagem).toBe(0);
        expect(r.vitais.vida.maximo).toBeGreaterThan(0);
    });
    it('vital sem atual definido conta como cheio', async () => {
        const f = fichaBase({ vida: { base: 5000000 } });
        const r = await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: f }));
        expect(r.vitais.vida.porcentagem).toBe(100);
    });
    it('vital ausente nao aparece', async () => {
        const f = fichaBase(); delete f.chakra;
        const r = await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: f }));
        expect(r.vitais.chakra).toBeUndefined();
    });
    it('poderes, armas, magias e pontos de prestigio', async () => {
        const f = fichaBase({
            poderes: [{ nome: 'Bankai', categoria: 'Forma', ativa: true }, { nome: 'Raio', categoria: 'Ataque', ativa: true }, { nome: 'Off', ativa: false }],
            inventario: [{ nome: 'Espada', tipo: 'arma', equipado: true }, { nome: 'Adaga', tipo: 'arma', equipado: false }, { nome: 'Poção', tipo: 'item', equipado: true }],
            ataquesElementais: { a: { nome: 'Bola', elemento: 'Fogo', equipado: true }, b: { nome: 'Neutra', equipado: true }, c: { nome: 'X', equipado: false } },
            prestigioPontosDisponiveis: 7,
        });
        const r = await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: f }));
        expect(r.formasAtivas).toEqual(['Bankai']);
        expect(r.poderesAtivos).toEqual(['Raio']);
        expect(r.armasEquipadas).toEqual(['Espada']);
        expect(r.magiasPreparadas).toEqual(['Bola (Fogo)', 'Neutra (Neutro)']);
        expect(r.pontosPrestigioDisponiveis).toBe(7);
    });
    it('ficha vazia/sem bio nao quebra (N/A)', async () => {
        const r = await chamar('consultar_ficha', {}, estadoBase({ minhaFicha: {} }));
        expect(r.raca).toBe('N/A');
        expect(r.classe).toBe('N/A');
        expect(r.erro).toBeUndefined();
    });
    it('resumoFichaDetalhado direto', () => {
        const r = resumoFichaDetalhado('Ana', fichaBase(), estadoBase());
        expect(r.nome).toBe('Ana');
    });
});

describe('estado_combate', () => {
    const ordem = [{ nome: 'A', iniciativa: 10 }, { nome: 'B', iniciativa: 5, isDummie: true }, { nome: 'C', iniciativa: 1 }];
    it('sem ordem: emCombate false e nome da cena', async () => {
        const r = await chamar('estado_combate', {}, estadoBase());
        expect(r).toMatchObject({ emCombate: false, cena: 'Floresta' });
    });
    it('cena cai para o id ativo ou "desconhecida"', async () => {
        expect((await chamar('estado_combate', {}, estadoBase({ cenario: { ativa: 'zz', lista: {} } }))).cena).toBe('zz');
        expect((await chamar('estado_combate', {}, estadoBase({ cenario: undefined }))).cena).toBe('desconhecida');
    });
    it('com ordem: vez, proximo e lista', async () => {
        const r = await chamar('estado_combate', {}, estadoBase({ resumoTurnoMapa: { ordem, turnoAtualIndex: 1 } }));
        expect(r).toMatchObject({ emCombate: true, vezDe: 'B', proximo: 'C' });
        expect(r.ordemDeTurno).toEqual([
            { posicao: 1, nome: 'A', iniciativa: 10, npc: false },
            { posicao: 2, nome: 'B', iniciativa: 5, npc: true },
            { posicao: 3, nome: 'C', iniciativa: 1, npc: false },
        ]);
    });
    it('index faz wrap (ultimo -> primeiro, maior que tamanho, negativo)', async () => {
        const f = async (i) => chamar('estado_combate', {}, estadoBase({ resumoTurnoMapa: { ordem, turnoAtualIndex: i } }));
        expect((await f(2))).toMatchObject({ vezDe: 'C', proximo: 'A' });
        expect((await f(3))).toMatchObject({ vezDe: 'A', proximo: 'B' });
        expect((await f(7))).toMatchObject({ vezDe: 'B' });
        expect((await f(-1))).toMatchObject({ vezDe: 'C', proximo: 'A' });
        expect((await f(undefined))).toMatchObject({ vezDe: 'A' });
        expect((await f('x'))).toMatchObject({ vezDe: 'A' });
    });
    it('ordem como objeto (Firebase) tambem funciona', async () => {
        const r = await chamar('estado_combate', {}, estadoBase({ resumoTurnoMapa: { ordem: { 0: ordem[0], 1: ordem[1] }, turnoAtualIndex: 1 } }));
        expect(r).toMatchObject({ vezDe: 'B', proximo: 'A' });
    });
    it('sem resumoTurnoMapa', async () => {
        expect((await chamar('estado_combate', {}, estadoBase({ resumoTurnoMapa: undefined }))).emCombate).toBe(false);
    });
});

describe('feed_recente', () => {
    const feed = Array.from({ length: 50 }, (_, i) => ({ tipo: 'ataque', nome: `E${i}`, dano: i }));
    it('padrao 15, os mais recentes em ordem cronologica', async () => {
        const r = await chamar('feed_recente', {}, estadoBase({ feedCombate: feed }));
        expect(r.total).toBe(15);
        expect(r.eventos[0]).toContain('E35');
        expect(r.eventos[14]).toContain('E49');
    });
    it('limita a 30 e a no minimo 1', async () => {
        expect((await chamar('feed_recente', { quantidade: 999 }, estadoBase({ feedCombate: feed }))).total).toBe(30);
        expect((await chamar('feed_recente', { quantidade: 30 }, estadoBase({ feedCombate: feed }))).total).toBe(30);
        expect((await chamar('feed_recente', { quantidade: 1 }, estadoBase({ feedCombate: feed }))).total).toBe(1);
        expect((await chamar('feed_recente', { quantidade: -5 }, estadoBase({ feedCombate: feed }))).total).toBe(1);
        expect((await chamar('feed_recente', { quantidade: 0 }, estadoBase({ feedCombate: feed }))).total).toBe(15);
        expect((await chamar('feed_recente', { quantidade: 'abc' }, estadoBase({ feedCombate: feed }))).total).toBe(15);
        expect((await chamar('feed_recente', { quantidade: 3.9 }, estadoBase({ feedCombate: feed }))).total).toBe(3);
    });
    it('feed vazio ou menor que a quantidade', async () => {
        expect(await chamar('feed_recente', {}, estadoBase())).toEqual({ eventos: [], total: 0 });
        expect((await chamar('feed_recente', { quantidade: 10 }, estadoBase({ feedCombate: feed.slice(0, 3) }))).total).toBe(3);
    });
    it('formata campos e ignora entradas invalidas', async () => {
        const r = await chamar('feed_recente', {}, estadoBase({ feedCombate: [
            null, 'x',
            { tipo: 'teste', nome: 'Ana', nomeTeste: 'Força', total: 12, acertouAlvo: true, alvoNome: 'Goblin', armaStr: 'Espada', texto: 'oi', acertoTotal: 20, dano: 0 },
            { acertouAlvo: false },
        ] }));
        expect(r.total).toBe(2);
        expect(r.eventos[0]).toBe('[teste] Ana | oi | teste: Força | com Espada | alvo: Goblin | total: 12 | acerto: 20 | dano: 0 | ACERTOU');
        expect(r.eventos[1]).toBe('[evento] ? | ERROU');
    });
    it('trunca cada evento em 300 caracteres', async () => {
        const r = await chamar('feed_recente', {}, estadoBase({ feedCombate: [{ tipo: 't', nome: 'n', texto: 'x'.repeat(1000) }] }));
        expect(r.eventos[0].length).toBe(300);
    });
});

describe('buscar_lore', () => {
    it('jogador so ve o Presente', async () => {
        const r = await chamar('buscar_lore', { termo: 'zephyr' }, estadoBase());
        expect(r.trechos).toHaveLength(1);
        expect(r.trechos[0]).toContain('(Presente > CapP > ArcoP)');
        expect(JSON.stringify(r)).not.toMatch(/Futuro/);
    });
    it('podeVerFuturo inclui o Futuro', async () => {
        const r = await chamar('buscar_lore', { termo: 'Zephyr' }, estadoBase({ podeVerFuturo: true }));
        expect(r.trechos).toHaveLength(2);
        expect(r.trechos[1]).toContain('(Futuro > CapF > ArcoF)');
        expect(r.totalEncontrado).toBe(2);
    });
    it('Mestre sem podeVerFuturo nao ve o Futuro (flag manda)', async () => {
        const r = await chamar('buscar_lore', { termo: 'zephyr' }, estadoBase({ isMestre: true }));
        expect(r.trechos).toHaveLength(1);
    });
    it('termo vazio devolve erro; sem resultado devolve mensagem', async () => {
        expect((await chamar('buscar_lore', { termo: '  ' }, estadoBase())).erro).toBeTruthy();
        expect((await chamar('buscar_lore', {}, estadoBase())).erro).toBeTruthy();
        const r = await chamar('buscar_lore', { termo: 'inexistente' }, estadoBase());
        expect(r.trechos).toEqual([]);
        expect(r.mensagem).toMatch(/Nada encontrado/);
    });
    it('ignora linhas muito curtas', async () => {
        const st = estadoBase({ capitulosPresente: [{ titulo: 'C', arcos: [{ titulo: 'A', texto: 'ab\nabc' }] }] });
        expect((await chamar('buscar_lore', { termo: 'ab' }, st)).trechos).toEqual([]);
    });
    it('limita o texto total a ~6000 caracteres', async () => {
        const linhas = Array.from({ length: 100 }, (_, i) => `Zephyr ${i} ${'y'.repeat(200)}`).join('\n');
        const st = estadoBase({ capitulosPresente: [{ titulo: 'C', arcos: [{ titulo: 'A', texto: linhas }] }] });
        const r = await chamar('buscar_lore', { termo: 'zephyr' }, st);
        expect(r.trechos.join('\n').length).toBeLessThanOrEqual(6000);
        expect(r.trechos.length).toBeLessThan(100);
        expect(r.totalEncontrado).toBe(100);
    });
    it('capitulos como objeto e sem arcos nao quebram', async () => {
        const st = estadoBase({ capitulosPresente: { 0: { titulo: 'C' }, 1: null, 2: { titulo: 'D', arcos: { 0: { titulo: 'A', texto: 'achei Zephyr aqui' } } } } });
        expect((await chamar('buscar_lore', { termo: 'zephyr' }, st)).trechos).toHaveLength(1);
    });
});

describe('buscar_arvore', () => {
    const arvore = {
        Silva: [{ nome: 'Joao', papel: 'Pai', classe: 'Guerreiro', elemento: 'Fogo', status: 'vivo', lore: 'L'.repeat(900) }, { nome: 'Maria', papel: 'Mae', afiliacao: 'Guilda', parceiros: 'Joao' }],
        Souza: [{ nome: 'Pedro', papel: 'Filho' }],
    };
    it('usa carregarArvore e filtra por termo (nome, papel, familia, afiliacao)', async () => {
        const carregarArvore = vi.fn().mockResolvedValue(arvore);
        const r = await chamar('buscar_arvore', { termo: 'joao' }, estadoBase(), { carregarArvore });
        expect(carregarArvore).toHaveBeenCalledTimes(1);
        expect(r.encontrados.map(m => m.nome)).toEqual(['Joao', 'Maria']);
        expect(r.encontrados[0].familia).toBe('Silva');
        expect(r.encontrados[0].lore.length).toBe(500);
        expect((await chamar('buscar_arvore', { termo: 'souza' }, estadoBase(), { carregarArvore })).encontrados.map(m => m.nome)).toEqual(['Pedro']);
        expect((await chamar('buscar_arvore', { termo: 'guilda' }, estadoBase(), { carregarArvore })).encontrados.map(m => m.nome)).toEqual(['Maria']);
    });
    it('sem termo lista familias', async () => {
        expect(await chamar('buscar_arvore', {}, estadoBase(), { carregarArvore: async () => arvore })).toEqual({ familias: ['Silva', 'Souza'] });
    });
    it('sem resultado devolve familias', async () => {
        const r = await chamar('buscar_arvore', { termo: 'nada' }, estadoBase(), { carregarArvore: async () => arvore });
        expect(r.encontrados).toEqual([]);
        expect(r.familias).toEqual(['Silva', 'Souza']);
    });
    it('limita a 20 resultados', async () => {
        const grande = { F: Array.from({ length: 40 }, (_, i) => ({ nome: `Membro${i}` })) };
        const r = await chamar('buscar_arvore', { termo: 'membro' }, estadoBase(), { carregarArvore: async () => grande });
        expect(r.encontrados).toHaveLength(20);
    });
    it('sem carregarArvore ou arvore nula', async () => {
        expect((await chamar('buscar_arvore', { termo: 'x' }, estadoBase())).erro).toMatch(/indisponível/);
        expect(await chamar('buscar_arvore', {}, estadoBase(), { carregarArvore: async () => null })).toEqual({ familias: [] });
    });
    it('carregarArvore que rejeita vira erro, sem lançar', async () => {
        const r = await chamar('buscar_arvore', { termo: 'x' }, estadoBase(), { carregarArvore: async () => { throw new Error('boom'); } });
        expect(r.erro).toMatch(/boom/);
    });
});

describe('simular_prestigio', () => {
    it('pontos positivos aumentam o poder', async () => {
        const st = estadoBase();
        const r = await chamar('simular_prestigio', { categoria: 'vida', pontos: 10 }, st);
        expect(r.prestigioAntes).toBe(5);
        expect(r.prestigioDepois).toBe(15);
        expect(r.poderDepois).toBeGreaterThan(r.poderAntes);
        expect(r.poderAntes).toBe(calcularPoderAtual(st.minhaFicha, 1).poderGlobal);
        expect(r.ganhoDePoder).toBe(r.poderDepois - r.poderAntes);
        expect(r.nome).toBe('Ana');
    });
    it('funciona para todas as categorias vitais', async () => {
        for (const cat of ['vida', 'mana', 'aura', 'chakra', 'corpo']) {
            const r = await chamar('simular_prestigio', { categoria: cat.toUpperCase(), pontos: 5 }, estadoBase());
            expect(r.erro).toBeUndefined();
            expect(r.categoria).toBe(cat);
            expect(r.prestigioDepois).toBe(10);
        }
    });
    it('base em string "5.000.000" e simulada igual ao numerico', async () => {
        const f = fichaBase({ vida: { base: '5.000.000', atual: 5000000 } });
        const a = await chamar('simular_prestigio', { categoria: 'vida', pontos: 3 }, estadoBase({ minhaFicha: f }));
        const b = await chamar('simular_prestigio', { categoria: 'vida', pontos: 3 }, estadoBase());
        expect(a.prestigioAntes).toBe(5);
        expect(a).toEqual(b);
    });
    it('avisa acima de 100 e acima dos pontos disponiveis', async () => {
        const r = await chamar('simular_prestigio', { categoria: 'vida', pontos: 200 }, estadoBase());
        expect(r.avisos).toHaveLength(2);
        expect(r.avisos[0]).toMatch(/100/);
        expect(r.avisos[1]).toMatch(/0 ponto/);
    });
    it('sem avisos quando dentro do limite e dos pontos disponiveis', async () => {
        const st = estadoBase({ minhaFicha: fichaBase({ prestigioPontosDisponiveis: 10 }) });
        const r = await chamar('simular_prestigio', { categoria: 'mana', pontos: 10 }, st);
        expect(r.avisos).toEqual([]);
    });
    it('pontos negativos reduzem e nunca ficam abaixo de 0', async () => {
        const r = await chamar('simular_prestigio', { categoria: 'vida', pontos: -100 }, estadoBase());
        expect(r.prestigioDepois).toBe(0);
        expect(r.poderDepois).toBeLessThan(r.poderAntes);
    });
    it('NAO muta a ficha real (deep-freeze e JSON antes/depois)', async () => {
        const st = estadoBase({ isMestre: true });
        deepFreeze(st);
        const antes = JSON.stringify(st);
        const r = await chamar('simular_prestigio', { categoria: 'corpo', pontos: 20, nome: 'Bruno' }, st);
        expect(r.erro).toBeUndefined();
        expect(JSON.stringify(st)).toBe(antes);
        await chamar('simular_prestigio', { categoria: 'vida', pontos: 20 }, st);
        expect(JSON.stringify(st)).toBe(antes);
    });
    it('categoria invalida (incluindo status) e pontos 0/invalidos dao erro', async () => {
        expect((await chamar('simular_prestigio', { categoria: 'status', pontos: 5 }, estadoBase())).erro).toBeTruthy();
        expect((await chamar('simular_prestigio', { categoria: 'xyz', pontos: 5 }, estadoBase())).erro).toBeTruthy();
        expect((await chamar('simular_prestigio', { pontos: 5 }, estadoBase())).erro).toBeTruthy();
        expect((await chamar('simular_prestigio', { categoria: 'vida', pontos: 0 }, estadoBase())).erro).toMatch(/pontos/);
        expect((await chamar('simular_prestigio', { categoria: 'vida', pontos: 'abc' }, estadoBase())).erro).toMatch(/pontos/);
        expect((await chamar('simular_prestigio', { categoria: 'vida' }, estadoBase())).erro).toMatch(/pontos/);
    });
    it('jogador nao simula outro personagem; Mestre sim', async () => {
        const j = await chamar('simular_prestigio', { categoria: 'vida', pontos: 5, nome: 'Bruno' }, estadoBase());
        expect(j.erro).toMatch(/próprio/);
        expect(j).not.toHaveProperty('poderAntes');
        const m = await chamar('simular_prestigio', { categoria: 'vida', pontos: 5, nome: 'Bruno' }, estadoBase({ isMestre: true }));
        expect(m.erro).toBeUndefined();
        expect(m.nome).toBe('Bruno');
    });
    it('jogador consegue simular a si mesmo pelo proprio nome', async () => {
        const r = await chamar('simular_prestigio', { categoria: 'vida', pontos: 5, nome: 'ana' }, estadoBase());
        expect(r.erro).toBeUndefined();
    });
    it('personagem inexistente', async () => {
        expect((await chamar('simular_prestigio', { categoria: 'vida', pontos: 5, nome: 'Nope' }, estadoBase({ isMestre: true }))).erro).toMatch(/Nope/);
    });
    it('categoria ausente na ficha e criada na copia (sem lancar)', async () => {
        const f = fichaBase(); delete f.aura;
        const r = await chamar('simular_prestigio', { categoria: 'aura', pontos: 4 }, estadoBase({ minhaFicha: f }));
        expect(r.erro).toBeUndefined();
        expect(r.prestigioDepois).toBe(4);
    });
});

describe('projetar_fadiga', () => {
    it('ficha descansada a supressao 100 ganha 3 por turno (Esforco de Poder)', async () => {
        const r = await chamar('projetar_fadiga', { turnos: 4 }, estadoBase());
        expect(r.porTurno).toHaveLength(4);
        r.porTurno.forEach(t => expect(t.ganho).toBeCloseTo(3, 5));
        expect(r.porTurno.map(t => t.fadiga)).toEqual([3, 6, 9, 12]);
        expect(r.fadigaInicial).toBe(0);
        expect(r.supressao).toBe(100);
        expect(r.turnosAteAlvo).toBeUndefined();
        expect(r.observacao).toBeTruthy();
    });
    it('ganho bate com calcularGanhoFadigaDinamico', async () => {
        const st = estadoBase();
        const r = await chamar('projetar_fadiga', { turnos: 1 }, st);
        expect(r.porTurno[0].ganho).toBeCloseTo(calcularGanhoFadigaDinamico(st.minhaFicha, { incluirEsforcoPoder: true }), 2);
    });
    it('supressao <= 80 nao gera fadiga', async () => {
        for (const s of [80, 50, 1]) {
            const r = await chamar('projetar_fadiga', { supressao: s, turnos: 3 }, estadoBase());
            expect(r.supressao).toBe(s);
            r.porTurno.forEach(t => { expect(t.ganho).toBe(0); expect(t.fadiga).toBe(0); });
        }
    });
    it('supressao e clampada em [1,100]', async () => {
        expect((await chamar('projetar_fadiga', { supressao: 500 }, estadoBase())).supressao).toBe(100);
        expect((await chamar('projetar_fadiga', { supressao: -3 }, estadoBase())).supressao).toBe(1);
    });
    it('usa a supressao atual da ficha quando nao informada', async () => {
        const st = estadoBase({ minhaFicha: fichaBase({ supressaoPoder: 60 }) });
        const r = await chamar('projetar_fadiga', { turnos: 2 }, st);
        expect(r.supressao).toBe(60);
        expect(r.porTurno[0].ganho).toBe(0);
    });
    it('turnos: padrao 10, max 100, min 1', async () => {
        expect((await chamar('projetar_fadiga', {}, estadoBase())).porTurno).toHaveLength(10);
        expect((await chamar('projetar_fadiga', { turnos: 1000 }, estadoBase())).porTurno).toHaveLength(100);
        expect((await chamar('projetar_fadiga', { turnos: -4 }, estadoBase())).porTurno).toHaveLength(1);
        expect((await chamar('projetar_fadiga', { turnos: 'x' }, estadoBase())).porTurno).toHaveLength(10);
    });
    it('fadiga satura em 100', async () => {
        const r = await chamar('projetar_fadiga', { turnos: 100 }, estadoBase());
        expect(r.porTurno[99].fadiga).toBe(100);
    });
    it('turnosAteAlvo calculado (alvo 10 com 3/turno = 4) mesmo alem de "turnos"', async () => {
        const r = await chamar('projetar_fadiga', { turnos: 2, fadigaAlvo: 10 }, estadoBase());
        expect(r.turnosAteAlvo).toBe(4);
        expect(r.fadigaAlvo).toBe(10);
        expect(r.porTurno).toHaveLength(2);
    });
    it('turnosAteAlvo = 0 se ja atingido', async () => {
        const st = estadoBase({ minhaFicha: fichaBase({ combate: { fadigaExtra: 50 } }) });
        const r = await chamar('projetar_fadiga', { turnos: 2, fadigaAlvo: 40 }, st);
        expect(r.turnosAteAlvo).toBe(0);
        expect(r.fadigaInicial).toBe(50);
    });
    it('alvo inalcancavel: "mais de 100"', async () => {
        const r = await chamar('projetar_fadiga', { supressao: 50, turnos: 3, fadigaAlvo: 30 }, estadoBase());
        expect(r.turnosAteAlvo).toBe('mais de 100');
    });
    it('alvo 0 e valido (ja atingido)', async () => {
        const r = await chamar('projetar_fadiga', { turnos: 1, fadigaAlvo: 0 }, estadoBase());
        expect(r.turnosAteAlvo).toBe(0);
    });
    it('NAO muta a ficha real', async () => {
        const st = deepFreeze(estadoBase({ isMestre: true }));
        const antes = JSON.stringify(st);
        const r = await chamar('projetar_fadiga', { turnos: 5, nome: 'Bruno', supressao: 90 }, st);
        expect(r.erro).toBeUndefined();
        expect(JSON.stringify(st)).toBe(antes);
        await chamar('projetar_fadiga', { turnos: 5 }, st);
        expect(JSON.stringify(st)).toBe(antes);
    });
    it('jogador nao projeta outro personagem; Mestre sim', async () => {
        const j = await chamar('projetar_fadiga', { nome: 'Bruno' }, estadoBase());
        expect(j.erro).toMatch(/próprio/);
        expect(j).not.toHaveProperty('porTurno');
        const m = await chamar('projetar_fadiga', { nome: 'Bruno' }, estadoBase({ isMestre: true }));
        expect(m.nome).toBe('Bruno');
        expect(m.porTurno.length).toBeGreaterThan(0);
    });
    it('personagem inexistente', async () => {
        expect((await chamar('projetar_fadiga', { nome: 'Nope' }, estadoBase({ isMestre: true }))).erro).toMatch(/Nope/);
    });
    it('ficha sem combate (criado na copia)', async () => {
        const f = fichaBase(); delete f.combate;
        const r = await chamar('projetar_fadiga', { turnos: 1 }, estadoBase({ minhaFicha: f }));
        expect(r.erro).toBeUndefined();
        expect(r.porTurno[0].fadiga).toBe(3);
    });
});

describe('executarFerramenta - geral', () => {
    it('ferramenta desconhecida', async () => {
        expect((await chamar('apagar_tudo', {}, estadoBase())).erro).toMatch(/desconhecida: apagar_tudo/);
    });
    it('args null/undefined tratados', async () => {
        expect((await chamar('estado_combate', null, estadoBase())).emCombate).toBe(false);
        expect((await chamar('feed_recente', undefined, estadoBase())).total).toBe(0);
    });
    it('excecao interna vira {erro}, sem lancar', async () => {
        const st = estadoBase();
        Object.defineProperty(st, 'dummies', { get() { throw new Error('kaboom'); } });
        const r = await chamar('listar_personagens', {}, st);
        expect(r.erro).toMatch(/kaboom/);
    });
    it('resultados sao serializaveis em JSON', async () => {
        for (const d of DECLARACOES_FERRAMENTAS) {
            const r = await chamar(d.name, { categoria: 'vida', pontos: 1, termo: 'a' }, estadoBase(), { carregarArvore: async () => ({}) });
            expect(() => JSON.stringify(r)).not.toThrow();
        }
    });
});

describe('montarContextoInicial', () => {
    it('jogador com ficha inclui JSON da propria ficha', () => {
        const txt = montarContextoInicial(estadoBase());
        expect(txt).toContain('Quem fala: Ana');
        expect(txt).toContain('Jogador');
        expect(txt).toContain('"poderCalculado"');
    });
    it('Mestre', () => {
        expect(montarContextoInicial(estadoBase({ isMestre: true }))).toContain('Mestre (vê tudo da mesa)');
    });
    it('nao vaza fichas de outros', () => {
        const txt = montarContextoInicial(estadoBase());
        expect(txt).not.toContain('Bruno');
        expect(txt).not.toContain('Elfo');
    });
    it('sem ficha e sem nome', () => {
        const txt = montarContextoInicial(estadoBase({ minhaFicha: null, meuNome: '' }));
        expect(txt).toContain('Desconhecido');
        expect(txt).not.toContain('Ficha de quem fala');
    });
});

describe('feed_recente - numeros da Disputa de Poder so para o Mestre', () => {
    const feedDisputa = [
        { tipo: 'dano', nome: 'Ana', dano: 1000, danoAplicado: 2000, alvoNome: 'Goblin', textoDisputa: 'Disputa de Poder: atacante mais forte', textoMestre: 'Aplicado: 2000' },
        { tipo: 'sistema', nome: 'SISTEMA', texto: 'O Mestre aplicou dano em Goblin!', textoMestre: 'Aplicado: 110 (digitado 100)' },
    ];
    it('jogador: nada de "no alvo", textoDisputa nem textoMestre', async () => {
        const r = await chamar('feed_recente', {}, estadoBase({ isMestre: false, feedCombate: feedDisputa }));
        const tudo = r.eventos.join(' | ');
        expect(tudo).toContain('dano: 1000');
        expect(tudo).not.toContain('no alvo');
        expect(tudo).not.toContain('2000');
        expect(tudo).not.toContain('Disputa');
        expect(tudo).not.toContain('digitado');
    });
    it('Mestre: recebe os numeros recalculados e o textoMestre', async () => {
        const r = await chamar('feed_recente', {}, estadoBase({ isMestre: true, feedCombate: feedDisputa }));
        expect(r.eventos[0]).toContain('no alvo: 2000');
        expect(r.eventos[0]).toContain('Disputa de Poder: atacante mais forte');
        expect(r.eventos[1]).toContain('Aplicado: 110 (digitado 100)');
    });
    it('isMestre ausente/undefined e tratado como jogador (nao vaza)', async () => {
        const r = await chamar('feed_recente', {}, estadoBase({ isMestre: undefined, feedCombate: feedDisputa }));
        expect(r.eventos.join(' | ')).not.toContain('Aplicado');
    });
});
