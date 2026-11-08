import { describe, it, expect } from 'vitest';
import { prepararItemImportado, montarPoderFinal, lerRespostaDaIA, prepararImportacao, montarPromptImportacao } from './importadorIA';
import { normalizarPoder } from './sextaFeiraCriacao';
import { getBuffs } from './attributes';
import { getPoderDiretoMultiplier } from './poder';

// QA - importador / Sexta-Feira: danoVerdadeiro e "quando" em multiplicador, do JSON da IA ate o Poder gravado e calculado.

const mult = (extra) => ({ nome: 'm', atributo: 'forca', valor: 2, tipo: 'geral', ...extra });
const final = (bruto) => montarPoderFinal(prepararItemImportado(bruto, 'poder').objeto, 7);
// Decide o destino de todos os pendentes (como a previa faz) antes de montar.
const finalComDestino = (bruto, destino = 'ativo') => {
    const { objeto } = prepararItemImportado(bruto, 'poder');
    objeto.efeitosIncertos = (objeto.efeitosIncertos || []).map(e => ({ ...e, destino }));
    return montarPoderFinal(objeto, 7);
};

describe('danoVerdadeiro no importador', () => {
    it('JSON da IA com danoVerdadeiro:true chega no Poder final (pipeline completo)', () => {
        const itens = lerRespostaDaIA(JSON.stringify([{ nome: 'Lamina', categoria: 'poder', danoQtd: 2, danoFaces: 6, danoVerdadeiro: true }]));
        const lista = Array.isArray(itens) ? itens : (itens.itens || itens);
        const prep = prepararImportacao(lista, 'poder', 1);
        const primeiro = Array.isArray(prep) ? prep[0] : (prep.itens || prep.propostas)[0];
        const objeto = primeiro.objeto || primeiro;
        expect(montarPoderFinal(objeto, 3).danoVerdadeiro).toBe(true);
    });
    it('false, ausente, texto qualquer e numero NAO marcam', () => {
        [false, undefined, null, 0, 1, 'sim', 'false', {}, []].forEach(v => {
            expect('danoVerdadeiro' in final({ nome: 'P', danoVerdadeiro: v })).toBe(false);
        });
    });
    it('"true" em texto marca (IA que devolve string)', () => {
        expect(final({ nome: 'P', danoVerdadeiro: 'true' }).danoVerdadeiro).toBe(true);
    });
    it('habilidade (categoria diferente) tambem preserva a marca', () => {
        const r = prepararItemImportado({ nome: 'H', categoria: 'habilidade', danoVerdadeiro: true }, 'habilidade');
        expect(r.objeto.danoVerdadeiro).toBe(true);
    });
    it('o prompt descreve o campo SO para dano verdadeiro/ignora resistencias', () => {
        const p = montarPromptImportacao('poder');
        expect(p).toMatch(/"danoVerdadeiro": true SÓ se o texto disser/);
    });
});

describe('quando em multiplicador no importador', () => {
    it('em_combate / empunhando_arma[:tipo] sobrevivem ate o efeito final (ativo e passivo)', () => {
        ['em_combate', 'empunhando_arma', 'empunhando_arma:espada'].forEach(q => {
            const a = finalComDestino({ nome: 'X', multiplicadores: [mult({ quando: q })] }, 'ativo');
            expect(a.efeitos).toHaveLength(1);
            expect(a.efeitos[0]).toMatchObject({ propriedade: 'mgeral', atributo: 'forca', valor: 2, quando: q });
            const b = finalComDestino({ nome: 'X', multiplicadores: [mult({ quando: q })] }, 'passivo');
            expect(b.efeitosPassivos[0].quando).toBe(q);
        });
    });
    it('entrada em outra caixa/espacos e normalizada', () => {
        const r = finalComDestino({ nome: 'X', multiplicadores: [mult({ quando: '  Em_Combate ' }), mult({ nome: 'n', quando: 'EMPUNHANDO_ARMA:Espada' })] });
        expect(r.efeitos.map(e => e.quando)).toEqual(['em_combate', 'empunhando_arma:espada']);
    });
    it('"sempre", vazio e ausente nao gravam a chave quando', () => {
        const r = finalComDestino({ nome: 'X', multiplicadores: [mult({ quando: 'sempre' }), mult({ nome: 'b', quando: '' }), mult({ nome: 'c' }), mult({ nome: 'd', quando: null })] });
        expect(r.efeitos).toHaveLength(4);
        r.efeitos.forEach(e => expect('quando' in e).toBe(false));
    });
    it('condicao de alvo / invalida: nao importa, avisa em naoAplicado e nada vira efeito', () => {
        ['alvo_com_estado:surpreso', 'alvo_vida_abaixo:30', 'lixo', 'empunhando', 'em combate'].forEach(q => {
            const { objeto, naoAplicado } = prepararItemImportado({ nome: 'X', multiplicadores: [mult({ quando: q })] }, 'poder');
            expect(objeto.efeitosIncertos || []).toHaveLength(0);
            expect(naoAplicado.join(' ')).toMatch(/Multiplicador condicional que o sistema não suporta/);
            const f = montarPoderFinal(objeto, 1);
            expect(f.efeitos || []).toHaveLength(0);
            expect(f.notasIA).toMatch(/Não aplicado automaticamente/);
        });
    });
    it('multiplicador vindo em "efeitos" (ja ativo) com quando valido tambem passa; invalido vai para naoAplicado', () => {
        const ok = prepararItemImportado({ nome: 'X', efeitos: [{ nome: 'm', atributo: 'forca', propriedade: 'mgeral', valor: 3, quando: 'em_combate' }] }, 'poder');
        expect(ok.objeto.efeitosIncertos[0]).toMatchObject({ quando: 'em_combate', destino: 'ativo', propriedade: 'mgeral' });
        const ruim = prepararItemImportado({ nome: 'X', efeitos: [{ nome: 'm', atributo: 'forca', propriedade: 'mgeral', valor: 3, quando: 'alvo_com_estado:surpreso' }] }, 'poder');
        expect(ruim.objeto.efeitosIncertos || []).toHaveLength(0);
        expect(ruim.naoAplicado.join(' ')).toMatch(/alvo_com_estado/);
    });
    it('um multiplicador invalido nao derruba os bons da mesma lista', () => {
        const r = finalComDestino({ nome: 'X', multiplicadores: [mult({ quando: 'alvo_vida_abaixo:30' }), mult({ nome: 'ok', valor: 4, quando: 'em_combate' }), mult({ nome: 'ok2', valor: 5 })] });
        expect(r.efeitos.map(e => e.nome)).toEqual(['ok', 'ok2']);
    });
    it('Poder Direto: o valor vira (x - 1) e o quando e mantido', () => {
        const r = finalComDestino({ nome: 'X', multiplicadores: [{ nome: 'p', atributo: 'poder_direto', valor: 3, tipo: 'geral', quando: 'em_combate' }] });
        expect(r.efeitos[0]).toMatchObject({ atributo: 'poder_direto', propriedade: 'mgeral', valor: 2, quando: 'em_combate' });
    });
    it('multiplicador sem tipo continua indo para naoAplicado (nao vira efeito de graca, mesmo condicional)', () => {
        const r = montarPoderFinal(prepararItemImportado({ nome: 'X', multiplicadores: [{ nome: 'p', atributo: 'forca', valor: 3, quando: 'em_combate' }] }, 'poder').objeto, 1);
        expect(r.efeitos || []).toHaveLength(0);
        expect(r.notasIA).toMatch(/sem tipo/);
    });
    it('valor 0, negativo e texto continuam recusados (regra antiga) mesmo com quando valido', () => {
        const { objeto, naoAplicado } = prepararItemImportado({ nome: 'X', multiplicadores: [mult({ valor: 0, quando: 'em_combate' }), mult({ valor: -2, quando: 'em_combate' }), mult({ valor: 'abc', quando: 'em_combate' })] }, 'poder');
        expect(objeto.efeitosIncertos || []).toHaveLength(0);
        expect(naoAplicado.length).toBeGreaterThanOrEqual(3);
    });
    it('efeito NAO multiplicador com quando (regra antiga) segue igual: acerto com alvo_com_estado continua aceito', () => {
        const r = prepararItemImportado({ nome: 'X', efeitos: [{ nome: 'a', atributo: 'acerto', propriedade: 'base', valor: 2, quando: 'alvo_com_estado:surpreso' }] }, 'poder');
        expect(r.objeto.efeitos[0].quando).toBe('alvo_com_estado:surpreso');
    });
    it('ponta a ponta: o Poder importado so multiplica no combate (getBuffs e Poder Direto)', () => {
        const poder = finalComDestino({ nome: 'X', multiplicadores: [mult({ valor: 5, quando: 'em_combate' }), { nome: 'd', atributo: 'poder_direto', valor: 3, tipo: 'geral', quando: 'em_combate' }] });
        const ficha = (iniciativa) => ({ forca: { base: 1000 }, iniciativa, inventario: [], poderes: [{ ...poder, ativa: true }] });
        expect(getBuffs(ficha(0), 'forca')._hasBuff.mgeral).toBe(false);
        expect(getBuffs(ficha(3), 'forca').mgeral).toBe(5);
        expect(getPoderDiretoMultiplier(ficha(0))).toBe(1);
        expect(getPoderDiretoMultiplier(ficha(3))).toBe(3);
    });
});

describe('Sexta-Feira normalizarPoder: multiplicador com quando', () => {
    const mk = (extra) => normalizarPoder({ nome: 'P', efeitos: [{ nome: 'm', atributo: 'forca', propriedade: 'mgeral', valor: 2, ...extra }] });
    it('aceita em_combate/empunhando_arma[:tipo], normalizando', () => {
        expect(mk({ quando: 'Em_Combate' }).objeto.efeitos[0].quando).toBe('em_combate');
        expect(mk({ quando: 'empunhando_arma:Espada' }).objeto.efeitos[0].quando).toBe('empunhando_arma:espada');
        expect(mk({ quando: 'empunhando_arma' }).objeto.efeitos[0].quando).toBe('empunhando_arma');
    });
    it('descarta o efeito (com aviso) para condicao de alvo ou lixo, em qualquer propriedade de multiplicador', () => {
        ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'].forEach(propriedade => {
            const r = mk({ propriedade, quando: 'alvo_com_estado:surpreso' });
            expect(r.objeto.efeitos || []).toHaveLength(0);
            expect(r.avisos.join(' ')).toMatch(/em_combate ou empunhando_arma/);
            expect(mk({ propriedade, quando: 'lixo' }).objeto.efeitos || []).toHaveLength(0);
        });
    });
    it('multiplicador em atributo que NAO tem "quando" (ex.: forca) aceita em_combate agora; nao-multiplicador no mesmo atributo continua descartado', () => {
        expect(mk({ quando: 'em_combate' }).objeto.efeitos).toHaveLength(1);
        const base = normalizarPoder({ nome: 'P', efeitos: [{ nome: 'b', atributo: 'forca', propriedade: 'base', valor: 2, quando: 'em_combate' }] });
        expect(base.objeto.efeitos || []).toHaveLength(0);
        expect(base.avisos.join(' ')).toMatch(/ainda não aceita condição/);
    });
    it('efeitos passivos tambem respeitam a regra', () => {
        const r = normalizarPoder({ nome: 'P', efeitosPassivos: [{ nome: 'm', atributo: 'forca', propriedade: 'mabs', valor: 1, quando: 'em_combate' }, { nome: 'n', atributo: 'forca', propriedade: 'mabs', valor: 1, quando: 'alvo_vida_abaixo:10' }] });
        expect(r.objeto.efeitosPassivos).toHaveLength(1);
        expect(r.objeto.efeitosPassivos[0].quando).toBe('em_combate');
    });
    it('propriedade em maiuscula (MGERAL) tambem e tratada como multiplicador', () => {
        const r = mk({ propriedade: 'MGERAL', quando: 'em_combate' });
        expect(r.objeto.efeitos).toHaveLength(1);
    });
});
