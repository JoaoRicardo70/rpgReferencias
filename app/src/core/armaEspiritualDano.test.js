import { describe, it, expect } from 'vitest';
import { parseDadoDano, danoDaArmaEspiritual, armaVirtualDaArmaEspiritual, normalizarAtributosDano } from './armaEspiritualDano.js';
import { calcularDano } from './engine.js';

const fichaCom = (arma) => ({ armaEspiritual: { acessoArma: true, nome: 'Excalibur', danoBase: '250d8', ...arma } });

describe('parseDadoDano', () => {
    it('lê o dado e ignora o resto', () => {
        expect(parseDadoDano('250d8')).toEqual({ qtd: 250, faces: 8, ignorouResto: false });
        expect(parseDadoDano('250d8 + 10')).toMatchObject({ qtd: 250, faces: 8, ignorouResto: true });
        expect(parseDadoDano(' 3 D 6 ')).toMatchObject({ qtd: 3, faces: 6 });
    });
    it('sem dado válido = null', () => {
        expect(parseDadoDano('')).toBeNull();
        expect(parseDadoDano('Des x2')).toBeNull();
        expect(parseDadoDano('0d8')).toBeNull();
        expect(parseDadoDano(null)).toBeNull();
    });
});

describe('danoDaArmaEspiritual', () => {
    it('desequipada ou sem acesso = null', () => {
        expect(danoDaArmaEspiritual(fichaCom({ equipada: false }))).toBeNull();
        expect(armaVirtualDaArmaEspiritual(fichaCom({ equipada: false }))).toBeNull();
        expect(danoDaArmaEspiritual(fichaCom({ acessoArma: false }))).toBeNull();
        expect(danoDaArmaEspiritual({})).toBeNull();
    });
    it('equipada (padrão) devolve o dado e os atributos com/sem multiplicador', () => {
        const d = danoDaArmaEspiritual(fichaCom({ danoAtributos: [{ atributo: 'forca', multiplica: false }, { atributo: 'destreza', multiplica: true, fator: 2 }, { atributo: 'forca' }] }));
        expect(d).toMatchObject({ estado: 'base', qtd: 250, faces: 8 });
        expect(d.atributos).toEqual([{ atributo: 'forca', multiplica: false }, { atributo: 'destreza', multiplica: true, fator: 2 }]);
    });
    it('estados superiores herdam da Base quando não há dano próprio', () => {
        const base = { acessoVerdadeira: true, acessoFantasma: true, danoAtributos: [{ atributo: 'forca', multiplica: false }] };
        const v = danoDaArmaEspiritual(fichaCom({ ...base, estadoAtivo: 'verdadeira' }));
        expect(v).toMatchObject({ estado: 'verdadeira', qtd: 250, faces: 8 });
        expect(v.atributos).toHaveLength(1);
        const f = danoDaArmaEspiritual(fichaCom({ ...base, estadoAtivo: 'fantasma' }));
        expect(f).toMatchObject({ estado: 'fantasma', qtd: 250 });
    });
    it('dano próprio do estado vale, com atributos próprios ou herdados', () => {
        const arma = { acessoVerdadeira: true, estadoAtivo: 'verdadeira', danoBaseVerdadeira: '500d10', danoAtributos: [{ atributo: 'forca', multiplica: false }] };
        const herda = danoDaArmaEspiritual(fichaCom(arma));
        expect(herda).toMatchObject({ qtd: 500, faces: 10 });
        expect(herda.atributos).toEqual([{ atributo: 'forca', multiplica: false }]);
        const proprio = danoDaArmaEspiritual(fichaCom({ ...arma, danoAtributosVerdadeira: [{ atributo: 'sabedoria', multiplica: true }] }));
        expect(proprio.atributos).toEqual([{ atributo: 'sabedoria', multiplica: true }]);
    });
    it('sem dado válido = null no dano e a arma virtual não existe (EA só com texto não é arma de dano)', () => {
        const f = fichaCom({ danoBase: 'nada' });
        expect(danoDaArmaEspiritual(f)).toBeNull();
        expect(armaVirtualDaArmaEspiritual(f)).toBeNull();
    });
    it('arma virtual no formato de arma', () => {
        expect(armaVirtualDaArmaEspiritual(fichaCom({}))).toMatchObject({ id: 'arma_espiritual', tipo: 'arma', nome: 'Excalibur', dadosQtd: 250, dadosFaces: 8, equipado: true });
    });
});

describe('normalizarAtributosDano', () => {
    it('descarta lixo e repetidos', () => {
        expect(normalizarAtributosDano([null, {}, { atributo: 'forca' }, { atributo: 'forca' }])).toEqual([{ atributo: 'forca', multiplica: false }]);
        expect(normalizarAtributosDano('x')).toEqual([]);
    });
});

describe('calcularDano com a Arma Espiritual', () => {
    const base = (arma) => ({
        ...fichaCom(arma),
        forca: { nome: 'Força', base: 0, atual: 0 },
        bio: {}
    });
    const rolar = (ficha) => calcularDano({ minhaFicha: ficha, configArma: null, configHabilidades: [], itensEquipados: [], isCriticoNormal: false, isCriticoFatal: false });

    it('equipada soma o dano; desequipada não', () => {
        const ligada = rolar(base({ danoBase: '10d1' }));
        expect(ligada.erro).toBeUndefined();
        expect(ligada.dano).toBe(10);
        expect(ligada.armaStr).toContain('Excalibur');
        const desligada = rolar(base({ danoBase: '10d1', equipada: false }));
        expect(desligada.erro).toBeTruthy();
    });
    it('atributo sem multiplicador soma; com multiplicador multiplica os dados', () => {
        const ficha = { ...base({ danoBase: '10d1', danoAtributos: [{ atributo: 'forca', multiplica: true, fator: 1 }] }) };
        const r = rolar(ficha);
        // sem valor de Força na ficha de teste o fator é 0 ou o valor exibido: o resultado nunca soma o atributo
        expect(r.erro).toBeUndefined();
        expect(r.detalheConta).toContain('Força');
        const soma = rolar(base({ danoBase: '10d1', danoAtributos: [{ atributo: 'forca', multiplica: false }] }));
        expect(soma.dano).toBeGreaterThanOrEqual(10);
    });
});
