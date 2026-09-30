import { describe, it, expect } from 'vitest';
import {
    chaveFirebaseDoInstante, instanteDaChaveFirebase, montarLinhasSessao, listarDestinosRegistros,
    montarPedidoResumo, extrairDestinoSugerido, montarTextoMemoria,
} from './sextaFeiraSessao';

const ALF = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
// Mesmo algoritmo do push() do Firebase (prefixo de tempo + 12 chars aleatorios)
function pushIdLike(ms, rnd = () => Math.floor(Math.random() * 64)) {
    let now = ms; let id = '';
    for (let i = 7; i >= 0; i--) { id = ALF.charAt(now % 64) + id; now = Math.floor(now / 64); }
    for (let i = 0; i < 12; i++) id += ALF.charAt(rnd());
    return id;
}
const hora = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

describe('chaveFirebaseDoInstante / instanteDaChaveFirebase', () => {
    it('gera 8 chars de tempo + 12 hifens (20 no total)', () => {
        const c = chaveFirebaseDoInstante(1700000000000);
        expect(c).toHaveLength(20);
        expect(c.slice(8)).toBe('-'.repeat(12));
        [...c].forEach(ch => expect(ALF).toContain(ch));
    });
    it('roundtrip em varios instantes', () => {
        [0, 1, 63, 64, 1700000000000, Date.now(), 4398046511103].forEach(ms => {
            expect(instanteDaChaveFirebase(chaveFirebaseDoInstante(ms))).toBe(ms);
        });
    });
    it('instante 0 vira 20 hifens', () => {
        expect(chaveFirebaseDoInstante(0)).toBe('-'.repeat(20));
    });
    it('ordenacao: instantes maiores geram chaves lexicograficamente maiores (ordem ASCII)', () => {
        const ms = [1000, 5000, 1700000000000, 1700000000001, 1700000060000, 1800000000000];
        const chaves = ms.map(chaveFirebaseDoInstante);
        expect([...chaves].sort()).toEqual(chaves);
    });
    it('chave real (push id) decodifica para o instante e fica no intervalo esperado', () => {
        const ms = 1712345678901;
        const id = pushIdLike(ms);
        expect(instanteDaChaveFirebase(id)).toBe(ms);
        expect(id >= chaveFirebaseDoInstante(ms)).toBe(true);
        expect(id >= chaveFirebaseDoInstante(ms - 60000)).toBe(true);
        expect(id < chaveFirebaseDoInstante(ms + 1)).toBe(true);
        expect(pushIdLike(ms, () => 63) < chaveFirebaseDoInstante(ms + 1)).toBe(true);
    });
    it('entradas invalidas para o decodificador devolvem null', () => {
        expect(instanteDaChaveFirebase(null)).toBeNull();
        expect(instanteDaChaveFirebase(undefined)).toBeNull();
        expect(instanteDaChaveFirebase(123)).toBeNull();
        expect(instanteDaChaveFirebase('')).toBeNull();
        expect(instanteDaChaveFirebase('curta')).toBeNull();
        expect(instanteDaChaveFirebase('abc!defghijkl')).toBeNull();
        expect(instanteDaChaveFirebase('ab.defghijkl')).toBeNull();
        expect(instanteDaChaveFirebase('ção-12345678')).toBeNull();
    });
    it('gerador tolera entradas invalidas / negativas', () => {
        expect(chaveFirebaseDoInstante(-500)).toBe(chaveFirebaseDoInstante(0));
        expect(chaveFirebaseDoInstante(NaN)).toBe(chaveFirebaseDoInstante(0));
        expect(chaveFirebaseDoInstante(undefined)).toBe(chaveFirebaseDoInstante(0));
        expect(chaveFirebaseDoInstante('abc')).toBe(chaveFirebaseDoInstante(0));
        expect(chaveFirebaseDoInstante(10.9)).toBe(chaveFirebaseDoInstante(10));
    });
});

describe('montarLinhasSessao', () => {
    const t0 = 1712345678901;
    it('mescla feed e falas em ordem cronologica', () => {
        const r = montarLinhasSessao({
            eventosFeed: [
                { chave: pushIdLike(t0 + 2000), evento: { tipo: 'ataque', nome: 'Ana', dano: 10 } },
                { chave: pushIdLike(t0 + 6000), evento: { tipo: 'ataque', nome: 'Bruno' } },
            ],
            transcricoes: [
                { timestamp: t0 + 4000, autor: 'Mestre', texto: '  O dragao ruge  ', tipo: 'narrador' },
                { timestamp: t0 + 1000, autor: 'Goblin', texto: 'Grr', tipo: 'npc' },
                { timestamp: t0 + 8000, autor: 'Ana', texto: 'oi', tipo: 'jogador' },
            ],
        });
        const linhas = r.texto.split('\n');
        expect(linhas).toHaveLength(5);
        expect(linhas[0]).toBe(`[${hora(t0 + 1000)}] (fala) Goblin (NPC): "Grr"`);
        expect(linhas[1]).toContain('(combate) [ataque] Ana');
        expect(linhas[1]).toContain('dano: 10');
        expect(linhas[2]).toBe(`[${hora(t0 + 4000)}] (fala) Mestre (narração): "O dragao ruge"`);
        expect(linhas[3]).toContain('(combate) [ataque] Bruno');
        expect(linhas[4]).toBe(`[${hora(t0 + 8000)}] (fala) Ana: "oi"`);
        expect(r.total).toBe(5);
        expect(r.cortado).toBe(false);
    });
    it('entradas vazias', () => {
        expect(montarLinhasSessao({})).toEqual({ texto: '', total: 0, cortado: false });
        expect(montarLinhasSessao({ eventosFeed: [], transcricoes: [] }).total).toBe(0);
    });
    it('ignora itens invalidos (chave ruim, evento nulo, fala sem texto/timestamp)', () => {
        const r = montarLinhasSessao({
            eventosFeed: [
                { chave: 'xx', evento: { tipo: 'a' } },
                { chave: pushIdLike(t0), evento: null },
                { chave: pushIdLike(t0), evento: 'string' },
                { chave: pushIdLike(t0), evento: { tipo: 'ok', nome: 'Z' } },
            ],
            transcricoes: [
                { timestamp: 'abc', texto: 'x' }, { timestamp: t0 }, { timestamp: t0, texto: '' },
                { timestamp: t0 + 1, texto: 'valida' },
            ],
        });
        expect(r.total).toBe(2);
        expect(r.texto).toContain('(fala) ?: "valida"');
        expect(r.texto).toContain('[ok] Z');
    });
    it('corta o comeco quando passa do limite e mantem o mais recente', () => {
        const transcricoes = Array.from({ length: 10 }, (_, i) => ({ timestamp: t0 + i * 1000, autor: 'A', texto: `fala numero ${i}`, tipo: 'x' }));
        const r = montarLinhasSessao({ transcricoes }, 120);
        expect(r.cortado).toBe(true);
        expect(r.texto.startsWith('[... começo da sessão cortado por tamanho ...]\n')).toBe(true);
        expect(r.texto).toContain('fala numero 9');
        expect(r.texto).not.toContain('fala numero 0');
        expect(r.total).toBe(10);
        const corpo = r.texto.split('\n').slice(1).join('\n');
        expect(corpo.length).toBeLessThanOrEqual(120);
    });
    it('uma unica linha maior que o limite e mantida (nao fica vazio)', () => {
        const r = montarLinhasSessao({ transcricoes: [{ timestamp: t0, autor: 'A', texto: 'x'.repeat(500) }] }, 50);
        expect(r.texto).toContain('xxx');
        expect(r.cortado).toBe(false);
    });
    it('nao corta quando cabe', () => {
        const r = montarLinhasSessao({ transcricoes: [{ timestamp: t0, autor: 'A', texto: 'oi' }] }, 1000);
        expect(r.cortado).toBe(false);
        expect(r.texto).not.toContain('cortado');
    });
});

describe('listarDestinosRegistros', () => {
    it('sempre inclui novo_capitulo, mesmo sem capitulos', () => {
        expect(listarDestinosRegistros(undefined)).toEqual([{ valor: 'novo_capitulo', rotulo: 'Criar um Capítulo novo' }]);
        expect(listarDestinosRegistros('x')).toHaveLength(1);
    });
    it('lista novo arco e cada arco', () => {
        const d = listarDestinosRegistros([{ id: 1, titulo: 'C1', arcos: [{ id: 11, titulo: 'A1' }, { id: 12, titulo: 'A2' }] }, { id: 2, titulo: 'C2' }]);
        expect(d.map(x => x.valor)).toEqual(['novo_capitulo', 'novo_arco_1', '1_11', '1_12', 'novo_arco_2']);
        expect(d[2].rotulo).toContain('A1');
        expect(d[2].rotulo).toContain('C1');
    });
});

describe('montarPedidoResumo', () => {
    it('inclui destinos, linhas e instrucao DESTINO', () => {
        const p = montarPedidoResumo({ linhasSessao: 'LINHA_X', destinos: [{ valor: 'novo_capitulo', rotulo: 'Cap novo' }], desdeTexto: 'de hoje' });
        expect(p).toContain('(de hoje)');
        expect(p).toContain('- novo_capitulo: Cap novo');
        expect(p).toContain('DESTINO: <valor>');
        expect(p).toContain('--- REGISTRO DA SESSÃO ---\nLINHA_X\n--- FIM DO REGISTRO ---');
    });
});

describe('extrairDestinoSugerido', () => {
    const destinos = [{ valor: 'novo_capitulo' }, { valor: '1_11' }, { valor: 'novo_arco_1' }];
    it('extrai e remove a ultima linha DESTINO', () => {
        expect(extrairDestinoSugerido('Resumo\n\nDESTINO: 1_11', destinos)).toEqual({ texto: 'Resumo', destino: '1_11' });
    });
    it('tolera negrito, crase e caixa', () => {
        expect(extrairDestinoSugerido('T\n**DESTINO:** novo_capitulo', destinos).destino).toBe('novo_capitulo');
        expect(extrairDestinoSugerido('T\n**DESTINO: `novo_arco_1`**', destinos).destino).toBe('novo_arco_1');
        expect(extrairDestinoSugerido('T\n destino : `1_11` ', destinos)).toEqual({ texto: 'T', destino: '1_11' });
    });
    it('destino invalido: remove a linha mas devolve null', () => {
        expect(extrairDestinoSugerido('T\nDESTINO: nao_existe', destinos)).toEqual({ texto: 'T', destino: null });
    });
    it('sem linha DESTINO devolve o texto (trim) e null', () => {
        expect(extrairDestinoSugerido('  so texto  ', destinos)).toEqual({ texto: 'so texto', destino: null });
    });
    it('remove apenas a ULTIMA ocorrencia', () => {
        const r = extrairDestinoSugerido('DESTINO: novo_capitulo\nmeio\nDESTINO: 1_11', destinos);
        expect(r.destino).toBe('1_11');
        expect(r.texto).toBe('DESTINO: novo_capitulo\nmeio');
    });
    it('nao confunde DESTINO no meio de uma frase', () => {
        const r = extrairDestinoSugerido('O DESTINO: é cruel', destinos);
        expect(r.destino).toBeNull();
        expect(r.texto).toBe('O DESTINO: é cruel');
    });
    it('entradas nulas', () => {
        expect(extrairDestinoSugerido(null, null)).toEqual({ texto: '', destino: null });
        expect(extrairDestinoSugerido(undefined, undefined)).toEqual({ texto: '', destino: null });
    });
});

describe('montarTextoMemoria', () => {
    const mem = {
        a: { texto: 'antigo', em: 1 },
        b: { texto: 'segredo', soMestre: true, em: 3 },
        c: { texto: '  recente  ', em: 5 },
        d: { texto: '   ', em: 9 },
        e: null,
        f: { texto: 42, em: 10 },
    };
    it('mestre ve tudo, mais recente primeiro, segredo marcado', () => {
        expect(montarTextoMemoria(mem, true)).toBe('- recente\n- segredo (segredo do Mestre)\n- antigo');
    });
    it('jogador nao recebe soMestre', () => {
        const t = montarTextoMemoria(mem, false);
        expect(t).toBe('- recente\n- antigo');
        expect(t).not.toContain('segredo');
    });
    it('respeita o limite (mantem os mais recentes)', () => {
        expect(montarTextoMemoria(mem, true, 20)).toBe('- recente');
    });
    it('memoria vazia/invalida', () => {
        expect(montarTextoMemoria(null, true)).toBe('');
        expect(montarTextoMemoria(undefined, false)).toBe('');
        expect(montarTextoMemoria({}, true)).toBe('');
        expect(montarTextoMemoria('str', true)).toBe('');
    });
    it('limite 0 devolve vazio', () => {
        expect(montarTextoMemoria(mem, true, 0)).toBe('');
    });
});
