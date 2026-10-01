import { describe, it, expect } from 'vitest';
import { descreverDestinoPedido, tempoDesde, ordenarPedidosPendentes, TIPOS_PEDIDO_JOGADOR } from './sextaFeiraCriacao';

describe('TIPOS_PEDIDO_JOGADOR', () => {
    it('contém só poder, magia e item', () => {
        expect(TIPOS_PEDIDO_JOGADOR).toEqual(['poder', 'magia', 'item']);
    });
});

describe('descreverDestinoPedido', () => {
    it('poder: habilidade é o padrão e vai pra Poderes Clássicos', () => {
        const d = descreverDestinoPedido('poder', { categoria: 'habilidade' });
        expect(d).toMatchObject({ secao: 'poderes', pagina: 'Poderes Clássicos', local: 'Habilidades', tipo: 'Habilidade', oQue: 'uma Habilidade', botaoVer: 'Ver a Habilidade' });
    });
    it('poder: categoria poder usa artigo masculino', () => {
        const d = descreverDestinoPedido('poder', { categoria: 'poder' });
        expect(d.oQue).toBe('um Poder');
        expect(d.botaoVer).toBe('Ver o Poder');
        expect(d.local).toBe('Poderes');
    });
    it('poder: categoria forma', () => {
        const d = descreverDestinoPedido('poder', { categoria: 'forma' });
        expect(d.oQue).toBe('uma Forma');
        expect(d.botaoVer).toBe('Ver a Forma');
        expect(d.local).toBe('Formas');
    });
    it('poder: categoria inválida cai em habilidade', () => {
        expect(descreverDestinoPedido('poder', { categoria: 'xyz' }).tipo).toBe('Habilidade');
    });
    it('poder: inclui pasta no local e vertente com elemento no tipo', () => {
        const d = descreverDestinoPedido('poder', { categoria: 'poder', pasta: '  Fogo  ', vertente: 'Elemental', elemento: 'Fogo' });
        expect(d.local).toBe('Poderes › pasta "Fogo"');
        expect(d.tipo).toBe('Poder · Elemental (Fogo)');
    });
    it('poder: vertente sem elemento não mostra parênteses', () => {
        expect(descreverDestinoPedido('poder', { categoria: 'habilidade', vertente: 'Marcial' }).tipo).toBe('Habilidade · Marcial');
    });
    it('poder: objeto nulo não quebra', () => {
        expect(descreverDestinoPedido('poder', null).secao).toBe('poderes');
        expect(descreverDestinoPedido('poder', undefined).local).toBe('Habilidades');
    });
    it('magia: elemento e mecânica conhecida', () => {
        const d = descreverDestinoPedido('magia', { elemento: 'Fogo', tipoMecanica: 'saving' });
        expect(d).toMatchObject({ secao: 'magias', pagina: 'Elementos', local: 'Pergaminhos de Fogo', tipo: 'Técnica Elemental · Teste de resistência', oQue: 'uma Técnica Elemental', botaoVer: 'Ver a Técnica' });
    });
    it('magia: sem elemento é Neutro e mecânica padrão Ataque', () => {
        const d = descreverDestinoPedido('magia', {});
        expect(d.local).toBe('Pergaminhos de Neutro');
        expect(d.tipo).toBe('Técnica Elemental · Ataque');
    });
    it('magia: mecânica desconhecida aparece crua', () => {
        expect(descreverDestinoPedido('magia', { tipoMecanica: 'zzz' }).tipo).toBe('Técnica Elemental · zzz');
    });
    it('item: arma com armaTipo e raridade', () => {
        const d = descreverDestinoPedido('item', { tipo: 'arma', armaTipo: 'espada', raridade: 'raro' });
        expect(d).toMatchObject({ secao: 'inventario', pagina: 'Inventário', local: 'Mochila (não equipado)', tipo: 'Arma · espada · raro', oQue: 'um Item', botaoVer: 'Ver o Item' });
    });
    it('item: tipo desconhecido vira Item', () => {
        expect(descreverDestinoPedido('item', {}).tipo).toBe('Item');
    });
    it('item: armadura', () => {
        expect(descreverDestinoPedido('item', { tipo: 'armadura', raridade: 'comum' }).tipo).toBe('Armadura · comum');
    });
    it('tipo desconhecido: seção vazia e textos genéricos', () => {
        const d = descreverDestinoPedido('banana', {});
        expect(d).toMatchObject({ secao: '', pagina: '', local: '', tipo: 'banana', oQue: 'uma criação', botaoVer: 'Ver o pedido' });
    });
    it('tipo com rótulo conhecido (npc) usa o rótulo', () => {
        expect(descreverDestinoPedido('npc', {}).tipo).toBe('NPC do Mapa');
    });
    it('tipo undefined/null não quebra', () => {
        expect(descreverDestinoPedido(undefined, null).tipo).toBe('');
        expect(descreverDestinoPedido(null).oQue).toBe('uma criação');
    });
});

describe('tempoDesde', () => {
    const agora = 1_000_000_000_000;
    it.each([
        [agora, 'agora mesmo'],
        [agora - 59999, 'agora mesmo'],
        [agora - 60000, 'há 1 min'],
        [agora - 5 * 60000, 'há 5 min'],
        [agora - 59 * 60000, 'há 59 min'],
        [agora - 60 * 60000, 'há 1 h'],
        [agora - 23 * 3600000, 'há 23 h'],
        [agora - 24 * 3600000, 'há 1 dia'],
        [agora - 47 * 3600000, 'há 1 dia'],
        [agora - 48 * 3600000, 'há 2 dias'],
        [agora - 10 * 86400000, 'há 10 dias'],
    ])('em=%s -> %s', (em, esperado) => {
        expect(tempoDesde(em, agora)).toBe(esperado);
    });
    it('data no futuro vira agora mesmo', () => {
        expect(tempoDesde(agora + 100000, agora)).toBe('agora mesmo');
    });
    it('entradas inválidas viram agora mesmo', () => {
        expect(tempoDesde(undefined, agora)).toBe('agora mesmo');
        expect(tempoDesde('abc', agora)).toBe('agora mesmo');
        expect(tempoDesde(NaN, agora)).toBe('agora mesmo');
        expect(tempoDesde(agora, NaN)).toBe('agora mesmo');
    });
    it('aceita número em string', () => {
        expect(tempoDesde(String(agora - 120000), agora)).toBe('há 2 min');
    });
    it('sem "agora" usa Date.now', () => {
        expect(tempoDesde(Date.now())).toBe('agora mesmo');
    });
});

describe('ordenarPedidosPendentes', () => {
    const ped = (over = {}) => ({ tipo: 'poder', alvo: 'Ana', solicitante: 'Ana', em: 1, avisos: [], objeto: { nome: 'Golpe', categoria: 'habilidade' }, ...over });

    it('entradas inválidas devolvem lista vazia', () => {
        expect(ordenarPedidosPendentes(null)).toEqual([]);
        expect(ordenarPedidosPendentes(undefined)).toEqual([]);
        expect(ordenarPedidosPendentes('x')).toEqual([]);
        expect(ordenarPedidosPendentes({})).toEqual([]);
    });
    it('ordena do mais novo pro mais antigo', () => {
        const r = ordenarPedidosPendentes({ a: ped({ em: 10 }), b: ped({ em: 30 }), c: ped({ em: 20 }) });
        expect(r.map(([id]) => id)).toEqual(['b', 'c', 'a']);
    });
    it('descarta nulos, tipo inválido, tipo só-do-Mestre, objeto ausente ou inválido', () => {
        const r = ordenarPedidosPendentes({
            nulo: null, texto: 'x', semTipo: ped({ tipo: undefined }), tipoRuim: ped({ tipo: 'npc' }),
            semObj: ped({ objeto: undefined }), objString: ped({ objeto: 'abc' }), semNome: ped({ objeto: { categoria: 'poder' } }),
            nomeVazio: ped({ objeto: { nome: '   ' } }), ok: ped(),
        });
        expect(r.map(([id]) => id)).toEqual(['ok']);
    });
    it('normaliza nome em objeto para string sem quebrar', () => {
        const r = ordenarPedidosPendentes({ a: ped({ objeto: { nome: { x: 1 } } }) });
        expect(r).toHaveLength(1);
        expect(typeof r[0][1].objeto.nome).toBe('string');
    });
    it('avisos como string vira lista vazia', () => {
        const r = ordenarPedidosPendentes({ a: ped({ avisos: 'cuidado' }) });
        expect(r[0][1].avisos).toEqual([]);
    });
    it('avisos válidos viram strings e vazios são filtrados', () => {
        const r = ordenarPedidosPendentes({ a: ped({ avisos: ['x', '', null, 5] }) });
        expect(r[0][1].avisos).toEqual(['x', '5']);
    });
    it('efeitos que não são lista não quebram', () => {
        expect(() => ordenarPedidosPendentes({
            a: ped({ objeto: { nome: 'A', efeitos: 'abc', efeitosPassivos: 5 } }),
            b: ped({ objeto: { nome: 'B', efeitos: { 0: { nome: 'x' } }, efeitosPassivos: null } }),
            c: ped({ tipo: 'item', objeto: { nome: 'C', efeitos: 'abc', efeitosPassivos: {} } }),
            d: ped({ tipo: 'magia', objeto: { nome: 'D', efeitos: 1 } }),
        })).not.toThrow();
        const r = ordenarPedidosPendentes({ a: ped({ objeto: { nome: 'A', efeitos: 'abc' } }) });
        expect(Array.isArray(r[0][1].objeto.efeitos)).toBe(true);
    });
    it('solicitante e alvo viram string', () => {
        const r = ordenarPedidosPendentes({ a: ped({ solicitante: { n: 1 }, alvo: 42 }), b: ped({ solicitante: undefined, alvo: null }) });
        const m = Object.fromEntries(r);
        expect(typeof m.a.solicitante).toBe('string');
        expect(m.a.alvo).toBe('42');
        expect(m.b.solicitante).toBe('');
        expect(m.b.alvo).toBe('');
    });
    it('em inválido vira 0 e vai pro fim', () => {
        const r = ordenarPedidosPendentes({ a: ped({ em: 'abc' }), b: ped({ em: 5 }) });
        expect(r.map(([id]) => id)).toEqual(['b', 'a']);
        expect(r[1][1].em).toBe(0);
    });
    it('trunca textos muito longos', () => {
        const r = ordenarPedidosPendentes({ a: ped({ solicitante: 'x'.repeat(500) }) });
        expect(r[0][1].solicitante.length).toBe(60);
    });
    it('não muta o objeto original', () => {
        const orig = { a: ped({ avisos: 'x' }) };
        const copia = JSON.parse(JSON.stringify(orig));
        ordenarPedidosPendentes(orig);
        expect(orig).toEqual(copia);
    });
    it('suporta unicode no nome', () => {
        const r = ordenarPedidosPendentes({ a: ped({ objeto: { nome: '炎の剣 🔥' } }) });
        expect(r[0][1].objeto.nome).toBe('炎の剣 🔥');
    });
});
