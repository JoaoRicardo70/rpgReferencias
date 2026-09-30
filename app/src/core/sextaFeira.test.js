import { describe, it, expect } from 'vitest';
import {
    montarContextoFicha, montarHistoricoGemini, adicionarMensagemUsuario, selecionarLoreRelevante,
    montarInstrucaoSistema, normalizarCapitulos, normalizarRegistros, corrigirIdAtivo,
    SYSTEM_PROMPT_SEXTA_FEIRA,
} from './sextaFeira';

describe('montarContextoFicha', () => {
    it('comeca com Quem fala e lista itens equipados/guardados', () => {
        const ficha = {
            bio: { raca: 'Elfo', classe: 'Mago' },
            inventario: [
                { nome: 'Espada', tipo: 'arma', equipado: true, dadosQtd: 2, dadosFaces: 8, raridade: 'Raro' },
                { nome: 'Adaga', tipo: 'arma', equipado: false },
                { nome: 'Pocao', tipo: 'consumivel' },
            ],
            ataquesElementais: [{ nome: 'Bola', elemento: 'Fogo', equipado: true }, { nome: 'X', equipado: false }],
            poderes: [{ nome: 'P1', ativa: true, vertente: 'Luz' }, { nome: 'P2', ativa: false }],
        };
        const t = montarContextoFicha(ficha, 'Natsu');
        expect(t.startsWith('Quem fala: Natsu')).toBe(true);
        expect(t).toContain('Raça: Elfo | Classe: Mago');
        expect(t).toContain('Espada [Raro/arma/Dano: 2d8]');
        expect(t).toContain('Armas guardadas: Adaga [Comum/arma/Dano: sem dados]');
        expect(t).toContain('Bola [Fogo]');
        expect(t).not.toContain('Pocao');
        expect(t).toContain('P1 [Luz]');
        expect(t).not.toContain('P2');
    });
    it('ficha nula', () => {
        expect(montarContextoFicha(null, 'Ana')).toBe('Quem fala: Ana');
        expect(montarContextoFicha(undefined, '')).toBe('Quem fala: Desconhecido');
    });
    it('arrays ausentes usam padroes', () => {
        const t = montarContextoFicha({}, 'Z');
        expect(t).toContain('Desarmado');
        expect(t).toContain('Armas guardadas: Nenhuma');
        expect(t).toContain('Magias preparadas: Nenhuma');
        expect(t).toContain('Poderes ativos: Nenhum');
        expect(t).toContain('N/A');
        expect(t).not.toContain('Vitais atuais');
    });
    it('arrays com nulos e tipos errados nao quebram', () => {
        expect(() => montarContextoFicha({ inventario: [null, undefined], poderes: 'x', ataquesElementais: {} }, 'A')).not.toThrow();
    });
    it('vitais aparecem', () => {
        const t = montarContextoFicha({ vida: { atual: 100 }, mana: { atual: 'abc' } }, 'A');
        expect(t).toContain('Vitais atuais: vida:');
        expect(t).toContain('mana: 0');
    });
});

describe('montarHistoricoGemini', () => {
    it('mapeia roles e descarta erro/vazio', () => {
        const r = montarHistoricoGemini([
            { role: 'user', texto: 'oi' }, { role: 'erro', texto: 'falha' }, { role: 'ai', texto: 'ola' },
            { role: 'user', texto: '   ' }, { role: 'ai', texto: '' },
        ]);
        expect(r).toEqual([{ role: 'user', parts: [{ text: 'oi' }] }, { role: 'model', parts: [{ text: 'ola' }] }]);
    });
    it('une papeis consecutivos', () => {
        const r = montarHistoricoGemini([{ role: 'user', texto: 'a' }, { role: 'erro', texto: 'e' }, { role: 'user', texto: 'b' }, { role: 'ai', texto: 'c' }]);
        expect(r).toEqual([{ role: 'user', parts: [{ text: 'a\n\nb' }] }, { role: 'model', parts: [{ text: 'c' }] }]);
    });
    it('remove turnos iniciais do modelo', () => {
        const r = montarHistoricoGemini([{ role: 'ai', texto: 'x' }, { role: 'user', texto: 'y' }]);
        expect(r).toEqual([{ role: 'user', parts: [{ text: 'y' }] }]);
        expect(montarHistoricoGemini([{ role: 'ai', texto: 'so ia' }])).toEqual([]);
    });
    it('respeita o limite (ultimas N validas)', () => {
        const h = [];
        for (let i = 0; i < 10; i++) h.push({ role: i % 2 ? 'ai' : 'user', texto: `m${i}` });
        const r = montarHistoricoGemini(h, 4);
        expect(r.map(c => c.parts[0].text)).toEqual(['m6', 'm7', 'm8', 'm9']);
        expect(r[0].role).toBe('user');
    });
    it('limite padrao 12', () => {
        const h = [];
        for (let i = 0; i < 30; i++) h.push({ role: i % 2 ? 'ai' : 'user', texto: `m${i}` });
        expect(montarHistoricoGemini(h)).toHaveLength(12);
    });
    it('entradas invalidas', () => {
        expect(montarHistoricoGemini(null)).toEqual([]);
        expect(montarHistoricoGemini(undefined)).toEqual([]);
        expect(montarHistoricoGemini([null, { role: 'user' }, { role: 'user', texto: 5 }])).toEqual([]);
        expect(montarHistoricoGemini([{ role: 'user', texto: 'a' }], 0)).toEqual([]);
    });
    it('nao muta o historico original', () => {
        const h = [{ role: 'user', texto: 'a' }, { role: 'user', texto: 'b' }];
        const copia = JSON.parse(JSON.stringify(h));
        montarHistoricoGemini(h);
        expect(h).toEqual(copia);
    });
});

describe('adicionarMensagemUsuario', () => {
    it('acrescenta turno do usuario apos o modelo', () => {
        const base = [{ role: 'user', parts: [{ text: 'a' }] }, { role: 'model', parts: [{ text: 'b' }] }];
        const r = adicionarMensagemUsuario(base, 'c');
        expect(r).toHaveLength(3);
        expect(r[2]).toEqual({ role: 'user', parts: [{ text: 'c' }] });
    });
    it('une ao ultimo turno de usuario sem mutar a entrada', () => {
        const base = [{ role: 'user', parts: [{ text: 'a' }] }];
        const r = adicionarMensagemUsuario(base, 'c');
        expect(r).toEqual([{ role: 'user', parts: [{ text: 'a\n\nc' }] }]);
        expect(base[0].parts[0].text).toBe('a');
    });
    it('lista vazia/null', () => {
        expect(adicionarMensagemUsuario([], 'x')).toEqual([{ role: 'user', parts: [{ text: 'x' }] }]);
        expect(adicionarMensagemUsuario(null, 'x')).toEqual([{ role: 'user', parts: [{ text: 'x' }] }]);
    });
});

describe('selecionarLoreRelevante', () => {
    const caps = [{ arcos: [{ texto: 'O dragao vermelho vive na montanha distante\nNada relevante aqui neste paragrafo' }] }, { arcos: [{ texto: 'A princesa foi sequestrada pelo dragao' }] }];
    it('filtra paragrafos por palavra > 4 letras', () => {
        const r = selecionarLoreRelevante(caps, 'onde vive o dragao?', 'ARCO');
        expect(r).toContain('dragao vermelho');
        expect(r).toContain('princesa');
        expect(r).toContain('[...]');
        expect(r).not.toContain('Nada relevante');
    });
    it('sem match usa final do arco ativo limitado', () => {
        expect(selecionarLoreRelevante(caps, 'zzzzzzz', '0123456789', 4)).toBe('6789');
    });
    it('mensagem so com palavras curtas/ignoradas usa arco ativo', () => {
        expect(selecionarLoreRelevante(caps, 'oi tudo sobre', 'ativo')).toBe('ativo');
    });
    it('respeita limite no resultado filtrado', () => {
        expect(selecionarLoreRelevante(caps, 'dragao', '', 10).length).toBeLessThanOrEqual(10);
    });
    it('entradas nulas', () => {
        expect(selecionarLoreRelevante(null, null, null)).toBe('');
        expect(selecionarLoreRelevante([null, { arcos: null }], 'dragao', undefined)).toBe('');
    });
});

describe('montarInstrucaoSistema', () => {
    it('inclui prompt, contexto e lore', () => {
        const t = montarInstrucaoSistema({ contextoFicha: 'Quem fala: X', lore: '  historia  ' });
        expect(t).toContain(SYSTEM_PROMPT_SEXTA_FEIRA);
        expect(t).toContain('Quem fala: X');
        expect(t).toContain('Trechos da lore');
        expect(t).toContain('historia');
        expect(t.trim().endsWith('--- FIM DO CONTEXTO ---')).toBe(true);
    });
    it('omite lore vazia', () => {
        expect(montarInstrucaoSistema({ contextoFicha: 'a', lore: '  ' })).not.toContain('Trechos da lore');
        expect(montarInstrucaoSistema({})).toContain('--- CONTEXTO ---');
    });
});

describe('normalizarCapitulos / normalizarRegistros', () => {
    it('aceita objeto no formato RTDB e completa arcos/tierList', () => {
        const r = normalizarCapitulos({ 0: { id: 1, titulo: 'C', arcos: { 0: { id: 11, titulo: 'A', texto: 't' } } }, 1: { id: 2 } });
        expect(r).toHaveLength(2);
        expect(r[0].arcos).toEqual([{ id: 11, titulo: 'A', texto: 't' }]);
        expect(r[0].tierList).toEqual([]);
        expect(r[1].titulo).toBe('Capítulo 2');
        expect(r[1].arcos).toEqual([{ id: 2001, titulo: 'Arco Principal', texto: '' }]);
    });
    it('gera ids/titulos faltantes de arco', () => {
        const r = normalizarCapitulos([{ id: 3, arcos: [{ texto: 5 }] }]);
        expect(r[0].arcos[0]).toEqual({ id: 3001, titulo: 'Arco 1', texto: '' });
    });
    it('tierList de objeto vira array; valores invalidos viram []', () => {
        expect(normalizarCapitulos([{ id: 1, tierList: { a: { nome: 'x' } } }])[0].tierList).toEqual([{ nome: 'x' }]);
        expect(normalizarCapitulos(null)).toEqual([]);
        expect(normalizarCapitulos('x')).toEqual([]);
    });
    it('registros', () => {
        expect(normalizarRegistros(null)).toBeNull();
        expect(normalizarRegistros('x')).toBeNull();
        expect(normalizarRegistros({})).toBeNull();
        expect(normalizarRegistros({ presente: [] })).toBeNull();
        const r = normalizarRegistros({ presente: [{ id: 1, titulo: 'a' }] });
        expect(r.presente).toHaveLength(1);
        expect(r.futuro).toEqual([]);
        expect(normalizarRegistros({ futuro: { 0: { id: 5 } } }).futuro).toHaveLength(1);
    });
});

describe('corrigirIdAtivo', () => {
    it('mantem valido, corrige invalido, devolve id se lista vazia', () => {
        expect(corrigirIdAtivo([{ id: 1 }, { id: 2 }], 2)).toBe(2);
        expect(corrigirIdAtivo([{ id: 1 }, { id: 2 }], 9)).toBe(1);
        expect(corrigirIdAtivo([], 9)).toBe(9);
        expect(corrigirIdAtivo(null, 7)).toBe(7);
    });
});
