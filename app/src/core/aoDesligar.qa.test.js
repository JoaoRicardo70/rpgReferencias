import { describe, it, expect } from 'vitest';
import { aplicarDanoEmSiMesmo } from './aoDesligar';
import { passarTurnoDaImunidadeTotal } from './gatilhosAplicar';
// Copia do HEAD para o diferencial (git show HEAD:<arquivo> > aoDesligar.qaold.js[x]); sem ela os blocos P1 sao pulados.
const caminhoAntigo = './aoDesligar.qaold';
const antigo = await import(/* @vite-ignore */ caminhoAntigo).catch(() => null);
const temAntigo = !!antigo;

const F = 1000;
const ser = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? `#${v}` : v));
const NEGAR = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, condicoes: ['vida_maior_que:1'], limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };

const VIDAS = [0, 1, 999, 1000, 500000, 1e9, 123456789.5, '700000', null, undefined, NaN];
const DANOS = [0, -3, NaN, undefined, '25', 0.4, 33.7, 299, 300, 1000, 1e6, 1e12, 1e20, Infinity];
const EXTRAS = [
    {}, { escudos: [{ id: 'a', nome: 'D', valor: 50, tipo: 'escudo' }] },
    { poderes: [{ id: 'p', ativa: true }] }, { poderes: [{ id: 'p', ativa: false, gatilhos: [NEGAR] }] },
    { poderes: [{ id: 'p', ativa: true, gatilhos: [{ ...NEGAR, modo: 'opcional' }] }] },
    { combate: { imunidadeTotal: { turnosRestantes: 0 } } },
];
const mk = (vida, extra) => { const f = JSON.parse(JSON.stringify(extra)); f.vida = {}; if (vida !== undefined) f.vida.atual = vida; return f; };

describe.skipIf(!temAntigo)('aoDesligar - P1: igual ao HEAD sem gatilhos e sem God Mode (matriz)', () => {
    it('mesma Vida, mesmo valor devolvido, mesmos escudos, nenhuma chave nova', () => {
        let n = 0;
        EXTRAS.forEach((extra) => VIDAS.forEach((v) => DANOS.forEach((d) => {
            const a = mk(v, extra); const b = mk(v, extra);
            const ra = antigo.aplicarDanoEmSiMesmo(a, d);
            const rb = aplicarDanoEmSiMesmo(b, d);
            n++;
            const rot = `extra=${EXTRAS.indexOf(extra)} v=${String(v)} d=${String(d)}`;
            expect(ser(b), rot).toBe(ser(a));
            expect(Object.is(rb, ra) || (Number.isNaN(rb) && Number.isNaN(ra)), `${rot} retorno ${rb} vs ${ra}`).toBe(true);
        })));
        expect(n).toBeGreaterThan(500);
    });
    it('ficha sem vida / null e dano invalido: 0 e nada muda', () => {
        expect(aplicarDanoEmSiMesmo(null, 5)).toBe(0);
        expect(aplicarDanoEmSiMesmo({}, 5)).toBe(0);
        const f = { vida: { atual: 7 * F } };
        expect(aplicarDanoEmSiMesmo(f, 0)).toBe(0);
        expect(aplicarDanoEmSiMesmo(f, -4)).toBe(0);
        expect(aplicarDanoEmSiMesmo(f, NaN)).toBe(0);
        expect(f.vida.atual).toBe(7 * F);
    });
});

describe('aoDesligar - P2', () => {
    it('God Mode (inclusive o dano que o proprio Poder se causa ao desligar): Vida intacta, escudo intacto, devolve 0 e avisa', () => {
        const f = { vida: { atual: 100 * F }, escudos: [{ id: 'a', nome: 'D', valor: 5, tipo: 'escudo' }], combate: { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } } };
        const textos = [];
        expect(aplicarDanoEmSiMesmo(f, 1e9, { nome: 'Eu', textos })).toBe(0);
        expect(f.vida.atual).toBe(100 * F);
        expect(f.escudos[0].valor).toBe(5);
        expect(textos).toEqual(['Eu está com Imunidade total: nenhum dano foi sofrido']);
        expect(f.combate.imunidadeTotal.turnosRestantes).toBe(2); // nao gasta turno
    });
    it('sem ctx.textos o God Mode nao quebra', () => {
        const f = { vida: { atual: 100 * F }, combate: { imunidadeTotal: { turnosRestantes: 1 } } };
        expect(() => aplicarDanoEmSiMesmo(f, 5)).not.toThrow();
    });
    it('Negar morte segura o dano proprio fatal (ignora escudo: dano direto) e depois so uma vez por cena', () => {
        const f = { vida: { atual: 100 * F }, escudos: [{ id: 'a', nome: 'D', valor: 9999, tipo: 'escudo' }], poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [NEGAR] }] };
        const textos = [];
        aplicarDanoEmSiMesmo(f, 5000, { nome: 'Eu', textos, cenaId: 'c' });
        expect(f.vida.atual).toBe(1 * F);
        expect(f.escudos[0].valor).toBe(9999);
        expect(textos.join(' ')).toContain('Negar morte segurou em 1 de vida');
        f.vida.atual = 100 * F;
        aplicarDanoEmSiMesmo(f, 5000, { nome: 'Eu', cenaId: 'c' });
        expect(f.vida.atual).toBe(0);
        f.vida.atual = 100 * F;
        aplicarDanoEmSiMesmo(f, 5000, { nome: 'Eu', cenaId: 'outra' });
        expect(f.vida.atual).toBe(1 * F);
    });
    it('faixa de Vida via aoDesligar dispara e devolve o dano pedido', () => {
        const g = { id: 'v', nome: 'Faixa', evento: { tipo: 'vidaAbaixoDe', de: 50, ate: 0 }, acoes: [{ tipo: 'mensagem', texto: 'metade' }] };
        const f = { vida: { atual: 100 * F, base: 100 * F }, poderes: [{ id: 'p', nome: 'P', ativa: true, gatilhos: [g] }] };
        const textos = [];
        // sem ctx.vidaMaxBruta a ficha minima nao tem maximo conhecido: nao dispara (nota)
        expect(aplicarDanoEmSiMesmo(f, 60, { textos, vidaMaxBruta: 100 * F })).toBe(60);
        expect(textos.join(' ')).toContain('Faixa: metade');
    });
    it('God Mode que vence no inicio do turno: depois disso o dano volta a valer', () => {
        const f = { vida: { atual: 100 * F }, combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } };
        expect(aplicarDanoEmSiMesmo(f, 10)).toBe(0);
        passarTurnoDaImunidadeTotal(f);
        expect(aplicarDanoEmSiMesmo(f, 10)).toBe(10);
        expect(f.vida.atual).toBe(90 * F);
    });
});
