import { describe, it, expect } from 'vitest';
import { getBuffs, getPoderTotalDaAbaPoderes, isStatBuffed } from './attributes';
import { getPoderDiretoMultiplier, getGlobalMultipliers, calcularPoderAtual } from './poder';
import {
    fichaRealista, ef, STATUS_FISICOS, ESPERADO_FORCA, ESPERADO_DIRETO, ESPERADO_GLOBAL,
} from './multiplicadorQuando.qa.fixture';

// QA - REGRESSAO DO PODER CALCULADO. O "quando" em multiplicadores (mbase/mgeral/mformas/mabs/munico) NAO pode mudar nenhum
// numero de quem nao usa "quando". Os valores esperados sao calculados a mao (ver multiplicadorQuando.qa.fixture.js).

const clone = (o) => JSON.parse(JSON.stringify(o));
const instantaneo = (f) => ({
    buffs: Object.fromEntries([...STATUS_FISICOS, 'status', 'vida', 'mana', 'aura', 'chakra', 'corpo', 'dano'].map(k => [k, getBuffs(f, k)])),
    aba: Object.fromEntries([...STATUS_FISICOS, 'status', 'vida', 'mana'].map(k => [k, getPoderTotalDaAbaPoderes(f, k)])),
    buffed: ['forca', 'status', 'mana'].map(k => isStatBuffed(f, k)),
    direto: getPoderDiretoMultiplier(f),
    global: getGlobalMultipliers(f),
    calc: calcularPoderAtual(f, 1),
});
// Poder do Scouter por inteiro (poderGlobal e exato) + os cinco multiplicadores.
const scouter = (f) => { const c = calcularPoderAtual(f, 1); return [c.poderGlobal, c.poderExato]; };

// Coloca um efeito extra num ponto da ficha (poder.efeitos, passivas, item, pacto...).
const adicionar = (f, caminho, efeito) => { const alvo = caminho.split('.').reduce((o, k) => o[k], f); alvo.push(efeito); return f; };

describe('REGRESSAO: ficha realista sem "quando" tem os numeros calculados a mao', () => {
    const f = fichaRealista();
    it('getBuffs(forca): mgeral/mbase/mformas/mabs/munico (Poder com estagio, desligado, Forma+Config, Item equipado, Pacto, Passiva)', () => {
        const b = getBuffs(f, 'forca');
        expect(b.mgeral).toBeCloseTo(ESPERADO_FORCA.mgeral, 10);
        expect(b.mbase).toBeCloseTo(ESPERADO_FORCA.mbase, 10);
        expect(b.mformas).toBeCloseTo(ESPERADO_FORCA.mformas, 10);
        expect(b.mabs).toBeCloseTo(ESPERADO_FORCA.mabs, 10);
        expect(b.munico).toEqual(ESPERADO_FORCA.munico);
        expect(b._hasBuff).toEqual({ mbase: true, mgeral: true, mformas: true, mabs: true });
    });
    it('item NAO equipado e pacto NAO sincronizado nao entram (99/50/100 ficam de fora)', () => {
        expect(getBuffs(f, 'forca').mgeral).toBeLessThan(20);
    });
    it('getPoderTotalDaAbaPoderes(forca) = 0.5 * 9 * 0.3 * 0.7 * 3', () => {
        expect(getPoderTotalDaAbaPoderes(f, 'forca')).toBeCloseTo(ESPERADO_FORCA.aba, 10);
        expect(isStatBuffed(f, 'forca')).toBe(true);
    });
    it('getPoderDiretoMultiplier = (1+0.5)(1+1)(1+0)(1+3)x2 = 24', () => {
        expect(getPoderDiretoMultiplier(f)).toBeCloseTo(ESPERADO_DIRETO, 10);
    });
    it('getGlobalMultipliers: finalB 3, finalG 3.5, finalA 1, finalP 2, finalUni 7.5', () => {
        const g = getGlobalMultipliers(f);
        ['finalB', 'finalG', 'finalA', 'finalP', 'finalUni', 'totalDano'].forEach(k => expect(g[k]).toBeCloseTo(ESPERADO_GLOBAL[k], 10));
        expect(g.finalF).toBeGreaterThanOrEqual(1);
    });
    it('Poder Calculado e finito, positivo e estavel entre chamadas', () => {
        const [a, ae] = scouter(f); const [b, be] = scouter(clone(f));
        expect(Number.isFinite(ae)).toBe(true); expect(ae).toBeGreaterThan(0);
        expect(a).toBe(b); expect(ae).toBe(be);
    });
});

describe('REGRESSAO: "quando" vazio/sempre/ausente = exatamente os mesmos numeros', () => {
    const base = instantaneo(fichaRealista());
    const marcar = (valor) => {
        const f = fichaRealista();
        const mexer = (lista) => (lista || []).forEach(e => { if (valor === undefined) delete e.quando; else e.quando = valor; });
        f.poderes.forEach(p => { mexer(p.efeitos); mexer(p.efeitosPassivos); (p.formas || []).forEach(fo => (fo.configs || []).forEach(c => mexer(c.efeitos))); });
        f.passivas.forEach(p => mexer(p.efeitos));
        f.inventario.forEach(i => { mexer(i.efeitos); mexer(i.efeitosPassivos); });
        f.seresSelados.forEach(s => mexer(s.efeitos));
        return f;
    };
    [undefined, '', 'sempre', '  ', null].forEach(v => {
        it(`quando = ${JSON.stringify(v)} em TODOS os efeitos nao muda nada (buffs, aba, direto, global, Scouter)`, () => {
            expect(instantaneo(marcar(v))).toEqual(base);
        });
    });
    it('quando em efeito que NAO e multiplicador (acerto/base) nunca e lido pelos multiplicadores', () => {
        const f = fichaRealista();
        adicionar(f, 'poderes.0.efeitos', ef('forca', 'base', 7, { quando: 'alvo_com_estado:surpreso' }));
        adicionar(f, 'poderes.0.efeitos', ef('acerto', 'base', 3, { quando: 'em_combate' }));
        const antes = fichaRealista();
        adicionar(antes, 'poderes.0.efeitos', ef('forca', 'base', 7));
        adicionar(antes, 'poderes.0.efeitos', ef('acerto', 'base', 3));
        expect(getBuffs(f, 'forca')).toEqual(getBuffs(antes, 'forca'));
        expect(getBuffs(f, 'forca').base).toBe(7 * 3);
    });
});

describe('em_combate (o app marca combate com iniciativa > 0)', () => {
    const comMult = (ini) => adicionar(fichaRealista({ iniciativa: ini }), 'poderes.2.efeitos', ef('forca', 'mgeral', 5, { quando: 'em_combate' }));
    it('iniciativa 0, negativa, vazia ou lixo: desligado = numeros identicos aos da ficha sem o efeito', () => {
        [0, -3, undefined, null, '', 'abc', NaN].forEach(ini => {
            expect(getBuffs(comMult(ini), 'forca').mgeral).toBe(getBuffs(fichaRealista(), 'forca').mgeral);
            expect(scouter(comMult(ini))).toEqual(scouter(fichaRealista()));
        });
    });
    it('iniciativa > 0 (inclusive texto numerico): +5 no mgeral da forca', () => {
        [1, 12, '7', 0.5].forEach(ini => expect(getBuffs(comMult(ini), 'forca').mgeral).toBeCloseTo(14, 10));
    });
    it('ligado equivale a efeito sem quando, e o Poder do Scouter sobe', () => {
        const sem = adicionar(fichaRealista({ iniciativa: 4 }), 'poderes.2.efeitos', ef('forca', 'mgeral', 5));
        expect(getPoderTotalDaAbaPoderes(comMult(4), 'forca')).toBeCloseTo(getPoderTotalDaAbaPoderes(sem, 'forca'), 10);
        expect(scouter(comMult(4))).toEqual(scouter(sem));
        expect(getPoderTotalDaAbaPoderes(comMult(4), 'forca')).toBeGreaterThan(getPoderTotalDaAbaPoderes(comMult(0), 'forca'));
    });
    it('em_combate em poder_direto: afeta getPoderDiretoMultiplier e o Scouter', () => {
        const mk = (ini) => adicionar(fichaRealista({ iniciativa: ini }), 'poderes.2.efeitos', ef('poder_direto', 'mgeral', 1, { quando: 'em_combate' }));
        expect(getPoderDiretoMultiplier(mk(0))).toBeCloseTo(24, 10);
        // mgeral do direto 1 -> 2: (1+2)/(1+1) = 1.5x
        expect(getPoderDiretoMultiplier(mk(2))).toBeCloseTo(36, 10);
        expect(scouter(mk(2))[1]).toBeGreaterThan(scouter(mk(0))[1]);
        expect(scouter(mk(0))).toEqual(scouter(fichaRealista()));
    });
    it('em_combate em dano: getGlobalMultipliers (Poder Calculado) acompanha', () => {
        const mk = (ini) => adicionar(fichaRealista({ iniciativa: ini }), 'passivas.0.efeitos', ef('dano', 'mgeral', 2, { quando: 'em_combate' }));
        expect(getGlobalMultipliers(mk(0)).finalG).toBeCloseTo(3.5, 10);
        expect(getGlobalMultipliers(mk(3)).finalG).toBeCloseTo(5.5, 10);
        expect(getGlobalMultipliers(mk(3)).totalDano).toBeCloseTo(3 * 5.5 * 2, 10);
        expect(getGlobalMultipliers(mk(0))).toEqual(getGlobalMultipliers(fichaRealista()));
    });
});

describe('multiplicador condicional em cada origem (item, forma, estagio, pacto, passiva)', () => {
    const pontos = [
        ['item equipado (ativo)', 'inventario.0.efeitos', 1],
        ['item equipado (passivo)', 'inventario.0.efeitosPassivos', 1],
        ['Poder ativo', 'poderes.2.efeitos', 1],
        ['Poder DESLIGADO (passivo)', 'poderes.1.efeitosPassivos', 1],
        ['Pacto sincronizado', 'seresSelados.0.efeitos', 1],
        ['Passiva', 'passivas.0.efeitos', 1],
    ];
    pontos.forEach(([nome, caminho, v]) => {
        it(`${nome}: condicao falsa = identico ao baseline; verdadeira = soma o valor`, () => {
            const base = getBuffs(fichaRealista(), 'forca').mgeral;
            const falso = adicionar(fichaRealista({ iniciativa: 0 }), caminho, ef('forca', 'mgeral', v, { quando: 'em_combate' }));
            const certo = adicionar(fichaRealista({ iniciativa: 9 }), caminho, ef('forca', 'mgeral', v, { quando: 'em_combate' }));
            expect(getBuffs(falso, 'forca').mgeral).toBe(base);
            expect(getBuffs(certo, 'forca').mgeral).toBeCloseTo(base + v, 10);
            expect(scouter(falso)).toEqual(scouter(fichaRealista()));
        });
    });
    it('item em Forma ativa (Bankai) com Config: o multiplicador condicional da Config respeita o quando', () => {
        const mk = (ini) => {
            const f = fichaRealista({ iniciativa: ini });
            Object.assign(f.inventario[0], {
                formaAtivaId: 'bf', configAtivaId: 'bc',
                formas: [{ id: 'bf', nome: 'B', acumulaFormaBase: true, configs: [{ id: 'bc', nome: 'C', efeitos: [ef('forca', 'mgeral', 6, { quando: 'em_combate' }), ef('poder_direto', 'mgeral', 2, { quando: 'em_combate' })], efeitosPassivos: [] }] }],
            });
            return f;
        };
        expect(getBuffs(mk(0), 'forca').mgeral).toBe(9);
        expect(getBuffs(mk(1), 'forca').mgeral).toBe(15);
        expect(getPoderDiretoMultiplier(mk(0))).toBeCloseTo(24, 10);
        expect(getPoderDiretoMultiplier(mk(1))).toBeCloseTo(48, 10); // mgeral direto 1 -> 3: 1.5 * 4 * 4 * 2
    });
    it('Forma sem acumular base: o item base some, mas a Forma condicional segue a regra', () => {
        const f = fichaRealista({ iniciativa: 0 });
        Object.assign(f.inventario[0], {
            formaAtivaId: 'bf', configAtivaId: 'bc',
            formas: [{ id: 'bf', nome: 'B', acumulaFormaBase: false, configs: [{ id: 'bc', nome: 'C', efeitos: [ef('forca', 'mgeral', 6, { quando: 'em_combate' })], efeitosPassivos: [] }] }],
        });
        // sem a espada base (-2) e sem o condicional (+0): 9 - 2 = 7
        expect(getBuffs(f, 'forca').mgeral).toBe(7);
        f.iniciativa = 5;
        expect(getBuffs(f, 'forca').mgeral).toBe(13);
    });
    it('Forma do Poder (sub-forma) condicional: respeita o quando', () => {
        const mk = (ini) => {
            const f = fichaRealista({ iniciativa: ini });
            f.poderes[1].ativa = true; f.poderes[1].efeitos = []; f.poderes[1].formaAtivaId = 'x';
            f.poderes[1].formas = [{ id: 'x', efeitos: [ef('forca', 'mformas', 0.4, { quando: 'em_combate' })], efeitosPassivos: [] }];
            return f;
        };
        expect(getBuffs(mk(0), 'forca').mformas).toBeCloseTo(0.3, 10);
        expect(getBuffs(mk(1), 'forca').mformas).toBeCloseTo(0.7, 10);
    });
    it('Estagio: o valor do multiplicador condicional escala pelo estagio (x3) e a condicao e preservada', () => {
        const mk = (ini) => adicionar(fichaRealista({ iniciativa: ini }), 'poderes.0.efeitos', ef('forca', 'mgeral', 2, { quando: 'em_combate' }));
        expect(getBuffs(mk(0), 'forca').mgeral).toBe(9);
        expect(getBuffs(mk(1), 'forca').mgeral).toBe(15); // 2 x3 = 6
    });
    it('Estagio 1 (sem crescimento) tambem respeita o quando', () => {
        const f = adicionar(fichaRealista({ iniciativa: 0 }), 'poderes.0.efeitos', ef('forca', 'mgeral', 2, { quando: 'em_combate' }));
        f.poderes[0].estagioAtual = 1;
        expect(getBuffs(f, 'forca').mgeral).toBe(7);
        f.iniciativa = 2;
        expect(getBuffs(f, 'forca').mgeral).toBe(9);
    });
    it('Estagio com marco: o quando do multiplicador do marco e preservado (fora de combate nao vale, em combate vale); sem quando fica igual', () => {
        const mk = (ini, quando) => {
            const f = fichaRealista({ iniciativa: ini });
            f.poderes[0].estagioAtual = 5;
            f.poderes[0].estagios.marcos = [{ estagio: 5, efeitos: [ef('forca', 'mgeral', 2, quando ? { quando } : {})] }];
            return f;
        };
        // marco no 5o estagio (fator 1x) substitui os efeitos ativos do Kaioken: 2 (marco) + 2 (Espada) + 4 (Kurama)
        expect(getBuffs(mk(0, 'em_combate'), 'forca').mgeral).toBe(6);
        expect(getBuffs(mk(1, 'em_combate'), 'forca').mgeral).toBe(8);
        expect(getBuffs(mk(0), 'forca').mgeral).toBe(8);
        expect(getBuffs(mk(0, 'sempre'), 'forca').mgeral).toBe(8);
    });
    it('Pacto sincronizado: Forma/Config do pacto condicional e pacto desligado ignorado', () => {
        const mk = (ini, ativo) => {
            const f = fichaRealista({ iniciativa: ini });
            Object.assign(f.seresSelados[0], {
                ativo, formaAtivaId: 'pf', configAtivaId: 'pc',
                formas: [{ id: 'pf', nome: 'PF', configs: [{ id: 'pc', nome: 'PC', efeitos: [ef('forca', 'mgeral', 3, { quando: 'em_combate' })], efeitosPassivos: [] }] }],
            });
            return f;
        };
        expect(getBuffs(mk(0, true), 'forca').mgeral).toBe(9);
        expect(getBuffs(mk(1, true), 'forca').mgeral).toBe(12);
        expect(getBuffs(mk(1, false), 'forca').mgeral).toBe(5); // 3 (Kaioken) + 2 (espada); pacto fora
    });
});

describe('empunhando_arma com e sem tipo', () => {
    const mk = (quando, inventario) => {
        const f = fichaRealista();
        f.inventario = inventario;
        f.poderes[2].efeitos.push(ef('forca', 'mgeral', 10, { quando }));
        return f;
    };
    const espada = { id: 'a', nome: 'E', tipo: 'arma', armaTipo: 'Espada', equipado: true, efeitos: [], efeitosPassivos: [] };
    const lanca = { id: 'b', nome: 'L', tipo: 'arma', armaTipo: 'lanca', equipado: true, efeitos: [], efeitosPassivos: [] };
    const guardada = { ...espada, equipado: false };
    // Sem a espada da ficha realista (mgeral 2) o baseline de forca e 3 + 4 = 7.
    it('sem tipo: qualquer arma equipada vale; sem arma ou arma guardada nao', () => {
        expect(getBuffs(mk('empunhando_arma', [espada]), 'forca').mgeral).toBe(17);
        expect(getBuffs(mk('empunhando_arma', [lanca]), 'forca').mgeral).toBe(17);
        expect(getBuffs(mk('empunhando_arma', []), 'forca').mgeral).toBe(7);
        expect(getBuffs(mk('empunhando_arma', [guardada]), 'forca').mgeral).toBe(7);
    });
    it('com tipo: so o tipo certo (sem diferenciar maiuscula) vale', () => {
        expect(getBuffs(mk('empunhando_arma:espada', [espada]), 'forca').mgeral).toBe(17);
        expect(getBuffs(mk('empunhando_arma:ESPADA', [espada]), 'forca').mgeral).toBe(17);
        expect(getBuffs(mk('empunhando_arma:espada', [lanca]), 'forca').mgeral).toBe(7);
        expect(getBuffs(mk('empunhando_arma:espada', [guardada]), 'forca').mgeral).toBe(7);
        expect(getBuffs(mk('empunhando_arma:espada', [lanca, espada]), 'forca').mgeral).toBe(17);
    });
    it('vale tambem em poder_direto e no Poder Calculado (dano)', () => {
        const f = fichaRealista();
        f.poderes[2].efeitos.push(ef('poder_direto', 'mgeral', 1, { quando: 'empunhando_arma:espada' }));
        f.passivas[0].efeitos.push(ef('dano', 'mgeral', 2, { quando: 'empunhando_arma:espada' }));
        expect(getPoderDiretoMultiplier(f)).toBeCloseTo(36, 10); // espada equipada: mgeral direto 1 -> 2
        expect(getGlobalMultipliers(f).finalG).toBeCloseTo(5.5, 10);
        f.inventario[0].equipado = false;
        expect(getPoderDiretoMultiplier(f)).toBeCloseTo(8, 10); // sem a espada: (1)(1+1)(1)(1+3)(1)
    });
});

describe('mistura de multiplicadores com e sem condicao + valores estranhos', () => {
    it('so os condicionais falsos saem; os incondicionais seguem iguais', () => {
        const f = fichaRealista({ iniciativa: 0 });
        adicionar(f, 'passivas.0.efeitos', ef('forca', 'mgeral', 1));
        adicionar(f, 'passivas.0.efeitos', ef('forca', 'mgeral', 100, { quando: 'em_combate' }));
        adicionar(f, 'passivas.0.efeitos', ef('forca', 'mabs', 0.3, { quando: 'empunhando_arma:lanca' }));
        adicionar(f, 'passivas.0.efeitos', ef('forca', 'mabs', 0.1, { quando: 'empunhando_arma:espada' }));
        const b = getBuffs(f, 'forca');
        expect(b.mgeral).toBe(10);
        expect(b.mabs).toBeCloseTo(0.8, 10);
    });
    it('munico condicional entra/sai da lista', () => {
        const mk = (ini) => adicionar(fichaRealista({ iniciativa: ini }), 'passivas.0.efeitos', ef('forca', 'munico', 4, { quando: 'em_combate' }));
        expect(getBuffs(mk(0), 'forca').munico).toEqual([2, 1.5]);
        expect(getBuffs(mk(1), 'forca').munico).toEqual([2, 1.5, 4]);
        expect(getPoderTotalDaAbaPoderes(mk(1), 'forca')).toBeCloseTo(2.835 * 4, 10);
    });
    it('todos_status / geral / todas_energias condicionais tambem obedecem', () => {
        const f = fichaRealista({ iniciativa: 0 });
        adicionar(f, 'passivas.0.efeitos', ef('todos_status', 'mgeral', 1, { quando: 'em_combate' }));
        adicionar(f, 'passivas.0.efeitos', ef('todas_energias', 'mbase', 1, { quando: 'em_combate' }));
        adicionar(f, 'passivas.0.efeitos', ef('geral', 'mabs', 1, { quando: 'em_combate' }));
        expect(getBuffs(f, 'destreza')._hasBuff.mgeral).toBe(false);
        expect(getBuffs(f, 'mana')._hasBuff.mbase).toBe(false);
        expect(getBuffs(f, 'vida')._hasBuff.mabs).toBe(false);
        f.iniciativa = 1;
        expect(getBuffs(f, 'destreza').mgeral).toBe(1);
        expect(getBuffs(f, 'mana').mbase).toBe(1);
        expect(getBuffs(f, 'vida').mabs).toBe(1);
    });
    it('valor NaN: condicao falsa ignora; verdadeira segue a regra antiga (NaN de multiplicador vale 1 no getBuffs, e e ignorado no Poder Direto)', () => {
        const mk = (ini) => adicionar(fichaRealista({ iniciativa: ini }), 'passivas.0.efeitos', ef('forca', 'mgeral', 'abc', { quando: 'em_combate' }));
        expect(getBuffs(mk(0), 'forca').mgeral).toBe(9);
        expect(getBuffs(mk(1), 'forca').mgeral).toBe(10);
        const d = (ini) => adicionar(fichaRealista({ iniciativa: ini }), 'poderes.2.efeitos', ef('poder_direto', 'mgeral', 'abc', { quando: 'em_combate' }));
        expect(getPoderDiretoMultiplier(d(0))).toBeCloseTo(24, 10);
        expect(getPoderDiretoMultiplier(d(5))).toBeCloseTo(24, 10);
        const f = d(5);
        expect(Number.isFinite(calcularPoderAtual(f, 1).poderExato)).toBe(true);
    });
    it('valor negativo condicional: subtrai so quando a condicao vale', () => {
        const mk = (ini) => adicionar(fichaRealista({ iniciativa: ini }), 'passivas.0.efeitos', ef('forca', 'mgeral', -2, { quando: 'em_combate' }));
        expect(getBuffs(mk(0), 'forca').mgeral).toBe(9);
        expect(getBuffs(mk(1), 'forca').mgeral).toBe(7);
        const m = (ini) => adicionar(fichaRealista({ iniciativa: ini }), 'passivas.0.efeitos', ef('forca', 'munico', -2, { quando: 'em_combate' }));
        expect(getBuffs(m(0), 'forca').munico).toEqual([2, 1.5]);
        expect(getBuffs(m(1), 'forca').munico).toEqual([2, 1.5, -2]);
        // munico negativo no Poder Direto continua ignorado (regra antiga: so val > 0)
        const dn = adicionar(fichaRealista({ iniciativa: 3 }), 'poderes.2.efeitos', ef('poder_direto', 'munico', -2, { quando: 'em_combate' }));
        expect(getPoderDiretoMultiplier(dn)).toBeCloseTo(24, 10);
        const dg = adicionar(fichaRealista({ iniciativa: 3 }), 'poderes.2.efeitos', ef('poder_direto', 'mgeral', -0.5, { quando: 'em_combate' }));
        expect(getPoderDiretoMultiplier(dg)).toBeCloseTo(24 * (1 + 0.5) / 2, 10);
    });
    it('condicao de alvo ou invalida: nunca vale (falha fechada), mesmo em combate e com arma', () => {
        ['alvo_com_estado:surpreso', 'alvo_vida_abaixo:50', 'lixo'].forEach(q => {
            const f = adicionar(fichaRealista({ iniciativa: 9 }), 'passivas.0.efeitos', ef('forca', 'mgeral', 100, { quando: q }));
            expect(getBuffs(f, 'forca').mgeral).toBe(9);
            expect(scouter(f)).toEqual(scouter(fichaRealista({ iniciativa: 9 })));
        });
    });
});

describe('fichas minimas / sem inventario / sem poderes', () => {
    it('sem inventario, sem poderes, sem passivas, sem pactos: nao quebra e os neutros ficam 1', () => {
        const f = { forca: { base: 1000 }, iniciativa: 5 };
        expect(getBuffs(f, 'forca')._hasBuff).toEqual({ mbase: false, mgeral: false, mformas: false, mabs: false });
        expect(getPoderTotalDaAbaPoderes(f, 'forca')).toBe(1);
        expect(getPoderDiretoMultiplier(f)).toBe(1);
        expect(getGlobalMultipliers(f).totalDano).toBe(1);
    });
    it('multiplicador condicional em ficha sem inventario nem iniciativa', () => {
        const f = { forca: { base: 1000 }, passivas: [{ nome: 'p', efeitos: [ef('forca', 'mgeral', 2, { quando: 'empunhando_arma' }), ef('forca', 'mgeral', 3, { quando: 'em_combate' })] }] };
        expect(getBuffs(f, 'forca')._hasBuff.mgeral).toBe(false);
        f.iniciativa = 2;
        expect(getBuffs(f, 'forca').mgeral).toBe(3);
    });
    it('ficha nula / vazia: contratos antigos mantidos', () => {
        expect(getPoderDiretoMultiplier(null)).toBe(1);
        expect(getGlobalMultipliers(null).totalDano).toBe(1);
        expect(getBuffs(null, 'forca').mgeral).toBe(1);
        expect(getBuffs({}, 'forca')._hasBuff.mgeral).toBe(false);
        expect(calcularPoderAtual(null, 1).poderGlobal).toBe(0);
    });
    it('listas com buracos (null) nao quebram com quando', () => {
        const f = fichaRealista({ iniciativa: 2 });
        f.poderes.push(null);
        f.inventario.push(null);
        f.passivas.push({ nome: 'x', efeitos: [null, ef('forca', 'mgeral', 1, { quando: 'em_combate' }), undefined] });
        expect(getBuffs(f, 'forca').mgeral).toBe(10);
    });
});

describe('Poder Calculado / Scouter com condicional', () => {
    it('condicional falso no meio de uma ficha realista: poderGlobal e poderExato IDENTICOS ao sem-efeito', () => {
        const f = fichaRealista({ iniciativa: 0 });
        adicionar(f, 'poderes.0.efeitos', ef('forca', 'mgeral', 50, { quando: 'em_combate' }));
        adicionar(f, 'inventario.0.efeitos', ef('poder_direto', 'munico', 50, { quando: 'empunhando_arma:arco' }));
        adicionar(f, 'seresSelados.0.efeitos', ef('dano', 'mgeral', 50, { quando: 'em_combate' }));
        adicionar(f, 'passivas.0.efeitos', ef('dano', 'munico', 50, { quando: 'em_combate' }));
        expect(calcularPoderAtual(f, 1)).toEqual(calcularPoderAtual(fichaRealista(), 1));
    });
    it('condicional verdadeiro = o mesmo Poder de quem escreveu o efeito sem quando', () => {
        const efs = [['poderes.0.efeitos', ef('forca', 'mgeral', 5)], ['seresSelados.0.efeitos', ef('dano', 'mgeral', 2)], ['inventario.0.efeitos', ef('poder_direto', 'munico', 3)]];
        const com = fichaRealista({ iniciativa: 6 });
        const sem = fichaRealista({ iniciativa: 6 });
        efs.forEach(([c, e]) => { adicionar(com, c, { ...e, quando: 'empunhando_arma:espada' }); adicionar(sem, c, e); });
        expect(calcularPoderAtual(com, 1)).toEqual(calcularPoderAtual(sem, 1));
        expect(calcularPoderAtual(com, 1).poderExato).toBeGreaterThan(calcularPoderAtual(fichaRealista(), 1).poderExato);
    });
});
