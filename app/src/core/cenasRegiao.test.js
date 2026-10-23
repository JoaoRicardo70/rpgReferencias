import { describe, it, expect } from 'vitest';
import {
    regiaoDaCena, nomeDaCenaNaRegiao, podeAcessarCena, cenasDaRegiao, cenarioComCenaDeRegiao,
    cenarioComAcessoDaCena, cenasPendentesDoAtlasLocal, listaDeNomesComAcesso
} from './cenasRegiao';

const mestre = { ehMestre: true, souCriador: false, meuNome: 'Ana', ativaId: 'default' };
const jogador = (nome) => ({ ehMestre: false, souCriador: false, meuNome: nome, ativaId: 'default' });

describe('regiaoDaCena / nomeDaCenaNaRegiao', () => {
    it('usa o campo reino e, nas Cenas antigas, o prefixo [Região] do nome', () => {
        expect(regiaoDaCena({ reino: 'Noxus', nome: 'Capital' })).toBe('Noxus');
        expect(regiaoDaCena({ nome: '[Noxus] Capital' })).toBe('Noxus');
        expect(regiaoDaCena({ nome: 'Taverna' })).toBe('');
        expect(regiaoDaCena(null)).toBe('');
        expect(nomeDaCenaNaRegiao({ nome: '[Noxus] Capital' })).toBe('Capital');
        expect(nomeDaCenaNaRegiao({ reino: 'Noxus', nome: 'Capital' })).toBe('Capital');
    });
});

describe('podeAcessarCena', () => {
    it('Cena sem restrição é de todos; Mestre entra sempre', () => {
        expect(podeAcessarCena({ nome: 'a' }, 'a', jogador('Bia'))).toBe(true);
        expect(podeAcessarCena({ nome: 'a', restrita: true }, 'a', mestre)).toBe(true);
    });
    it('Cena restrita só abre pra quem está na lista (compara o nome sanitizado)', () => {
        const cena = { nome: 'a', restrita: true, acessoNomes: ['Bia_2'] };
        expect(podeAcessarCena(cena, 'a', jogador('Bia.2'))).toBe(true);
        expect(podeAcessarCena(cena, 'a', jogador('Caio'))).toBe(false);
        expect(podeAcessarCena(cena, 'a', jogador(''))).toBe(false);
    });
    it('restrita sem ninguém liberado é só dos Mestres; a Cena publicada é de todos', () => {
        const cena = { nome: 'a', restrita: true };
        expect(podeAcessarCena(cena, 'a', jogador('Bia'))).toBe(false);
        expect(podeAcessarCena(cena, 'a', { ...jogador('Bia'), ativaId: 'a' })).toBe(true);
    });
    it('apenasCriador só aparece pro Mestre Supremo (ou quando publicada)', () => {
        const cena = { nome: 'a', apenasCriador: true };
        expect(podeAcessarCena(cena, 'a', mestre)).toBe(false);
        expect(podeAcessarCena(cena, 'a', { ...mestre, souCriador: true })).toBe(true);
        expect(podeAcessarCena(cena, 'a', { ...mestre, ativaId: 'a' })).toBe(true);
    });
    it('Cena inexistente nunca abre', () => {
        expect(podeAcessarCena(undefined, 'x', mestre)).toBe(false);
    });
});

describe('cenasDaRegiao', () => {
    const lista = {
        default: { nome: 'Cenário Inicial' },
        c1: { reino: 'Noxus', nome: 'Capital' },
        c2: { nome: '[Noxus] Arena' },
        c3: { reino: 'Noxus', nome: 'Segredo', restrita: true, acessoNomes: ['Bia'] },
        c4: { reino: 'Demacia', nome: 'Muralha' }
    };
    it('lista só as Cenas da região, em ordem, respeitando o acesso', () => {
        expect(cenasDaRegiao(lista, 'Noxus', jogador('Caio')).map(x => x.id)).toEqual(['c2', 'c1']);
        expect(cenasDaRegiao(lista, 'Noxus', jogador('Bia')).map(x => x.id)).toEqual(['c2', 'c1', 'c3']);
        expect(cenasDaRegiao(lista, 'Noxus', mestre).map(x => x.id)).toEqual(['c2', 'c1', 'c3']);
    });
    it('entradas inválidas devolvem lista vazia', () => {
        expect(cenasDaRegiao(null, 'Noxus', mestre)).toEqual([]);
        expect(cenasDaRegiao(lista, '', mestre)).toEqual([]);
    });
});

describe('cenarioComCenaDeRegiao / cenarioComAcessoDaCena', () => {
    it('cria a Cena na região sem alterar o cenário original', () => {
        const base = { ativa: 'default', lista: { default: { nome: 'Inicial' } } };
        const novo = cenarioComCenaDeRegiao(base, 'c1', { reino: 'Noxus', nome: '  Capital ', criadoPor: 'Ana' });
        expect(novo.ativa).toBe('default');
        expect(novo.lista.c1).toMatchObject({ nome: 'Capital', reino: 'Noxus', criadoPor: 'Ana', escala: 1.5, unidade: 'm' });
        expect(base.lista.c1).toBeUndefined();
    });
    it('restringe, libera todos e limpa os campos de acesso', () => {
        const base = { lista: { c1: { nome: 'a', reino: 'Noxus' } } };
        const restrito = cenarioComAcessoDaCena(base, 'c1', ['Bia', 'Bia', 'Caio']);
        expect(restrito.lista.c1.restrita).toBe(true);
        expect(listaDeNomesComAcesso(restrito.lista.c1)).toEqual(['Bia', 'Caio']);
        const soMestres = cenarioComAcessoDaCena(base, 'c1', []);
        expect(soMestres.lista.c1.restrita).toBe(true);
        expect(soMestres.lista.c1.acessoNomes).toBeUndefined();
        const liberado = cenarioComAcessoDaCena(restrito, 'c1', null);
        expect(liberado.lista.c1.restrita).toBeUndefined();
        expect(liberado.lista.c1.acessoNomes).toBeUndefined();
        expect(cenarioComAcessoDaCena(base, 'nao-existe', null)).toBe(base);
    });
});

describe('cenasPendentesDoAtlasLocal', () => {
    it('devolve só os mapas do Atlas antigo que ainda não estão no cenário compartilhado', () => {
        const atlas = { Noxus: [{ id: 'mapa_1', nome: 'Capital', img: 'u' }, { id: 'mapa_2', nome: 'Arena' }], Demacia: 'lixo' };
        expect(cenasPendentesDoAtlasLocal(atlas, { mapa_2: {} })).toEqual([{ id: 'mapa_1', reino: 'Noxus', nome: 'Capital', img: 'u' }]);
        expect(cenasPendentesDoAtlasLocal(null, {})).toEqual([]);
    });
});
