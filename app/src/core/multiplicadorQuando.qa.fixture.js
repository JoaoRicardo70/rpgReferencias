// Fixture compartilhada pelos testes QA de multiplicador com "quando" (nao e um teste).
// Ficha realista: varios Poderes (ativo, desligado, com Estagio, com Forma/Config), Passivas, Itens (equipado e nao),
// Pacto Selado (sincronizado e nao), dano manual. Os numeros esperados nos testes foram calculados A MAO a partir daqui.

export const STATUS_FISICOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

export const stat = (base) => ({ base, atual: base, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1, reducaoCusto: 0, regeneracao: 0 });

export const ef = (atributo, propriedade, valor, extra = {}) => ({ nome: `${atributo}-${propriedade}`, atributo, propriedade, valor, ...extra });

// Ficha SEM nenhum "quando": os numeros de referencia (a mao) abaixo valem para ela.
export function fichaRealista(extra = {}) {
    const ficha = {
        ascensaoBase: 1,
        vida: stat(100000000), mana: stat(10000000), aura: stat(10000000), chakra: stat(10000000), corpo: stat(10000000),
        divisores: { vida: 1, status: 1, mana: 1, aura: 1, chakra: 1, corpo: 1 },
        divisorPoder: 0, supressaoPoder: 100, limiteSupressao: 1,
        iniciativa: 0,
        dano: { mBase: 2, mGeral: 1.5, mUnico: '2,3', mPotencial: 2 },
        poderes: [
            // Estagio 3 (crescimento 100% => fator 3): so os efeitos ATIVOS escalam, os passivos nao.
            {
                id: 'p1', nome: 'Kaioken', categoria: 'poder', ativa: true, estagioAtual: 3,
                estagios: { habilitado: true, maximo: 10, crescimento: 100, fadigaPorEstagio: 2, rotulo: 'Nivel', nomes: [] },
                efeitos: [ef('forca', 'mgeral', 1), ef('todos_status', 'mformas', 0.1), ef('poder_direto', 'mabs', 1)],
                efeitosPassivos: [ef('forca', 'mbase', 0.5)],
            },
            // Desligado: so os PASSIVOS contam.
            {
                id: 'p2', nome: 'Dormente', categoria: 'poder', ativa: false,
                efeitos: [ef('forca', 'mgeral', 99), ef('poder_direto', 'mgeral', 99)],
                efeitosPassivos: [ef('forca', 'mabs', 0.2)],
            },
            // Forma ativa com Config: efeitos da Config entram, junto com os do Poder.
            {
                id: 'p3', nome: 'Modo', categoria: 'poder', ativa: true, formaAtivaId: 'f1', configAtivaId: 'c1',
                efeitos: [ef('poder_direto', 'mgeral', 1)], efeitosPassivos: [],
                formas: [{ id: 'f1', nome: 'F1', efeitos: [], efeitosPassivos: [], configs: [{ id: 'c1', nome: 'C1', efeitos: [ef('forca', 'munico', 2)], efeitosPassivos: [] }] }],
            },
        ],
        passivas: [{ nome: 'Treino', efeitos: [ef('forca', 'munico', 1.5)] }],
        inventario: [
            {
                id: 'i1', nome: 'Espada', tipo: 'arma', armaTipo: 'espada', equipado: true,
                efeitos: [ef('forca', 'mgeral', 2), ef('poder_direto', 'munico', 2), ef('dano', 'munico', 1.25)],
                efeitosPassivos: [ef('forca', 'mabs', 0.5), ef('poder_direto', 'mbase', 0.5)],
            },
            { id: 'i2', nome: 'Reserva', tipo: 'arma', armaTipo: 'espada', equipado: false, efeitos: [ef('forca', 'mgeral', 50)], efeitosPassivos: [] },
        ],
        seresSelados: [
            { id: 's1', nome: 'Kurama', ativo: true, efeitos: [ef('forca', 'mgeral', 4), ef('dano', 'mgeral', 1)], efeitosPassivos: [], formas: [] },
            { id: 's2', nome: 'Adormecido', ativo: false, efeitos: [ef('forca', 'mgeral', 100)], efeitosPassivos: [], formas: [] },
        ],
    };
    STATUS_FISICOS.forEach(s => { ficha[s] = stat(100000); });
    return { ...ficha, ...extra };
}

// Valores a mao da ficha realista SEM "quando":
//  forca: mgeral = 3 (Kaioken 1x3) + 2 (Espada) + 4 (Kurama) = 9; mbase = 0.5; mformas = 0.1x3 = 0.3; mabs = 0.2 + 0.5 = 0.7; munico = [2, 1.5]
//  Poder aba Poderes (forca) = 0.5 * 9 * 0.3 * 0.7 * 3 = 0.5*9=4.5; *0.3=1.35; *0.7=0.945; *3=2.835
//  Poder Direto = (1 + mbase 0.5) * (1 + mgeral 1) * (1 + mformas 0) * (1 + mabs 1x3=3) * munico 2 = 1.5*2*4*2 = 24
//  Global (dano): finalB = 1+2 = 3; finalG = 1 + 1.5 + 1 (Kurama) = 3.5; finalA = 1; finalP = 2; finalUni = 2*3*1.25 = 7.5
export const ESPERADO_FORCA = { mgeral: 9, mbase: 0.5, mformas: 0.3, mabs: 0.7, munico: [2, 1.5], aba: 2.835 };
export const ESPERADO_DIRETO = 24;
export const ESPERADO_GLOBAL = { finalB: 3, finalG: 3.5, finalA: 1, finalP: 2, finalUni: 7.5, totalDano: 3 * 3.5 * 1 * 2 };
