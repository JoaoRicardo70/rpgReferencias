import { describe, it, expect, vi, beforeEach } from 'vitest';
import useStore from '../stores/useStore';
import { salvarRacasDaMesa, definirRacaDoPersonagemDireto } from './racasMesa';
import { salvarFichaSilencioso, salvarCenarioCompleto, salvarCamposPersonagem } from './firebase-sync';

vi.mock('./firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), salvarCenarioCompleto: vi.fn(), salvarCamposPersonagem: vi.fn(),
}));

const CEN = { outro: 1, racas: [{ id: 'saiyajin', nome: 'Saiyajin' }, { id: 'humano', nome: 'Humano' }] };
function preparar(extra = {}) {
    useStore.setState({
        isMestre: true, meuNome: 'Heroi', cenario: CEN, minhaFicha: { bio: {} },
        ...extra,
    });
}
beforeEach(() => { vi.clearAllMocks(); preparar(); });

describe('salvarRacasDaMesa', () => {
    it('jogador: retorna null e não grava', () => {
        preparar({ isMestre: false });
        expect(salvarRacasDaMesa([{ nome: 'X' }])).toBeNull();
        expect(salvarCenarioCompleto).not.toHaveBeenCalled();
    });
    it('Mestre: grava saneado preservando o resto do cenário', () => {
        const r = salvarRacasDaMesa([{ nome: 'Elfo' }]);
        expect(r).toHaveLength(1);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect(salvo.outro).toBe(1);
        expect(salvo.racas[0].nome).toBe('Elfo');
        expect(CEN.racas).toHaveLength(2);
    });
    it('lista vazia apaga o catálogo', () => {
        expect(salvarRacasDaMesa([])).toEqual([]);
        const salvo = salvarCenarioCompleto.mock.calls[0][0];
        expect('racas' in salvo).toBe(false);
        expect(salvo.outro).toBe(1);
    });
    it('cenário ausente não quebra', () => {
        preparar({ cenario: null });
        expect(() => salvarRacasDaMesa([{ nome: 'A' }])).not.toThrow();
    });
});

describe('definirRacaDoPersonagemDireto', () => {
    it('entidade null: false', () => {
        expect(definirRacaDoPersonagemDireto(null, 'humano')).toBe(false);
    });
    it('Mestre grava em outro personagem via salvarCamposPersonagem', () => {
        expect(definirRacaDoPersonagemDireto({ id: 'Outro' }, 'humano')).toBe(true);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Outro', { 'bio/racaId': 'humano', 'bio/raca': 'Humano' });
    });
    it('Mestre em si mesmo: atualiza ficha e salva debounced', () => {
        expect(definirRacaDoPersonagemDireto({ id: 'Heroi' }, 'saiyajin')).toBe(true);
        expect(useStore.getState().minhaFicha.bio.raca).toBe('Saiyajin');
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('jogador na própria ficha: ok; em outro: false', () => {
        preparar({ isMestre: false });
        expect(definirRacaDoPersonagemDireto({ id: 'Heroi' }, 'humano')).toBe(true);
        expect(useStore.getState().minhaFicha.bio.racaId).toBe('humano');
        expect(definirRacaDoPersonagemDireto({ id: 'Outro' }, 'humano')).toBe(false);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('racaId vazio limpa a raça', () => {
        useStore.setState({ minhaFicha: { bio: { racaId: 'humano', raca: 'Humano' } } });
        expect(definirRacaDoPersonagemDireto({ id: 'Heroi' }, '')).toBe(true);
        expect(useStore.getState().minhaFicha.bio.racaId).toBe('');
        expect(useStore.getState().minhaFicha.bio.raca).toBe('');
    });
    it('id inexistente no catálogo é rejeitado', () => {
        expect(definirRacaDoPersonagemDireto({ id: 'Heroi' }, 'naoexiste')).toBe(false);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
    it('nome com caracteres inválidos casa pela sanitização', () => {
        preparar({ meuNome: 'He.roi' });
        expect(definirRacaDoPersonagemDireto({ id: 'He.roi' }, 'humano')).toBe(true);
    });
});
