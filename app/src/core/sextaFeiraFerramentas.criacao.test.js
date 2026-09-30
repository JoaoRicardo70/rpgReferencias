import { describe, it, expect, vi } from 'vitest';
import { executarFerramenta } from './sextaFeiraFerramentas';

function fichaBase(over = {}) {
    return {
        bio: { raca: 'Humano', classe: 'Guerreiro' },
        vida: { base: 5000000, atual: 5000000 },
        mana: { base: 50000000, atual: 50000000 },
        aura: { base: 50000000, atual: 50000000 },
        chakra: { base: 50000000, atual: 50000000 },
        corpo: { base: 50000000, atual: 50000000 },
        forca: { base: 1000000 },
        poderes: [], inventario: [], passivas: [], seresSelados: [],
        combate: {}, supressaoPoder: 100,
        ...over,
    };
}
function estadoBase(over = {}) {
    return {
        meuNome: 'Ana', isMestre: false, podeVerFuturo: false,
        minhaFicha: fichaBase(),
        personagens: { Bruno: fichaBase({ bio: { raca: 'Elfo', classe: 'Mago' } }) },
        dummies: { d1: { nome: 'Goblin' } },
        resumoTurnoMapa: { ordem: [], turnoAtualIndex: 0 },
        cenario: { ativa: 'c1', lista: { c1: { nome: 'Floresta' } } },
        feedCombate: [], divisorPoderMesa: 1, capitulosPresente: [], capitulosFuturo: [],
        ...over,
    };
}
const propostaRegistrada = () => vi.fn(async () => 'prop_1');

describe('executarFerramenta propor_*', () => {
    it('jogador propoe habilidade para si: chama registrarProposta com o formato certo e retorna ok + id', async () => {
        const registrarProposta = propostaRegistrada();
        const r = await executarFerramenta('propor_habilidade', { nome: 'Golpe', categoria: 'habilidade', dadosQtd: 1, dadosFaces: 6, custoPercentual: 5 }, estadoBase(), { registrarProposta });
        expect(r).toMatchObject({ ok: true, proposta: 'prop_1', alvo: 'Ana' });
        expect(registrarProposta).toHaveBeenCalledTimes(1);
        const arg = registrarProposta.mock.calls[0][0];
        expect(arg).toMatchObject({ tipo: 'poder', alvo: 'Ana', quantidade: 1 });
        expect(arg.objeto.nome).toBe('Golpe');
        expect(Array.isArray(arg.avisos)).toBe(true);
    });
    it('nao grava nada no estado (ficha permanece intacta)', async () => {
        const estado = estadoBase();
        const antes = JSON.stringify(estado);
        await executarFerramenta('propor_item', { nome: 'Espada', tipo: 'arma' }, estado, { registrarProposta: propostaRegistrada() });
        expect(JSON.stringify(estado)).toBe(antes);
    });
    it.each([['propor_magia', 'magia', { nome: 'Chama', elemento: 'Fogo' }], ['propor_item', 'item', { nome: 'Anel', tipo: 'artefato' }]])('%s mapeia para o tipo %s', async (fn, tipo, args) => {
        const registrarProposta = propostaRegistrada();
        const r = await executarFerramenta(fn, args, estadoBase(), { registrarProposta });
        expect(r.ok).toBe(true);
        expect(registrarProposta.mock.calls[0][0].tipo).toBe(tipo);
    });
    it('jogador pedindo para outro personagem: recusado, sem registrar', async () => {
        const registrarProposta = propostaRegistrada();
        const r = await executarFerramenta('propor_habilidade', { nome: 'X', categoria: 'poder', alvo: 'Bruno' }, estadoBase(), { registrarProposta });
        expect(r.erro).toMatch(/próprio personagem/);
        expect(registrarProposta).not.toHaveBeenCalled();
    });
    it('jogador com alvo igual ao proprio nome (caixa diferente) e aceito', async () => {
        const r = await executarFerramenta('propor_habilidade', { nome: 'X', alvo: ' ANA ' }, estadoBase(), { registrarProposta: propostaRegistrada() });
        expect(r.ok).toBe(true);
    });
    it('Mestre pode mirar em qualquer personagem; o campo alvo nao vaza para o objeto', async () => {
        const registrarProposta = propostaRegistrada();
        const r = await executarFerramenta('propor_habilidade', { nome: 'X', alvo: 'Bruno' }, estadoBase({ isMestre: true, meuNome: 'Mestre' }), { registrarProposta });
        expect(r.alvo).toBe('Bruno');
        expect(registrarProposta.mock.calls[0][0].alvo).toBe('Bruno');
        expect(registrarProposta.mock.calls[0][0].objeto).not.toHaveProperty('alvo');
    });
    it('alvo inexistente: erro', async () => {
        const registrarProposta = propostaRegistrada();
        const r = await executarFerramenta('propor_magia', { nome: 'X', elemento: 'Fogo', alvo: 'Zzz' }, estadoBase({ isMestre: true }), { registrarProposta });
        expect(r.erro).toMatch(/Não encontrei/);
        expect(registrarProposta).not.toHaveBeenCalled();
    });
    it('jogador sem ficha propria (minhaFicha nula) recebe erro', async () => {
        const r = await executarFerramenta('propor_item', { nome: 'X', tipo: 'arma' }, estadoBase({ minhaFicha: null }), { registrarProposta: propostaRegistrada() });
        expect(r.erro).toBeTruthy();
    });
    it('proposta invalida (sem nome): erro Proposta incompleta e nada registrado', async () => {
        const registrarProposta = propostaRegistrada();
        const r = await executarFerramenta('propor_habilidade', { categoria: 'poder' }, estadoBase(), { registrarProposta });
        expect(r.erro).toBe('Proposta incompleta.');
        expect(r.avisos).toContain('Falta o nome.');
        expect(registrarProposta).not.toHaveBeenCalled();
    });
    it('sem registrarProposta: erro de criacao indisponivel', async () => {
        const r = await executarFerramenta('propor_habilidade', { nome: 'X' }, estadoBase(), {});
        expect(r.erro).toMatch(/indispon/);
        const r2 = await executarFerramenta('propor_habilidade', { nome: 'X' }, estadoBase());
        expect(r2.erro).toMatch(/indispon/);
    });
    it('args nulos nao explodem', async () => {
        const r = await executarFerramenta('propor_habilidade', null, estadoBase(), { registrarProposta: propostaRegistrada() });
        expect(r.erro).toBe('Proposta incompleta.');
    });
    it('excecao em registrarProposta vira erro amigavel', async () => {
        const r = await executarFerramenta('propor_habilidade', { nome: 'X' }, estadoBase(), { registrarProposta: async () => { throw new Error('boom'); } });
        expect(r.erro).toMatch(/boom/);
    });
    it('avisos de equilibrio sao repassados junto com os de normalizacao', async () => {
        const registrarProposta = propostaRegistrada();
        const r = await executarFerramenta('propor_habilidade', { nome: 'X', categoria: 'poder', dadosQtd: 3, dadosFaces: 6, vertente: 'Bizarra' }, estadoBase(), { registrarProposta });
        const { avisos } = registrarProposta.mock.calls[0][0];
        expect(avisos.some(a => a.includes('Bizarra'))).toBe(true);
        expect(avisos).toContain('Causa dano sem custo de energia.');
        expect(r.equilibrio).toContain('Causa dano sem custo de energia.');
        expect(r.ajustes.some(a => a.includes('Bizarra'))).toBe(true);
    });

    describe('so Mestre: npc e tierlist', () => {
        it.each([['propor_npc', { nome: 'Orc', vida: 10 }], ['propor_tier_list', { ranks: [{ nome: 'Ana', rank: 'A' }] }]])('jogador recusado em %s', async (fn, args) => {
            const registrarProposta = propostaRegistrada();
            const r = await executarFerramenta(fn, args, estadoBase(), { registrarProposta });
            expect(r.erro).toMatch(/Só o Mestre/);
            expect(registrarProposta).not.toHaveBeenCalled();
        });
        it('Mestre propoe npc: quantidade e hpMax passam', async () => {
            const registrarProposta = propostaRegistrada();
            const r = await executarFerramenta('propor_npc', { nome: 'Orc', vida: 200, quantidade: 3 }, estadoBase({ isMestre: true }), { registrarProposta });
            expect(r.ok).toBe(true);
            const arg = registrarProposta.mock.calls[0][0];
            expect(arg).toMatchObject({ tipo: 'npc', alvo: null, quantidade: 3 });
            expect(arg.objeto.hpMax).toBe(200000);
        });
        it('Mestre propoe tierlist; nome desconhecido gera aviso; ranks invalidos = erro', async () => {
            const registrarProposta = propostaRegistrada();
            const st = estadoBase({ isMestre: true, meuNome: 'Mestre' });
            const r = await executarFerramenta('propor_tier_list', { ranks: [{ nome: 'Bruno', rank: 'S' }, { nome: 'Goblin', rank: 'C' }, { nome: 'Quem', rank: 'B' }] }, st, { registrarProposta });
            expect(r.ok).toBe(true);
            const { avisos, objeto } = registrarProposta.mock.calls[0][0];
            expect(objeto.ranks).toHaveLength(3);
            expect(avisos.some(a => a.includes('Quem') && !a.includes('Bruno') && !a.includes('Goblin'))).toBe(true);
            const r2 = await executarFerramenta('propor_tier_list', { ranks: [{ nome: 'Bruno', rank: 'nope' }] }, st, { registrarProposta });
            expect(r2.erro).toBe('Proposta incompleta.');
        });
    });
});

describe('executarFerramenta poder_do_grupo', () => {
    it('jogador e recusado', async () => {
        const r = await executarFerramenta('poder_do_grupo', {}, estadoBase());
        expect(r.erro).toMatch(/Só o Mestre/);
    });
    it('Mestre: lista jogadores, exclui NPCs (isNPC ou bio.mesa npc) e calcula medias', async () => {
        const st = estadoBase({
            isMestre: true, meuNome: 'Mestre', minhaFicha: fichaBase(),
            personagens: {
                Ana: fichaBase(),
                Bruno: fichaBase({ vida: { base: 10000000, atual: 10000000 } }),
                Vilao: fichaBase({ isNPC: true }),
                Aliado: fichaBase({ bio: { raca: 'X', classe: 'Y', mesa: 'NPC' } }),
                Lixo: null,
            },
        });
        const r = await executarFerramenta('poder_do_grupo', {}, st);
        expect(r.erro).toBeUndefined();
        const nomes = r.jogadores.map(j => j.nome).sort();
        expect(nomes).toEqual(['Ana', 'Bruno', 'Mestre']);
        expect(r.jogadores.find(j => j.nome === 'Bruno').vidaMaxima).toBeGreaterThan(r.jogadores.find(j => j.nome === 'Ana').vidaMaxima);
        const somaVida = r.jogadores.reduce((s, j) => s + j.vidaMaxima, 0);
        expect(r.medias.vidaMaxima).toBe(Math.round(somaVida / 3));
        const somaPoder = r.jogadores.reduce((s, j) => s + j.poderCalculado, 0);
        expect(r.medias.poderCalculado).toBe(Math.round(somaPoder / 3));
        expect(r.dica).toContain('propor_npc');
        r.jogadores.forEach(j => expect(j).toHaveProperty('fadigaPorcentagem'));
    });
    it('a ficha do proprio Mestre com nome repetido em personagens nao duplica', async () => {
        const st = estadoBase({ isMestre: true, meuNome: 'Mestre', personagens: { Mestre: fichaBase(), Ana: fichaBase() } });
        const r = await executarFerramenta('poder_do_grupo', {}, st);
        expect(r.jogadores.filter(j => j.nome === 'Mestre')).toHaveLength(1);
    });
    it('sem jogadores: medias 0, sem erro', async () => {
        const st = estadoBase({ isMestre: true, meuNome: '', minhaFicha: null, personagens: {} });
        const r = await executarFerramenta('poder_do_grupo', {}, st);
        expect(r.jogadores).toEqual([]);
        expect(r.medias).toEqual({ poderCalculado: 0, vidaMaxima: 0 });
    });
});
