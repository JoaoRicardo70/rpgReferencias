import { describe, it, expect, afterEach } from 'vitest';
import { registrarResolvedorNivelClasse, getEfeitosFixosDeClasse, getNivelClasse } from './classesMecanicas.js';
import { getNivelDaFichaNaClasse } from './attributes.js';
import { calcularMaximoAcoes } from './acoes.js';
import useStore from '../stores/useStore';

afterEach(() => { registrarResolvedorNivelClasse(getNivelDaFichaNaClasse); });

const ficha = (classe, extra = {}) => ({ bio: { classe, mesa: 'presente' }, combate: {}, ...extra });
const nivel = (n) => registrarResolvedorNivelClasse(() => n);

describe('Ações vindas do nível da Classe ("Mais Ações") e do Lancer', () => {
    it('Saber: Comum 2/2/2, Candidato +1 Reação, Grand +1 Reação e +1 Ação Bônus', () => {
        nivel('comum'); expect(calcularMaximoAcoes(ficha('saber'))).toEqual({ padrao: 2, bonus: 2, reacao: 2 });
        nivel('candidato'); expect(calcularMaximoAcoes(ficha('saber'))).toEqual({ padrao: 2, bonus: 2, reacao: 3 });
        nivel('grand'); expect(calcularMaximoAcoes(ficha('saber'))).toEqual({ padrao: 2, bonus: 3, reacao: 3 });
    });

    it('Lancer ganha +1 Reação em qualquer nível, somando com o nível', () => {
        nivel('comum'); expect(calcularMaximoAcoes(ficha('lancer')).reacao).toBe(3);
        nivel('candidato'); expect(calcularMaximoAcoes(ficha('lancer')).reacao).toBe(4);
        nivel('grand'); expect(calcularMaximoAcoes(ficha('lancer'))).toEqual({ padrao: 2, bonus: 3, reacao: 4 });
    });

    it('os efeitos de Ação da Classe não dão Ação Padrão', () => {
        nivel('grand');
        expect(calcularMaximoAcoes(ficha('ruler')).padrao).toBe(2);
        expect(getEfeitosFixosDeClasse(ficha('ruler')).filter(e => e.atributo === 'acao_padrao')).toEqual([]);
    });
});

describe('Alter Ego / Pretender: nível vale para a Classe vestida', () => {
    const montar = (grands, f) => useStore.setState({ meuNome: 'Eu', minhaFicha: f, personagens: { Eu: f, Mestre: { compendioOverrides: { grands } } } });

    it('Candidato de Alter Ego usa o nível Candidato da Classe vestida', () => {
        const f = { bio: { classe: 'alterego', subClasse: 'avenger', mesa: 'presente' }, combate: {} };
        montar({ alterego_presente_candidatos: ['Eu'] }, f);
        expect(getNivelDaFichaNaClasse(f, 'avenger')).toBe('candidato');
        expect(getNivelClasse(f)).toBe('candidato');
        expect(getEfeitosFixosDeClasse(f).find(e => e.atributo === 'dano' && e.propriedade === 'munico').valor).toBe(50);
    });

    it('Grand de Alter Ego/Pretender usa os benefícios de Candidato (Grand deles ainda indefinido)', () => {
        const f = { bio: { classe: 'pretender', subClasse: 'ruler', mesa: 'presente' }, combate: {} };
        montar({ pretender_presente: 'Eu' }, f);
        expect(getNivelDaFichaNaClasse(f, 'ruler')).toBe('candidato');
    });

    it('Alter Ego comum continua Comum, e ser Grand de OUTRA Classe não vale', () => {
        const f = { bio: { classe: 'alterego', subClasse: 'avenger', mesa: 'presente' }, combate: {} };
        montar({ saber_presente: 'Eu' }, f);
        expect(getNivelDaFichaNaClasse(f, 'avenger')).toBe('comum');
    });

    it('Grand de Avenger vestindo a Classe própria vale como Grand', () => {
        const f = { bio: { classe: 'alterego', subClasse: 'avenger', mesa: 'presente' }, combate: {} };
        montar({ avenger_presente: 'Eu' }, f);
        expect(getNivelDaFichaNaClasse(f, 'avenger')).toBe('grand');
    });
});
