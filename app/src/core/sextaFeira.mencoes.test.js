import { describe, it, expect } from 'vitest';
import {
    ATALHOS_JOGADOR, ATALHOS_MESTRE, detectarMencaoAtiva, aplicarMencao, listarAlvosMencao,
    filtrarAlvosMencao, descreverMencoes, montarInstrucaoSistema, SYSTEM_PROMPT_SEXTA_FEIRA,
} from './sextaFeira';

describe('ATALHOS', () => {
    it.each([['jogador', ATALHOS_JOGADOR], ['mestre', ATALHOS_MESTRE]])('%s: lista nao vazia com rotulo e texto', (_n, lista) => {
        expect(lista.length).toBeGreaterThan(0);
        lista.forEach(a => {
            expect(typeof a.rotulo).toBe('string');
            expect(a.rotulo.length).toBeGreaterThan(0);
            expect(typeof a.texto).toBe('string');
            expect(a.texto.length).toBeGreaterThan(0);
        });
        expect(new Set(lista.map(a => a.rotulo)).size).toBe(lista.length);
    });
    it('conjuntos sao diferentes', () => {
        expect(ATALHOS_MESTRE.map(a => a.rotulo)).not.toEqual(ATALHOS_JOGADOR.map(a => a.rotulo));
    });
});

describe('detectarMencaoAtiva', () => {
    it('@ no inicio', () => {
        expect(detectarMencaoAtiva('@Na', 3)).toEqual({ inicio: 0, termo: 'Na' });
    });
    it('@ apos espaco', () => {
        expect(detectarMencaoAtiva('oi @Na', 6)).toEqual({ inicio: 3, termo: 'Na' });
    });
    it('apos quebra de linha (whitespace) vale', () => {
        expect(detectarMencaoAtiva('oi\n@Na', 6)).toEqual({ inicio: 3, termo: 'Na' });
    });
    it('@ vazio devolve termo vazio', () => {
        expect(detectarMencaoAtiva('oi @', 4)).toEqual({ inicio: 3, termo: '' });
    });
    it('email (@ colado em palavra) nao conta', () => {
        expect(detectarMencaoAtiva('a@b', 3)).toBeNull();
    });
    it('sem @ retorna null', () => {
        expect(detectarMencaoAtiva('ola', 3)).toBeNull();
        expect(detectarMencaoAtiva('', 0)).toBeNull();
    });
    it('termo com quebra de linha invalida', () => {
        expect(detectarMencaoAtiva('@Na\nx', 5)).toBeNull();
    });
    it('termo com outro @ invalida', () => {
        expect(detectarMencaoAtiva('@a@b', 4)).toBeNull();
    });
    it('termo com 40 chars vale, 41 nao', () => {
        expect(detectarMencaoAtiva('@' + 'a'.repeat(40), 41)).toEqual({ inicio: 0, termo: 'a'.repeat(40) });
        expect(detectarMencaoAtiva('@' + 'a'.repeat(41), 42)).toBeNull();
    });
    it('usa o cursor: texto depois do cursor e ignorado', () => {
        expect(detectarMencaoAtiva('@Natsu Ackermann', 3)).toEqual({ inicio: 0, termo: 'Na' });
    });
    it('cursor fora dos limites e limitado; NaN/undefined = fim', () => {
        expect(detectarMencaoAtiva('@Na', 999)).toEqual({ inicio: 0, termo: 'Na' });
        expect(detectarMencaoAtiva('@Na', -5)).toBeNull();
        expect(detectarMencaoAtiva('@Na', undefined)).toEqual({ inicio: 0, termo: 'Na' });
        expect(detectarMencaoAtiva('@Na', NaN)).toEqual({ inicio: 0, termo: 'Na' });
    });
    it('null/undefined texto', () => {
        expect(detectarMencaoAtiva(null, 0)).toBeNull();
        expect(detectarMencaoAtiva(undefined)).toBeNull();
    });
    it('termo com espaco e permitido (nomes compostos)', () => {
        expect(detectarMencaoAtiva('@Natsu Ack', 10)).toEqual({ inicio: 0, termo: 'Natsu Ack' });
    });
});

describe('aplicarMencao', () => {
    it('substitui @termo por @Rotulo com espaco e posiciona o cursor', () => {
        expect(aplicarMencao('oi @Na', 3, 6, 'Natsu')).toEqual({ texto: 'oi @Natsu ', cursor: 10 });
    });
    it('preserva texto depois do cursor', () => {
        expect(aplicarMencao('@Na resto', 0, 3, 'Natsu Ackermann')).toEqual({ texto: '@Natsu Ackermann  resto', cursor: 17 });
    });
    it('texto nulo', () => {
        expect(aplicarMencao(null, 0, 0, 'X')).toEqual({ texto: '@X ', cursor: 3 });
    });
});

describe('listarAlvosMencao', () => {
    const base = {
        meuNome: 'Ana',
        personagens: { Ana: {}, Bruno: {} },
        dummies: { d1: { nome: 'Goblin' }, d2: {}, d3: { nome: 'Bruno' } },
        capitulosPresente: [{ titulo: 'Cap P', arcos: [{ titulo: 'Arco P' }, { titulo: '' }, { texto: 'sem titulo' }] }],
        capitulosFuturo: [{ titulo: 'Cap F', arcos: [{ titulo: 'Arco F' }] }],
        podeVerFuturo: false,
    };
    it('cena primeiro, depois meuNome, personagens, dummies e arcos', () => {
        const r = listarAlvosMencao(base);
        expect(r[0]).toEqual({ rotulo: 'Cena atual', tipo: 'cena' });
        expect(r.map(a => a.rotulo)).toEqual(['Cena atual', 'Ana', 'Bruno', 'Goblin', 'd2', 'Arco P']);
    });
    it('sem duplicar pessoas (meuNome ja em personagens; dummie com mesmo nome de personagem)', () => {
        const r = listarAlvosMencao(base);
        expect(r.filter(a => a.rotulo === 'Ana')).toHaveLength(1);
        expect(r.filter(a => a.rotulo === 'Bruno')).toHaveLength(1);
        expect(r.find(a => a.rotulo === 'Bruno').tipo).toBe('personagem');
    });
    it('dummie sem nome usa o id', () => {
        expect(listarAlvosMencao(base).find(a => a.rotulo === 'd2').tipo).toBe('npc');
    });
    it('arco carrega o titulo do capitulo', () => {
        expect(listarAlvosMencao(base).find(a => a.tipo === 'arco')).toEqual({ rotulo: 'Arco P', tipo: 'arco', capitulo: 'Cap P' });
    });
    it('Futuro so com podeVerFuturo', () => {
        expect(listarAlvosMencao(base).some(a => a.rotulo === 'Arco F')).toBe(false);
        expect(listarAlvosMencao({ ...base, podeVerFuturo: true }).some(a => a.rotulo === 'Arco F')).toBe(true);
    });
    it('entradas vazias/undefined nao quebram', () => {
        expect(listarAlvosMencao({})).toEqual([{ rotulo: 'Cena atual', tipo: 'cena' }]);
        expect(listarAlvosMencao({ meuNome: 'X', personagens: null, dummies: null, capitulosPresente: 'x', capitulosFuturo: {}, podeVerFuturo: true }).map(a => a.rotulo)).toEqual(['Cena atual', 'X']);
        expect(() => listarAlvosMencao({ capitulosPresente: [null, { arcos: null }], dummies: { a: null } })).not.toThrow();
    });
});

describe('filtrarAlvosMencao', () => {
    const alvos = [
        { rotulo: 'Cena atual', tipo: 'cena' },
        { rotulo: 'Bruno Nascimento', tipo: 'personagem' },
        { rotulo: 'Natsu', tipo: 'personagem' },
        { rotulo: 'Ana', tipo: 'personagem' },
        { rotulo: 'Arco da Ação', tipo: 'arco' },
    ];
    it('termo vazio devolve tudo (ate o limite)', () => {
        expect(filtrarAlvosMencao(alvos, '')).toHaveLength(5);
        expect(filtrarAlvosMencao(alvos, '', 2)).toHaveLength(2);
    });
    it('prefixo antes de contem', () => {
        const r = filtrarAlvosMencao(alvos, 'na').map(a => a.rotulo);
        expect(r[0]).toBe('Natsu');
        expect(r).toContain('Ana');
        expect(r).toContain('Bruno Nascimento');
        expect(r).toContain('Cena atual');
    });
    it('ignora acentos e caixa em ambos os lados', () => {
        expect(filtrarAlvosMencao(alvos, 'acao').map(a => a.rotulo)).toEqual(['Arco da Ação']);
        expect(filtrarAlvosMencao(alvos, 'AÇÃO').map(a => a.rotulo)).toEqual(['Arco da Ação']);
        expect(filtrarAlvosMencao([{ rotulo: 'José' }], 'jose')).toHaveLength(1);
    });
    it('sem correspondencia devolve vazio', () => {
        expect(filtrarAlvosMencao(alvos, 'zzz')).toEqual([]);
    });
    it('limite padrao 8', () => {
        const muitos = Array.from({ length: 20 }, (_, i) => ({ rotulo: `N${i}`, tipo: 'personagem' }));
        expect(filtrarAlvosMencao(muitos, 'n')).toHaveLength(8);
    });
    it('alvos nulos', () => {
        expect(filtrarAlvosMencao(null, 'x')).toEqual([]);
        expect(filtrarAlvosMencao(undefined, '')).toEqual([]);
    });
    it('nao muta a lista original', () => {
        const copia = alvos.map(a => a.rotulo);
        filtrarAlvosMencao(alvos, 'na');
        expect(alvos.map(a => a.rotulo)).toEqual(copia);
    });
});

describe('descreverMencoes', () => {
    const alvos = [
        { rotulo: 'Cena atual', tipo: 'cena' },
        { rotulo: 'Natsu', tipo: 'personagem' },
        { rotulo: 'Natsu Ackermann', tipo: 'personagem' },
        { rotulo: 'Goblin', tipo: 'npc' },
        { rotulo: 'Arco P', tipo: 'arco', capitulo: 'Cap P' },
    ];
    it('sem mencoes devolve string vazia', () => {
        expect(descreverMencoes('ola', alvos)).toBe('');
        expect(descreverMencoes('', alvos)).toBe('');
        expect(descreverMencoes(null, null)).toBe('');
    });
    it('com ferramentas inclui dicas de tool por tipo', () => {
        const r = descreverMencoes('@Cena atual e @Goblin e @Arco P', alvos);
        expect(r).toContain('estado_combate');
        expect(r).toContain('consultar_ficha ou listar_personagens');
        expect(r).toContain('buscar_lore');
        expect(r).toContain('do capítulo "Cap P"');
        expect(r.startsWith('Menções nesta mensagem: ')).toBe(true);
        expect(r.endsWith('.')).toBe(true);
    });
    it('personagem usa consultar_ficha', () => {
        expect(descreverMencoes('@Natsu', alvos)).toContain('@Natsu = personagem (use consultar_ficha)');
    });
    it('comFerramentas false nao cita nenhuma tool', () => {
        const r = descreverMencoes('@Cena atual @Natsu @Goblin @Arco P', alvos, { comFerramentas: false });
        expect(r).not.toMatch(/use |estado_combate|consultar_ficha|buscar_lore|listar_personagens/);
        expect(r).toContain('@Natsu = personagem');
        expect(r).toContain('@Cena atual = a cena atual do Mapa');
    });
    it('mais longo primeiro: @Natsu Ackermann nao conta tambem como @Natsu', () => {
        const r = descreverMencoes('fale sobre @Natsu Ackermann', alvos);
        expect(r).toContain('@Natsu Ackermann');
        expect(r).not.toMatch(/@Natsu =/);
    });
    it('ambos aparecem se ambos forem mencionados separadamente', () => {
        const r = descreverMencoes('@Natsu Ackermann e @Natsu', alvos);
        expect(r).toMatch(/@Natsu Ackermann = /);
        expect(r).toMatch(/@Natsu = /);
    });
    it('mencao repetida so aparece uma vez', () => {
        const r = descreverMencoes('@Goblin @Goblin', alvos);
        expect(r.match(/@Goblin =/g)).toHaveLength(1);
    });
    it('tipo desconhecido usa o proprio tipo', () => {
        expect(descreverMencoes('@X', [{ rotulo: 'X', tipo: 'coisa' }])).toBe('Menções nesta mensagem: @X = coisa.');
    });
    it('rotulo com caracteres de regex nao quebra', () => {
        expect(descreverMencoes('@a.b(c)+', [{ rotulo: 'a.b(c)+', tipo: 'npc' }])).toContain('@a.b(c)+');
    });
});

describe('montarInstrucaoSistema semFerramentas', () => {
    const linhaFerr = '- Você tem ferramentas para consultar a mesa';
    it('padrao mantem a linha de ferramentas', () => {
        const r = montarInstrucaoSistema({ contextoFicha: 'CTX' });
        expect(r).toContain(linhaFerr);
        expect(r).not.toContain('NÃO tem acesso aos dados da mesa');
    });
    it('semFerramentas troca a linha pela de sem acesso', () => {
        const r = montarInstrucaoSistema({ contextoFicha: 'CTX', semFerramentas: true });
        expect(r).not.toContain(linhaFerr);
        expect(r).toContain('NÃO tem acesso aos dados da mesa');
        expect(r).toContain('CTX');
    });
    it('so troca essa linha: o restante do prompt e igual', () => {
        const a = SYSTEM_PROMPT_SEXTA_FEIRA.split('\n');
        const b = montarInstrucaoSistema({ contextoFicha: '', semFerramentas: true }).split('\n');
        expect(b.slice(0, a.length).filter((l, i) => l !== a[i])).toHaveLength(1);
    });
    it('memoria e lore continuam sendo incluidas', () => {
        const r = montarInstrucaoSistema({ contextoFicha: 'C', lore: 'LORE1', memoria: 'MEM1', semFerramentas: true });
        expect(r).toContain('LORE1');
        expect(r).toContain('MEM1');
        expect(r.trim().endsWith('--- FIM DO CONTEXTO ---')).toBe(true);
    });
});
