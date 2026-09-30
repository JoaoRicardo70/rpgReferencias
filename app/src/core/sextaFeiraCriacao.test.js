import { describe, it, expect } from 'vitest';
import {
    normalizarPoder, normalizarMagia, normalizarItem, normalizarNpc, normalizarTierList, normalizarProposta,
    avaliarEquilibrio, anexarNaLista, resumirProposta, DECLARACOES_CRIACAO, TIPO_POR_FERRAMENTA, TIPOS_SO_MESTRE,
    ATRIBUTOS_EFEITO, PROPRIEDADES_EFEITO, IDS_RANKS, ELEMENTOS_CONHECIDOS, CAMPO_FICHA_POR_TIPO,
} from './sextaFeiraCriacao';

describe('normalizarPoder', () => {
    it('habilidade: maestria + maestriaRequerida, formato da tela', () => {
        const r = normalizarPoder({ nome: 'Golpe', categoria: 'habilidade', dadosQtd: 2, dadosFaces: 6, custoPercentual: 10, alcance: 3, maestria: 5, maestriaRequerida: 20 });
        expect(r.valido).toBe(true);
        expect(r.avisos).toEqual([]);
        expect(r.objeto).toEqual({
            nome: 'Golpe', descricao: '', vertente: '', elemento: '', elementosAfetados: '', categoria: 'habilidade', ativa: false,
            efeitos: [], efeitosPassivos: [], imagemUrl: '', dadosQtd: 2, dadosFaces: 6, custoPercentual: 10, alcance: 3, area: 0,
            armaVinculada: '', pasta: '', maestria: 5, maestriaRequerida: 20,
        });
    });
    it('poder tambem usa maestria + maestriaRequerida', () => {
        const { objeto } = normalizarPoder({ nome: 'P', categoria: 'poder' });
        expect(objeto).toHaveProperty('maestria', 0);
        expect(objeto).toHaveProperty('maestriaRequerida', 0);
        expect(objeto).not.toHaveProperty('fadigaPorUso');
    });
    it('forma: maestria + fadigaPorUso (padrao 15), sem maestriaRequerida', () => {
        const { objeto } = normalizarPoder({ nome: 'F', categoria: 'forma' });
        expect(objeto.fadigaPorUso).toBe(15);
        expect(objeto.maestria).toBe(0);
        expect(objeto).not.toHaveProperty('maestriaRequerida');
        expect(normalizarPoder({ nome: 'F', categoria: 'forma', fadigaPorUso: 30 }).objeto.fadigaPorUso).toBe(30);
    });
    it('efeitos: valor vira STRING e atributo/propriedade invalidos sao trocados com aviso', () => {
        const r = normalizarPoder({
            nome: 'X',
            efeitos: [{ nome: 'Forte', atributo: 'forca', propriedade: 'mgeral', valor: 2.5 }, { atributo: 'inexistente', propriedade: 'lixo', valor: 'abc' }],
            efeitosPassivos: [{ atributo: 'zzz', propriedade: 'base', valor: 7 }],
        });
        expect(r.objeto.efeitos[0]).toEqual({ nome: 'Forte', atributo: 'forca', propriedade: 'mgeral', valor: '2.5' });
        expect(r.objeto.efeitos[1]).toEqual({ nome: 'Efeito 2', atributo: 'forca', propriedade: 'base', valor: '0' });
        expect(r.objeto.efeitosPassivos[0].atributo).toBe('evasiva');
        expect(typeof r.objeto.efeitosPassivos[0].valor).toBe('string');
        expect(r.avisos.some(a => a.includes('Efeito ativo 2') && a.includes('inexistente'))).toBe(true);
        expect(r.avisos.some(a => a.includes('Efeito ativo 2') && a.includes('lixo'))).toBe(true);
        expect(r.avisos.some(a => a.includes('Efeito passivo 1') && a.includes('zzz'))).toBe(true);
    });
    it('atributo e propriedade aceitam caixa diferente', () => {
        const { objeto, avisos } = normalizarPoder({ nome: 'X', efeitos: [{ atributo: 'FORCA', propriedade: 'MGERAL', valor: 1 }] });
        expect(objeto.efeitos[0]).toMatchObject({ atributo: 'forca', propriedade: 'mgeral' });
        expect(avisos).toEqual([]);
    });
    it('limita a 12 efeitos e ignora efeitos nao-array', () => {
        const muitos = Array.from({ length: 20 }, () => ({ atributo: 'forca', propriedade: 'base', valor: 1 }));
        expect(normalizarPoder({ nome: 'X', efeitos: muitos }).objeto.efeitos).toHaveLength(12);
        expect(normalizarPoder({ nome: 'X', efeitos: 'oi' }).objeto.efeitos).toEqual([]);
    });
    it('elemento so e mantido para vertente Elemental', () => {
        expect(normalizarPoder({ nome: 'X', vertente: 'Elemental', elemento: 'Fogo' }).objeto.elemento).toBe('Fogo');
        expect(normalizarPoder({ nome: 'X', vertente: 'Acumulativo', elemento: 'Fogo' }).objeto.elemento).toBe('');
        expect(normalizarPoder({ nome: 'X', elemento: 'Fogo' }).objeto.elemento).toBe('');
        expect(normalizarPoder({ nome: 'X', vertente: 'elemental', elemento: 'Gelo' }).objeto.vertente).toBe('Elemental');
    });
    it('vertente e categoria invalidas geram aviso e usam padrao', () => {
        const r = normalizarPoder({ nome: 'X', vertente: 'Bizarra', categoria: 'lixo' });
        expect(r.objeto.vertente).toBe('');
        expect(r.objeto.categoria).toBe('habilidade');
        expect(r.avisos).toHaveLength(2);
    });
    it('alcance 0, vazio ou invalido vira 1', () => {
        expect(normalizarPoder({ nome: 'X', alcance: 0 }).objeto.alcance).toBe(1);
        expect(normalizarPoder({ nome: 'X', alcance: '' }).objeto.alcance).toBe(1);
        expect(normalizarPoder({ nome: 'X', alcance: 'abc' }).objeto.alcance).toBe(1);
        expect(normalizarPoder({ nome: 'X', alcance: -5 }).objeto.alcance).toBe(1);
        expect(normalizarPoder({ nome: 'X' }).objeto.alcance).toBe(1);
        expect(normalizarPoder({ nome: 'X', alcance: 4 }).objeto.alcance).toBe(4);
    });
    it('faz clamp de numeros e trunca textos longos', () => {
        const { objeto } = normalizarPoder({ nome: 'n'.repeat(500), descricao: 'd'.repeat(5000), dadosQtd: -3, dadosFaces: 0, custoPercentual: 500, maestria: 999 });
        expect(objeto.nome).toHaveLength(120);
        expect(objeto.descricao).toHaveLength(2000);
        expect(objeto.dadosQtd).toBe(0);
        expect(objeto.dadosFaces).toBe(1);
        expect(objeto.custoPercentual).toBe(100);
        expect(objeto.maestria).toBe(100);
    });
    it('sem nome ou nome so de espacos: invalido com aviso', () => {
        for (const d of [{}, { nome: '   ' }, null, undefined]) {
            const r = normalizarPoder(d);
            expect(r.valido).toBe(false);
            expect(r.avisos).toContain('Falta o nome.');
        }
    });
    it('aceita unicode/emoji no nome', () => {
        expect(normalizarPoder({ nome: '火の呼吸 🔥' }).objeto.nome).toBe('火の呼吸 🔥');
    });
});

describe('normalizarMagia', () => {
    it('formato completo com padroes', () => {
        const r = normalizarMagia({ nome: 'Bola de Fogo', elemento: 'Fogo' });
        expect(r.valido).toBe(true);
        expect(r.objeto).toEqual({
            nome: 'Bola de Fogo', descricao: '', elemento: 'Fogo', elementosAfetados: '', bonusTipo: 'nenhum', bonusValor: '0', custoValor: 0,
            dadosExtraQtd: 0, dadosExtraFaces: 20, energiaCombustao: 'flexivel', tipoMecanica: 'ataque', savingAttr: 'destreza',
            alcanceQuad: 1, areaQuad: 0, alvosAfetados: 'todos', duracaoZona: 0, equipado: false,
        });
    });
    it('enums validos passam; caixa/acento diferentes sao corrigidos', () => {
        const r = normalizarMagia({
            nome: 'X', elemento: 'Fogo', tipoMecanica: 'SAVING', savingAttr: 'Constituição', bonusTipo: 'mult_dano', bonusValor: 3,
            energiaCombustao: 'MANA', alvosAfetados: 'Inimigos',
        });
        expect(r.objeto).toMatchObject({ tipoMecanica: 'saving', savingAttr: 'constituicao', bonusTipo: 'mult_dano', bonusValor: '3', energiaCombustao: 'mana', alvosAfetados: 'inimigos' });
        expect(r.avisos).toEqual([]);
    });
    it('enums invalidos usam padrao e avisam', () => {
        const r = normalizarMagia({ nome: 'X', elemento: 'Fogo', tipoMecanica: 'x', savingAttr: 'y', bonusTipo: 'z', energiaCombustao: 'w', alvosAfetados: 'v' });
        expect(r.objeto).toMatchObject({ tipoMecanica: 'ataque', savingAttr: 'destreza', bonusTipo: 'nenhum', energiaCombustao: 'flexivel', alvosAfetados: 'todos' });
        expect(r.avisos).toHaveLength(5);
    });
    it('elemento casa sem diferenciar caixa/acento com ELEMENTOS_CONHECIDOS', () => {
        expect(normalizarMagia({ nome: 'X', elemento: 'agua' }).objeto.elemento).toBe('Agua');
        expect(normalizarMagia({ nome: 'X', elemento: 'ÁGUA' }).objeto.elemento).toBe('Agua');
        expect(normalizarMagia({ nome: 'X', elemento: 'vácuo' }).objeto.elemento).toBe('Vacuo');
        expect(normalizarMagia({ nome: 'X', elemento: 'gelo verdadeiro' }).objeto.elemento).toBe('Gelo Verdadeiro');
        expect(normalizarMagia({ nome: 'X', elemento: 'projeção de aura' }).objeto.elemento).toBe('Projeção de Aura');
        expect(normalizarMagia({ nome: 'X', elemento: 'agua' }).avisos).toEqual([]);
    });
    it('elemento desconhecido e mantido mas avisa; vazio vira Neutro', () => {
        const r = normalizarMagia({ nome: 'X', elemento: 'Plasma' });
        expect(r.objeto.elemento).toBe('Plasma');
        expect(r.avisos.some(a => a.includes('Plasma') && a.includes('Pergaminhos Perdidos'))).toBe(true);
        expect(normalizarMagia({ nome: 'X' }).objeto.elemento).toBe('Neutro');
        expect(normalizarMagia({ nome: 'X', elemento: 'Elemento 7' }).avisos).toEqual([]);
    });
    it('sem nome: invalido', () => {
        expect(normalizarMagia({ elemento: 'Fogo' }).valido).toBe(false);
        expect(normalizarMagia(undefined).valido).toBe(false);
    });
    it('clamps numericos', () => {
        const { objeto } = normalizarMagia({ nome: 'X', custoValor: -10, dadosExtraQtd: 5000, dadosExtraFaces: -1, duracaoZona: 3.6, alcanceQuad: 0 });
        expect(objeto).toMatchObject({ custoValor: 0, dadosExtraQtd: 1000, dadosExtraFaces: 1, duracaoZona: 4, alcanceQuad: 1 });
    });
});

describe('normalizarItem', () => {
    it('arma: dados, alcance e efeitos', () => {
        const r = normalizarItem({
            nome: 'Excalibur', tipo: 'arma', armaTipo: 'espada', raridade: 'lendaria', bonusTipo: 'mult_dano', bonusValor: 2,
            dadosQtd: 3, dadosFaces: 8, alcance: 2, efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 100 }],
        });
        expect(r.valido).toBe(true);
        expect(r.objeto).toEqual({
            nome: 'Excalibur', tipo: 'arma', elemento: 'Neutro', bonusTipo: 'mult_dano', bonusValor: '2', armaTipo: 'espada', raridade: 'lendaria',
            dadosQtd: 3, dadosFaces: 8, alcance: 2,
            efeitos: [{ nome: 'Efeito 1', atributo: 'forca', propriedade: 'base', valor: '100' }],
            efeitosPassivos: [], equipado: false,
        });
        expect(r.avisos).toEqual([]);
    });
    it('padroes de arma: 1d20, espada, comum, alcance 1', () => {
        const { objeto } = normalizarItem({ nome: 'Faca' });
        expect(objeto).toMatchObject({ tipo: 'arma', armaTipo: 'espada', raridade: 'comum', dadosQtd: 1, dadosFaces: 20, alcance: 1 });
    });
    it.each(['armadura', 'artefato'])('%s: dados/alcance 0, efeitos [] e aviso se efeitos foram dados', (tipo) => {
        const r = normalizarItem({
            nome: 'Peitoral', tipo, dadosQtd: 5, dadosFaces: 10, alcance: 3, armaTipo: 'espada',
            efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 1 }],
        });
        expect(r.objeto).toMatchObject({ tipo, dadosQtd: 0, dadosFaces: 0, alcance: 0, efeitos: [], efeitosPassivos: [], armaTipo: '' });
        expect(r.avisos.some(a => a.includes('Só armas guardam efeitos'))).toBe(true);
    });
    it('armadura sem efeitos: sem aviso', () => {
        expect(normalizarItem({ nome: 'X', tipo: 'armadura' }).avisos).toEqual([]);
    });
    it('efeitosPassivos dados a armadura tambem geram aviso', () => {
        const r = normalizarItem({ nome: 'X', tipo: 'artefato', efeitosPassivos: [{ atributo: 'forca', propriedade: 'base', valor: 1 }] });
        expect(r.avisos.some(a => a.includes('Só armas'))).toBe(true);
    });
    it('enums invalidos: padrao e aviso', () => {
        const r = normalizarItem({ nome: 'X', tipo: 'grimorio', raridade: 'mitica', bonusTipo: 'nada', armaTipo: 'laser' });
        expect(r.objeto).toMatchObject({ tipo: 'arma', raridade: 'comum', bonusTipo: 'mult_dano', armaTipo: 'espada' });
        expect(r.avisos.length).toBe(4);
    });
    it('sem nome invalido', () => {
        expect(normalizarItem({ tipo: 'arma' }).valido).toBe(false);
    });
});

describe('normalizarNpc', () => {
    it('hpMax = vida * 1000 (escala exibida)', () => {
        const r = normalizarNpc({ nome: 'Goblin', vida: 250, tipoDefesa: 'resistencia', valorDefesa: 30, visibilidadeHp: 'mestre', quantidade: 3 });
        expect(r.valido).toBe(true);
        expect(r.quantidade).toBe(3);
        expect(r.objeto).toEqual({ nome: 'Goblin', hpMax: 250000, hpAtual: 250000, tipoDefesa: 'resistencia', valorDefesa: 30, visibilidadeHp: 'mestre' });
    });
    it('padroes: vida 100, evasiva 10, visivel a todos, nome Entidade, quantidade 1', () => {
        const r = normalizarNpc({});
        expect(r.objeto).toEqual({ nome: 'Entidade', hpMax: 100000, hpAtual: 100000, tipoDefesa: 'evasiva', valorDefesa: 10, visibilidadeHp: 'todos' });
        expect(r.quantidade).toBe(1);
        expect(r.valido).toBe(true);
    });
    it('quantidade clamp 1..10', () => {
        expect(normalizarNpc({ quantidade: 0 }).quantidade).toBe(1);
        expect(normalizarNpc({ quantidade: -4 }).quantidade).toBe(1);
        expect(normalizarNpc({ quantidade: 99 }).quantidade).toBe(10);
        expect(normalizarNpc({ quantidade: 2.4 }).quantidade).toBe(2);
        expect(normalizarNpc({ quantidade: 'abc' }).quantidade).toBe(1);
    });
    it('vida minima 1 (nao aceita 0/negativo) e enums invalidos avisam', () => {
        expect(normalizarNpc({ vida: 0 }).objeto.hpMax).toBe(1000);
        expect(normalizarNpc({ vida: -50 }).objeto.hpMax).toBe(1000);
        const r = normalizarNpc({ tipoDefesa: 'magica', visibilidadeHp: 'ninguem' });
        expect(r.objeto).toMatchObject({ tipoDefesa: 'evasiva', visibilidadeHp: 'todos' });
        expect(r.avisos).toHaveLength(2);
    });
});

describe('normalizarTierList', () => {
    it('aceita apenas IDS_RANKS validos, normaliza caixa', () => {
        const r = normalizarTierList({ ranks: [{ nome: 'Ana', rank: 's+' }, { nome: 'Bruno', rank: 'ZZ' }, { nome: 'Cid', rank: 'EX' }, { nome: 'Dan', rank: 'r-' }] });
        expect(r.objeto.ranks).toEqual([{ nome: 'Ana', rank: 'S+' }, { nome: 'Cid', rank: 'EX' }, { nome: 'Dan', rank: 'R-' }]);
        expect(r.avisos.some(a => a.includes('ZZ') && a.includes('Bruno'))).toBe(true);
        expect(r.valido).toBe(true);
    });
    it('remove duplicatas por nome (primeiro vence)', () => {
        const r = normalizarTierList({ ranks: [{ nome: 'Ana', rank: 'A' }, { nome: 'Ana', rank: 'S' }] });
        expect(r.objeto.ranks).toEqual([{ nome: 'Ana', rank: 'A' }]);
    });
    it('nome repetido com rank invalido nao bloqueia a entrada valida seguinte', () => {
        const r = normalizarTierList({ ranks: [{ nome: 'Ana', rank: 'Q9' }, { nome: 'Ana', rank: 'B' }] });
        expect(r.objeto.ranks).toEqual([{ nome: 'Ana', rank: 'B' }]);
    });
    it('avisa nomes sem ficha/avatar apenas quando ha nomesConhecidos', () => {
        const r = normalizarTierList({ ranks: [{ nome: 'Ana', rank: 'A' }, { nome: 'Fantasma', rank: 'B' }] }, ['Ana']);
        expect(r.avisos.some(a => a.includes('Fantasma') && !a.includes('Ana,'))).toBe(true);
        expect(normalizarTierList({ ranks: [{ nome: 'Fantasma', rank: 'B' }] }, []).avisos).toEqual([]);
    });
    it('vazio/invalido: valido false', () => {
        expect(normalizarTierList({ ranks: [] }).valido).toBe(false);
        expect(normalizarTierList({}).valido).toBe(false);
        expect(normalizarTierList(null).valido).toBe(false);
        expect(normalizarTierList({ ranks: 'x' }).valido).toBe(false);
        expect(normalizarTierList({ ranks: [{ nome: '', rank: 'A' }, null] }).valido).toBe(false);
    });
    it('limita a 60 entradas', () => {
        const ranks = Array.from({ length: 100 }, (_, i) => ({ nome: `P${i}`, rank: 'A' }));
        expect(normalizarTierList({ ranks }).objeto.ranks).toHaveLength(60);
    });
});

describe('normalizarProposta', () => {
    it('despacha por tipo e trata tipo desconhecido', () => {
        expect(normalizarProposta('poder', { nome: 'X' }).objeto.categoria).toBe('habilidade');
        expect(normalizarProposta('magia', { nome: 'X' }).objeto.tipoMecanica).toBe('ataque');
        expect(normalizarProposta('item', { nome: 'X' }).objeto.tipo).toBe('arma');
        expect(normalizarProposta('npc', {}).quantidade).toBe(1);
        expect(normalizarProposta('tierlist', { ranks: [{ nome: 'A', rank: 'A' }] }).valido).toBe(true);
        const r = normalizarProposta('bobagem', {});
        expect(r).toMatchObject({ objeto: null, valido: false });
        expect(r.avisos[0]).toContain('bobagem');
    });
    it('repassa nomesConhecidos para tierlist', () => {
        const r = normalizarProposta('tierlist', { ranks: [{ nome: 'X', rank: 'A' }] }, { nomesConhecidos: ['Y'] });
        expect(r.avisos.length).toBe(1);
    });
});

describe('avaliarEquilibrio', () => {
    const fichaComPoder = (qtd, faces) => ({ poderes: [{ dadosQtd: qtd, dadosFaces: faces }] });
    it('sem objeto ou ficha: sem avisos', () => {
        expect(avaliarEquilibrio('poder', null, {})).toEqual([]);
        expect(avaliarEquilibrio('poder', { dadosQtd: 1 }, null)).toEqual([]);
    });
    it('avisa dano muito acima do maior existente (>1.5x)', () => {
        const av = avaliarEquilibrio('poder', { categoria: 'habilidade', dadosQtd: 10, dadosFaces: 20, custoPercentual: 5 }, fichaComPoder(1, 6));
        expect(av.some(a => a.includes('bem mais forte'))).toBe(true);
    });
    it('nao avisa quando dentro de 1.5x', () => {
        const av = avaliarEquilibrio('poder', { categoria: 'habilidade', dadosQtd: 1, dadosFaces: 6, custoPercentual: 5 }, fichaComPoder(1, 6));
        expect(av).toEqual([]);
    });
    it('sem poderes existentes com dado, nao compara', () => {
        const av = avaliarEquilibrio('poder', { categoria: 'habilidade', dadosQtd: 50, dadosFaces: 50, custoPercentual: 5 }, { poderes: [{ dadosQtd: 0 }] });
        expect(av).toEqual([]);
    });
    it('inventario como objeto RTDB com nulos e usado para itens', () => {
        const ficha = { inventario: { 0: null, 1: { dadosQtd: 1, dadosFaces: 4 } } };
        const av = avaliarEquilibrio('item', { dadosQtd: 5, dadosFaces: 20, efeitos: [], efeitosPassivos: [] }, ficha);
        expect(av.some(a => a.includes('bem mais forte'))).toBe(true);
    });
    it('multiplicador >= 2x avisa; abaixo de 2 ou base nao', () => {
        const mk = (propriedade, valor) => ({ categoria: 'habilidade', dadosQtd: 0, efeitos: [{ propriedade, valor: String(valor) }], efeitosPassivos: [] });
        expect(avaliarEquilibrio('poder', mk('mgeral', 2), {}).some(a => a.includes('2x'))).toBe(true);
        expect(avaliarEquilibrio('poder', mk('mabs', 5), {}).some(a => a.includes('2x'))).toBe(true);
        expect(avaliarEquilibrio('poder', mk('mgeral', 1.5), {}).some(a => a.includes('2x'))).toBe(false);
        expect(avaliarEquilibrio('poder', mk('base', 1000), {}).some(a => a.includes('2x'))).toBe(false);
        const passivo = { categoria: 'habilidade', dadosQtd: 0, efeitos: [], efeitosPassivos: [{ propriedade: 'munico', valor: '3' }] };
        expect(avaliarEquilibrio('item', passivo, {}).some(a => a.includes('2x'))).toBe(true);
    });
    it('poder com dano e sem custo avisa; forma nao', () => {
        expect(avaliarEquilibrio('poder', { categoria: 'poder', dadosQtd: 2, dadosFaces: 6, custoPercentual: 0 }, {})).toContain('Causa dano sem custo de energia.');
        expect(avaliarEquilibrio('poder', { categoria: 'forma', dadosQtd: 2, dadosFaces: 6, custoPercentual: 0 }, {})).toEqual([]);
        expect(avaliarEquilibrio('poder', { categoria: 'poder', dadosQtd: 0, custoPercentual: 0 }, {})).toEqual([]);
        expect(avaliarEquilibrio('poder', { categoria: 'poder', dadosQtd: 2, dadosFaces: 6, custoPercentual: 5 }, {})).toEqual([]);
    });
    it('magia: custo 0 em ataque avisa; suporte nao', () => {
        expect(avaliarEquilibrio('magia', { tipoMecanica: 'ataque', custoValor: 0 }, {})).toContain('Técnica de ataque sem custo.');
        expect(avaliarEquilibrio('magia', { tipoMecanica: 'suporte', custoValor: 0 }, {})).toEqual([]);
        expect(avaliarEquilibrio('magia', { tipoMecanica: 'ataque', custoValor: 10 }, {})).toEqual([]);
    });
    it('magia: dados extras muito acima das existentes avisam', () => {
        const ficha = { ataquesElementais: [{ dadosExtraQtd: 1, dadosExtraFaces: 6 }] };
        const av = avaliarEquilibrio('magia', { tipoMecanica: 'ataque', custoValor: 10, dadosExtraQtd: 10, dadosExtraFaces: 20 }, ficha);
        expect(av.some(a => a.includes('Dados extras'))).toBe(true);
    });
    it('npc e tierlist nunca geram avisos de equilibrio', () => {
        expect(avaliarEquilibrio('npc', { hpMax: 1 }, {})).toEqual([]);
    });
});

describe('anexarNaLista', () => {
    it('anexa a array sem mutar o original', () => {
        const atual = [{ a: 1 }];
        const r = anexarNaLista(atual, { b: 2 });
        expect(r).toEqual([{ a: 1 }, { b: 2 }]);
        expect(atual).toHaveLength(1);
    });
    it('aceita objeto do RTDB e filtra nulos', () => {
        expect(anexarNaLista({ 0: { a: 1 }, 1: null, 2: { c: 3 } }, { n: 1 })).toEqual([{ a: 1 }, { c: 3 }, { n: 1 }]);
        expect(anexarNaLista([null, { a: 1 }, undefined], { n: 1 })).toEqual([{ a: 1 }, { n: 1 }]);
    });
    it('null/undefined/string/numero viram lista com so o novo', () => {
        for (const v of [null, undefined, 'x', 5, false]) expect(anexarNaLista(v, { n: 1 })).toEqual([{ n: 1 }]);
    });
});

describe('resumirProposta', () => {
    it('poder', () => {
        const { objeto } = normalizarPoder({ nome: 'X', categoria: 'poder', dadosQtd: 2, dadosFaces: 8, custoPercentual: 12, efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 1 }] });
        expect(resumirProposta('poder', objeto)).toBe('poder · 2d8 · custo 12% · 1 efeito(s)');
        expect(resumirProposta('poder', normalizarPoder({ nome: 'X' }).objeto)).toContain('sem dano');
    });
    it('magia', () => {
        const { objeto } = normalizarMagia({ nome: 'X', elemento: 'Fogo', dadosExtraQtd: 3, dadosExtraFaces: 6, custoValor: 50 });
        expect(resumirProposta('magia', objeto)).toBe('Fogo · ataque · 3d6 · custo 50');
        expect(resumirProposta('magia', normalizarMagia({ nome: 'X' }).objeto)).toContain('sem dados extras');
    });
    it('item', () => {
        expect(resumirProposta('item', normalizarItem({ nome: 'X', armaTipo: 'arco', dadosQtd: 1, dadosFaces: 8 }).objeto)).toBe('arma (arco) · comum · 1d8');
        expect(resumirProposta('item', normalizarItem({ nome: 'X', tipo: 'armadura' }).objeto)).toBe('armadura · comum');
    });
    it('npc e tierlist', () => {
        expect(resumirProposta('npc', normalizarNpc({ vida: 250 }).objeto)).toContain('Vida 250');
        expect(resumirProposta('npc', normalizarNpc({ vida: 250 }).objeto)).toContain('evasiva 10');
        expect(resumirProposta('tierlist', { ranks: [{}, {}] })).toBe('2 personagem(ns) classificados');
    });
    it('objeto nulo ou tipo desconhecido: string vazia', () => {
        expect(resumirProposta('poder', null)).toBe('');
        expect(resumirProposta('xx', {})).toBe('');
    });
});

describe('DECLARACOES_CRIACAO / constantes', () => {
    it('nomes esperados, sem duplicatas', () => {
        const nomes = DECLARACOES_CRIACAO.map(d => d.name);
        expect(nomes).toEqual(['propor_habilidade', 'propor_magia', 'propor_item', 'propor_npc', 'poder_do_grupo', 'propor_tier_list']);
        expect(new Set(nomes).size).toBe(nomes.length);
    });
    it('todas tem description e parameters OBJECT; required existe em properties', () => {
        DECLARACOES_CRIACAO.forEach((d) => {
            expect(d.description.length).toBeGreaterThan(10);
            expect(d.parameters.type).toBe('OBJECT');
            expect(d.parameters.properties).toBeTypeOf('object');
            (d.parameters.required || []).forEach(r => expect(d.parameters.properties).toHaveProperty(r));
        });
    });
    it('todos os enums (inclusive aninhados) nao sao vazios e sao de strings unicas', () => {
        const visitar = (no, caminho) => {
            if (!no || typeof no !== 'object') return;
            if (Array.isArray(no.enum)) {
                expect(no.enum.length, caminho).toBeGreaterThan(0);
                expect(new Set(no.enum).size, caminho).toBe(no.enum.length);
                no.enum.forEach(v => expect(typeof v).toBe('string'));
            }
            Object.entries(no).forEach(([k, v]) => visitar(v, `${caminho}.${k}`));
        };
        DECLARACOES_CRIACAO.forEach(d => visitar(d.parameters, d.name));
    });
    it('enums dos efeitos vem das constantes do app', () => {
        const ef = DECLARACOES_CRIACAO[0].parameters.properties.efeitos.items.properties;
        expect(ef.atributo.enum).toEqual(ATRIBUTOS_EFEITO);
        expect(ef.propriedade.enum).toEqual(PROPRIEDADES_EFEITO);
        expect(ATRIBUTOS_EFEITO).toContain('forca');
    });
    it('TIPO_POR_FERRAMENTA cobre todas as propor_* e TIPOS_SO_MESTRE', () => {
        DECLARACOES_CRIACAO.filter(d => d.name.startsWith('propor_')).forEach(d => expect(TIPO_POR_FERRAMENTA[d.name]).toBeTruthy());
        expect(TIPOS_SO_MESTRE).toEqual(['npc', 'tierlist']);
        expect(CAMPO_FICHA_POR_TIPO).toEqual({ poder: 'poderes', magia: 'ataquesElementais', item: 'inventario' });
    });
    it('IDS_RANKS: sem duplicatas, 19 + 14*3 = 61 ranks', () => {
        expect(new Set(IDS_RANKS).size).toBe(IDS_RANKS.length);
        expect(IDS_RANKS).toHaveLength(19 + 42);
        expect(IDS_RANKS[0]).toBe('EX');
    });
    it('ELEMENTOS_CONHECIDOS sem duplicatas', () => {
        expect(new Set(ELEMENTOS_CONHECIDOS).size).toBe(ELEMENTOS_CONHECIDOS.length);
    });
});
