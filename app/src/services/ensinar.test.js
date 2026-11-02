import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(),
    enviarParaFeed: vi.fn(),
}));

import { salvarCamposPersonagem, enviarParaFeed } from './firebase-sync';
import { enviarEnsinamento } from './ensinar';

const base = { professor: 'Natsu', tipo: 'poder', item: { nome: 'Chama' }, nivel: 40 };

beforeEach(() => { vi.clearAllMocks(); });

describe('enviarEnsinamento', () => {
    it('lista vazia ou inválida: erro e nada gravado', async () => {
        for (const alunos of [[], undefined, null, 'Rin']) {
            const r = await enviarEnsinamento({ ...base, alunos });
            expect(r.ok).toBe(false);
            expect(r.erro).toContain('pelo menos um aluno');
        }
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('sucesso: grava só ensinamentos/<id> para cada aluno e avisa no feed uma vez', async () => {
        salvarCamposPersonagem.mockResolvedValue(true);
        const r = await enviarEnsinamento({ ...base, alunos: ['Rin', 'Ayla'] });
        expect(r).toEqual({ ok: true, enviados: 2 });
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(2);
        const [aluno, campos] = salvarCamposPersonagem.mock.calls[0];
        expect(aluno).toBe('Rin');
        const chaves = Object.keys(campos);
        expect(chaves).toHaveLength(1);
        expect(chaves[0]).toMatch(/^ensinamentos\/ens_/);
        expect(campos[chaves[0]]).toMatchObject({ de: 'Natsu', tipo: 'poder', nivel: 40 });
        expect(enviarParaFeed).toHaveBeenCalledTimes(1);
        expect(enviarParaFeed.mock.calls[0][0].texto).toContain('Rin, Ayla');
    });

    it('ids das ofertas são diferentes por aluno', async () => {
        salvarCamposPersonagem.mockResolvedValue(true);
        await enviarEnsinamento({ ...base, alunos: ['Rin', 'Ayla'] });
        const k1 = Object.keys(salvarCamposPersonagem.mock.calls[0][1])[0];
        const k2 = Object.keys(salvarCamposPersonagem.mock.calls[1][1])[0];
        expect(k1).not.toBe(k2);
    });

    it('falha de um aluno: ok=false, cita o aluno, feed só com quem recebeu', async () => {
        salvarCamposPersonagem.mockImplementation(async (aluno) => aluno !== 'Ayla');
        const r = await enviarEnsinamento({ ...base, alunos: ['Rin', 'Ayla'] });
        expect(r.ok).toBe(false);
        expect(r.enviados).toBe(1);
        expect(r.erro).toContain('Ayla');
        expect(r.erro).not.toContain('Rin');
        const texto = enviarParaFeed.mock.calls[0][0].texto;
        expect(texto).toContain('Rin');
        expect(texto).not.toContain('Ayla');
    });

    it('falha em todos: erro e nenhum aviso no feed', async () => {
        salvarCamposPersonagem.mockResolvedValue(false);
        const r = await enviarEnsinamento({ ...base, alunos: ['Rin'] });
        expect(r.ok).toBe(false);
        expect(r.enviados).toBe(0);
        expect(enviarParaFeed).not.toHaveBeenCalled();
    });

    it('item inválido: devolve o erro da oferta sem gravar', async () => {
        const r = await enviarEnsinamento({ ...base, item: { nome: '' }, alunos: ['Rin'] });
        expect(r.ok).toBe(false);
        expect(r.erro).toContain('nome');
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });

    it('tipo inválido e professor ausente: erro sem gravar', async () => {
        expect((await enviarEnsinamento({ ...base, tipo: 'x', alunos: ['Rin'] })).ok).toBe(false);
        expect((await enviarEnsinamento({ ...base, professor: '', alunos: ['Rin'] })).ok).toBe(false);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
});
