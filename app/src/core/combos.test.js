import { describe, it, expect } from 'vitest';
import {
    normalizarBuff, normalizarGolpe, normalizarCombo, normalizarFollowUp, combosDaFicha, followUpsDaFicha, temCombos,
    estadoVazio, estadoDeCombo, iniciarCombo, avancarCombo, interromperCombo, usarFollowUp, ajustarNivelFollowUp, nivelDoFollowUp,
    opcoesDeCombo, proximoGolpeDoCombo, efeitosDeCombos, exportarCombos, importarCombos, LIMITES
} from './combos';
import { getBuffs } from './attributes';
import { calcularCA } from './engine';
import { calcularMaximoAcoes } from './acoes';

const buff = (atributo, valor, propriedade = 'base') => ({ atributo, propriedade, valor });

function comboExemplo(extra = {}) {
    return normalizarCombo({
        id: 'cmb1', nome: 'Dança das Lâminas',
        iniciador: { nome: 'Corte Rasante', acao: 'padrao', buffs: [buff('dano', 5)] },
        passos: [
            { nome: 'Giro', acao: 'bonus', buffs: [buff('dano', 10)] },
            { nome: 'Estocada Final', acao: 'padrao', buffs: [buff('dano', 20), buff('evasiva', 2)] }
        ],
        ...extra
    });
}
const fichaCom = (combos, followUps = [], estado = null) => ({ combos, followUps, combate: estado ? { comboEstado: estado } : {} });

describe('combos - normalização', () => {
    it('buff válido mantém atributo/valor e propriedade inválida cai numa opção do atributo', () => {
        expect(normalizarBuff(buff('dano', '7'))).toMatchObject({ atributo: 'dano', propriedade: 'base', valor: 7 });
        expect(normalizarBuff({ atributo: 'dano', propriedade: 'xyz', valor: 3 }).propriedade).toBe('base');
        expect(normalizarBuff({ atributo: 'reducao_dano', propriedade: 'mgeral', valor: 20 }).propriedade).toBe('base');
    });

    it('descarta buff de atributo desconhecido, sem número ou de reação', () => {
        expect(normalizarBuff(buff('inexistente', 1))).toBeNull();
        expect(normalizarBuff(buff('dano', 'abc'))).toBeNull();
        expect(normalizarBuff(buff('reacao_errou', 1))).toBeNull();
        expect(normalizarBuff(null)).toBeNull();
    });

    it('golpe: tipo/ação inválidos voltam ao padrão e textos são cortados', () => {
        const g = normalizarGolpe({ nome: 'x'.repeat(200), tipo: 'bobagem', acao: 'nada', buffs: [buff('dano', 1), null] });
        expect(g.nome).toHaveLength(LIMITES.nome);
        expect(g.tipo).toBe('livre');
        expect(g.acao).toBe('padrao');
        expect(g.buffs).toHaveLength(1);
    });

    it('combo ganha id, limita os golpes e follow up sem níveis ganha um nível 0', () => {
        const c = normalizarCombo({ nome: 'A', iniciador: { nome: 'I' }, passos: Array.from({ length: 30 }, (_, i) => ({ nome: `p${i}` })) });
        expect(c.id).toBeTruthy();
        expect(c.passos).toHaveLength(LIMITES.passos);
        const f = normalizarFollowUp({ nome: 'Seguir', acao: 'reacao' });
        expect(f.niveis).toEqual([{ combos: 0, descricao: '', buffs: [] }]);
        expect(f.acoesPermitidas).toEqual(['reacao']);
        expect(f.buffs).toBeUndefined();
    });

    it('ids repetidos viram ids únicos', () => {
        const lista = combosDaFicha({ combos: [{ id: 'igual', nome: 'A' }, { id: 'igual', nome: 'B' }] });
        expect(new Set(lista.map(c => c.id)).size).toBe(2);
    });

    it('quem não tem Combos nem Follow Ups não usa o sistema', () => {
        expect(temCombos({})).toBe(false);
        expect(temCombos({ combos: [] })).toBe(false);
        expect(temCombos({ combos: [{}] })).toBe(true);
        expect(efeitosDeCombos({ combate: { comboEstado: { ativo: { comboId: 'x', passo: 3 } } } })).toEqual([]);
    });
});

describe('combos - fluxo do Combo', () => {
    it('iniciar, avançar e concluir; conclusão guarda o combo e conta um finalizado', () => {
        const combo = comboExemplo();
        let e = iniciarCombo(estadoVazio(), combo);
        expect(e.ativo).toEqual({ comboId: 'cmb1', passo: 0 });
        e = avancarCombo(e, combo);
        expect(e.ativo.passo).toBe(1);
        e = avancarCombo(e, combo);
        expect(e.ativo).toBeNull();
        expect(e.concluidos).toEqual(['cmb1']);
        expect(e.finalizados).toBe(1);
    });

    it('não inicia outro Combo com um em andamento e ignora avanço de outro combo', () => {
        const a = comboExemplo();
        const b = comboExemplo({ id: 'cmb2' });
        const e = iniciarCombo(estadoVazio(), a);
        expect(iniciarCombo(e, b)).toBe(e);
        expect(avancarCombo(e, b)).toBe(e);
    });

    it('combo só com o iniciador conclui na hora; repetir o mesmo combo conta finalizado mas não duplica o buff', () => {
        const solo = normalizarCombo({ id: 'solo', nome: 'S', iniciador: { nome: 'I', buffs: [buff('dano', 4)] }, passos: [] });
        let e = iniciarCombo(estadoVazio(), solo);
        expect(e.concluidos).toEqual(['solo']);
        e = iniciarCombo(e, solo);
        expect(e.finalizados).toBe(2);
        expect(e.concluidos).toEqual(['solo']);
        const efeitos = efeitosDeCombos(fichaCom([solo], [], e));
        expect(efeitos.filter(x => x.atributo === 'dano')).toHaveLength(1);
    });

    it('interromper perde os buffs do Combo em andamento mas mantém os concluídos', () => {
        const a = comboExemplo();
        const b = comboExemplo({ id: 'cmb2', nome: 'Outro', iniciador: { nome: 'I2', buffs: [buff('dano', 100)] }, passos: [{ nome: 'p', buffs: [buff('dano', 1)] }] });
        let e = iniciarCombo(estadoVazio(), a);
        e = avancarCombo(avancarCombo(e, a), a);
        e = iniciarCombo(e, b);
        expect(efeitosDeCombos(fichaCom([a, b], [], e)).some(x => x.valor === 100)).toBe(true);
        e = interromperCombo(e);
        const depois = efeitosDeCombos(fichaCom([a, b], [], e));
        expect(depois.some(x => x.valor === 100)).toBe(false);
        expect(depois.some(x => x.valor === 20)).toBe(true);
    });

    it('proximoGolpeDoCombo e opcoesDeCombo seguem o estado', () => {
        const combo = comboExemplo();
        const parado = fichaCom([combo]);
        expect(opcoesDeCombo(parado).iniciadores.map(o => o.golpe.nome)).toEqual(['Corte Rasante']);
        expect(opcoesDeCombo(parado).proximo).toBeNull();
        const andando = fichaCom([combo], [], { ativo: { comboId: 'cmb1', passo: 1 } });
        const prox = proximoGolpeDoCombo(andando);
        expect(prox).toMatchObject({ indice: 2, ultimo: true });
        expect(prox.golpe.nome).toBe('Estocada Final');
        expect(opcoesDeCombo(andando).iniciadores).toEqual([]);
    });
});

describe('combos - buffs que valem agora', () => {
    it('os buffs acumulam golpe a golpe e ficam no máximo depois de concluir', () => {
        const combo = comboExemplo();
        const somaDano = (ficha) => efeitosDeCombos(ficha).filter(x => x.atributo === 'dano').reduce((s, x) => s + x.valor, 0);
        expect(somaDano(fichaCom([combo]))).toBe(0);
        expect(somaDano(fichaCom([combo], [], { ativo: { comboId: 'cmb1', passo: 0 } }))).toBe(5);
        expect(somaDano(fichaCom([combo], [], { ativo: { comboId: 'cmb1', passo: 1 } }))).toBe(15);
        expect(somaDano(fichaCom([combo], [], { ativo: null, concluidos: ['cmb1'], finalizados: 1 }))).toBe(35);
    });

    it('dois combos concluídos somam por cima', () => {
        const a = comboExemplo();
        const b = comboExemplo({ id: 'cmb2', iniciador: { nome: 'X', buffs: [buff('dano', 1)] }, passos: [] });
        const efeitos = efeitosDeCombos(fichaCom([a, b], [], { concluidos: ['cmb1', 'cmb2'], finalizados: 2 }));
        expect(efeitos.filter(x => x.atributo === 'dano').reduce((s, x) => s + x.valor, 0)).toBe(36);
    });

    it('Follow Up só vale depois de usado e no nível atual (por Combos finalizados + ajuste manual)', () => {
        const f = normalizarFollowUp({
            id: 'fu1', nome: 'Perseguição', acao: 'reacao', quando: 'qualquer',
            niveis: [{ combos: 0, buffs: [buff('dano', 3)] }, { combos: 2, buffs: [buff('dano', 9)] }]
        });
        let estado = estadoVazio();
        expect(efeitosDeCombos(fichaCom([], [f], estado))).toEqual([]);
        estado = usarFollowUp(estado, f);
        expect(efeitosDeCombos(fichaCom([], [f], estado)).map(x => x.valor)).toEqual([3]);
        expect(nivelDoFollowUp(f, { ...estado, finalizados: 2 })).toBe(1);
        expect(efeitosDeCombos(fichaCom([], [f], { ...estado, finalizados: 2 })).map(x => x.valor)).toEqual([9]);
        expect(nivelDoFollowUp(f, ajustarNivelFollowUp(estado, 'fu1', 1))).toBe(1);
        expect(nivelDoFollowUp(f, ajustarNivelFollowUp(estado, 'fu1', -5))).toBe(0);
    });

    it('Follow Up "só durante um Combo" só é oferecido com Combo ativo (e do combo certo)', () => {
        const combo = comboExemplo();
        const f = normalizarFollowUp({ id: 'fu1', nome: 'Seguir', quando: 'combo', combosIds: ['cmb1'] });
        const g = normalizarFollowUp({ id: 'fu2', nome: 'Livre', quando: 'qualquer' });
        expect(opcoesDeCombo(fichaCom([combo], [f, g])).followUps.map(o => o.followUp.id)).toEqual(['fu2']);
        const andando = fichaCom([combo], [f, g], { ativo: { comboId: 'cmb1', passo: 0 } });
        expect(opcoesDeCombo(andando).followUps.map(o => o.followUp.id)).toEqual(['fu1', 'fu2']);
        const outro = fichaCom([comboExemplo({ id: 'cmb9' })], [f], { ativo: { comboId: 'cmb9', passo: 0 } });
        expect(opcoesDeCombo(outro).followUps).toEqual([]);
    });

    it('estado quebrado da ficha é normalizado', () => {
        const e = estadoDeCombo({ combate: { comboEstado: { ativo: { comboId: '!!', passo: 'x' }, concluidos: ['a', 'a', 5, '$'], finalizados: -3, followUps: { fu: { usos: '2', ativo: true }, '!': {} } } } });
        expect(e.ativo).toBeNull();
        expect(e.concluidos).toEqual(['a', '5']);
        expect(e.finalizados).toBe(0);
        expect(e.followUps).toEqual({ fu: { usos: 2, ativo: true } });
    });
});

describe('combos - a engine enxerga os buffs (sem lógica de dano paralela)', () => {
    const base = () => ({ bio: {}, status: { forca: { base: 10 }, destreza: { base: 10 } }, poderes: [], inventario: [] });

    it('getBuffs soma o buff base de dano do Combo em andamento', () => {
        const combo = comboExemplo();
        const sem = getBuffs({ ...base(), combos: [combo] }, 'dano');
        const com = getBuffs({ ...base(), combos: [combo], combate: { comboEstado: { ativo: { comboId: 'cmb1', passo: 1 } } } }, 'dano');
        expect(sem.base).toBe(0);
        expect(com.base).toBe(15);
    });

    it('buff multiplicador de dano do Combo entra no multiplicador geral (somado como os de qualquer Habilidade)', () => {
        const combo = normalizarCombo({ id: 'm', nome: 'M', iniciador: { nome: 'I', buffs: [buff('dano', 1.5, 'mgeral')] }, passos: [{ nome: 'p' }] });
        const b = getBuffs({ ...base(), combos: [combo], combate: { comboEstado: { ativo: { comboId: 'm', passo: 0 } } } }, 'dano');
        expect(b.mgeral).toBeCloseTo(1.5);
        expect(b._hasBuff.mgeral).toBe(true);
    });

    it('a CA sobe com o buff de evasiva do Combo concluído', () => {
        const combo = comboExemplo();
        const antes = calcularCA({ ...base(), combos: [combo] }, 'evasiva');
        const depois = calcularCA({ ...base(), combos: [combo], combate: { comboEstado: { concluidos: ['cmb1'], finalizados: 1 } } }, 'evasiva');
        expect(depois - antes).toBe(2);
    });

    it('buffs de Ação Bônus aumentam o máximo de Ações', () => {
        const combo = normalizarCombo({ id: 'a', nome: 'A', iniciador: { nome: 'I', buffs: [buff('acao_bonus', 1)] }, passos: [{ nome: 'p' }] });
        const antes = calcularMaximoAcoes({ ...base(), combos: [combo] });
        const depois = calcularMaximoAcoes({ ...base(), combos: [combo], combate: { comboEstado: { ativo: { comboId: 'a', passo: 0 } } } });
        expect(depois.bonus - antes.bonus).toBe(1);
    });
});

describe('combos - exportar e importar', () => {
    it('exportar e importar de volta preserva a estrutura, com ids novos e follow ups religados', () => {
        const combo = comboExemplo();
        const f = normalizarFollowUp({ id: 'fu1', nome: 'Seguir', combosIds: ['cmb1'], niveis: [{ combos: 0, buffs: [buff('dano', 2)] }] });
        const pacote = exportarCombos({ combos: [combo], followUps: [f] });
        expect(pacote).toMatchObject({ tipo: 'rpg-combos', versao: 1 });
        const lido = importarCombos(JSON.stringify(pacote));
        expect(lido.combos).toHaveLength(1);
        expect(lido.combos[0].id).not.toBe('cmb1');
        expect(lido.combos[0].passos.map(p => p.nome)).toEqual(['Giro', 'Estocada Final']);
        expect(lido.followUps[0].combosIds).toEqual([lido.combos[0].id]);
    });

    it('aceita bloco de código, lista simples e avisa quando falta coisa', () => {
        const texto = '```json\n[{"nome":"Rápido","iniciador":{"nome":"Soco"},"passos":[]}]\n```';
        const r = importarCombos(texto);
        expect(r.combos[0].nome).toBe('Rápido');
        expect(r.avisos.some(a => a.includes('não tem golpes'))).toBe(true);
    });

    it('texto inválido não quebra nem importa nada', () => {
        expect(importarCombos('isto não é json').combos).toEqual([]);
        expect(importarCombos('isto não é json').avisos).toHaveLength(1);
        expect(importarCombos(null).combos).toEqual([]);
        expect(importarCombos(42).combos).toEqual([]);
    });

    it('respeita os limites ao importar', () => {
        const muitos = { combos: Array.from({ length: 80 }, (_, i) => ({ nome: `c${i}`, iniciador: { nome: 'i' }, passos: [{ nome: 'p' }] })) };
        expect(importarCombos(muitos).combos).toHaveLength(LIMITES.combos);
    });
});

describe('combos - estado imutável', () => {
    it('as transições não alteram o estado original', () => {
        const combo = comboExemplo();
        const original = estadoVazio();
        const congelado = JSON.stringify(original);
        iniciarCombo(original, combo);
        usarFollowUp(original, normalizarFollowUp({ id: 'f', nome: 'F' }));
        expect(JSON.stringify(original)).toBe(congelado);
    });
});
