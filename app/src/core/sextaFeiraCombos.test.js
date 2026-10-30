import { describe, it, expect } from 'vitest';
import {
    normalizarProposta, resumirProposta, descreverDestinoPedido, DECLARACOES_CRIACAO, TIPO_POR_FERRAMENTA, CAMPO_FICHA_POR_TIPO,
    TIPOS_PEDIDO_JOGADOR, ROTULO_TIPO, ordenarPedidosPendentes
} from './sextaFeiraCriacao';
import { executarFerramenta } from './sextaFeiraFerramentas';
import { combosDaFicha, followUpsDaFicha, efeitosDeCombos } from './combos';

const buff = (atributo, valor, propriedade = 'base') => ({ atributo, propriedade, valor });
const comboTexto = {
    nome: 'Tempestade de Aço',
    iniciador: { nome: 'Corte Relâmpago', tipo: 'arma', acao: 'padrao', buffs: [buff('dano', 5)] },
    passos: [
        { nome: 'Giro', acao: 'bonus', buffs: [buff('dano', 10), buff('evasiva', 1)] },
        { nome: 'Estocada', acao: 'padrao', buffs: [buff('dano', 20)] }
    ]
};

describe('Sexta-Feira cria Combos e Follow Ups', () => {
    it('os tipos novos estão ligados às ferramentas e à ficha', () => {
        expect(TIPO_POR_FERRAMENTA).toMatchObject({ propor_combo: 'combo', propor_follow_up: 'followup' });
        expect(CAMPO_FICHA_POR_TIPO).toMatchObject({ combo: 'combos', followup: 'followUps' });
        expect(TIPOS_PEDIDO_JOGADOR).toEqual(expect.arrayContaining(['combo', 'followup']));
        expect(ROTULO_TIPO).toMatchObject({ combo: 'Combo', followup: 'Follow Up' });
        const nomes = DECLARACOES_CRIACAO.map(d => d.name);
        expect(nomes).toEqual(expect.arrayContaining(['propor_combo', 'propor_follow_up']));
    });

    it('normaliza um Combo vindo do texto do jogador', () => {
        const { objeto, valido, avisos } = normalizarProposta('combo', comboTexto);
        expect(valido).toBe(true);
        expect(avisos).toEqual([]);
        expect(objeto.id).toBeUndefined();
        expect(objeto.passos).toHaveLength(2);
        expect(objeto.passos[0]).toMatchObject({ nome: 'Giro', acao: 'bonus' });
        expect(resumirProposta('combo', objeto)).toBe('Corte Relâmpago → Giro → Estocada · 3 golpes');
    });

    it('Combo incompleto é inválido e buffs ruins são descartados com aviso', () => {
        expect(normalizarProposta('combo', { nome: 'Sem golpes', iniciador: { nome: 'A' }, passos: [] }).valido).toBe(false);
        expect(normalizarProposta('combo', { nome: '', iniciador: { nome: 'A' }, passos: [{ nome: 'B' }] }).valido).toBe(false);
        const r = normalizarProposta('combo', { ...comboTexto, iniciador: { nome: 'A', buffs: [buff('inventado', 1), buff('dano', 2)] } });
        expect(r.valido).toBe(true);
        expect(r.objeto.iniciador.buffs).toHaveLength(1);
        expect(r.avisos.some(a => a.includes('descartado'))).toBe(true);
        expect(normalizarProposta('combo', null).valido).toBe(false);
    });

    it('normaliza um Follow Up e o resumo mostra níveis e Ações', () => {
        const { objeto, valido } = normalizarProposta('followup', {
            nome: 'Perseguição', acao: 'reacao', quando: 'qualquer', acoesPermitidas: ['reacao', 'bonus', 'nada'],
            niveis: [{ combos: 2, buffs: [buff('dano', 8)] }, { combos: 0, buffs: [buff('dano', 3)] }]
        });
        expect(valido).toBe(true);
        expect(objeto.niveis.map(n => n.combos)).toEqual([0, 2]);
        expect(objeto.acoesPermitidas).toEqual(['reacao', 'bonus']);
        expect(resumirProposta('followup', objeto)).toContain('2 nível(is)');
        expect(normalizarProposta('followup', { nome: '' }).valido).toBe(false);
    });

    it('o destino do pedido aponta para a seção Combos', () => {
        expect(descreverDestinoPedido('combo', {})).toMatchObject({ pagina: 'Combate', oQue: 'um Combo' });
        expect(descreverDestinoPedido('followup', {})).toMatchObject({ oQue: 'um Follow Up' });
    });

    it('o objeto aprovado pelo Mestre vira Combo que a engine enxerga', () => {
        const { objeto } = normalizarProposta('combo', comboTexto);
        const ficha = { combos: [{ ...objeto, id: Date.now() }], combate: { comboEstado: { ativo: { comboId: String(Date.now()), passo: 1 } } } };
        expect(combosDaFicha(ficha)).toHaveLength(1);
        ficha.combate.comboEstado.ativo.comboId = combosDaFicha(ficha)[0].id;
        expect(efeitosDeCombos(ficha).filter(e => e.atributo === 'dano').reduce((s, e) => s + e.valor, 0)).toBe(15);
        expect(followUpsDaFicha(ficha)).toEqual([]);
    });

    it('pedidos de jogadores com Combo passam pela fila normalizados', () => {
        const fila = ordenarPedidosPendentes({ a: { tipo: 'combo', objeto: comboTexto, alvo: 'Heroi', solicitante: 'Heroi', em: 5 }, b: { tipo: 'combo', objeto: { nome: 'x' }, alvo: 'H', solicitante: 'H', em: 6 } });
        expect(fila).toHaveLength(1);
        expect(fila[0][1].objeto.nome).toBe('Tempestade de Aço');
    });

    it('a ferramenta propor_combo registra uma proposta para o jogador pedir para si', async () => {
        const registros = [];
        const estado = { meuNome: 'Heroi', isMestre: false, minhaFicha: { bio: {} }, personagens: {}, dummies: {} };
        const r = await executarFerramenta('propor_combo', comboTexto, estado, { registrarProposta: async (p) => { registros.push(p); return 'p1'; } });
        expect(r.ok).toBe(true);
        expect(registros[0]).toMatchObject({ tipo: 'combo', alvo: 'Heroi' });
        const incompleto = await executarFerramenta('propor_combo', { nome: 'x', iniciador: { nome: 'a' }, passos: [] }, estado, { registrarProposta: async () => 'p2' });
        expect(incompleto.erro).toBeTruthy();
    });
});
