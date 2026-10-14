import { describe, it, expect, afterEach } from 'vitest';
import {
    registrarResolvedorNivelClasse, getEfeitosFixosDeClasse, getBonusAcertoDeClasse, getVantagensDeClasse,
    calcularFatorBerserker, calcularGanhoBerserker, getTextoMecanica, getClasseAtivaId, riderMontado,
    MECANICA_CLASSE, MECANICA_CLASSE_CANDIDATO, MECANICA_CLASSE_GRAND, removerEfeitosLegados
} from './classesMecanicas.js';
import { getNivelDaFichaNaClasse } from './attributes.js';

const ficha = (classe, extra = {}) => ({ bio: { classe, mesa: 'presente' }, combate: {}, ...extra });
const valor = (ef, a, p) => ef.filter(e => e.atributo === a && e.propriedade === p).map(e => e.valor);
const nivel = (n) => registrarResolvedorNivelClasse(() => n);

afterEach(() => { registrarResolvedorNivelClasse(getNivelDaFichaNaClasse); });

describe('Focos por nível', () => {
    it.each([['comum', 10], ['candidato', 15], ['grand', 20]])('Avenger em Foco de Ódio (%s): Vida e Poder x%i', (n, v) => {
        nivel(n);
        const ef = getEfeitosFixosDeClasse(ficha('avenger', { combate: { focoOdio: true } }));
        expect(valor(ef, 'vida', 'munico')).toEqual([v]);
        expect(valor(ef, 'dano', 'munico')).toEqual([v]);
    });
    it.each([['comum', 10], ['candidato', 15], ['grand', 20]])('Ruler em Foco de Protecao (%s): Vida e Poder x%i', (n, v) => {
        nivel(n);
        const ef = getEfeitosFixosDeClasse(ficha('ruler', { combate: { focoProtecao: true } }));
        expect(valor(ef, 'vida', 'munico')).toEqual([v]);
        expect(valor(ef, 'dano', 'munico')).toEqual([v]);
    });
    it('Foco falsy (0, "", null, undefined) nao ativa', () => {
        [0, '', null, undefined].forEach(x => {
            expect(valor(getEfeitosFixosDeClasse(ficha('avenger', { combate: { focoOdio: x } })), 'vida', 'munico')).toEqual([]);
            expect(valor(getEfeitosFixosDeClasse(ficha('ruler', { combate: { focoProtecao: x } })), 'dano', 'munico')).toEqual([]);
        });
    });
    it('ficha sem combate/bio nao quebra', () => {
        expect(getEfeitosFixosDeClasse({})).toEqual([]);
        expect(getEfeitosFixosDeClasse(null)).toEqual([]);
        expect(getEfeitosFixosDeClasse({ bio: { classe: 'avenger' } }).length).toBe(1);
    });
    it('Pretender vestindo Ruler usa Foco de Protecao; sem subClasse nao usa', () => {
        const f = { bio: { classe: 'pretender', subClasse: 'Ruler' }, combate: { focoProtecao: true } };
        expect(valor(getEfeitosFixosDeClasse(f), 'dano', 'munico')).toEqual([10]);
        expect(getEfeitosFixosDeClasse({ bio: { classe: 'pretender' }, combate: { focoProtecao: true } })).toEqual([]);
    });
    it('classe com caixa/espacos e normalizada', () => {
        expect(getClasseAtivaId({ bio: { classe: '  Avenger ' } })).toBe('avenger');
    });
});

describe('Berserker nos limites', () => {
    it('0%, negativo, NaN, null, texto = fator 1; ganho 0', () => {
        [0, -10, NaN, null, undefined, 'abc'].forEach(p => expect(calcularFatorBerserker(p)).toBe(1));
        expect(calcularGanhoBerserker(0)).toBe(0);
    });
    it('abaixo do 1o degrau (9.99%) e 1; em 10% e x1,5', () => {
        expect(calcularFatorBerserker(9.99)).toBe(1);
        expect(calcularFatorBerserker(10)).toBe(1.5);
    });
    it('100% e x20 e acima de 100% continua x20', () => {
        expect(calcularFatorBerserker(100)).toBe(20);
        expect(calcularFatorBerserker(250)).toBe(20);
        expect(calcularGanhoBerserker(100)).toBe(19);
    });
    it('escada cresce a cada 10%', () => {
        let ant = 1;
        for (let p = 10; p <= 100; p += 10) { const f = calcularFatorBerserker(p); expect(f).toBeGreaterThan(ant); ant = f; }
    });
    it('escala Candidato (1,5) e Grand (2) multiplicam; 0% continua 1', () => {
        expect(calcularFatorBerserker(100, 1.5)).toBe(30);
        expect(calcularFatorBerserker(100, 2)).toBe(40);
        expect(calcularFatorBerserker(10, 2)).toBe(3);
        expect(calcularFatorBerserker(0, 2)).toBe(1);
        expect(calcularGanhoBerserker(100, 2)).toBe(39);
    });
    it('efeito fixo do Berserker e furia_berserker 1,5 em qualquer nivel', () => {
        nivel('grand');
        expect(valor(getEfeitosFixosDeClasse(ficha('berserker')), 'dano', 'furia_berserker')).toEqual([1.5]);
    });
});

describe('Rider por nivel', () => {
    const montado = { combate: { montariaPresente: true } };
    it.each([['comum', 3, 1, 10], ['candidato', 4, 1, 15], ['grand', 5, 2, 20]])('Rider montado (%s): acerto %i, vantagens %i, poder x%i', (n, ac, vant, poder) => {
        nivel(n);
        const f = ficha('rider', montado);
        expect(getBonusAcertoDeClasse(f)).toBe(ac);
        expect(getVantagensDeClasse(f, []).vantagens).toBe(vant);
        expect(valor(getEfeitosFixosDeClasse(f), 'dano', 'munico')).toEqual([poder]);
    });
    it('Rider sem montaria: sem bonus, sem vantagem', () => {
        nivel('grand');
        const f = ficha('rider');
        expect(getBonusAcertoDeClasse(f)).toBe(0);
        expect(getVantagensDeClasse(f, ['espada'])).toEqual({ vantagens: 0, motivos: [] });
    });
    it('Rider Dragao e montado passivamente', () => {
        ['Dragão', 'dragon', 'Draconiano'].forEach(r => expect(riderMontado({ bio: { classe: 'rider', raca: r } })).toBe(true));
        expect(riderMontado({ bio: { classe: 'rider', raca: 'Humano' } })).toBe(false);
        expect(riderMontado({ bio: { classe: 'saber', raca: 'Dragão' } })).toBe(false);
    });
    it('motivos de vantagem e entradas invalidas', () => {
        expect(getVantagensDeClasse(ficha('rider', montado), []).motivos).toEqual(['Vantagem de RIDER (montado)']);
        expect(getVantagensDeClasse(ficha('saber'), ['Espada']).motivos[0]).toContain('SABER');
        expect(getVantagensDeClasse(ficha('saber'), ['lanca']).vantagens).toBe(0);
        expect(getVantagensDeClasse(ficha('saber'), undefined).vantagens).toBe(0);
        expect(getVantagensDeClasse(ficha('saber'), null).vantagens).toBe(0);
    });
    it('Alter Ego vestindo Rider montado ganha bonus', () => {
        const f = { bio: { classe: 'alterego', subClasse: 'rider' }, combate: { montariaPresente: true } };
        expect(getBonusAcertoDeClasse(f)).toBe(3);
    });
});

describe('Textos alterego/pretender e niveis', () => {
    it('Alter Ego e Pretender tem o mesmo texto nos 3 niveis', () => {
        ['alterego', 'pretender'].forEach(id => {
            expect(MECANICA_CLASSE[id]).toBeTruthy();
            expect(MECANICA_CLASSE_CANDIDATO[id]).toBe(MECANICA_CLASSE[id]);
            expect(MECANICA_CLASSE_GRAND[id]).toBe(MECANICA_CLASSE[id]);
            expect(getTextoMecanica(id, 'grand')).toBe(MECANICA_CLASSE[id]);
            expect(MECANICA_CLASSE[id]).toContain('Ação Bônus');
        });
    });
    it('toda Classe numerica tem texto diferente em Candidato e Grand', () => {
        ['saber', 'archer', 'lancer', 'rider', 'caster', 'assassin', 'berserker', 'ruler', 'avenger', 'mooncancer', 'foreigner'].forEach(id => {
            expect(MECANICA_CLASSE_CANDIDATO[id]).not.toBe(MECANICA_CLASSE[id]);
            expect(MECANICA_CLASSE_GRAND[id]).not.toBe(MECANICA_CLASSE_CANDIDATO[id]);
        });
    });
    it('Ruler/Avenger: numeros certos por nivel', () => {
        expect(MECANICA_CLASSE.ruler).toContain('Vida x10');
        expect(MECANICA_CLASSE_CANDIDATO.ruler).toContain('Vida x15');
        expect(MECANICA_CLASSE_GRAND.ruler).toContain('Vida x20');
        expect(MECANICA_CLASSE_GRAND.ruler).toContain('Poder Calculado x20');
        expect(MECANICA_CLASSE_GRAND.avenger).toContain('Vida x20');
    });
    it('Rider cita Acerto e Vantagens por nivel', () => {
        expect(MECANICA_CLASSE.rider).toContain('+3 de Acerto');
        expect(MECANICA_CLASSE_CANDIDATO.rider).toContain('+4 de Acerto');
        expect(MECANICA_CLASSE_GRAND.rider).toContain('+5 de Acerto');
        expect(MECANICA_CLASSE_GRAND.rider).toContain('2 Vantagens');
        expect(MECANICA_CLASSE.rider).not.toContain('2 Vantagens');
    });
    it('Caster Grand reduz 40% e nunca passa de 90%', () => {
        expect(MECANICA_CLASSE_GRAND.caster).toContain('-40%');
        nivel('grand');
        expect(valor(getEfeitosFixosDeClasse(ficha('caster')), 'aura', 'reducaocusto')[0]).toBeLessThanOrEqual(90);
    });
    it('getTextoMecanica: default comum, classe vazia/indefinida', () => {
        expect(getTextoMecanica('saber')).toBe(MECANICA_CLASSE.saber);
        expect(getTextoMecanica('saber', 'candidato')).toBe(MECANICA_CLASSE_CANDIDATO.saber);
        expect(getTextoMecanica('', 'grand')).toBe('');
        expect(getTextoMecanica(undefined)).toBe('');
    });
});

describe('removerEfeitosLegados', () => {
    it('remove copia antiga do Avenger, mantem o resto', () => {
        const lista = [{ atributo: 'dano', propriedade: 'munico', valor: 10 }, { atributo: 'vida', propriedade: 'munico', valor: 5 }];
        expect(removerEfeitosLegados('avenger', lista)).toEqual([lista[1]]);
        expect(removerEfeitosLegados('saber', lista)).toBe(lista);
        expect(removerEfeitosLegados('avenger', undefined)).toEqual([]);
    });
});
