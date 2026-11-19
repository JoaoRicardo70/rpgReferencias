import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calcularDano, calcularAcerto, calcularEvasiva, calcularResistencia, calcularReducao } from '../core/engine.js';

const XSS = '<img src=x onerror=alert(1)>';
const XSS_ESC = '&lt;img src=x onerror=alert(1)&gt;';
const semTagPerigosa = (s) => expect(String(s)).not.toMatch(/<img|<script|<svg/i);

const atributo = (nome, base) => ({ base, nome, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', reducaoCusto: 0, regeneracao: 0 });
function ficha(nomeForca = 'Força') {
    return {
        forca: atributo(nomeForca, 100000), inteligencia: atributo('Inteligência', 50000), destreza: atributo('Destreza', 50000),
        mana: { ...atributo('Mana', 50), atual: 1000 }, aura: { ...atributo('Aura', 50), atual: 1000 },
        dano: { base: 0, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mPotencial: 1, mUnico: '1.0' },
        poderes: [], inventario: [], ataquesElementais: [],
    };
}
const cfg = { statusUsados: ['forca'], energiaCombustao: 'mana', percEnergia: 0 };
// atributosUsados e texto puro (o FeedCombate o escapa ao renderizar); os demais campos string sao HTML.
const strings = (r) => JSON.stringify(Object.entries(r).filter(([k, v]) => typeof v === 'string' && k !== 'atributosUsados').map(([, v]) => v));

describe('engine: nomes controlados pelo jogador saem escapados', () => {
    beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0.5); });
    afterEach(() => vi.restoreAllMocks());

    it('calcularDano: nome de arma em armaStr', () => {
        const r = calcularDano({ minhaFicha: ficha(), configArma: cfg, configHabilidades: [], itensEquipados: [{ tipo: 'arma', nome: XSS, dadosQtd: 1, dadosFaces: 6 }] });
        semTagPerigosa(strings(r));
        expect(r.armaStr).toContain(XSS_ESC);
    });
    it('calcularDano: elemento malicioso do item', () => {
        const r = calcularDano({ minhaFicha: ficha(), configArma: cfg, configHabilidades: [], itensEquipados: [{ tipo: 'arma', nome: 'Espada', elemento: XSS, dadosQtd: 1, dadosFaces: 6 }] });
        semTagPerigosa(strings(r));
        expect(r.armaStr).toContain('<span class="');
    });
    it('calcularDano: nome de tecnica/magia', () => {
        const hab = { id: 't', nome: XSS, dadosQtd: 2, dadosFaces: 6, custoPercentual: 0, armaVinculada: '', statusUsados: ['inteligencia'], energiaCombustao: 'mana', efeitos: [], vertente: 'elemental', elemento: 'Fogo' };
        const r = calcularDano({ minhaFicha: ficha(), configArma: cfg, configHabilidades: [hab], itensEquipados: [] });
        semTagPerigosa(strings(r));
    });
    it('calcularDano: nome de atributo em detalheConta', () => {
        const r = calcularDano({ minhaFicha: ficha(XSS), configArma: cfg, configHabilidades: [], itensEquipados: [{ tipo: 'arma', nome: 'Espada', dadosQtd: 1, dadosFaces: 6 }] });
        semTagPerigosa(strings(r));
        expect(r.detalheConta).toContain(XSS_ESC);
    });
    it('calcularAcerto: nome de arma', () => {
        const r = calcularAcerto({ qD: 1, fD: 20, prof: 0, usarProf: false, bonus: 0, sels: ['forca'], minhaFicha: ficha(), itensEquipados: [{ tipo: 'arma', nome: XSS, armaTipo: 'espada' }] });
        semTagPerigosa(strings(r));
        expect(r.armaStr).toContain(XSS_ESC);
    });
    it('calcularEvasiva/Resistencia/Reducao: nome de armadura', () => {
        const itens = [{ tipo: 'armadura', nome: XSS }];
        const ev = calcularEvasiva({ prof: 0, bonus: 0, minhaFicha: ficha(), itensEquipados: itens });
        const rs = calcularResistencia({ prof: 0, bonus: 0, minhaFicha: ficha(), itensEquipados: itens });
        [ev.armaStr, rs.armaStr].forEach((s) => { semTagPerigosa(s); expect(s).toContain(XSS_ESC); });
        const rd = calcularReducao({ energiaKey: 'mana', perc: 10, multBase: 1, minhaFicha: ficha(), itensEquipados: itens, rE: 1 });
        semTagPerigosa(strings(rd));
    });
    it('nome com & e aspas aparece escapado uma vez so', () => {
        const ev = calcularEvasiva({ prof: 0, bonus: 0, minhaFicha: ficha(), itensEquipados: [{ tipo: 'armadura', nome: 'Manto "A&B"' }] });
        expect(ev.armaStr).toContain('Manto &quot;A&amp;B&quot;');
        expect(ev.armaStr).not.toContain('&amp;amp;');
    });
});
